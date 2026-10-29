import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TechStack, mapDbTechStack } from '@/lib/mockData';

// =============================================
// TYPES
// =============================================

/** An incoming tech stack row (from CSV upload, manual add, or edit). */
export type IncomingStack = {
  vendor: string;
  product_name: string;
  version: string;
  org_name: string;
  email_id: string;
  email_list?: string;
};

/** An existing DB row matching an incoming stack on org+vendor+product but a DIFFERENT version. */
export type TechStackConflict = {
  incoming: IncomingStack;
  existingRows: Array<{ id: string; version: string; email_list: string | null }>;
};

/**
 * User's resolution for a single conflict.
 *  - 'separate' -> insert the incoming row as a new entry.
 *  - 'merge'    -> update the chosen existing row's version + merge emails.
 */
export type ConflictDecision = {
  incoming: IncomingStack;
  action: 'separate' | 'merge';
  mergeTargetId?: string; // required when action === 'merge'
};

interface AdvisoryData {
  id: string;
  cve_id: string;
  Severity: string;
  tech_stack_vendor: string;
  tech_stack_product: string;
  tech_stack_version: string;
  lastModified: string;
  cvin_id: string | null;
  cvin_severity: string | null;
  description: string;
  cvss_score: number;
  attack_vector: string;
  Reference_URL: string | null;
  organization: string;
  email_to: string;
  hasNvd?: boolean;
  hasCertIn?: boolean;
}

interface DashboardStats {
  totalProducts: number;
  totalAdvisories: number;
  totalCVEs: number;
  totalCERTIN: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  globalRisk: 'Critical' | 'High' | 'Medium' | 'Low';
}

// =============================================
// HELPER FUNCTIONS
// =============================================
const capitalizeSeverity = (severity: string | null | undefined): string => {
  if (!severity) return 'Low';
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
};

/**
 * Merge NVD + CERT-IN rows for the same CVE into a single advisory record.
 * NVD is preferred as the primary source; CERT-IN data (cert_in ID + severity) is attached.
 *
 * Grouping key: cve_match + vendor + product + version + email_id
 * - If both NVD and CERT-IN rows exist for the same CVE → merge into one (NVD as base + CERT-IN badge)
 * - If only NVD exists → keep as is
 * - If only CERT-IN exists → keep as is (CIVN-only entry)
 * - CERT-IN rows without a CVE link are kept separately
 */
const mergeAdvisories = (rows: any[]): any[] => {
  const groups = new Map<string, { nvd: any | null; certIn: any | null }>();
  const standalone: any[] = []; // CERT-IN rows without a linked CVE

  for (const row of rows) {
    const cveId = row.cve_match;
    if (!cveId) {
      // No CVE link — keep as standalone (e.g. CIVN with empty cve_list)
      standalone.push(row);
      continue;
    }

    const key = [cveId, row.vendor, row.product_name, row.version || '', row.email_id]
      .map(v => (v || '').toString().toLowerCase())
      .join('|');

    if (!groups.has(key)) {
      groups.set(key, { nvd: null, certIn: null });
    }
    const grp = groups.get(key)!;
    if (row.source === 'nvd' && !grp.nvd) {
      grp.nvd = row;
    } else if (row.source === 'cert_in' && !grp.certIn) {
      grp.certIn = row;
    }
  }

  const merged: any[] = [];
  for (const { nvd, certIn } of groups.values()) {
    if (nvd && certIn) {
      // Merge: NVD as base, attach CERT-IN ID and CERT-IN severity
      merged.push({
        ...nvd,
        cert_in: certIn.cert_in,
        severity_cert_in: certIn.severity_cert_in,
        __hasNvd: true,
        __hasCertIn: true,
      });
    } else if (nvd) {
      merged.push({ ...nvd, __hasNvd: true, __hasCertIn: false });
    } else if (certIn) {
      merged.push({ ...certIn, __hasNvd: false, __hasCertIn: true });
    }
  }

  // Sort the full merged set by last_modified DESC (newest first).
  // The Map grouping above does not preserve the DB sort order, so we
  // re-sort here to guarantee the most recently modified CVEs appear first.
  const combined = [...merged, ...standalone.map((s: any) => ({ ...s, __hasNvd: false, __hasCertIn: true }))];
  combined.sort((a, b) => {
    const ta = a.last_modified ? new Date(a.last_modified).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
    const tb = b.last_modified ? new Date(b.last_modified).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
    return tb - ta; // descending
  });
  return combined;
};

