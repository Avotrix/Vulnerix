import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Advisory } from '@/lib/mockData';

// Severity priority for highest-severity rule
const SEVERITY_PRIORITY: Record<string, number> = {
  'Critical': 5,
  'High': 4,
  'Medium': 3,
  'Low': 2,
  'Info': 1,
};

interface SplunkResponse {
  success: boolean;
  advisories: SplunkAdvisory[];
  count: number;
  timestamp: string;
  error?: string;
}

interface SplunkAdvisory {
  lastModified: string;
  cve_id: string;
  Description: string;
  cpe_value: string;
  tech_stack_vendor: string;
  tech_stack_product: string;
  tech_stack_version: string;
  versionStartIncluding?: string;
  versionStartExcluding?: string;
  versionEndIncluding?: string;
  versionEndExcluding?: string;
  match_status: string;
  cvss_score: number;
  Severity: string;
  attack_vector: string;
  Vulnerability_Status: string;
  civn_id?: string;
  civn_title?: string;
  civn_severity?: string;
  civn_risk_assessment?: string;
  civn_software_affected?: string;
  civn_url?: string;
  Reference_URL: string;
  organization: string;
  email_to: string;
}

// Map Splunk advisory to UI Advisory format
const mapSplunkToAdvisory = (splunk: SplunkAdvisory): Advisory => ({
  lastModified: splunk.lastModified,
  cve_id: splunk.cve_id,
  Description: splunk.Description,
  cpe_value: splunk.cpe_value,
  tech_stack_vendor: splunk.tech_stack_vendor,
  tech_stack_product: splunk.tech_stack_product,
  tech_stack_version: splunk.tech_stack_version,
  versionStartIncluding: splunk.versionStartIncluding,
  versionStartExcluding: splunk.versionStartExcluding,
  versionEndIncluding: splunk.versionEndIncluding,
  versionEndExcluding: splunk.versionEndExcluding,
  match_status: splunk.match_status,
  cvss_score: splunk.cvss_score,
  Severity: normalizeSeverity(splunk.Severity),
  attack_vector: splunk.attack_vector,
  Vulnerability_Status: splunk.Vulnerability_Status,
  cvin_id: splunk.civn_id,
  cvin_title: splunk.civn_title,
  cvin_severity: splunk.civn_severity,
  cvin_risk_assessment: splunk.civn_risk_assessment,
  cvin_software_affected: splunk.civn_software_affected,
  cvin_url: splunk.civn_url,
  Reference_URL: buildReferenceUrl(splunk),
  organization: splunk.organization,
  email_to: splunk.email_to,
});

// Normalize severity string to expected format
const normalizeSeverity = (severity: string): 'Critical' | 'High' | 'Medium' | 'Low' => {
  const normalized = severity?.charAt(0).toUpperCase() + severity?.slice(1).toLowerCase();
  if (['Critical', 'High', 'Medium', 'Low'].includes(normalized)) {
    return normalized as 'Critical' | 'High' | 'Medium' | 'Low';
  }
  return 'Low';
};

// Build reference URL dynamically
const buildReferenceUrl = (advisory: SplunkAdvisory): string => {
  // CVE link from NVD
  if (advisory.cve_id?.startsWith('CVE-')) {
    return `https://nvd.nist.gov/vuln/detail/${advisory.cve_id}`;
  }
  // CERT-IN link directly
  if (advisory.civn_url) {
    return advisory.civn_url;
  }
  // Fallback to Reference_URL
  return advisory.Reference_URL || '';
};

// Get highest severity from a list of advisories
export const getHighestSeverity = (advisories: Advisory[]): 'Critical' | 'High' | 'Medium' | 'Low' => {
  if (advisories.length === 0) return 'Low';
  
  let highest = 'Low';
  let highestPriority = 0;
  
  for (const advisory of advisories) {
    const priority = SEVERITY_PRIORITY[advisory.Severity] || 0;
    if (priority > highestPriority) {
      highestPriority = priority;
      highest = advisory.Severity;
    }
  }
  
  return highest as 'Critical' | 'High' | 'Medium' | 'Low';
};

// Hook to fetch advisories from Splunk
export const useSplunkAdvisories = () => {
  const { user } = useAuth();
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchAdvisories = useCallback(async () => {
    if (!user) {
      setAdvisories([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke<SplunkResponse>(
        'splunk-advisories',
        { method: 'POST' }
      );

      if (invokeError) {
        throw invokeError;
      }

      if (data?.advisories) {
        const mapped = data.advisories.map(mapSplunkToAdvisory);
        setAdvisories(mapped);
        setLastFetched(new Date());
      } else {
        setAdvisories([]);
      }
    } catch (err) {
      // Silent fail - don't show error to user, just return empty
      setAdvisories([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAdvisories();
  }, [fetchAdvisories]);

  return {
    advisories,
    isLoading,
    error,
    lastFetched,
    refetch: fetchAdvisories,
  };
};

// Dashboard stats derived from Splunk data
export interface DashboardStats {
  totalAdvisories: number;
  totalCVEs: number;
  totalCERTIN: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  globalRisk: 'Critical' | 'High' | 'Medium' | 'Low';
  uniqueVendors: string[];
  uniqueProducts: string[];
  recentAdvisories: Advisory[];
  matchedAdvisories: Advisory[];
}

export const useSplunkDashboard = () => {
  const { advisories, isLoading, error, refetch } = useSplunkAdvisories();

  const stats: DashboardStats = {
    totalAdvisories: advisories.length,
    totalCVEs: advisories.filter(a => a.cve_id?.startsWith('CVE-')).length,
    totalCERTIN: advisories.filter(a => a.cvin_id && a.cvin_id.trim() !== '').length,
    criticalCount: advisories.filter(a => a.Severity === 'Critical').length,
    highCount: advisories.filter(a => a.Severity === 'High').length,
    mediumCount: advisories.filter(a => a.Severity === 'Medium').length,
    lowCount: advisories.filter(a => a.Severity === 'Low').length,
    globalRisk: getHighestSeverity(advisories),
    uniqueVendors: [...new Set(advisories.map(a => a.tech_stack_vendor).filter(Boolean))],
    uniqueProducts: [...new Set(advisories.map(a => a.tech_stack_product).filter(Boolean))],
    recentAdvisories: [...advisories]
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, 5),
    matchedAdvisories: advisories.filter(a => a.match_status === 'Vulnerable' || a.match_status === 'Matched'),
  };

  return {
    stats,
    advisories,
    isLoading,
    error,
    refetch,
  };
};

// Hook for notifications - returns full Advisory objects (no fabrication)
export const useSplunkNotifications = () => {
  const { advisories, isLoading } = useSplunkAdvisories();

  // Critical and High severity advisories for immediate notification
  // Returns FULL Advisory objects - no field fabrication
  const urgentAdvisories = advisories.filter(a => 
    a.Severity === 'Critical' || a.Severity === 'High'
  );

  return {
    advisories,
    urgentAdvisories,
    isLoading,
  };
};
