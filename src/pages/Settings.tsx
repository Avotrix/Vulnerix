import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, Sun, Moon, Save, Trash2, AlertTriangle, RefreshCw, Sparkles, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { useCVEEngine } from "@/hooks/useCVEEngine";

// UI-only settings stored in localStorage (non-sensitive)
const THEME_KEY = 'vulnerix_theme';
const AUTO_REFRESH_KEY = 'vulnerix_auto_refresh';
function intervalToMs(cfg: { refreshInterval: string; customValue: string; customUnit: 'hours' | 'days'; }): number {
  if (cfg.refreshInterval === 'custom') {
    const n = Math.max(1, parseInt(cfg.customValue || '1', 10) || 1);
    const unitMs = cfg.customUnit === 'days' ? 86400000 : 3600000;
    return n * unitMs;
  }
  return (parseInt(cfg.refreshInterval, 10) || 30) * 60000;
}

// Parse a DB cron_time string like "09:00_AM" into safe UI parts.
// Returns hard defaults on any bad/missing input so Select controls never
// receive a value that has no matching item (which crashes Radix Select).
function parseCronTimeToParts(raw: string | null | undefined): { hour: string; minute: string; period: 'AM' | 'PM' } {
  const fallback = { hour: '9', minute: '00', period: 'AM' as const };
  if (!raw || typeof raw !== 'string' || !raw.includes('_')) return fallback;
  const [timeStr, periodRaw] = raw.split('_');
  if (!timeStr || !periodRaw) return fallback;
  const [h, m] = timeStr.split(':');
  let hourNum = parseInt(h, 10);
  const minNum = parseInt(m, 10);
  if (isNaN(hourNum) || isNaN(minNum)) return fallback;
  const period: 'AM' | 'PM' = periodRaw.toUpperCase() === 'PM' ? 'PM' : 'AM';
  // Normalize hour into 1..12 for the 12-hour picker.
  if (hourNum === 0) hourNum = 12;
  if (hourNum > 12) hourNum = hourNum - 12;
  const minute = ['00', '15', '30', '45'].includes(m) ? m : (minNum < 30 ? '00' : '30');
  return { hour: String(hourNum), minute, period };
}

// Compose the DB cron_time string "HH:MM_AM" from UI parts (used at save).
function composeCronTime(hour: string, minute: string, period: 'AM' | 'PM'): string {
  const h = String(parseInt(hour, 10) || 9).padStart(2, '0');
  const m = ['00', '15', '30', '45'].includes(minute) ? minute : '00';
  const p = period === 'PM' ? 'PM' : 'AM';
  return `${h}:${m}_${p}`;
}

interface SettingsData {
  emailNotifications: boolean;
  reassuranceEnabled: boolean;
  digestFrequency: 'immediate' | 'daily' | 'weekly';
  // Cron time stored as separate safe parts (no inline string splitting in JSX).
  cronHour: string;   // '1'..'12'
  cronMinute: string; // '00','15','30','45'
  cronPeriod: 'AM' | 'PM';
  cronDay: string;    // monday, tuesday, ..., sunday
  theme: 'light' | 'dark' | 'system';
  autoRefresh: boolean;
  refreshInterval: string;
  customValue: string;
  customUnit: 'hours' | 'days';
  notificationSeverities: string[];
  notificationSources: string[];
}

