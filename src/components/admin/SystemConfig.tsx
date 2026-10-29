import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { 
  Settings, Play, Pause, RefreshCw, Shield, AlertTriangle,
  Bell, Gauge, Save, Clock, Lock, Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useAdminActions } from "@/hooks/useAdminActions";
import type { Json } from "@/integrations/supabase/types";

// Snap a "HH:MM" time to the nearest 15-min grid slot (00/15/30/45), so the
// fetch schedule always lands on a time the every-5-min scheduler will hit.
function snapTo15(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hhmm || '');
  if (!m) return '00:00';
  let h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  let min = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  const snapped = [0, 15, 30, 45].reduce((prev, cur) => (Math.abs(cur - min) < Math.abs(prev - min) ? cur : prev), 0);
  min = snapped === 60 ? 0 : snapped;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

interface SystemSettings {
  engineEnabled: boolean;
  cveSourceEnabled: boolean;
  certInSourceEnabled: boolean;
  notificationsEnabled: boolean;
  criticalThreshold: number;
  highThreshold: number;
  mediumThreshold: number;
  engineSchedule: string;
  engineScheduleCustomValue: string;
  engineScheduleCustomUnit: 'hours' | 'days';
  // NVD/CERT-In daily fetch schedule (IST). 24-hour "HH:MM" strings.
  nvdFetchTime: string;    // e.g. "20:35"
  certInFetchTime: string; // e.g. "19:35"
  nvdFetchFrequency: string;    // '6h' | '12h' | 'daily' | 'weekly'
  certInFetchFrequency: string; // '6h' | '12h' | 'daily' | 'weekly'
  nvdFetchDay: string;    // for weekly: 'monday'..'sunday'
  certInFetchDay: string; // for weekly
}

const defaultSettings: SystemSettings = {
  engineEnabled: true,
  cveSourceEnabled: true,
  certInSourceEnabled: true,
  notificationsEnabled: true,
  criticalThreshold: 9.0,
  highThreshold: 7.0,
  mediumThreshold: 4.0,
  engineSchedule: 'daily',
  engineScheduleCustomValue: '6',
  engineScheduleCustomUnit: 'hours',
  // Defaults on the 15-min grid (IST). NVD 20:30 IST = 15:00 UTC, CERT 19:30 IST = 14:00 UTC.
  nvdFetchTime: '20:30',
  certInFetchTime: '19:30',
  nvdFetchFrequency: 'daily',
  certInFetchFrequency: 'daily',
  nvdFetchDay: 'monday',
  certInFetchDay: 'monday'
};

