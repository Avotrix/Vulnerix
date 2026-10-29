import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Filter, ExternalLink, ChevronLeft, ChevronRight,
  AlertCircle, Info, Shield, Mail, MailCheck, Loader2, Sparkles, X, CheckCircle2, Link2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTechStackResults, useTechStacks } from "@/hooks/useSupabaseData";
import { getCertInToggle } from "@/lib/storage";
import { Advisory, TechStack } from "@/lib/mockData";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ITEMS_PER_PAGE = 5;

const Advisories = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { results: advisories, isLoading } = useTechStackResults();
  const { techStacks } = useTechStacks();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("7"); // "1" | "7" | "15" | "30" | "custom" | "all"
  const [customDays, setCustomDays] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [emailStatuses, setEmailStatuses] = useState<Record<string, string>>({});
  const [certInEnabled] = useState(getCertInToggle);

  useEffect(() => {
    const cveParam = searchParams.get('cve');
    if (cveParam) {
      setSearchQuery(cveParam);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // ✅ FIXED: emailList (multiple emails) prefer karo, fallback to emailId
  const vendorEmailMap = useMemo(() => {
    const map: Record<string, string> = {};
    techStacks.forEach(stack => {
      if (stack.vendorName) {
        // emailList prefer karo (multiple emails), fallback emailId
        const email = (stack as any).emailList || (stack as any).email_list || stack.emailId;
        if (email) {
          map[stack.vendorName.toLowerCase()] = email;
        }
      }
    });
    return map;
  }, [techStacks]);

  const vendors = useMemo(() => {
    // Case-insensitive dedup — keep the first-seen casing for display
    const seen = new Map<string, string>();
    for (const stack of techStacks) {
      if (!stack.vendorName) continue;
      const key = stack.vendorName.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, stack.vendorName);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [techStacks]);

  const baseAdvisories = useMemo(() => {
    if (certInEnabled) {
      return advisories;
    }
    return advisories.filter(a => a.cve_id && a.cve_id.startsWith('CVE-'));
  }, [advisories, certInEnabled]);

  const filteredAdvisories = useMemo(() => {
    return baseAdvisories.filter(advisory => {
      const matchesSearch = searchQuery === "" || 
        advisory.cve_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        advisory.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        advisory.tech_stack_product.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSeverity = severityFilter === "all" || advisory.Severity === severityFilter;
      const matchesVendor = vendorFilter === "all" ||
        advisory.tech_stack_vendor?.toLowerCase() === vendorFilter.toLowerCase();
      const matchesDate = dateFilter === "all" || (() => {
        const days = dateFilter === "custom" ? parseInt(customDays, 10) : parseInt(dateFilter, 10);
        if (!days || isNaN(days)) return true;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        return new Date(advisory.lastModified) >= cutoff;
      })();
      return matchesSearch && matchesSeverity && matchesVendor && matchesDate;
    });
  }, [baseAdvisories, searchQuery, severityFilter, vendorFilter, dateFilter, customDays]);

  const totalPages = Math.ceil(filteredAdvisories.length / ITEMS_PER_PAGE);
  const paginatedAdvisories = filteredAdvisories.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // ---- AI Remediation (Phase 3) ----
  const [aiOpen, setAiOpen] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiData, setAiData] = useState<Record<string, any>>({});

  const aiKeyFor = (a: any) => a.id || a.cve_id;

  // Render AI text: convert **bold** (section headers) to bold, keep line breaks.
  const pillStyle = (label: string) => {
    const t = label.toLowerCase();
    if (t.includes("vulnerab") || t.includes("why")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    if (t.includes("impact")) return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
    if (t.includes("fix") || t.includes("remediat")) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    return "bg-muted text-foreground";
  };
  const renderRemediation = (text: string) => {
    // Normalize: put each numbered step (1. 2. 3. ...) on its own line even if the AI inlined them.
    const normalized = (text || "").replace(/\s+(\d+\.\s)/g, "\n$1");
    const lines = normalized.split(/\n/).filter(l => l.trim() !== "");
    const out: any[] = [];
    lines.forEach((line, li) => {
      // Match a header like **Why it is vulnerable** optionally followed by ':' and inline body.
      const m = line.trim().match(/^\*\*\s*([^*]+?)\s*\*\*\s*:?\s*(.*)$/);
      if (m) {
        const label = m[1].trim();
        const body = m[2].trim();
        out.push(
          <div key={`h${li}`} className="mt-3 mb-1">
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${pillStyle(label)}`}>{label}</span>
          </div>
        );
        if (body) out.push(<div key={`b${li}`} className="text-foreground">{body}</div>);
        return;
      }
      // plain body line, with inline **bold** support
      const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(p => p !== "");
      out.push(
        <div key={`p${li}`} className="text-foreground">
          {parts.map((p, pi) =>
            p.startsWith("**") && p.endsWith("**")
              ? <span key={pi} className="font-semibold">{p.slice(2, -2)}</span>
              : <span key={pi}>{p}</span>
          )}
        </div>
      );
    });
    return out;
  };

  const handleAiRemediation = async (advisory: any) => {
    const key = aiKeyFor(advisory);
    if (aiOpen === key) { setAiOpen(null); return; }   // toggle close
    setAiOpen(key);
    if (aiData[key]) return;                             // already loaded
    setAiLoading(key);
    try {
      const { data, error } = await supabase.functions.invoke('ai-remediation', {
        body: {
          cve_id: advisory.cve_id,
          installed_version: advisory.tech_stack_version || '',
          vendor: advisory.tech_stack_vendor || '',
          product: advisory.tech_stack_product || '',
        },
      });
      if (error) throw error;
      if (data?.error === 'no_ai_key') {
        toast({ title: 'Set up AI provider', description: 'Choose a provider and add your API key in Settings.' });
        setAiOpen(null);
        window.location.href = '/settings?section=ai';
        return;
      }
      if (data?.error) {
        const msg = data.error === 'no_credits' ? 'Your AI provider has no credits.'
          : data.error === 'invalid_key' ? 'Your AI API key is invalid.'
          : data.detail || 'Could not generate remediation.';
        setAiData(prev => ({ ...prev, [key]: { error: msg } }));
        return;
      }
      setAiData(prev => ({ ...prev, [key]: data }));
    } catch (e: any) {
      setAiData(prev => ({ ...prev, [key]: { error: e.message || 'Request failed' } }));
    } finally {
      setAiLoading(null);
    }
  };


  const handleSendEmail = async (advisory: Advisory) => {
    const vendorKey = advisory.tech_stack_vendor?.toLowerCase() || '';
    const targetEmail = vendorEmailMap[vendorKey] || advisory.email_to;
    
    if (!targetEmail) {
      toast({
        title: "No email configured",
        description: `No email found for vendor "${advisory.tech_stack_vendor}". Please update Tech Stack.`,
        variant: "destructive",
      });
      return;
    }

    const statusKey = advisory.id || advisory.cve_id;
    setEmailStatuses(prev => ({ ...prev, [statusKey]: 'queued' }));

    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: targetEmail,
          subject: `Vulnerability Alert: ${advisory.cve_id}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">⚠️ Vulnerability Advisory</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; font-weight: bold;">CVE ID</td><td style="padding: 8px;">${advisory.cve_id}</td></tr>
                <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold;">Severity</td><td style="padding: 8px;">${advisory.Severity || 'N/A'}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">CVSS Score</td><td style="padding: 8px;">${advisory.cvss_score || 'N/A'}</td></tr>
                <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold;">Vendor / Product</td><td style="padding: 8px;">${advisory.tech_stack_vendor} / ${advisory.tech_stack_product}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Version</td><td style="padding: 8px;">${advisory.tech_stack_version || 'N/A'}</td></tr>
                <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold;">Attack Vector</td><td style="padding: 8px;">${advisory.attack_vector || 'N/A'}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">${advisory.lastModified || 'N/A'}</td></tr>
              </table>
              <h3>Description</h3>
              <p style="color: #374151;">${advisory.description || 'No description available'}</p>
              ${advisory.Reference_URL ? `<p><a href="${advisory.Reference_URL}" style="color: #2563eb;">View Full Reference →</a></p>` : ''}
              <hr />
              <p style="color: #6b7280; font-size: 12px;">Sent via Vulnerix Dashboard</p>
            </div>
          `
        }
      });

      if (error) throw error;

      setEmailStatuses(prev => ({ ...prev, [statusKey]: 'sent' }));
      toast({
        title: "Email sent!",
        description: `Advisory sent to ${targetEmail}`,
      });
    } catch (err: any) {
      console.error('Email send error:', err);
      setEmailStatuses(prev => ({ ...prev, [statusKey]: 'failed' }));
      toast({
        title: "Failed to send email",
        description: err?.message || "Something went wrong. Check console.",
        variant: "destructive",
      });
    }
  };

  const getTargetEmail = (advisory: Advisory) => {
    const vendorKey = advisory.tech_stack_vendor?.toLowerCase() || '';
    return vendorEmailMap[vendorKey] || advisory.email_to || 'No email configured';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const renderVersionRange = (advisory: Advisory) => {
    const parts = [];
    if (advisory.versionStartIncluding) parts.push(`>= ${advisory.versionStartIncluding}`);
    if (advisory.versionStartExcluding) parts.push(`> ${advisory.versionStartExcluding}`);
    if (advisory.versionEndIncluding) parts.push(`<= ${advisory.versionEndIncluding}`);
    if (advisory.versionEndExcluding) parts.push(`< ${advisory.versionEndExcluding}`);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Advisories</h1>
            <p className="text-muted-foreground">
              {filteredAdvisories.length} vulnerabilities found
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by CVE, description, or product..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          
          <div className="flex gap-3">
            <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-36">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={vendorFilter} onValueChange={(v) => { setVendorFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {vendors.map(vendor => (
                  <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
                ))}
              </SelectContent>
            </Select>
	    <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="1">Last 1 day</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="15">Last 15 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {dateFilter === "custom" && (
              <Input
                type="number"
                min="1"
                placeholder="Days"
                value={customDays}
                onChange={(e) => { setCustomDays(e.target.value); setCurrentPage(1); }}
                className="w-24"
              />
            )}
          </div>
        </div>

        <AnimatePresence mode="popLayout">
        <div className="space-y-4">
          {paginatedAdvisories.map((advisory, index) => (
            <motion.div
              key={advisory.id || `${advisory.cve_id}-${advisory.tech_stack_vendor}-${advisory.tech_stack_product}-${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: index * 0.05 }}
              className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className={`h-1 ${
                advisory.Severity === 'Critical' ? 'bg-severity-critical' :
                advisory.Severity === 'High' ? 'bg-severity-high' :
                advisory.Severity === 'Medium' ? 'bg-severity-medium' :
                'bg-severity-low'
              }`} />
              
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-lg font-bold text-foreground">
                        {advisory.cve_id}
                      </span>
                      <SeverityBadge severity={advisory.Severity} />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-xs font-medium">
                              <Info className="h-3 w-3" />
                              CVSS {advisory.cvss_score}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              CVSS score ranges from 0-10. Higher scores indicate more severe vulnerabilities.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(advisory.lastModified)}
                      </span>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {advisory.description}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                      <div>
                        <span className="text-xs text-muted-foreground block mb-1">Vendor / Product</span>
                        <span className="text-sm font-medium">
                          {advisory.tech_stack_vendor} / {advisory.tech_stack_product}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block mb-1">Version</span>
                        <span className="text-sm font-mono">{advisory.tech_stack_version}</span>
                      </div>
                      {renderVersionRange(advisory) && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Affected Versions</span>
                          <span className="text-sm font-mono">{renderVersionRange(advisory)}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-muted-foreground block mb-1">Attack Vector</span>
                        <span className="text-sm">{advisory.attack_vector}</span>
                      </div>
                    </div>

                    {certInEnabled && advisory.cvin_id && advisory.cvin_id.trim() !== '' && (
                      <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <Shield className="h-4 w-4 text-accent" />
                          <span className="font-medium text-sm">{advisory.cvin_id}</span>
                          {advisory.cvin_title && (
                            <span className="text-sm text-muted-foreground">- {advisory.cvin_title}</span>
                          )}
                        </div>
                        {advisory.cvin_risk_assessment && (
                          <p className="text-sm text-muted-foreground">{advisory.cvin_risk_assessment}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 lg:w-40">
                    {advisory.Reference_URL && (
                      <a href={advisory.Reference_URL} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="w-full">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Reference
                        </Button>
                      </a>
                    )}
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant={emailStatuses[advisory.id || advisory.cve_id] === 'sent' ? "secondary" : emailStatuses[advisory.id || advisory.cve_id] === 'failed' ? "destructive" : "accent"}
                            size="sm"
                            className="w-full"
                            onClick={() => handleSendEmail(advisory)}
                            disabled={emailStatuses[advisory.id || advisory.cve_id] === 'queued' || emailStatuses[advisory.id || advisory.cve_id] === 'sent'}
                          >
                            {emailStatuses[advisory.id || advisory.cve_id] === 'sent' ? (
                              <><MailCheck className="h-4 w-4 mr-2" />Sent</>
                            ) : emailStatuses[advisory.id || advisory.cve_id] === 'queued' ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                            ) : emailStatuses[advisory.id || advisory.cve_id] === 'failed' ? (
                              <><Mail className="h-4 w-4 mr-2" />Retry</>
                            ) : (
                              <><Mail className="h-4 w-4 mr-2" />Mail Me</>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Send advisory details to {getTargetEmail(advisory)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      variant={aiOpen === aiKeyFor(advisory) ? "secondary" : "accent"}
                      size="sm"
                      className="w-full"
                      onClick={() => handleAiRemediation(advisory)}
                      disabled={aiLoading === aiKeyFor(advisory)}
                    >
                      {aiLoading === aiKeyFor(advisory) ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
                      ) : (
                        <><Sparkles className="h-4 w-4 mr-2" />AI Remediation</>
                      )}
                    </Button>
                  </div>
                </div>
                {aiOpen === aiKeyFor(advisory) && (
                  <div className="border-t border-border px-6 pb-6 pt-4 bg-muted/20">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-accent" />
                        <span className="font-semibold text-sm">AI Remediation</span>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 gap-1 border-border bg-background hover:bg-destructive hover:text-destructive-foreground hover:border-destructive" onClick={() => setAiOpen(null)}>
                        <X className="h-4 w-4" /> Close
                      </Button>
                    </div>
                    {aiLoading === aiKeyFor(advisory) ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="h-4 w-4 animate-spin" /> Generating remediation...
                      </div>
                    ) : aiData[aiKeyFor(advisory)]?.error ? (
                      <p className="text-sm text-destructive">{aiData[aiKeyFor(advisory)].error}</p>
                    ) : aiData[aiKeyFor(advisory)] ? (
                      <div className="space-y-3">
                        {aiData[aiKeyFor(advisory)].fix_version && (
                          <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-900">
                            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                            <p className="text-sm text-foreground">
                              You are on version <span className="font-mono font-medium">{aiData[aiKeyFor(advisory)].installed_version || advisory.tech_stack_version}</span>.
                              Please upgrade to <span className="font-mono font-medium">{aiData[aiKeyFor(advisory)].fix_version}</span> or later, where this vulnerability is fixed.
                            </p>
                          </div>
                        )}
                        {!aiData[aiKeyFor(advisory)].fix_version && aiData[aiKeyFor(advisory)].vuln_ceiling && (
                          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900">
                            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <p className="text-sm text-foreground">
                              You are on version <span className="font-mono font-medium">{aiData[aiKeyFor(advisory)].installed_version || advisory.tech_stack_version}</span>.
                              Vulnerable up to and including <span className="font-mono font-medium">{aiData[aiKeyFor(advisory)].vuln_ceiling}</span>. No fixed version is published yet, monitor the vendor advisory.
                            </p>
                          </div>
                        )}
                        <div className="text-sm text-foreground leading-relaxed">
                          {renderRemediation(aiData[aiKeyFor(advisory)].remediation)}
                        </div>
                        {Array.isArray(aiData[aiKeyFor(advisory)].references) && aiData[aiKeyFor(advisory)].references.length > 0 && (
                          <div className="pt-1">
                            <span className="text-xs text-muted-foreground block mb-1">Reference Link</span>
                            <div className="space-y-1">
                              {aiData[aiKeyFor(advisory)].references.map((r: string, i: number) => (
                                <a key={i} href={r} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-accent hover:underline break-all">
                                  <Link2 className="h-3 w-3 shrink-0" /> {r}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground pt-1">Generated by {aiData[aiKeyFor(advisory)].provider ? (aiData[aiKeyFor(advisory)].provider.charAt(0).toUpperCase() + aiData[aiKeyFor(advisory)].provider.slice(1) + " AI") : "AI"} from NVD/CERT-In data.</p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {paginatedAdvisories.length === 0 && (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No advisories found</h3>
              <p className="text-muted-foreground">
                {advisories.length === 0 
                  ? "Add products to your tech stack to see vulnerability advisories"
                  : "Try adjusting your search or filters"
                }
              </p>
            </div>
          )}
        </div>
        </AnimatePresence>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to{' '}
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredAdvisories.length)} of{' '}
              {filteredAdvisories.length} advisories
            </p>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (currentPage <= 3) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = currentPage - 2 + i;
                  }
                  
                  return (
                    <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setCurrentPage(page)}>
                      {page}
                    </Button>
                  );
                })}
              </div>
              
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Advisories;
