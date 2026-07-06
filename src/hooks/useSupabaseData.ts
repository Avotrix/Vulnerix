import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TechStack, mapDbTechStack } from '@/lib/mockData';

// =============================================
// TYPES
// =============================================
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
      });
    } else if (nvd) {
      merged.push(nvd);
    } else if (certIn) {
      merged.push(certIn);
    }
  }

  return [...merged, ...standalone];
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
  email_to: item.email_id || ''
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

  const addTechStack = async (stack: {
    vendor: string;
    product_name: string;
    version: string;
    org_name: string;
    email_id: string;
    email_list?: string;
  }) => {
    // Check for duplicate entry (case-insensitive match on vendor + product + version)
    const { data: existingList, error: fetchErr } = await supabase
      .from('tech_stack')
      .select('id, vendor, product_name, version')
      .eq('email_id', stack.email_id);

    if (!fetchErr && existingList) {
      const duplicate = existingList.find(row =>
        (row.vendor || '').toLowerCase() === stack.vendor.toLowerCase() &&
        (row.product_name || '').toLowerCase() === stack.product_name.toLowerCase() &&
        (row.version || '').toLowerCase() === (stack.version || '').toLowerCase()
      );

      if (duplicate) {
        throw new Error(`"${stack.vendor} / ${stack.product_name} @ ${stack.version || '*'}" already exists in your tech stack.`);
      }
    }

    const { data, error } = await supabase
      .from('tech_stack')
      .insert(stack as any)
      .select()
      .single();

    if (error) {
      // Handle DB unique constraint violation with a friendly message
      const errMsg = JSON.stringify(error);
      if (errMsg.includes('uq_tech_stack_entry') || errMsg.includes('duplicate key') || errMsg.includes('unique constraint') || errMsg.includes('23505')) {
        throw new Error(`"${stack.vendor} / ${stack.product_name} @ ${stack.version || '*'}" already exists in your tech stack.`);
      }
      throw new Error(error.message || 'Failed to add product');
    }
    await fetchTechStacks();
    return data;
  };

  const addMultipleTechStacks = async (stacks: Array<{
    vendor: string;
    product_name: string;
    version: string;
    org_name: string;
    email_id: string;
    email_list?: string;
  }>) => {
    if (!user?.email) throw new Error('Not authenticated');

    const { data: existing } = await supabase
      .from('tech_stack')
      .select('*')
      .eq('email_id', user.email);

    const existingMap = new Map<string, any>();
    (existing || []).forEach(row => {
      const key = `${(row.vendor || '').toLowerCase()}|${(row.product_name || '').toLowerCase()}|${(row.version || '').toLowerCase()}|${(row.org_name || '').toLowerCase()}`;
      existingMap.set(key, row);
    });

    const toInsert: typeof stacks = [];
    const toUpdate: Array<{ id: string; email_list: string }> = [];

    for (const stack of stacks) {
      const key = `${stack.vendor.toLowerCase()}|${stack.product_name.toLowerCase()}|${(stack.version || '').toLowerCase()}|${stack.org_name.toLowerCase()}`;
      const existingRow = existingMap.get(key);

      if (existingRow) {
        const existingEmails = (existingRow.email_list || existingRow.email_id || '').split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
        const newEmails = (stack.email_list || stack.email_id || '').split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
        const merged = [...new Set([...existingEmails, ...newEmails])];
        const mergedStr = merged.join(',');
        if (mergedStr !== (existingRow.email_list || '')) {
          toUpdate.push({ id: existingRow.id, email_list: mergedStr });
        }
      } else {
        toInsert.push(stack);
        existingMap.set(key, { ...stack, email_list: stack.email_list });
      }
    }

    if (toInsert.length > 0) {
      const { error } = await supabase
        .from('tech_stack')
        .insert(toInsert as any);
      if (error) {
        if (error.code === '23505' || error.message?.includes('uq_tech_stack_entry')) {
          throw new Error('Some entries already exist in your tech stack. Duplicates were skipped.');
        }
        throw error;
      }
    }

    for (const update of toUpdate) {
      await supabase
        .from('tech_stack')
        .update({ email_list: update.email_list })
        .eq('id', update.id);
    }

    await fetchTechStacks();
  };

  const updateTechStack = async (id: string, updates: Partial<{
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
  };

  const deleteTechStack = async (id: string) => {
    const { error } = await supabase
      .from('tech_stack')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await fetchTechStacks();
  };

  return {
    techStacks,
    isLoading,
    error,
    refetch: fetchTechStacks,
    addTechStack,
    addMultipleTechStacks,
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
        .order('created_at', { ascending: false });

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
