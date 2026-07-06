import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name: string, organization: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          return;
        }
        setSession(session);
        setUser(session?.user ?? null);
        
        // Create user_settings on sign up if needed
        if (event === 'SIGNED_IN' && session?.user) {
          setTimeout(() => {
            createUserSettingsIfNeeded(session.user);
          }, 0);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const createUserSettingsIfNeeded = async (user: User) => {
    // Check if user settings already exist
    const { data: existingSettings } = await supabase
      .from('user_settings')
      .select('id')
      .eq('email_id', user.email)
      .maybeSingle();

    if (!existingSettings && user.email) {
      // Create user settings
      const metadata = user.user_metadata || {};
      await supabase.from('user_settings').insert({
        email_id: user.email,
        org_name: metadata.organization || 'Default Organization',
        user_id: user.id,
        notification_level: 'all'
      });
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    organization: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            name,
            organization
          }
        }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      // Auto-confirm is enabled, so user should be signed in
      if (data.user) {
        // Create user settings
        await supabase.from('user_settings').insert({
          email_id: email,
          org_name: organization,
          user_id: data.user.id,
          notification_level: 'all'
        });
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) console.error('Logout error:', error);
    setUser(null);
    setSession(null);
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Check if user exists using the auth admin API via RPC
      // We use a security definer function to bypass RLS
      const { data: userExists } = await supabase
        .rpc('check_user_exists', { p_email: email });

      if (!userExists) {
        return { success: false, error: 'No account found with this email address.' };
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const updatePassword = async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated: !!session,
        isLoading,
        login,
        register,
        logout,
        resetPassword,
        updatePassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
