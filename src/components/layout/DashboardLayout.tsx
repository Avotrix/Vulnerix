import { ReactNode, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { 
  LayoutDashboard, FileText, Package, Settings, 
  LogOut, User, ChevronDown, Bell, Phone, Shield, Trash2
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/contexts/AdminContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Advisory } from "@/lib/mockData";
import { SeverityBadge } from "@/components/ui/severity-badge";
import vulnerixLogo from "@/assets/vulnerix-logo.png";
import { supabase } from "@/integrations/supabase/client";

interface DashboardLayoutProps {
  children: ReactNode;
}

const READ_NOTIFICATIONS_KEY = 'vulnerix_read_notifications';
const SETTINGS_KEY = 'vulnerix_settings';
const CERTIN_TOGGLE_KEY = 'vulnerix_certin_toggle';

const getReadNotifications = (): string[] => {
  const data = localStorage.getItem(READ_NOTIFICATIONS_KEY);
  return data ? JSON.parse(data) : [];
};

const markNotificationAsRead = (cveId: string) => {
  const readIds = getReadNotifications();
  if (!readIds.includes(cveId)) {
    readIds.push(cveId);
    localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(readIds));
  }
};

const getNotificationSettings = () => {
  const data = localStorage.getItem(SETTINGS_KEY);
  if (data) {
    const settings = JSON.parse(data);
    return {
      severities: settings.notificationSeverities || ['Critical', 'High'],
      sources: settings.notificationSources || ['CVE', 'CERT-In']
    };
  }
  return {
    severities: ['Critical', 'High'],
    sources: ['CVE', 'CERT-In']
  };
};

// =============================================
// HELPER FUNCTIONS
// =============================================

const formatDate = (dateString: string): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return 'Invalid Date';
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (e) {
    console.error('Date formatting error:', e);
    return 'Invalid Date';
  }
};

