import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, Sun, Moon, Save, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// UI-only settings stored in localStorage (non-sensitive)
const THEME_KEY = 'vulnerix_theme';

interface SettingsData {
  emailNotifications: boolean;
  criticalAlerts: boolean;
  weeklyDigest: boolean;
  theme: 'light' | 'dark' | 'system';
  autoRefresh: boolean;
  refreshInterval: string;
  notificationSeverities: string[];
  notificationSources: string[];
}

const defaultSettings: SettingsData = {
  emailNotifications: true,
  criticalAlerts: true,
  weeklyDigest: false,
  theme: 'light',
  autoRefresh: false,
  refreshInterval: '5',
  notificationSeverities: ['Critical', 'High'],
  notificationSources: ['CVE', 'CERT-In']
};

const SEVERITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];
// NVD/CVE always ON internally - only CERT-In is user-toggleable

const Settings = () => {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);

  // Delete account state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      if (!user?.email) {
        setIsLoading(false);
        return;
      }

      try {
        // Load notification_level from user_settings table
        const { data, error } = await supabase
          .from('user_settings')
          .select('notification_level')
          .eq('email_id', user.email)
          .maybeSingle();

        if (error) {
          console.error('Error loading settings:', error);
        }

        // Parse notification level to derive settings
        const notificationLevel = data?.notification_level || 'all';
        
        // Load theme from localStorage (UI preference only)
        const storedTheme = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | 'system' | null;
        
        setSettings(prev => ({
          ...prev,
          theme: storedTheme || 'light',
          emailNotifications: notificationLevel !== 'none',
          criticalAlerts: notificationLevel === 'all' || notificationLevel === 'critical',
        }));
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [user]);

  const handleSave = async () => {
    if (!user?.email) {
      toast({
        title: "Error",
        description: "You must be logged in to save settings.",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    
    try {
      // Determine notification level based on settings
      let notificationLevel = 'all';
      if (!settings.emailNotifications) {
        notificationLevel = 'none';
      } else if (settings.criticalAlerts && !settings.weeklyDigest) {
        notificationLevel = 'critical';
      }

      // Update user_settings in database
      const { data: existingSettings } = await supabase
        .from('user_settings')
        .select('id')
        .eq('email_id', user.email)
        .maybeSingle();

      if (existingSettings) {
        // Update existing
        const { error: updateError } = await supabase
          .from('user_settings')
          .update({ notification_level: notificationLevel })
          .eq('email_id', user.email);

        if (updateError) throw updateError;
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from('user_settings')
          .insert({
            email_id: user.email,
            org_name: user.user_metadata?.organization || 'Unknown',
            notification_level: notificationLevel,
            user_id: user.id
          });

        if (insertError) throw insertError;
      }

      // Save theme to localStorage (UI preference only)
      localStorage.setItem(THEME_KEY, settings.theme);

      toast({
        title: "Settings saved",
        description: settings.emailNotifications && user?.email 
          ? `Notifications will be sent to ${user.email}`
          : "Your preferences have been updated.",
      });
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to save settings.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    
    // Apply theme immediately when changed
    if (key === 'theme') {
      setTheme(value as 'light' | 'dark' | 'system');
    }
  };

  const toggleSeverity = (severity: string) => {
    setSettings(prev => ({
      ...prev,
      notificationSeverities: prev.notificationSeverities.includes(severity)
        ? prev.notificationSeverities.filter(s => s !== severity)
        : [...prev.notificationSeverities, severity]
    }));
  };

  const toggleSource = (source: string) => {
    // NVD cannot be disabled
    if (source === 'NVD') return;
    
    setSettings(prev => ({
      ...prev,
      notificationSources: prev.notificationSources.includes(source)
        ? prev.notificationSources.filter(s => s !== source)
        : [...prev.notificationSources, source]
    }));
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    setIsDeleting(true);

    try {
      // Call server-side edge function for complete account deletion
      const { error } = await supabase.functions.invoke('delete-user');
      
      if (error) {
        throw new Error(error.message || 'Failed to delete account');
      }

      // Clear UI preferences from localStorage
      localStorage.removeItem(THEME_KEY);
      localStorage.removeItem('vulnerix_tour_completed');

      toast({
        title: "Account deleted",
        description: "Your account and all data have been permanently removed.",
      });

      await logout();
      navigate('/');
    } catch (err: any) {
      console.error('Failed to delete account:', err);
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Configure your preferences</p>
        </div>

        {/* Notification Settings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border overflow-hidden"
        >
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
                <p className="text-sm text-muted-foreground">
                  Manage your notification preferences
                  {user?.email && <span className="block text-xs mt-1">Notifications will be sent to: {user.email}</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive email updates for new advisories</p>
              </div>
              <Switch
                checked={settings.emailNotifications}
                onCheckedChange={(checked) => updateSetting('emailNotifications', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Critical Alerts</Label>
                <p className="text-sm text-muted-foreground">Immediate alerts for critical vulnerabilities</p>
              </div>
              <Switch
                checked={settings.criticalAlerts}
                onCheckedChange={(checked) => updateSetting('criticalAlerts', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Weekly Digest</Label>
                <p className="text-sm text-muted-foreground">Weekly summary of all vulnerabilities</p>
              </div>
              <Switch
                checked={settings.weeklyDigest}
                onCheckedChange={(checked) => updateSetting('weeklyDigest', checked)}
              />
            </div>

            {/* Severity Multi-Select */}
            <div className="pt-4 border-t border-border">
              <Label className="text-base mb-3 block">Notify for Severity Levels</Label>
              <div className="flex flex-wrap gap-3">
                {SEVERITY_OPTIONS.map((severity) => (
                  <label
                    key={severity}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={settings.notificationSeverities.includes(severity)}
                      onCheckedChange={() => toggleSeverity(severity)}
                    />
                    <span className={`text-sm font-medium ${
                      severity === 'Critical' ? 'text-severity-critical' :
                      severity === 'High' ? 'text-severity-high' :
                      severity === 'Medium' ? 'text-severity-medium' :
                      'text-severity-low'
                    }`}>
                      {severity}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* CERT-In Toggle - NVD/CVE always ON internally */}
            <div className="pt-4 border-t border-border">
              <Label className="text-base mb-3 block">Advisory Sources</Label>
              <p className="text-sm text-muted-foreground mb-4">
                NVD/CVE advisories are always enabled. Toggle CERT-In notifications below.
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 cursor-not-allowed opacity-70">
                  <Checkbox checked={true} disabled />
                  <span className="text-sm font-medium">
                    NVD/CVE <span className="text-xs text-muted-foreground ml-1">(Always On)</span>
                  </span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={settings.notificationSources.includes('CERT-In')}
                    onCheckedChange={() => toggleSource('CERT-In')}
                  />
                  <span className="text-sm font-medium">CERT-In Advisories</span>
                </label>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Display Settings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-xl border border-border overflow-hidden"
        >
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                {theme === 'dark' ? (
                  <Moon className="h-5 w-5 text-accent" />
                ) : (
                  <Sun className="h-5 w-5 text-accent" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Display</h2>
                <p className="text-sm text-muted-foreground">Customize your display preferences</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Theme</Label>
                <p className="text-sm text-muted-foreground">Choose your preferred theme</p>
              </div>
              <Select
                value={settings.theme}
                onValueChange={(value: 'light' | 'dark' | 'system') => updateSetting('theme', value)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card">
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      Light
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      Dark
                    </div>
                  </SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Auto Refresh</Label>
                <p className="text-sm text-muted-foreground">Automatically refresh advisory data</p>
              </div>
              <Switch
                checked={settings.autoRefresh}
                onCheckedChange={(checked) => updateSetting('autoRefresh', checked)}
              />
            </div>

            {settings.autoRefresh && (
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Refresh Interval</Label>
                  <p className="text-sm text-muted-foreground">How often to refresh data</p>
                </div>
                <Select
                  value={settings.refreshInterval}
                  onValueChange={(value) => updateSetting('refreshInterval', value)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card">
                    <SelectItem value="1">1 minute</SelectItem>
                    <SelectItem value="5">5 minutes</SelectItem>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </motion.div>

        {/* Danger Zone - Delete Account */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-xl border border-destructive/30 overflow-hidden"
        >
          <div className="p-6 border-b border-destructive/30 bg-destructive/5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Danger Zone</h2>
                <p className="text-sm text-muted-foreground">Irreversible and destructive actions</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base text-destructive">Delete Account</Label>
                <p className="text-sm text-muted-foreground">
                  Permanently delete your account and all associated data
                </p>
              </div>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button variant="accent" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your account
              and remove all your data from our servers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteAccount}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Yes, Delete My Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Settings;
