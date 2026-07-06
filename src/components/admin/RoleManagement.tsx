import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Shield, Users, Clock, History, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface RoleEntry {
  id: string;
  user_id: string;
  role: 'admin' | 'user';
  created_at: string;
  email?: string;
}

interface RoleAuditEntry {
  id: string;
  admin_id: string;
  action_performed: string;
  previous_value: string | null;
  new_value: string | null;
  created_at: string;
}

const RoleManagement = () => {
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [roleAudit, setRoleAudit] = useState<RoleAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        // Fetch all roles
        const { data: rolesData, error: rolesError } = await supabase
          .from('user_roles')
          .select('*')
          .order('created_at', { ascending: false });

        if (rolesError) throw rolesError;

        // Get user emails
        const { data: usersData } = await supabase
          .from('user_settings')
          .select('user_id, email_id');

        const emailMap = new Map<string, string>();
        usersData?.forEach(u => {
          if (u.user_id) emailMap.set(u.user_id, u.email_id);
        });

        // Combine data
        const rolesWithEmail: RoleEntry[] = rolesData?.map(r => ({
          ...r,
          email: emailMap.get(r.user_id) || 'Unknown'
        })) || [];

        setRoles(rolesWithEmail);

        // Fetch role-related audit logs
        const { data: auditData, error: auditError } = await supabase
          .from('admin_audit_logs')
          .select('*')
          .or('action_performed.ilike.%role%,action_performed.ilike.%admin%')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!auditError && auditData) {
          setRoleAudit(auditData);
        }

      } catch (error) {
        console.error('Error fetching roles:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoles();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  const adminCount = roles.filter(r => r.role === 'admin').length;
  const userCount = roles.filter(r => r.role === 'user').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Role Management</h1>
        <p className="text-muted-foreground">View and manage user roles and access levels</p>
      </div>

      {/* Role Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{adminCount}</p>
                <p className="text-xs text-muted-foreground">Admin Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{userCount}</p>
                <p className="text-xs text-muted-foreground">Regular Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <History className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{roleAudit.length}</p>
                <p className="text-xs text-muted-foreground">Role Changes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Available Roles */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Available Roles</CardTitle>
          <CardDescription>System role definitions and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Shield className="h-5 w-5 text-accent" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-foreground">Admin</h4>
                  <Badge>Elevated</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Full access to admin panel, user management, role assignment, audit logs, and system configuration.
                  Can promote/demote other users. Actions are logged.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-foreground">User</h4>
                  <Badge variant="secondary">Standard</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Access to dashboard, tech stack management, advisories, and personal settings.
                  Cannot access admin panel or manage other users.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Admins */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Current Administrators</CardTitle>
          <CardDescription>Users with admin privileges</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {roles.filter(r => r.role === 'admin').map((role) => (
              <motion.div
                key={role.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center">
                    <Shield className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{role.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Admin since {new Date(role.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Badge>Active</Badge>
              </motion.div>
            ))}
            {roles.filter(r => r.role === 'admin').length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No admin users found
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Role Change History */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Role Change History
          </CardTitle>
          <CardDescription>Audit trail of role assignments and removals</CardDescription>
        </CardHeader>
        <CardContent>
          {roleAudit.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No role changes recorded
            </div>
          ) : (
            <div className="space-y-2">
              {roleAudit.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{entry.action_performed}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.previous_value} → {entry.new_value}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Notice */}
      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-foreground">Role Escalation Prevention</h4>
              <p className="text-sm text-muted-foreground">
                Users cannot self-promote to admin. Admin roles can only be assigned by existing admins 
                or via direct database access with service role credentials. All role changes are 
                immutably logged in the audit trail.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RoleManagement;
