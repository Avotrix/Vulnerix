// Type definitions for Vulnerix - No mock data

export interface Advisory {
  id?: string;
  lastModified: string;
  cve_id: string;
  description: string;
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
  Severity: 'Critical' | 'High' | 'Medium' | 'Low';
  attack_vector: string;
  Vulnerability_Status: string;
  cvin_id?: string;
  cvin_title?: string;
  cvin_severity?: string;
  cvin_risk_assessment?: string;
  cvin_software_affected?: string;
  cvin_url?: string;
  Reference_URL: string;
  organization: string;
  email_to: string;
}

export interface TechStack {
  id: string;
  srNo: number;
  organization?: string;
  vendorName: string;
  productName: string;
  productVersion: string;
  emailId: string;
  emailList?: string;
  uploadedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  organization: string;
  createdAt: string;
  isNewUser: boolean;
}

// Sample template data for downloads only (new format)
export const sampleTemplateData = [
  { email_to: "security@example.com, admin@example.com", organization: "Your Organization", product: "FortiOS", vendor: "Fortinet", version: "7.6.4" },
  { email_to: "", organization: "Your Organization", product: "Acrobat", vendor: "Adobe", version: "3.1" },
];

// Legacy mapper removed - all advisories now come from Splunk via useSplunkAdvisories hook

// Helper to map DB tech_stack to TechStack format
export const mapDbTechStack = (row: any, index: number): TechStack => ({
  id: row.id,
  srNo: index + 1,
  organization: row.org_name,
  vendorName: row.vendor,
  productName: row.product_name,
  productVersion: row.version || '',
  emailId: row.email_id,
  emailList: row.email_list || row.email_id,
  uploadedAt: row.created_at || new Date().toISOString()
});
