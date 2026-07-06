import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, Users, ShieldCheck, Activity, Settings, 
  Database, HeartPulse, ChevronLeft, ChevronRight, Shield,
  LogOut, Menu
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import vulnerixLogo from "@/assets/vulnerix-logo.png";

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Overview', path: '/admin/panel', section: 'dashboard' },
  { icon: Users, label: 'User Management', path: '/admin/panel?tab=users', section: 'users' },
  { icon: ShieldCheck, label: 'Role Management', path: '/admin/panel?tab=roles', section: 'roles' },
  { icon: Activity, label: 'Audit Logs', path: '/admin/panel?tab=audit', section: 'audit' },
  { icon: Settings, label: 'System Config', path: '/admin/panel?tab=config', section: 'config' },
  { icon: Database, label: 'Database Viewer', path: '/admin/panel?tab=database', section: 'database' },
  { icon: HeartPulse, label: 'System Health', path: '/admin/panel?tab=health', section: 'health' },
];

const AdminSidebar = ({ collapsed, onToggle }: AdminSidebarProps) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab') || 'dashboard';

  const isActive = (section: string) => {
    if (section === 'dashboard' && !searchParams.get('tab')) return true;
    return currentTab === section;
  };

  return (
    <TooltipProvider>
      <aside className={cn(
        "fixed left-0 top-0 h-full bg-card border-r border-border z-50 transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}>
        {/* Header */}
        <div className="h-16 border-b border-border flex items-center justify-between px-4">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <img src={vulnerixLogo} alt="Vulnerix" className="h-8 w-8" />
              <div>
                <span className="font-display font-bold text-foreground">Admin</span>
                <span className="text-xs block text-muted-foreground">Control Center</span>
              </div>
            </div>
          )}
          {collapsed && (
            <img src={vulnerixLogo} alt="Vulnerix" className="h-8 w-8 mx-auto" />
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onToggle}
            className="h-8 w-8 flex-shrink-0"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Admin Badge */}
        <div className={cn(
          "px-4 py-3 border-b border-border",
          collapsed && "px-2"
        )}>
          <div className={cn(
            "flex items-center gap-2 p-2 rounded-lg bg-accent/10",
            collapsed && "justify-center"
          )}>
            <Shield className="h-4 w-4 text-accent flex-shrink-0" />
            {!collapsed && (
              <div className="min-w-0">
                <span className="text-xs font-medium text-accent block">Admin Access</span>
                <span className="text-xs text-muted-foreground truncate block">{user?.email}</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.section);
            
            if (collapsed) {
              return (
                <Tooltip key={item.section} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors",
                        active 
                          ? "bg-accent text-white" 
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <Link
                key={item.section}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium",
                  active 
                    ? "bg-accent text-white" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <Link
            to="/dashboard"
            className={cn(
              "flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2",
              collapsed && "justify-center"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            {!collapsed && <span>Back to Dashboard</span>}
          </Link>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={logout}
            className={cn("w-full", collapsed && "px-2")}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Logout</span>}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
};

export default AdminSidebar;