const transformAdvisory = (item: any): AdvisoryData => ({
  id: item.id || '',
  cve_id: item.cve_match || '',
  Severity: capitalizeSeverity(item.severity_cve || item.severity_cert_in),
  tech_stack_vendor: item.vendor || 'Unknown',
  tech_stack_product: item.product_name || 'Unknown',
  tech_stack_version: item.version || 'Unknown',
  lastModified: item.last_modified || item.created_at || '',
  cvin_id: item.cert_in || null,
  cvin_severity: item.severity_cert_in ? capitalizeSeverity(item.severity_cert_in) : null,
  description: item.description ||
    `${item.vendor || 'Unknown'} ${item.product_name || 'Product'} ${item.version || ''}`.trim(),
  // Use real cvss_score from DB; fall back to severity-based estimate only if missing
  cvss_score: item.cvss_score != null ? Number(item.cvss_score) :
              item.severity_cve === 'critical' ? 9.0 :
              item.severity_cve === 'high' ? 7.5 :
              item.severity_cve === 'medium' ? 5.0 : 3.0,
  Reference_URL: item.cve_match
    ? `https://nvd.nist.gov/vuln/detail/${item.cve_match}`
    : item.reference_url || null,
  attack_vector: item.attack_vector || 'N/A',
  organization: item.org_name || 'Unknown',
  email_to: item.email_id || '',
  hasNvd: item.__hasNvd !== false,
  hasCertIn: item.__hasCertIn === true,
});

