import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook to trigger the CVE/CERT-IN matching engine
 * This hook provides functionality to automatically trigger the CVE engine
 * after tech stack entries are added or updated.
 */
export const useCVEEngine = () => {
  const { user } = useAuth();

  /**
   * Triggers the CVE engine to process tech stack entries
   * Returns processing result with match counts
   */
  const triggerEngine = useCallback(async (): Promise<{
    success: boolean;
    processed: number;
    matches: number;
    error?: string;
  }> => {
    if (!user?.email) {
      return { success: false, processed: 0, matches: 0, error: 'User not authenticated' };
    }

    try {
      // Get the current session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        return { success: false, processed: 0, matches: 0, error: 'No valid session' };
      }

      // Call the CVE engine edge function
      const { data, error } = await supabase.functions.invoke('cve-engine', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        console.error('[CVE Engine] Invocation error:', error);
        return { 
          success: false, 
          processed: 0, 
          matches: 0, 
          error: error.message 
        };
      }

      console.log('[CVE Engine] Processing complete:', data);

      // After matching, immediately send the notification digest for this user.
      // send-notifications respects: email_enabled, severity filter, last-7-days
      // recency, and dedup (never re-sends an advisory already emailed).
      // Fire-and-forget so it never blocks the engine result.
      supabase.functions
        .invoke('send-notifications', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        .then(({ data: nd, error: nerr }) => {
          if (nerr) console.warn('[Notifications] warning:', nerr.message);
          else console.log('[Notifications] result:', nd);
        })
        .catch((e) => console.warn('[Notifications] error:', e));

      return {
        success: data?.success || false,
        processed: data?.processed || 0,
        matches: data?.matches || 0
      };
    } catch (err: any) {
      console.error('[CVE Engine] Error:', err);
      return { 
        success: false, 
        processed: 0, 
        matches: 0, 
        error: err.message 
      };
    }
  }, [user?.email]);

  /**
   * Triggers engine processing in the background
   * Does not block the calling code - fire and forget
   */
  const triggerEngineBackground = useCallback(() => {
    // Fire and forget - don't await
    triggerEngine().then(result => {
      if (result.success) {
        console.log(`[CVE Engine] Background processing complete: ${result.processed} items, ${result.matches} matches`);
      } else if (result.error) {
        console.warn('[CVE Engine] Background processing warning:', result.error);
      }
    }).catch(err => {
      console.error('[CVE Engine] Background processing error:', err);
    });
  }, [triggerEngine]);

  return {
    triggerEngine,
    triggerEngineBackground
  };
};
