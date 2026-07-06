import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/contexts/AdminContext";
import { useToast } from "@/hooks/use-toast";

// Admin Components
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminOverview from "@/components/admin/AdminOverview";
import UserManagement from "@/components/admin/UserManagement";
import RoleManagement from "@/components/admin/RoleManagement";
import AuditLogs from "@/components/admin/AuditLogs";
import SystemConfig from "@/components/admin/SystemConfig";
import DatabaseViewer from "@/components/admin/DatabaseViewer";
import SystemHealth from "@/components/admin/SystemHealth";

const AdminPanel = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdminAuthenticated, isAdminLoading } = useAdmin();
  const { toast } = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const currentTab = searchParams.get('tab') || 'dashboard';

  // Redirect if not admin
  useEffect(() => {
    if (!isAdminLoading && !isAdminAuthenticated) {
      toast({
        title: "Access Denied",
        description: "You must be an admin to access this page.",
        variant: "destructive"
      });
      navigate('/admin');
    }
  }, [isAdminAuthenticated, isAdminLoading, navigate, toast]);

  if (isAdminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (!isAdminAuthenticated) {
    return null;
  }

  const renderContent = () => {
    switch (currentTab) {
      case 'users':
        return <UserManagement />;
      case 'roles':
        return <RoleManagement />;
      case 'audit':
        return <AuditLogs />;
      case 'config':
        return <SystemConfig />;
      case 'database':
        return <DatabaseViewer />;
      case 'health':
        return <SystemHealth />;
      default:
        return <AdminOverview />;
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar */}
      <AdminSidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />
      
      {/* Main Content */}
      <main className={cn(
        "transition-all duration-300 min-h-screen",
        sidebarCollapsed ? "ml-16" : "ml-64"
      )}>
        <div className="p-8">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default AdminPanel;
