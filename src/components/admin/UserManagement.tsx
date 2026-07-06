import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { 
  Users, Search, Shield, User, Building2, 
  Package, MoreVertical, UserX, AlertTriangle, Loader2, Ban, RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminActions } from "@/hooks/useAdminActions";

interface UserData {
  id: string;
  email_id: string;
  org_name: string;
  notification_level: string | null;
  created_at: string | null;
  user_id: string | null;
  role: 'admin' | 'user';
  techStackCount: number;
}

const UserManagement = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [orgs, setOrgs] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [actionDialog, setActionDialog] = useState<{ type: string; open: boolean }>({ type: '', open: false });
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; action: () => void; title: string; description: string }>({
    open: false,
    action: () => {},
    title: '',
    description: ''
  });
  
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { isProcessing, assignAdminRole, removeAdminRole, verifyAdminRole } = useAdminActions();

  const fetchUsers = useCallback(async () => {
    try {
      // Server-side admin verification before fetching sensitive data
      const isAdmin = await verifyAdminRole();
      if (!isAdmin) {
        toast({
          title: "Access Denied",
          description: "Admin verification failed",
          variant: "destructive"
        });
        return;
      }

      // Fetch user settings
      const { data: settings, error: settingsError } = await supabase
        .from('user_settings')
        .select('*');

      if (settingsError) throw settingsError;

      // Fetch user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Create role map
      const roleMap = new Map<string, 'admin' | 'user'>();
      roles?.forEach(r => {
        if (r.role === 'admin') {
          roleMap.set(r.user_id, 'admin');
        }
      });

      // Fetch tech stack counts per user
      const { data: techStackData } = await supabase
        .from('tech_stack')
        .select('email_id');

      const techStackCounts = new Map<string, number>();
      techStackData?.forEach(ts => {
        const count = techStackCounts.get(ts.email_id) || 0;
        techStackCounts.set(ts.email_id, count + 1);
      });

      // Combine data
      const combinedUsers: UserData[] = settings?.map(s => ({
        id: s.id,
        email_id: s.email_id,
        org_name: s.org_name,
        notification_level: s.notification_level,
        created_at: s.created_at,
        user_id: s.user_id,
        role: s.user_id ? (roleMap.get(s.user_id) || 'user') : 'user',
        techStackCount: techStackCounts.get(s.email_id) || 0
      })) || [];

      setUsers(combinedUsers);
      setFilteredUsers(combinedUsers);

      // Get unique orgs
      const uniqueOrgs = [...new Set(combinedUsers.map(u => u.org_name))];
      setOrgs(uniqueOrgs);

    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [toast, verifyAdminRole]);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    let filtered = users;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(u => 
        u.email_id.toLowerCase().includes(query) ||
        u.org_name.toLowerCase().includes(query)
      );
    }

    // Role filter
    if (roleFilter !== 'all') {
      filtered = filtered.filter(u => u.role === roleFilter);
    }

    // Org filter
    if (orgFilter !== 'all') {
      filtered = filtered.filter(u => u.org_name === orgFilter);
    }

    setFilteredUsers(filtered);
  }, [searchQuery, roleFilter, orgFilter, users]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchUsers();
  };

  const handleAssignRole = async (role: 'admin' | 'user') => {
    if (!selectedUser?.user_id) {
      toast({
        title: "Error",
        description: "User ID not found",
        variant: "destructive"
      });
      return;
    }

    // Prevent self-modification
    if (selectedUser.user_id === currentUser?.id) {
      toast({
        title: "Error",
        description: "Cannot modify your own role",
        variant: "destructive"
      });
      return;
    }

    let result;
    if (role === 'admin') {
      result = await assignAdminRole(selectedUser.user_id);
    } else {
      result = await removeAdminRole(selectedUser.user_id);
    }

    if (result.success) {
      fetchUsers();
    }

    setActionDialog({ type: '', open: false });
    setSelectedUser(null);
  };

  const showConfirmation = (title: string, description: string, action: () => void) => {
    setConfirmDialog({
      open: true,
      title,
      description,
      action
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        <span className="ml-3 text-muted-foreground">Loading user data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground">Manage users, roles, and access permissions</p>
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

      {/* Security Notice */}
      <Card className="border-accent/20 bg-accent/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-accent" />
            <div>
              <span className="text-sm font-medium text-foreground">Server-Authoritative Access Control</span>
              <p className="text-xs text-muted-foreground">
                All role changes are verified server-side and logged immutably. Self-escalation is prevented.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email or organization..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="user">Users</SelectItem>
              </SelectContent>
            </Select>
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by org" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {orgs.map(org => (
                  <SelectItem key={org} value={org}>{org}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Users</CardTitle>
              <CardDescription>{filteredUsers.length} users found</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tech Stack</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Joined</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map((user) => (
                  <motion.tr 
                    key={user.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-muted/30"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-accent" />
                        </div>
                        <span className="text-sm text-foreground">{user.email_id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">{user.org_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role === 'admin' && <Shield className="h-3 w-3 mr-1" />}
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">{user.techStackCount}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setActionDialog({ type: 'view', open: true });
                          }}>
                            <User className="h-4 w-4 mr-2" />
                            View Profile
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {user.role === 'user' ? (
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedUser(user);
                                setActionDialog({ type: 'promote', open: true });
                              }}
                              disabled={!user.user_id}
                            >
                              <Shield className="h-4 w-4 mr-2" />
                              Promote to Admin
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedUser(user);
                                setActionDialog({ type: 'demote', open: true });
                              }}
                              disabled={user.email_id === currentUser?.email}
                              className="text-destructive"
                            >
                              <UserX className="h-4 w-4 mr-2" />
                              Remove Admin Role
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Promote Dialog */}
      <Dialog open={actionDialog.type === 'promote' && actionDialog.open} onOpenChange={(open) => setActionDialog({ type: '', open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-accent" />
              Promote to Admin
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to grant admin privileges to <strong>{selectedUser?.email_id}</strong>?
              This action will be logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Admin users have full access to the admin panel and can manage other users.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ type: '', open: false })} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={() => handleAssignRole('admin')} disabled={isProcessing}>
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Promotion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Demote Dialog */}
      <Dialog open={actionDialog.type === 'demote' && actionDialog.open} onOpenChange={(open) => setActionDialog({ type: '', open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <UserX className="h-5 w-5" />
              Remove Admin Role
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove admin privileges from <strong>{selectedUser?.email_id}</strong>?
              This action will be logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ type: '', open: false })} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => handleAssignRole('user')} disabled={isProcessing}>
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove Admin Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Profile Dialog */}
      <Dialog open={actionDialog.type === 'view' && actionDialog.open} onOpenChange={(open) => setActionDialog({ type: '', open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Profile</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center">
                  <User className="h-8 w-8 text-accent" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{selectedUser.email_id}</p>
                  <Badge variant={selectedUser.role === 'admin' ? 'default' : 'secondary'}>
                    {selectedUser.role}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Organization</span>
                  <span className="text-foreground">{selectedUser.org_name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Tech Stack Entries</span>
                  <span className="text-foreground">{selectedUser.techStackCount}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Notification Level</span>
                  <span className="text-foreground">{selectedUser.notification_level || 'all'}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Joined</span>
                  <span className="text-foreground">
                    {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString() : '-'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;