const defaultSettings: SettingsData = {
  emailNotifications: true,
  reassuranceEnabled: true,
  digestFrequency: 'daily',
  cronHour: '9',
  cronMinute: '00',
  cronPeriod: 'AM',
  cronDay: 'monday',
  theme: 'light',
  autoRefresh: false,
  refreshInterval: '30',
  customValue: '1',
  customUnit: 'days',
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
  const { triggerEngine } = useCVEEngine();
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Guard: don't persist auto-refresh config until initial load has hydrated it,
  // otherwise the default (false) would overwrite the saved value on mount.
  const [isHydrated, setIsHydrated] = useState(false);

  const handleRefreshNow = async () => {
    setIsRefreshing(true);
    try {
      const result = await triggerEngine();
      if (result.success) {
        toast({
          title: "Tech stack refreshed",
          description: `Re-matched ${result.processed} item(s), found ${result.matches} advisory match(es).`,
        });
      } else {
        toast({
          title: "Refresh failed",
          description: result.error || "Could not refresh tech stack.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Refresh failed", description: err?.message || "Unexpected error.", variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Persist auto-refresh config and run the interval timer when enabled.
  // Skip until initial load has hydrated settings from localStorage, so we
  // never overwrite the saved value with the on-mount default.
  useEffect(() => {
    if (!isHydrated) return;

    localStorage.setItem(AUTO_REFRESH_KEY, JSON.stringify({
      autoRefresh: settings.autoRefresh,
      refreshInterval: settings.refreshInterval,
      customValue: settings.customValue,
      customUnit: settings.customUnit,
    }));

    if (!settings.autoRefresh) return;
    // Enforce a sane floor (5 min) so a bad value can't create a hot loop, and
    // guard the async call so a rejected refresh never kills the interval.
    const ms = Math.max(5 * 60000, intervalToMs(settings));
    const id = setInterval(() => {
      Promise.resolve(handleRefreshNow()).catch((e) =>
        console.warn('[auto-refresh] tick failed, will retry next interval:', e)
      );
    }, ms);
    return () => clearInterval(id);
  }, [isHydrated, settings.autoRefresh, settings.refreshInterval, settings.customValue, settings.customUnit]);

  // Delete account state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ---- AI Remediation provider config (Phase 1) ----
  const [aiProvider, setAiProvider] = useState('groq');
  const [aiModel, setAiModel] = useState('qwen/qwen3.8-27b');
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [aiLast4, setAiLast4] = useState<string | null>(null);
  const [aiIsSet, setAiIsSet] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiShow, setAiShow] = useState(false);

  // scroll to AI section if redirected with ?section=ai (retry until card is in DOM)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('section') !== 'ai') return;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const el = document.getElementById('ai-remediation');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-accent');
        setTimeout(() => el.classList.remove('ring-2', 'ring-accent'), 2500);
        clearInterval(timer);
      } else if (tries > 40) {
        clearInterval(timer);
      }
    }, 150);
    return () => clearInterval(timer);
  }, [isLoading]);

  const handleDeleteAiKey = async () => {
    try {
      const { error } = await supabase.rpc('delete_ai_key', { p_provider: aiProvider });
      if (error) throw error;
      setAiKeyInput(''); setAiShow(false); setAiLast4(null); setAiIsSet(false);
      toast({ title: 'API key removed' });
    } catch (e: any) {
      toast({ title: 'Could not delete key', description: e.message || 'error', variant: 'destructive' });
    }
  };

  const loadAiMeta = async (prov?: string) => {
    const which = prov || aiProvider;
    try {
      const { data, error } = await supabase.rpc('get_ai_key_meta', { p_provider: which });
      if (!error && data && data.length > 0) {
        const r = data[0];
        // provider stays as user-selected
        setAiModel(r.model || 'qwen/qwen3.8-27b');
        setAiLast4(r.last4 || null);
        setAiIsSet(!!r.is_set);
      }
    } catch (e) { console.error('ai meta load failed', e); }
  };

  useEffect(() => { if (user?.email) loadAiMeta(aiProvider); }, [user]);

  const handleSaveAiKey = async () => {
    if (!aiKeyInput.trim()) {
      toast({ title: 'Enter an API key', variant: 'destructive' });
      return;
    }
    setAiSaving(true);
    try {
      const { error } = await supabase.rpc('save_ai_key', {
        p_provider: aiProvider, p_model: aiModel, p_key: aiKeyInput.trim(),
      });
      if (error) throw error;
      setAiKeyInput('');
      setAiShow(false);
      await loadAiMeta(aiProvider);
      toast({ title: 'API key saved', description: 'Your AI provider key is stored securely.' });
    } catch (e: any) {
      toast({ title: 'Could not save key', description: e.message || 'error', variant: 'destructive' });
    } finally { setAiSaving(false); }
  };


  useEffect(() => {
    const loadSettings = async () => {
      // Always hydrate the auto-refresh config from localStorage first, even
      // if there's no logged-in email yet, so the persist guard can open.
      let arCfg0: any = {};
      try { arCfg0 = JSON.parse(localStorage.getItem(AUTO_REFRESH_KEY) || '{}'); } catch { arCfg0 = {}; }
      setSettings(prev => ({
        ...prev,
        autoRefresh: typeof arCfg0.autoRefresh === 'boolean' ? arCfg0.autoRefresh : prev.autoRefresh,
        refreshInterval: arCfg0.refreshInterval || prev.refreshInterval,
        customValue: arCfg0.customValue || prev.customValue,
        customUnit: arCfg0.customUnit || prev.customUnit,
      }));

      if (!user?.email) {
        setIsLoading(false);
        setIsHydrated(true);
        return;
      }

      try {
        // Load notification preferences from user_settings table
        const { data, error } = await supabase
          .from('user_settings')
          .select('email_enabled, severities, digest_frequency, cron_schedule_type, cron_time, cron_day, auto_refresh_enabled, refresh_interval_minutes, reassurance_enabled')
          .eq('email_id', user.email)
          .maybeSingle();

        if (error) {
          console.error('Error loading settings:', error);
        }

        // Load theme from localStorage (UI preference only)
        const storedTheme = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | 'system' | null;
        let arCfg: any = {};
        try { arCfg = JSON.parse(localStorage.getItem(AUTO_REFRESH_KEY) || '{}'); } catch { arCfg = {}; }
        // DB is the source of truth for auto-refresh (server scheduler uses it).
        // Map stored minutes back to a preset, else 'custom'.
        const dbMins = (typeof data?.refresh_interval_minutes === 'number') ? data.refresh_interval_minutes : null;
        const PRESET_MINS: Record<number, string> = { 30: '30', 60: '60', 360: '360', 720: '720', 1440: '1440' };
        if (typeof data?.auto_refresh_enabled === 'boolean') {
          arCfg.autoRefresh = data.auto_refresh_enabled;
        }
        if (dbMins && dbMins > 0) {
          if (PRESET_MINS[dbMins]) {
            arCfg.refreshInterval = PRESET_MINS[dbMins];
          } else {
            arCfg.refreshInterval = 'custom';
            if (dbMins % 1440 === 0) { arCfg.customValue = String(dbMins / 1440); arCfg.customUnit = 'days'; }
            else { arCfg.customValue = String(Math.round(dbMins / 60)); arCfg.customUnit = 'hours'; }
          }
        }

        // Safely parse DB cron_time ("HH:MM_AM"/"HH:MM_PM") into UI parts.
        // Always returns valid values so the Select controls never break.
        const parsedCron = parseCronTimeToParts(data?.cron_time);

        setSettings(prev => ({
          ...prev,
          theme: storedTheme || 'light',
          autoRefresh: typeof arCfg.autoRefresh === 'boolean' ? arCfg.autoRefresh : prev.autoRefresh,
          refreshInterval: arCfg.refreshInterval || prev.refreshInterval,
          customValue: arCfg.customValue || prev.customValue,
          customUnit: arCfg.customUnit || prev.customUnit,
          emailNotifications: typeof data?.email_enabled === 'boolean' ? data.email_enabled : prev.emailNotifications,
          reassuranceEnabled: typeof data?.reassurance_enabled === 'boolean' ? data.reassurance_enabled : prev.reassuranceEnabled,
          notificationSeverities: Array.isArray(data?.severities) && data.severities.length > 0 ? data.severities : prev.notificationSeverities,
          digestFrequency: (data?.digest_frequency as any) || prev.digestFrequency,
          cronHour: parsedCron.hour,
          cronMinute: parsedCron.minute,
          cronPeriod: parsedCron.period,
          cronDay: data?.cron_day || prev.cronDay,
        }));
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoading(false);
        setIsHydrated(true);
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
      // Keep legacy notification_level roughly in sync for back-compat.
      let notificationLevel = 'all';
      if (!settings.emailNotifications) {
        notificationLevel = 'none';
      } else if (settings.notificationSeverities.length === 1 && settings.notificationSeverities[0] === 'Critical') {
        notificationLevel = 'critical';
      }

      // Persist the auto-refresh interval server-side so the scheduler can run
      // it without a browser. Null interval => fall back to admin schedule.
      const refreshMins = settings.autoRefresh
        ? Math.max(5, Math.round(intervalToMs(settings) / 60000))
        : null;
      const prefs = {
        email_enabled: settings.emailNotifications,
        reassurance_enabled: settings.reassuranceEnabled,
        severities: settings.notificationSeverities,
        digest_frequency: settings.digestFrequency,
        cron_schedule_type: settings.digestFrequency,
        cron_time: composeCronTime(settings.cronHour, settings.cronMinute, settings.cronPeriod),
        cron_day: settings.cronDay,
        notification_level: notificationLevel,
        auto_refresh_enabled: settings.autoRefresh,
        refresh_interval_minutes: refreshMins,
      };

      // Update user_settings in database
      const { data: existingSettings } = await supabase
        .from('user_settings')
        .select('id')
        .eq('email_id', user.email)
        .maybeSingle();

      if (existingSettings) {
        const { error: updateError } = await supabase
          .from('user_settings')
          .update(prefs)
          .eq('email_id', user.email);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('user_settings')
          .insert({
            email_id: user.email,
            org_name: user.user_metadata?.organization || 'Unknown',
            user_id: user.id,
            ...prefs,
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

      // After saving settings, trigger send-notifications ONLY for immediate users.
      // Daily/weekly users do NOT get an email on save — they receive the digest
      // at their scheduled time via the server scheduler. (Backend also enforces this.)
      // Fire-and-forget so it doesn't block the save UX.
      if (settings.emailNotifications && settings.digestFrequency === 'immediate') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          supabase.functions
            .invoke('send-notifications', {
              headers: { Authorization: `Bearer ${session.access_token}` },
            })
            .then(({ data: nd, error: nerr }) => {
              if (!nerr && nd?.advisories_emailed && nd.advisories_emailed > 0) {
                console.log(`[Settings] Notifications sent for ${nd.advisories_emailed} advisory(ies).`);
              }
            })
            .catch((e) => console.warn('[Settings] Notification trigger warning:', e));
        }
      }
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
            <div className={`flex items-center justify-between ${!settings.emailNotifications ? 'opacity-50 pointer-events-none' : ''}`}>
              <div>
                <Label className="text-base">All-clear emails</Label>
                <p className="text-sm text-muted-foreground">Notify me even when no vulnerabilities are found. Turn off to receive emails only when there are matching CVEs.</p>
              </div>
              <Switch
                checked={settings.reassuranceEnabled}
                onCheckedChange={(checked) => updateSetting('reassuranceEnabled', checked)}
              />
            </div>

            <div className={`flex items-center justify-between ${!settings.emailNotifications ? 'opacity-50 pointer-events-none' : ''}`}>
              <div>
                <Label className="text-base">Digest Frequency</Label>
                <p className="text-sm text-muted-foreground">How often matched-advisory emails are sent</p>
              </div>
              <Select
                value={settings.digestFrequency}
                onValueChange={(value: 'immediate' | 'daily' | 'weekly') => updateSetting('digestFrequency', value)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card">
                  <SelectItem value="immediate">Immediate</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cron Schedule Settings - Daily / Weekly time picker (crash-proof:
                uses separate Hour/Minute/AM-PM selects, no inline string parsing). */}
            {(settings.emailNotifications && (settings.digestFrequency === 'daily' || settings.digestFrequency === 'weekly')) && (
              <div className="pt-4 border-t border-border">
                <Label className="text-base mb-3 block">
                  {settings.digestFrequency === 'weekly' ? 'Weekly Schedule' : 'Daily Schedule'}
                </Label>
                <p className="text-sm text-muted-foreground mb-4">
                  {settings.digestFrequency === 'weekly'
                    ? 'Emails will be sent once per week on your chosen day and time (IST).'
                    : 'Emails will be sent every day at this time (IST).'}
                </p>
                <div className="space-y-4">
                  {settings.digestFrequency === 'weekly' && (
                    <div>
                      <Label className="text-sm mb-2 block">Day of Week</Label>
                      <Select
                        value={settings.cronDay}
                        onValueChange={(day) => updateSetting('cronDay', day)}
                      >
                        <SelectTrigger className="w-full sm:w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card">
                          <SelectItem value="monday">Monday</SelectItem>
                          <SelectItem value="tuesday">Tuesday</SelectItem>
                          <SelectItem value="wednesday">Wednesday</SelectItem>
                          <SelectItem value="thursday">Thursday</SelectItem>
                          <SelectItem value="friday">Friday</SelectItem>
                          <SelectItem value="saturday">Saturday</SelectItem>
                          <SelectItem value="sunday">Sunday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label className="text-sm mb-2 block">Time (IST)</Label>
                    <div className="flex items-center gap-2">
                      <Select value={settings.cronHour} onValueChange={(v) => updateSetting('cronHour', v)}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-card max-h-60">
                          {['1','2','3','4','5','6','7','8','9','10','11','12'].map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-lg font-medium text-muted-foreground">:</span>
                      <Select value={settings.cronMinute} onValueChange={(v) => updateSetting('cronMinute', v)}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-card">
                          {['00','15','30','45'].map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={settings.cronPeriod} onValueChange={(v: 'AM' | 'PM') => updateSetting('cronPeriod', v)}>
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-card">
                          <SelectItem value="AM">AM</SelectItem>
                          <SelectItem value="PM">PM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Selected: {settings.cronHour}:{settings.cronMinute} {settings.cronPeriod} IST
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Severity Multi-Select */}
            <div className={`pt-4 border-t border-border ${!settings.emailNotifications ? 'opacity-50 pointer-events-none' : ''}`}>
              <Label className="text-base mb-3 block">Notify for Severity Levels</Label>
              <p className="text-sm text-muted-foreground mb-3">Only advisories of the selected severities will be emailed.</p>
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
                <Label className="text-base">Refresh Tech Stack Now</Label>
                <p className="text-sm text-muted-foreground">Re-match your tech stack against the latest NVD &amp; CERT-In data</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefreshNow} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Refreshing..." : "Refresh Now"}
              </Button>
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
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="360">6 hours</SelectItem>
                    <SelectItem value="720">12 hours</SelectItem>
                    <SelectItem value="1440">24 hours</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {settings.autoRefresh && settings.refreshInterval === 'custom' && (
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Custom Interval</Label>
                  <p className="text-sm text-muted-foreground">Enter a number and choose the unit</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={settings.customValue}
                    onKeyDown={(e) => {
                      // Block decimal point, exponent, and sign — whole numbers only.
                      if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                    }}
                    onChange={(e) => {
                      // Strip anything that isn't a digit, then clamp to >= 1.
                      const digits = e.target.value.replace(/[^0-9]/g, '');
                      const n = digits === '' ? '' : String(Math.max(1, parseInt(digits, 10)));
                      updateSetting('customValue', n);
                    }}
                    className="w-20"
                  />
                  <Select
                    value={settings.customUnit}
                    onValueChange={(value: 'hours' | 'days') => updateSetting('customUnit', value)}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card">
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* AI Remediation Settings */}
        <motion.div
          id="ai-remediation"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border overflow-hidden"
        >
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">AI Remediation</h2>
                <p className="text-sm text-muted-foreground">Connect an AI provider to generate remediation guidance</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Provider</label>
              <Select value={aiProvider} onValueChange={(v) => { setAiProvider(v); setAiModel(v === 'openrouter' ? 'nvidia/nemotron-3.5-lightning:free' : 'qwen/qwen3.8-27b'); setAiKeyInput(''); setAiShow(false); setAiLast4(null); setAiIsSet(false); loadAiMeta(v); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card">
                  <SelectItem value="groq">Groq</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">API Key</label>
              {aiIsSet && !aiShow ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 rounded-md border border-border bg-muted/30 text-sm text-muted-foreground">
                    {aiLast4 ? `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${aiLast4}` : 'Saved'}
                  </div>
                  <Button variant="outline" size="sm" onClick={handleDeleteAiKey} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={aiKeyInput}
                    onChange={(e) => setAiKeyInput(e.target.value)}
                    placeholder={aiIsSet ? 'Enter new key to replace' : 'Paste your API key'}
                    className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm"
                  />
                  {aiIsSet && (
                    <Button variant="outline" size="sm" onClick={() => { setAiShow(false); setAiKeyInput(''); }}>
                      <EyeOff className="h-4 w-4 mr-1" /> Hide
                    </Button>
                  )}
                </div>
              )}
              {aiIsSet && !aiShow && (
                <p className="text-xs text-muted-foreground">Key is stored securely and never shown in full.</p>
              )}
            </div>
            <Button variant="accent" onClick={handleSaveAiKey} disabled={aiSaving}>
              <Save className="h-4 w-4 mr-2" />
              {aiSaving ? 'Saving...' : 'Save AI Key'}
            </Button>
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