// =============================================
// HOOK: useTechStacks
// =============================================
export const useTechStacks = () => {
  const { user } = useAuth();
  const [techStacks, setTechStacks] = useState<TechStack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTechStacks = useCallback(async () => {
    if (!user?.email) {
      setTechStacks([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('tech_stack')
        .select('*')
        .eq('email_id', user.email)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setTechStacks((data || []).map((row) => mapDbTechStack(row, row.id)));
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setTechStacks([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    fetchTechStacks();
  }, [fetchTechStacks]);

  // Merge two comma-separated email lists (case-insensitive union, order preserved)
  const mergeEmailLists = (a: string, b: string): string => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const src of [a, b]) {
      (src || '').split(',').map(e => e.trim()).filter(Boolean).forEach(e => {
        const k = e.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(e); }
      });
    }
    return out.join(',');
  };

  /**
   * Analyze a batch of incoming stacks against existing tech stack rows.
   * Returns:
   *  - clean: rows that are brand new (no org+vendor+product match) -> safe to insert
   *  - exactMerges: rows whose org+vendor+product+version already exists -> just merge emails
   *  - conflicts: rows where org+vendor+product exists but version differs -> need user choice
   */
  const analyzeTechStacks = async (stacks: IncomingStack[]) => {
    if (!user?.email) throw new Error('Not authenticated');

    const { data: existing } = await supabase
      .from('tech_stack')
      .select('id, org_name, vendor, product_name, version, email_list, email_id')
      .eq('email_id', user.email);

    const rows = existing || [];
    const idKey = (r: any) =>
      `${(r.org_name || '').toLowerCase()}|${(r.vendor || '').toLowerCase()}|${(r.product_name || '').toLowerCase()}`;

    // Group existing rows by org+vendor+product
    const byProduct = new Map<string, any[]>();
    rows.forEach(r => {
      const k = idKey(r);
      if (!byProduct.has(k)) byProduct.set(k, []);
      byProduct.get(k)!.push(r);
    });

    const clean: IncomingStack[] = [];
    const exactMerges: Array<{ id: string; email_list: string }> = [];
    const conflicts: TechStackConflict[] = [];

    for (const stack of stacks) {
      const k = idKey(stack);
      const group = byProduct.get(k);

      if (!group || group.length === 0) {
        clean.push(stack);
        continue;
      }

      // Same org+vendor+product exists. Is there an exact version match?
      const exact = group.find(
        r => (r.version || '').toLowerCase() === (stack.version || '').toLowerCase()
      );
      if (exact) {
        // Exact duplicate -> merge emails into that row (no popup)
        const merged = mergeEmailLists(exact.email_list || exact.email_id || '', stack.email_list || stack.email_id || '');
        if (merged !== (exact.email_list || '')) {
          exactMerges.push({ id: exact.id, email_list: merged });
        }
      } else {
        // Same product, different version -> conflict, needs user decision
        conflicts.push({
          incoming: stack,
          existingRows: group.map(r => ({ id: r.id, version: r.version, email_list: r.email_list })),
        });
      }
    }

    return { clean, exactMerges, conflicts };
  };

  /**
   * Apply a fully-resolved batch:
   *  - insert brand-new rows
   *  - apply exact-duplicate email merges
   *  - apply per-conflict decisions (separate = insert, merge = update chosen row)
   */
  // After any tech-stack change, run a full CVE match for this user so newly
  // added/edited products are matched against the complete database immediately
  // (no waiting for the 6h incremental run). Fire-and-forget; refresh results after.
  const triggerEngineRefresh = async () => {
    try {
      await supabase.functions.invoke('cve-engine', { body: {} });
    } catch (e) {
      // non-fatal: scheduled incremental run will still pick it up later
      console.warn('[techstack] engine refresh after change failed', e);
    }
  };

  const applyTechStacks = async (params: {
    clean: IncomingStack[];
    exactMerges: Array<{ id: string; email_list: string }>;
    decisions: ConflictDecision[];
  }) => {
    if (!user?.email) throw new Error('Not authenticated');

    const inserts: IncomingStack[] = [...params.clean];
    const updates: Array<{ id: string; version?: string; email_list: string }> = [
      ...params.exactMerges.map(m => ({ id: m.id, email_list: m.email_list })),
    ];

    // Fetch current rows once for merge-target email lookup
    const { data: existing } = await supabase
      .from('tech_stack')
      .select('id, version, email_list, email_id')
      .eq('email_id', user.email);
    const rowById = new Map((existing || []).map(r => [r.id, r]));

    for (const d of params.decisions) {
      if (d.action === 'separate') {
        inserts.push(d.incoming);
      } else if (d.action === 'merge' && d.mergeTargetId) {
        const target = rowById.get(d.mergeTargetId);
        const mergedEmails = mergeEmailLists(
          (target?.email_list as string) || (target?.email_id as string) || '',
          d.incoming.email_list || d.incoming.email_id || ''
        );
        updates.push({ id: d.mergeTargetId, version: d.incoming.version, email_list: mergedEmails });
      }
    }

    if (inserts.length > 0) {
      const { error } = await supabase
        .from('tech_stack')
        .upsert(inserts as any, {
          onConflict: 'email_id,org_name,vendor,product_name,version',
          ignoreDuplicates: true,
        });
      if (error) throw error;
    }

    for (const u of updates) {
      const patch: any = { email_list: u.email_list };
      if (u.version !== undefined) patch.version = u.version;
      const { error } = await supabase.from('tech_stack').update(patch).eq('id', u.id);
      if (error) throw error;
    }

    await fetchTechStacks();
    await triggerEngineRefresh();
  };

  /**
   * Backwards-compatible bulk add. When there are no version conflicts it just
   * inserts/merges directly. If conflicts exist it throws a typed error carrying
   * the conflict list so the caller (upload modal) can prompt the user.
   */
  const addMultipleTechStacks = async (stacks: IncomingStack[]) => {
    const { clean, exactMerges, conflicts } = await analyzeTechStacks(stacks);
    if (conflicts.length > 0) {
      const err: any = new Error('CONFLICTS');
      err.code = 'TECH_STACK_CONFLICTS';
      err.conflicts = conflicts;
      err.clean = clean;
      err.exactMerges = exactMerges;
      throw err;
    }
    await applyTechStacks({ clean, exactMerges, decisions: [] });
  };

  /**
   * Single add (manual modal). Uses the same conflict rules as bulk:
   *  - brand new / exact duplicate -> applied directly.
   *  - same org+vendor+product, different version -> throws TECH_STACK_CONFLICTS
   *    so the modal can prompt the user (update existing vs add separate).
   */
  const addTechStack = async (stack: IncomingStack) => {
    const { clean, exactMerges, conflicts } = await analyzeTechStacks([stack]);
    if (conflicts.length > 0) {
      const err: any = new Error('CONFLICTS');
      err.code = 'TECH_STACK_CONFLICTS';
      err.conflicts = conflicts;
      err.clean = clean;
      err.exactMerges = exactMerges;
      throw err;
    }
    await applyTechStacks({ clean, exactMerges, decisions: [] });
  };

  const updateTechStack = async (id: string, updates: Partial<{
    org_name: string;
    vendor: string;
    product_name: string;
    version: string;
    email_list: string;
  }>) => {
    const { error } = await supabase
      .from('tech_stack')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    await fetchTechStacks();
    await triggerEngineRefresh();
  };

  const deleteTechStack = async (id: string) => {
    const { error } = await supabase
      .from('tech_stack')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await fetchTechStacks();
    await triggerEngineRefresh();
  };

  return {
    techStacks,
    isLoading,
    error,
    refetch: fetchTechStacks,
    addTechStack,
    addMultipleTechStacks,
    analyzeTechStacks,
    applyTechStacks,
    updateTechStack,
    deleteTechStack
  };
};

// =============================================
// HOOK: useTechStackResults
// =============================================
export const useTechStackResults = () => {
  const { user } = useAuth();
  const [results, setResults] = useState<AdvisoryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    if (!user?.email) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('tech_stack_results')
        .select('*')
        .eq('email_id', user.email)
        .order('last_modified', { ascending: false });

      if (error) throw error;

      // Merge NVD + CERT-IN entries for the same CVE into a single advisory.
      // NVD is the primary data source; CERT-IN data is attached as supplementary fields.
      const merged = mergeAdvisories(data || []);
      const transformed = merged.map(item => transformAdvisory(item));
      setResults(transformed);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  return {
    results,
    isLoading,
    error,
    refetch: fetchResults
  };
};

// =============================================
// HOOK: useDashboardStats
// =============================================
export const useDashboardStats = () => {
  const { user } = useAuth();
  const { results, refetch: refetchResults } = useTechStackResults();
  const [productCount, setProductCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalAdvisories: 0,
    totalCVEs: 0,
    totalCERTIN: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    globalRisk: 'Low'
  });

  const fetchProductCount = useCallback(async () => {
    if (!user?.email) return 0;
    try {
      const { count } = await supabase
        .from('tech_stack')
        .select('*', { count: 'exact', head: true })
        .eq('email_id', user.email);

      return count || 0;
    } catch {
      return 0;
    }
  }, [user?.email]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const count = await fetchProductCount();
    const critical = results.filter(r => r.Severity === 'Critical').length;
    const high = results.filter(r => r.Severity === 'High').length;
    const medium = results.filter(r => r.Severity === 'Medium').length;
    const low = results.filter(r => r.Severity === 'Low').length;

    setStats({
      totalProducts: count,
      totalAdvisories: results.length,
      totalCVEs: results.filter(r => r.cve_id?.startsWith('CVE-')).length,
      totalCERTIN: results.filter(r => r.cvin_id).length,
      critical,
      high,
      medium,
      low,
      globalRisk: critical > 0 ? 'Critical' : 
                 high > 0 ? 'High' : 
                 medium > 0 ? 'Medium' : 'Low',
    });
    setIsLoading(false);
  }, [results, fetchProductCount]);

  useEffect(() => {
    let mounted = true;
    if (mounted) loadData();
    return () => { mounted = false; };
  }, [loadData]);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    await refetchResults();
  }, [refetchResults]);

  return { stats, isLoading, refetch };
};

// =============================================
// HOOK: useUserSettings
// =============================================
export const useUserSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<{
    org_name: string;
    notification_level: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user?.email) {
        setSettings(null);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('org_name, notification_level')
          .eq('email_id', user.email)
          .maybeSingle();

        if (error) throw error;
        setSettings(data);
      } catch (err) {
        setSettings(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [user?.email]);

  return { settings, isLoading };
};

// =============================================
// UTILITY: getHighestSeverity
// =============================================
export const getHighestSeverity = (results: AdvisoryData[]): string => {
  if (!results || results.length === 0) return 'Low';
  
  const hasCritical = results.some(r => r.Severity === 'Critical');
  if (hasCritical) return 'Critical';
  
  const hasHigh = results.some(r => r.Severity === 'High');
  if (hasHigh) return 'High';
  
  const hasMedium = results.some(r => r.Severity === 'Medium');
  if (hasMedium) return 'Medium';
  
  return 'Low';
};