const SystemConfig = () => {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [originalSettings, setOriginalSettings] = useState<SystemSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; action: string }>({ open: false, action: '' });
  
  const { toast } = useToast();
  const { isProcessing, updateSystemConfig, triggerEngine, verifyAdminRole } = useAdminActions();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Verify admin access first
        const isAdmin = await verifyAdminRole();
        if (!isAdmin) {
          toast({
            title: "Access Denied",
            description: "Admin verification failed",
            variant: "destructive"
          });
          return;
        }

        const { data, error } = await supabase
          .from('admin_settings')
          .select('settings')
          .limit(1)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        if (data?.settings) {
          const savedSettings = data.settings as Record<string, Json>;
          const loadedSettings: SystemSettings = {
            engineEnabled: (savedSettings.engineEnabled as boolean) ?? defaultSettings.engineEnabled,
            cveSourceEnabled: (savedSettings.cveSourceEnabled as boolean) ?? defaultSettings.cveSourceEnabled,
            certInSourceEnabled: (savedSettings.certInSourceEnabled as boolean) ?? defaultSettings.certInSourceEnabled,
            notificationsEnabled: (savedSettings.notificationsEnabled as boolean) ?? defaultSettings.notificationsEnabled,
            criticalThreshold: (savedSettings.criticalThreshold as number) ?? defaultSettings.criticalThreshold,
            highThreshold: (savedSettings.highThreshold as number) ?? defaultSettings.highThreshold,
            mediumThreshold: (savedSettings.mediumThreshold as number) ?? defaultSettings.mediumThreshold,
            engineSchedule: (savedSettings.engineSchedule as string) ?? defaultSettings.engineSchedule,
            engineScheduleCustomValue: (savedSettings.engineScheduleCustomValue as string) ?? defaultSettings.engineScheduleCustomValue,
            engineScheduleCustomUnit: (savedSettings.engineScheduleCustomUnit as 'hours' | 'days') ?? defaultSettings.engineScheduleCustomUnit,
            nvdFetchTime: (savedSettings.nvdFetchTime as string) ?? defaultSettings.nvdFetchTime,
            certInFetchTime: (savedSettings.certInFetchTime as string) ?? defaultSettings.certInFetchTime,
            nvdFetchFrequency: (savedSettings.nvdFetchFrequency as string) ?? defaultSettings.nvdFetchFrequency,
            certInFetchFrequency: (savedSettings.certInFetchFrequency as string) ?? defaultSettings.certInFetchFrequency,
            nvdFetchDay: (savedSettings.nvdFetchDay as string) ?? defaultSettings.nvdFetchDay,
            certInFetchDay: (savedSettings.certInFetchDay as string) ?? defaultSettings.certInFetchDay
          };
          setSettings(loadedSettings);
          setOriginalSettings(loadedSettings);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
        toast({
          title: "Error",
          description: "Failed to load settings",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [toast, verifyAdminRole]);

  const handleSaveSettings = async () => {
    const result = await updateSystemConfig(
      settings as unknown as Json, 
      originalSettings as unknown as Json
    );
    
    if (result.success) {
      setOriginalSettings(settings);
      setHasChanges(false);
    }
  };

  const updateSetting = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleTriggerEngine = async () => {
    setConfirmDialog({ open: false, action: '' });
    await triggerEngine();
  };

  const handleResetChanges = () => {
    setSettings(originalSettings);
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        <span className="ml-3 text-muted-foreground">Loading configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">System Configuration</h1>
          <p className="text-muted-foreground">Manage engine settings, sources, and thresholds</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="outline" onClick={handleResetChanges} disabled={isProcessing}>
              Reset
            </Button>
          )}
          <Button onClick={handleSaveSettings} disabled={!hasChanges || isProcessing}>
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {isProcessing ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Security Notice */}
      <Card className="border-accent/20 bg-accent/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-accent" />
            <div>
              <span className="text-sm font-medium text-foreground">Configuration Protected</span>
              <p className="text-xs text-muted-foreground">
                All changes are validated server-side and logged immutably in the audit trail.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Engine Controls */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Engine Controls
          </CardTitle>
          <CardDescription>Manage the CVE matching engine</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.engineEnabled ? (
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Play className="h-5 w-5 text-green-500" />
                </div>
              ) : (
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Pause className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <Label className="text-base">CVE Engine</Label>
                <p className="text-sm text-muted-foreground">
                  {settings.engineEnabled ? 'Engine is active and processing' : 'Engine is paused'}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.engineEnabled}
              onCheckedChange={(checked) => updateSetting('engineEnabled', checked)}
            />
          </div>

          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => setConfirmDialog({ open: true, action: 'trigger_engine' })}
              disabled={!settings.engineEnabled || isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Trigger Engine Manually
            </Button>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Select 
                value={settings.engineSchedule} 
                onValueChange={(value) => updateSetting('engineSchedule', value)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="manual">Manual Only</SelectItem>
                </SelectContent>
              </Select>
              {settings.engineSchedule === 'custom' && (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">every</span>
                  <Input
                    type="number"
                    min={1}
                    className="w-[70px]"
                    value={settings.engineScheduleCustomValue}
                    onChange={(e) => updateSetting('engineScheduleCustomValue', e.target.value || '1')}
                  />
                  <Select
                    value={settings.engineScheduleCustomUnit}
                    onValueChange={(value) => updateSetting('engineScheduleCustomUnit', value)}
                  >
                    <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">hours</SelectItem>
                      <SelectItem value="days">days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Automatic re-match runs on this schedule server-side (every 5 min the scheduler checks what is due).
            A user's own refresh interval, if set, takes priority over this. "Manual Only" = no admin-driven auto run.
            Use "Trigger Engine Manually" for an immediate system-wide run.
          </p>
        </CardContent>
      </Card>

      {/* Data Sources */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Sources
          </CardTitle>
          <CardDescription>Enable or disable vulnerability data sources</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <Label className="text-base">CVE / NVD Source</Label>
              <p className="text-sm text-muted-foreground">
                National Vulnerability Database (NVD) CVE data
              </p>
            </div>
            <Switch
              checked={settings.cveSourceEnabled}
              onCheckedChange={(checked) => updateSetting('cveSourceEnabled', checked)}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <Label className="text-base">CERT-IN Source</Label>
              <p className="text-sm text-muted-foreground">
                Indian Computer Emergency Response Team advisories
              </p>
            </div>
            <Switch
              checked={settings.certInSourceEnabled}
              onCheckedChange={(checked) => updateSetting('certInSourceEnabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Fetch Schedule (NVD / CERT-In, IST) */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Data Fetch Schedule (IST)
          </CardTitle>
          <CardDescription>How often and when the server fetches vulnerability data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3 p-4 bg-muted/20 rounded-lg">
              <Label className="text-base">NVD Fetch Schedule</Label>
              <p className="text-xs text-muted-foreground">National Vulnerability Database (modified + new CVEs)</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={settings.nvdFetchFrequency} onValueChange={(v) => updateSetting('nvdFetchFrequency', v)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6h">Every 6 hours</SelectItem>
                    <SelectItem value="12h">Every 12 hours</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
                {(settings.nvdFetchFrequency === 'daily' || settings.nvdFetchFrequency === 'weekly') && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">at</span>
                    <Select value={settings.nvdFetchTime.split(':')[0] || '16'} onValueChange={(h) => updateSetting('nvdFetchTime', h + ':' + (settings.nvdFetchTime.split(':')[1] || '00'))}>
                      <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({length: 24}, (_, i) => String(i).padStart(2, '0')).map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm">:</span>
                    <Select value={settings.nvdFetchTime.split(':')[1] || '00'} onValueChange={(m) => updateSetting('nvdFetchTime', (settings.nvdFetchTime.split(':')[0] || '16') + ':' + m)}>
                      <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="00">00</SelectItem>
                        <SelectItem value="15">15</SelectItem>
                        <SelectItem value="30">30</SelectItem>
                        <SelectItem value="45">45</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">IST</span>
                  </div>
                )}
                {settings.nvdFetchFrequency === 'weekly' && (
                  <Select value={settings.nvdFetchDay} onValueChange={(v) => updateSetting('nvdFetchDay', v)}>
                    <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monday">Monday</SelectItem>
                      <SelectItem value="tuesday">Tuesday</SelectItem>
                      <SelectItem value="wednesday">Wednesday</SelectItem>
                      <SelectItem value="thursday">Thursday</SelectItem>
                      <SelectItem value="friday">Friday</SelectItem>
                      <SelectItem value="saturday">Saturday</SelectItem>
                      <SelectItem value="sunday">Sunday</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="space-y-3 p-4 bg-muted/20 rounded-lg">
              <Label className="text-base">CERT-In Fetch Schedule</Label>
              <p className="text-xs text-muted-foreground">Indian CERT advisory pull</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={settings.certInFetchFrequency} onValueChange={(v) => updateSetting('certInFetchFrequency', v)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6h">Every 6 hours</SelectItem>
                    <SelectItem value="12h">Every 12 hours</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
                {(settings.certInFetchFrequency === 'daily' || settings.certInFetchFrequency === 'weekly') && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">at</span>
                    <Select value={settings.certInFetchTime.split(':')[0] || '16'} onValueChange={(h) => updateSetting('certInFetchTime', h + ':' + (settings.certInFetchTime.split(':')[1] || '00'))}>
                      <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({length: 24}, (_, i) => String(i).padStart(2, '0')).map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm">:</span>
                    <Select value={settings.certInFetchTime.split(':')[1] || '00'} onValueChange={(m) => updateSetting('certInFetchTime', (settings.certInFetchTime.split(':')[0] || '16') + ':' + m)}>
                      <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="00">00</SelectItem>
                        <SelectItem value="15">15</SelectItem>
                        <SelectItem value="30">30</SelectItem>
                        <SelectItem value="45">45</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">IST</span>
                  </div>
                )}
                {settings.certInFetchFrequency === 'weekly' && (
                  <Select value={settings.certInFetchDay} onValueChange={(v) => updateSetting('certInFetchDay', v)}>
                    <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monday">Monday</SelectItem>
                      <SelectItem value="tuesday">Tuesday</SelectItem>
                      <SelectItem value="wednesday">Wednesday</SelectItem>
                      <SelectItem value="thursday">Thursday</SelectItem>
                      <SelectItem value="friday">Friday</SelectItem>
                      <SelectItem value="saturday">Saturday</SelectItem>
                      <SelectItem value="sunday">Sunday</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            System-wide setting. The server applies the schedule on its next sync (every 5 min).
          </p>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification System
          </CardTitle>
          <CardDescription>Global notification settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <Label className="text-base">Enable Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Send alerts to users for new vulnerabilities
              </p>
            </div>
            <Switch
              checked={settings.notificationsEnabled}
              onCheckedChange={(checked) => updateSetting('notificationsEnabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Severity Thresholds */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Severity Thresholds (CVSS)
          </CardTitle>
          <CardDescription>Define severity classification boundaries</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-severity-critical">Critical Threshold (≥)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={settings.criticalThreshold}
                onChange={(e) => updateSetting('criticalThreshold', parseFloat(e.target.value))}
                className="border-severity-critical/30"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-severity-high">High Threshold (≥)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={settings.highThreshold}
                onChange={(e) => updateSetting('highThreshold', parseFloat(e.target.value))}
                className="border-severity-high/30"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-severity-medium">Medium Threshold (≥)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={settings.mediumThreshold}
                onChange={(e) => updateSetting('mediumThreshold', parseFloat(e.target.value))}
                className="border-severity-medium/30"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            * Scores below the Medium threshold are classified as Low severity
          </p>
        </CardContent>
      </Card>

      {/* Warning */}
      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-foreground">Configuration Changes</h4>
              <p className="text-sm text-muted-foreground">
                All configuration changes are logged in the audit trail. Changes to severity 
                thresholds will affect how vulnerabilities are classified going forward but 
                will not retroactively update existing records.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Engine Trigger Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ open, action: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trigger CVE Engine</AlertDialogTitle>
            <AlertDialogDescription>
              This will manually trigger the CVE matching engine to process all tech stack entries.
              This action will be logged in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTriggerEngine} disabled={isProcessing}>
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Trigger
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SystemConfig;
