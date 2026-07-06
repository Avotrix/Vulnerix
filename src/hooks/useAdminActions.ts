import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export interface AuditLogEntry {
  page_affected: string;
  action_performed: string;
  previous_value?: string | null;
  new_value?: string | null;
}

export interface AdminActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Hook for hardened admin actions with server-side validation,
 * audit logging, loading states, and error handling.
 */
export const useAdminActions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Verify current user has admin role server-side
   * Returns true only if the server confirms admin status
   */
  const verifyAdminRole = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) {
        console.error('Admin verification failed:', error);
        return false;
      }

      return !!data;
    } catch (err) {
      console.error('Admin verification error:', err);
      return false;
    }
  }, [user?.id]);

  /**
   * Log an admin action to the audit trail
   * All fields are sanitized and the log is immutable
   */
  const logAuditAction = useCallback(async (entry: AuditLogEntry): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase.from('admin_audit_logs').insert({
        admin_id: user.id,
        page_affected: entry.page_affected.slice(0, 100), // Sanitize length
        action_performed: entry.action_performed.slice(0, 200),
        previous_value: entry.previous_value?.slice(0, 5000) || null,
        new_value: entry.new_value?.slice(0, 5000) || null,
      });

      if (error) {
        console.error('Audit log failed:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Audit log error:', err);
      return false;
    }
  }, [user?.id]);

  /**
   * Execute an admin action with full security wrapper:
   * 1. Verify admin role server-side
   * 2. Execute the action
   * 3. Log to audit trail
   * 4. Handle errors gracefully
   */
  const executeAdminAction = useCallback(async <T>(
    action: () => Promise<AdminActionResult<T>>,
    auditEntry: AuditLogEntry,
    options?: {
      skipAuditOnFailure?: boolean;
      successMessage?: string;
      errorMessage?: string;
    }
  ): Promise<AdminActionResult<T>> => {
    setIsProcessing(true);

    try {
      // Step 1: Server-side admin verification
      const isAdmin = await verifyAdminRole();
      if (!isAdmin) {
        toast({
          title: 'Access Denied',
          description: 'You do not have admin privileges',
          variant: 'destructive',
        });
        return { success: false, error: 'Unauthorized: Admin role not verified' };
      }

      // Step 2: Execute the action
      const result = await action();

      // Step 3: Log to audit trail
      if (result.success || !options?.skipAuditOnFailure) {
        await logAuditAction({
          ...auditEntry,
          new_value: result.success 
            ? auditEntry.new_value 
            : `FAILED: ${result.error || 'Unknown error'}`,
        });
      }

      // Step 4: Show appropriate feedback
      if (result.success) {
        toast({
          title: 'Success',
          description: options?.successMessage || 'Action completed successfully',
        });
      } else {
        toast({
          title: 'Error',
          description: options?.errorMessage || result.error || 'Action failed',
          variant: 'destructive',
        });
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      
      // Log failed attempt
      await logAuditAction({
        ...auditEntry,
        new_value: `ERROR: ${errorMessage}`,
      });

      toast({
        title: 'Error',
        description: options?.errorMessage || errorMessage,
        variant: 'destructive',
      });

      return { success: false, error: errorMessage };
    } finally {
      setIsProcessing(false);
    }
  }, [verifyAdminRole, logAuditAction, toast]);

  /**
   * Assign admin role to a user
   * Includes self-escalation prevention
   */
  const assignAdminRole = useCallback(async (targetUserId: string): Promise<AdminActionResult> => {
    // Prevent self-escalation (even though RLS should block this)
    if (targetUserId === user?.id) {
      return { success: false, error: 'Cannot modify your own role' };
    }

    return executeAdminAction(
      async () => {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: targetUserId, role: 'admin' });

        if (error) {
          // Check for duplicate
          if (error.code === '23505') {
            return { success: false, error: 'User already has admin role' };
          }
          return { success: false, error: error.message };
        }

        return { success: true };
      },
      {
        page_affected: 'user_management',
        action_performed: 'assign_admin_role',
        previous_value: 'user',
        new_value: 'admin',
      },
      {
        successMessage: 'Admin role assigned successfully',
        errorMessage: 'Failed to assign admin role',
      }
    );
  }, [user?.id, executeAdminAction]);

  /**
   * Remove admin role from a user
   * Includes self-demotion prevention
   */
  const removeAdminRole = useCallback(async (targetUserId: string): Promise<AdminActionResult> => {
    // Prevent self-demotion
    if (targetUserId === user?.id) {
      return { success: false, error: 'Cannot remove your own admin role' };
    }

    return executeAdminAction(
      async () => {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', targetUserId)
          .eq('role', 'admin');

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      },
      {
        page_affected: 'user_management',
        action_performed: 'remove_admin_role',
        previous_value: 'admin',
        new_value: 'user',
      },
      {
        successMessage: 'Admin role removed successfully',
        errorMessage: 'Failed to remove admin role',
      }
    );
  }, [user?.id, executeAdminAction]);

  /**
   * Update system configuration
   */
  const updateSystemConfig = useCallback(async (
    settings: Json,
    previousSettings?: Json
  ): Promise<AdminActionResult> => {
    return executeAdminAction(
      async () => {
        // Check if settings exist
        const { data: existing } = await supabase
          .from('admin_settings')
          .select('id')
          .limit(1)
          .maybeSingle();

        const payload = {
          settings: settings,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        };

        let error;
        if (existing) {
          const result = await supabase
            .from('admin_settings')
            .update(payload)
            .eq('id', existing.id);
          error = result.error;
        } else {
          const result = await supabase
            .from('admin_settings')
            .insert(payload);
          error = result.error;
        }

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      },
      {
        page_affected: 'system_config',
        action_performed: 'update_settings',
        previous_value: previousSettings ? JSON.stringify(previousSettings) : null,
        new_value: JSON.stringify(settings),
      },
      {
        successMessage: 'System configuration updated',
        errorMessage: 'Failed to update configuration',
      }
    );
  }, [user?.id, executeAdminAction]);

  /**
   * Trigger the CVE engine manually
   */
  const triggerEngine = useCallback(async (): Promise<AdminActionResult> => {
    return executeAdminAction(
      async () => {
        const { error } = await supabase.functions.invoke('cve-engine', {
          body: { trigger: 'manual', admin_id: user?.id },
        });

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      },
      {
        page_affected: 'system_config',
        action_performed: 'trigger_engine_manual',
        new_value: 'manual_trigger',
      },
      {
        successMessage: 'CVE engine triggered successfully',
        errorMessage: 'Failed to trigger CVE engine',
      }
    );
  }, [user?.id, executeAdminAction]);

  return {
    isProcessing,
    verifyAdminRole,
    logAuditAction,
    executeAdminAction,
    assignAdminRole,
    removeAdminRole,
    updateSystemConfig,
    triggerEngine,
  };
};
