import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { 
  Users, Building2, Package, FileText, Shield, AlertTriangle,
  Activity, Clock, CheckCircle, XCircle, RefreshCw, Lock, Mail, Trash2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAdminActions } from "@/hooks/useAdminActions";
import { useToast } from "@/hooks/use-toast";



interface AdminStats {
  totalUsers: number;
  totalOrgs: number;
  totalTechStack: number;
  totalResults: number;
  totalCVE: number;
  totalCertIn: number;
  totalAdmins: number;
  auditLogCount: number;
  sentNotificationsCount: number;
  engineStatus: 'idle' | 'running' | 'error';
  lastEngineRun: string | null;
}

const AdminOverview = () => {
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalOrgs: 0,
    totalTechStack: 0,
    totalResults: 0,
    totalCVE: 0,
    totalCertIn: 0,
    totalAdmins: 0,
    auditLogCount: 0,
    sentNotificationsCount: 0,
    engineStatus: 'idle',
    lastEngineRun: null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // Generic detail dialog (lazy-loaded per card)
  const [detail, setDetail] = useState<{
    open: boolean;
    title: string;
    columns: string[];
    rows: any[];
    loading: boolean;
    error: string;
  }>({ open: false, title: '', columns: [], rows: [], loading: false, error: '' });

  const { verifyAdminRole } = useAdminActions();
  const { toast } = useToast();

  // Open a detail dialog and lazy-fetch its rows.
  const openDetail = async (
    title: string,
    columns: string[],
    fetcher: () => Promise<any[]>
  ) => {
    setDetail({ open: true, title, columns, rows: [], loading: true, error: '' });
    try {
      const rows = await fetcher();
      setDetail(d => ({ ...d, rows, loading: false }));
    } catch (e: any) {
      setDetail(d => ({ ...d, loading: false, error: e?.message || 'Failed to load' }));
    }
  };

  const renderCell = (val: any): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'object') { const s = JSON.stringify(val); return s.length > 100 ? s.slice(0, 100) + '…' : s; }
    const s = String(val);
    // Format ISO timestamps to readable IST
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST';
      }
    }
    return s.length > 100 ? s.slice(0, 100) + '…' : s;
  };

  // ── Per-card lazy fetchers ────────────────────────────────────────────────
  const DETAIL_LIMIT = 100;

  const showUsers = () => openDetail('Users', ['email_id', 'org_name', 'notification_level'], async () => {
    const { data, error } = await supabase.from('user_settings').select('email_id, org_name, notification_level').limit(DETAIL_LIMIT);
    if (error) throw error; return data || [];
  });

  const showOrganizations = () => openDetail('Organizations', ['name', 'users', 'techStack'], async () => {
    const [{ data: us }, { data: ts }] = await Promise.all([
      supabase.from('user_settings').select('org_name'),
      supabase.from('tech_stack').select('org_name'),
    ]);
    const uc = new Map<string, number>(); (us || []).forEach((o: any) => o.org_name && uc.set(o.org_name, (uc.get(o.org_name) || 0) + 1));
    const tc = new Map<string, number>(); (ts || []).forEach((o: any) => o.org_name && tc.set(o.org_name, (tc.get(o.org_name) || 0) + 1));
    const names = new Set<string>([...uc.keys(), ...tc.keys()]);
    return [...names].sort().map(name => ({ name, users: uc.get(name) || 0, techStack: tc.get(name) || 0 }));
  });

  const showTechStack = () => openDetail('Tech Stack Entries', ['org_name', 'vendor', 'product_name', 'version', 'email_id'], async () => {
    const { data, error } = await supabase.from('tech_stack').select('org_name, vendor, product_name, version, email_id').limit(DETAIL_LIMIT);
    if (error) throw error; return data || [];
  });

  const showResults = () => openDetail('Processed Results', ['org_name', 'vendor', 'product_name', 'cve_match', 'cert_in', 'severity_cve'], async () => {
    const { data, error } = await supabase.from('tech_stack_results').select('org_name, vendor, product_name, cve_match, cert_in, severity_cve').limit(DETAIL_LIMIT);
    if (error) throw error; return data || [];
  });

  const showCVE = () => openDetail('CVE Matches', ['org_name', 'vendor', 'product_name', 'cve_match', 'severity_cve'], async () => {
    const { data, error } = await supabase.from('tech_stack_results').select('org_name, vendor, product_name, cve_match, severity_cve').eq('source', 'nvd').limit(DETAIL_LIMIT);
    if (error) throw error; return data || [];
  });

  const showCertIn = () => openDetail('CERT-IN Matches', ['org_name', 'vendor', 'product_name', 'cert_in', 'cve_match', 'severity_cert_in'], async () => {
    const { data, error } = await supabase.from('tech_stack_results').select('org_name, vendor, product_name, cert_in, cve_match, severity_cert_in').not('cert_in', 'is', null).limit(DETAIL_LIMIT);
    if (error) throw error; return data || [];
  });

  const showAdmins = () => openDetail('Admin Users', ['email', 'role'], async () => {
    const { data: roles, error } = await supabase.from('user_roles').select('user_id, role').eq('role', 'admin');
    if (error) throw error;
    // Map user_id -> email via user_settings is not reliable (keyed by email). Use admin list as-is + try email lookup.
    const { data: us } = await supabase.from('user_settings').select('email_id, user_id');
    const emailById = new Map<string, string>((us || []).map((u: any) => [u.user_id, u.email_id]));
    return (roles || []).map((r: any) => ({ email: emailById.get(r.user_id) || r.user_id, role: r.role }));
  });

  const showAudit = () => openDetail('System Logs', ['created_at', 'source', 'status', 'email_id', 'summary'], async () => {
    const { data, error } = await supabase.from('admin_audit_logs').select('created_at, source, status, email_id, summary, action_performed, new_value').order('created_at', { ascending: false }).limit(DETAIL_LIMIT);
    if (error) throw error; return data || [];
  });

  const showSentNotifications = () => openDetail('Sent Email Notifications', ['email_id', 'org_name', 'recipients', 'vendor', 'product_name', 'cve_match', 'cert_in', 'severity', 'sent_at'], async () => {
    const { data, error } = await supabase.from('sent_notifications').select('email_id, org_name, recipients, vendor, product_name, cve_match, cert_in, severity, sent_at').order('sent_at', { ascending: false }).limit(DETAIL_LIMIT);
    if (error) throw error; return data || [];
  });

  const fetchStats = useCallback(async () => {
    try {
      // Server-side admin verification
      const isAdmin = await verifyAdminRole();
      if (!isAdmin) {
        setAccessDenied(true);
        toast({
          title: "Access Denied",
          description: "Admin verification failed",
          variant: "destructive"
        });
        return;
      }

      // Fetch all stats in parallel
      const [
        usersResult,
        techStackResult,
        resultsResult,
        cveResult,
        certInResult,
        adminsResult,
        auditResult,
        sentNotifResult
      ] = await Promise.all([
        supabase.from('user_settings').select('id', { count: 'exact', head: true }),
        supabase.from('tech_stack').select('id', { count: 'exact', head: true }),
        supabase.from('tech_stack_results').select('id', { count: 'exact', head: true }),
        supabase.from('tech_stack_results').select('id', { count: 'exact', head: true }).eq('source', 'nvd'),
        supabase.from('tech_stack_results').select('id', { count: 'exact', head: true }).not('cert_in', 'is', null),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
        supabase.from('admin_audit_logs').select('id', { count: 'exact', head: true }),
        supabase.from('sent_notifications').select('id', { count: 'exact', head: true })
      ]);

      // Unique org count (for the card number). Full breakdown is lazy-loaded on click.
      const { data: orgsData } = await supabase.from('user_settings').select('org_name');
      const uniqueOrgs = new Set((orgsData || []).map(o => o.org_name).filter(Boolean));

      setStats({
        totalUsers: usersResult.count || 0,
        totalOrgs: uniqueOrgs.size,
        totalTechStack: techStackResult.count || 0,
        totalResults: resultsResult.count || 0,
        totalCVE: cveResult.count || 0,
        totalCertIn: certInResult.count || 0,
        totalAdmins: adminsResult.count || 0,
        auditLogCount: auditResult.count || 0,
        sentNotificationsCount: sentNotifResult.count || 0,
        engineStatus: 'idle',
        lastEngineRun: null
      });
    } catch {
      // Silent failure for admin stats - show toast only
      toast({
        title: "Error",
        description: "Failed to load admin statistics",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [verifyAdminRole, toast]);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchStats();
  };

  // ── Per-customer email checkpoint clear ───────────────────────────────────
  const [checkpointEmail, setCheckpointEmail] = useState('');
  const [clearingCheckpoint, setClearingCheckpoint] = useState(false);

  const handleClearCheckpoint = async () => {
    const email = checkpointEmail.trim();
    if (!email) {
      toast({ title: 'Enter a customer email', description: 'Select or type the customer email to clear.', variant: 'destructive' });
      return;
    }
    setClearingCheckpoint(true);
    try {
      const { data, error } = await supabase.rpc('admin_clear_sent_notifications', { target_email: email });
      if (error) throw error;
      toast({
        title: 'Checkpoint cleared',
        description: `Removed ${data ?? 0} sent record(s) for ${email}. They can now receive those advisories again.`,
      });
      setCheckpointEmail('');
      fetchStats();
    } catch (e: any) {
      toast({ title: 'Failed to clear checkpoint', description: e?.message || 'Unexpected error', variant: 'destructive' });
    } finally {
      setClearingCheckpoint(false);
    }
  };

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-500', bgColor: 'bg-blue-500/10', onClick: showUsers },
    { label: 'Organizations', value: stats.totalOrgs, icon: Building2, color: 'text-purple-500', bgColor: 'bg-purple-500/10', onClick: showOrganizations },
    { label: 'Tech Stack Entries', value: stats.totalTechStack, icon: Package, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', onClick: showTechStack },
    { label: 'Processed Results', value: stats.totalResults, icon: FileText, color: 'text-green-500', bgColor: 'bg-green-500/10', onClick: showResults },
    { label: 'CVE Matches', value: stats.totalCVE, icon: AlertTriangle, color: 'text-orange-500', bgColor: 'bg-orange-500/10', onClick: showCVE },
    { label: 'CERT-IN Matches', value: stats.totalCertIn, icon: Shield, color: 'text-red-500', bgColor: 'bg-red-500/10', onClick: showCertIn },
    { label: 'Admin Users', value: stats.totalAdmins, icon: Shield, color: 'text-accent', bgColor: 'bg-accent/10', onClick: showAdmins },
    { label: 'Audit Log Entries', value: stats.auditLogCount, icon: Activity, color: 'text-indigo-500', bgColor: 'bg-indigo-500/10', onClick: showAudit },
    { label: 'Emails Sent', value: stats.sentNotificationsCount, icon: Mail, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', onClick: showSentNotifications },
  ];

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Lock className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have admin privileges to view this content.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        <span className="ml-3 text-muted-foreground">Loading admin dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Admin Overview</h1>
          <p className="text-muted-foreground">System statistics and monitoring dashboard</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card
              className={`border-border transition-colors ${
                (stat as any).onClick
                  ? 'hover:border-accent cursor-pointer'
                  : 'hover:border-accent/50'
              }`}
              onClick={(stat as any).onClick}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">
                      {stat.label}
                      {(stat as any).onClick && <span className="ml-1 text-accent">· view</span>}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Engine Status */}
      <Card className="border-border">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Engine Status</h3>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              {stats.engineStatus === 'idle' && (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-foreground">Idle</span>
                </>
              )}
              {stats.engineStatus === 'running' && (
                <>
                  <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
                  <span className="text-foreground">Running</span>
                </>
              )}
              {stats.engineStatus === 'error' && (
                <>
                  <XCircle className="h-5 w-5 text-red-500" />
                  <span className="text-foreground">Error</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-sm">
                Last run: {stats.lastEngineRun || 'Never'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-customer email checkpoint clear */}
      <Card className="border-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Trash2 className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-semibold text-foreground">Clear Email Checkpoint</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Reset a customer's sent-email history so they can receive previously-sent advisories again
            (useful for demos/retesting). This only clears the dedup record — it does not send any email.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 max-w-xl">
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground mb-1 block">Customer email</label>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={checkpointEmail}
                onChange={(e) => setCheckpointEmail(e.target.value)}
                list="checkpoint-email-suggestions"
              />
            </div>
            <Button
              variant="destructive"
              onClick={handleClearCheckpoint}
              disabled={clearingCheckpoint || !checkpointEmail.trim()}
            >
              {clearingCheckpoint ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {clearingCheckpoint ? 'Clearing...' : 'Clear Checkpoint'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* System Health Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-foreground">Database</span>
              </div>
              <span className="text-xs text-green-500">Connected</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-foreground">Auth Service</span>
              </div>
              <span className="text-xs text-green-500">Active</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-foreground">Edge Functions</span>
              </div>
              <span className="text-xs text-green-500">Available</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generic detail dialog (lazy-loaded per card) */}
      <Dialog open={detail.open} onOpenChange={(o) => setDetail(d => ({ ...d, open: o }))}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail.title}</DialogTitle>
            <DialogDescription>
              Showing up to {DETAIL_LIMIT} record(s).
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto">
            {detail.loading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent"></div>
              </div>
            ) : detail.error ? (
              <p className="p-4 text-sm text-destructive">{detail.error}</p>
            ) : detail.rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No records to display.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    {detail.columns.map(c => (
                      <th key={c} className="px-3 py-2 text-left font-medium text-muted-foreground uppercase whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detail.rows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-muted/20">
                      {detail.columns.map(c => (
                        <td key={c} className="px-3 py-2 text-foreground whitespace-nowrap max-w-[260px] truncate" title={renderCell(row[c])}>
                          {renderCell(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminOverview;
