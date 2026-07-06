import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { 
  Users, Building2, Package, FileText, Shield, AlertTriangle,
  Activity, Clock, CheckCircle, XCircle, RefreshCw, Lock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    engineStatus: 'idle',
    lastEngineRun: null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  
  const { verifyAdminRole } = useAdminActions();
  const { toast } = useToast();

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
        auditResult
      ] = await Promise.all([
        supabase.from('user_settings').select('id', { count: 'exact', head: true }),
        supabase.from('tech_stack').select('id', { count: 'exact', head: true }),
        supabase.from('tech_stack_results').select('id', { count: 'exact', head: true }),
        supabase.from('tech_stack_results').select('id', { count: 'exact', head: true }).not('cve_match', 'is', null),
        supabase.from('tech_stack_results').select('id', { count: 'exact', head: true }).not('cert_in', 'is', null),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
        supabase.from('admin_audit_logs').select('id', { count: 'exact', head: true })
      ]);

      // Get unique orgs
      const { data: orgsData } = await supabase
        .from('user_settings')
        .select('org_name');
      
      const uniqueOrgs = new Set(orgsData?.map(o => o.org_name) || []);

      setStats({
        totalUsers: usersResult.count || 0,
        totalOrgs: uniqueOrgs.size,
        totalTechStack: techStackResult.count || 0,
        totalResults: resultsResult.count || 0,
        totalCVE: cveResult.count || 0,
        totalCertIn: certInResult.count || 0,
        totalAdmins: adminsResult.count || 0,
        auditLogCount: auditResult.count || 0,
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

  const statCards = [
    { 
      label: 'Total Users', 
      value: stats.totalUsers, 
      icon: Users, 
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    { 
      label: 'Organizations', 
      value: stats.totalOrgs, 
      icon: Building2, 
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    },
    { 
      label: 'Tech Stack Entries', 
      value: stats.totalTechStack, 
      icon: Package, 
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10'
    },
    { 
      label: 'Processed Results', 
      value: stats.totalResults, 
      icon: FileText, 
      color: 'text-green-500',
      bgColor: 'bg-green-500/10'
    },
    { 
      label: 'CVE Matches', 
      value: stats.totalCVE, 
      icon: AlertTriangle, 
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10'
    },
    { 
      label: 'CERT-IN Matches', 
      value: stats.totalCertIn, 
      icon: Shield, 
      color: 'text-red-500',
      bgColor: 'bg-red-500/10'
    },
    { 
      label: 'Admin Users', 
      value: stats.totalAdmins, 
      icon: Shield, 
      color: 'text-accent',
      bgColor: 'bg-accent/10'
    },
    { 
      label: 'Audit Log Entries', 
      value: stats.auditLogCount, 
      icon: Activity, 
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10'
    },
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
            <Card className="border-border hover:border-accent/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
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
    </div>
  );
};

export default AdminOverview;