const capitalizeSeverity = (severity: string): string => {
  if (!severity) return 'Low';
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
};

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isAdminAuthenticated } = useAdmin();
  
  const [notifications, setNotifications] = useState<Advisory[]>([]);
  const [allNotificationIds, setAllNotificationIds] = useState<string[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const userOrg = user?.user_metadata?.organization || 'Organization';

  const loadNotifications = useCallback(async () => {
    if (!user?.email) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const readIds = getReadNotifications();
      const settings = getNotificationSettings();
      const certInEnabled = localStorage.getItem(CERTIN_TOGGLE_KEY) !== 'false';

      const { data: advisories, error } = await supabase
        .from('tech_stack_results')
        .select('*')
        .eq('email_id', user.email);

      if (error) throw error;

      // Merge NVD + CERT-IN entries for the same CVE (same logic as useTechStackResults)
      const mergedRows = (() => {
        const groups = new Map<string, { nvd: any | null; certIn: any | null }>();
        const standalone: any[] = [];

        for (const row of (advisories || [])) {
          const cveId = row.cve_match;
          if (!cveId) {
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
          if (row.source === 'nvd' && !grp.nvd) grp.nvd = row;
          else if (row.source === 'cert_in' && !grp.certIn) grp.certIn = row;
        }

        const result: any[] = [];
        for (const { nvd, certIn } of groups.values()) {
          if (nvd && certIn) {
            result.push({ ...nvd, cert_in: certIn.cert_in, severity_cert_in: certIn.severity_cert_in });
          } else if (nvd) {
            result.push(nvd);
          } else if (certIn) {
            result.push(certIn);
          }
        }
        return [...result, ...standalone];
      })();

      const transformedAdvisories: Advisory[] = mergedRows.map(item => ({
        lastModified: formatDate(item.created_at),
        cve_id: item.cve_match || '',
        description: `${item.vendor || 'Unknown'} ${item.product_name || 'Product'} - ${item.cve_match || 'No CVE'}`,
        cpe_value: '',
        tech_stack_vendor: item.vendor || 'Unknown',
        tech_stack_product: item.product_name || 'Unknown',
        tech_stack_version: item.version || 'Unknown',
        match_status: 'Vulnerable',
        cvss_score: item.severity_cve === 'critical' ? 9.0 :
                    item.severity_cve === 'high' ? 7.5 :
                    item.severity_cve === 'medium' ? 5.0 : 3.0,
        Severity: capitalizeSeverity(item.severity_cve),
        attack_vector: 'Network',
        Vulnerability_Status: 'Active',
        cvin_id: item.cert_in,
        cvin_title: null,
        cvin_severity: item.severity_cert_in ? capitalizeSeverity(item.severity_cert_in) : null,
        cvin_risk_assessment: null,
        cvin_software_affected: null,
        cvin_url: null,
        Reference_URL: item.cve_match ? `https://nvd.nist.gov/vuln/detail/${item.cve_match}` : null,
        organization: item.org_name || 'Unknown',
        email_to: item.email_id || ''
      }));

      const urgentNotifications = transformedAdvisories
        .filter(advisory => {
          const notificationId = advisory.cve_id || advisory.cvin_id || '';
          if (!notificationId) return false;
          const isUnread = !readIds.includes(notificationId);
          return isUnread;
        });

      // Badge count = unread urgent notifications (resets when "Clear All" is clicked)
      setNotificationCount(urgentNotifications.length);
      setAllNotificationIds(urgentNotifications.map(n => n.cve_id || n.cvin_id || '').filter(Boolean));
      setNotifications(urgentNotifications.slice(0, 10));
    } catch (error) {
      console.error('Error loading notifications:', error);
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    loadNotifications();
    
    const subscription = supabase
      .channel('tech_stack_results_changes')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'tech_stack_results' },
        () => loadNotifications()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [loadNotifications, location.pathname]);

  const handleClearAll = () => {
    const allReadIds = [...new Set([...getReadNotifications(), ...allNotificationIds])];
    localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(allReadIds));
    setNotifications([]);
    setNotificationCount(0);
    setAllNotificationIds([]);
    setIsNotificationOpen(false);
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: FileText, label: 'Advisories', path: '/advisories' },
    { icon: Package, label: 'Tech Stack', path: '/tech-stack' },
    { icon: Phone, label: 'Contact', path: '/contact' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
        <div className="h-16 px-6 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-2">
              <img src={vulnerixLogo} alt="Vulnerix Logo" className="h-10 w-10" />
              <span className="text-xl font-display font-bold text-navy">Vulnerix</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    location.pathname === item.path
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <Popover open={isNotificationOpen} onOpenChange={setIsNotificationOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  {notificationCount > 0 && (
                    <span className="absolute top-1 right-1 h-4 w-4 bg-severity-critical rounded-full flex items-center justify-center text-[10px] text-white font-bold">
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0 bg-card">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="font-semibold text-foreground">Notifications</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{notificationCount} alerts</span>
                    {notificationCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={handleClearAll}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Clear All
                      </Button>
                    )}
                  </div>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No new alerts
                    </div>
                  ) : (
                    notifications.map((advisory) => (
                      <div
                        key={advisory.cve_id || advisory.cvin_id}
                        className="p-3 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer"
                        onClick={() => {
                          const notificationId = advisory.cve_id || advisory.cvin_id || '';
                          markNotificationAsRead(notificationId);
                          setNotifications(prev => prev.filter(n => (n.cve_id || n.cvin_id) !== notificationId));
                          setIsNotificationOpen(false);
                          navigate(`/advisories?cve=${notificationId}`);
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
                            advisory.Severity === 'Critical' ? 'bg-severity-critical/10' : 
                            advisory.Severity === 'High' ? 'bg-severity-high/10' :
                            advisory.Severity === 'Medium' ? 'bg-severity-medium/10' :
                            'bg-severity-low/10'
                          )}>
                            <Shield className={cn(
                              "h-4 w-4",
                              advisory.Severity === 'Critical' ? 'text-severity-critical' : 
                              advisory.Severity === 'High' ? 'text-severity-high' :
                              advisory.Severity === 'Medium' ? 'text-severity-medium' :
                              'text-severity-low'
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {advisory.cve_id || advisory.cvin_id}
                              </span>
                              <SeverityBadge severity={advisory.Severity} />
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {advisory.description}
                            </p>
                            <p className="text-xs text-muted-foreground/70 mt-1">
                              {advisory.tech_stack_vendor} / {advisory.tech_stack_product} v{advisory.tech_stack_version}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-3 border-t border-border">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => {
                      setIsNotificationOpen(false);
                      navigate('/advisories');
                    }}
                  >
                    View All Advisories
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-accent" />
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-sm font-medium">{userName}</div>
                    <div className="text-xs text-muted-foreground">{userOrg}</div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card">
                {isAdminAuthenticated && (
                  <>
                    <DropdownMenuItem onClick={() => navigate('/admin/panel')}>
                      <Shield className="h-4 w-4 mr-2 text-destructive" />
                      Admin Panel
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="pt-16 min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="container mx-auto px-6 py-8"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
};

export default DashboardLayout;
