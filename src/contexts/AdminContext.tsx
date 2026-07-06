import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AdminContextType {
  isAdminAuthenticated: boolean;
  isAdminLoading: boolean;
  checkAdminStatus: () => Promise<boolean>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated } = useAuth();
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  // Check admin status from database when user changes
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user || !isAuthenticated) {
        setIsAdminAuthenticated(false);
        setIsAdminLoading(false);
        return;
      }

      try {
        // Query the user_roles table to check if user is admin
        // Uses the is_admin() database function via RLS
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (error) {
          console.error('Error checking admin status:', error);
          setIsAdminAuthenticated(false);
        } else {
          setIsAdminAuthenticated(!!data);
        }
      } catch (err) {
        console.error('Admin check failed:', err);
        setIsAdminAuthenticated(false);
      } finally {
        setIsAdminLoading(false);
      }
    };

    checkAdmin();
  }, [user, isAuthenticated]);

  const checkAdminStatus = async (): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) {
        console.error('Error checking admin status:', error);
        return false;
      }

      const isAdmin = !!data;
      setIsAdminAuthenticated(isAdmin);
      return isAdmin;
    } catch (err) {
      console.error('Admin check failed:', err);
      return false;
    }
  };

  return (
    <AdminContext.Provider value={{
      isAdminAuthenticated,
      isAdminLoading,
      checkAdminStatus
    }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};
