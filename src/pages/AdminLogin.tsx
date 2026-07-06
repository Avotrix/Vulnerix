import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, Mail, Shield, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/contexts/AdminContext";
import { useToast } from "@/hooks/use-toast";
import vulnerixLogo from "@/assets/vulnerix-logo.png";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const { isAdminAuthenticated, isAdminLoading, checkAdminStatus } = useAdmin();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  // If already authenticated as admin, redirect to panel
  useEffect(() => {
    if (isAuthenticated && isAdminAuthenticated && !isAdminLoading) {
      navigate('/admin/panel');
    }
  }, [isAuthenticated, isAdminAuthenticated, isAdminLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // First, authenticate with Supabase Auth
      const { error: loginError } = await login(formData.email, formData.password);
      
      if (loginError) {
        toast({
          title: "Authentication Failed",
          description: loginError || "Invalid credentials.",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      // Then check if user has admin role in database
      const isAdmin = await checkAdminStatus();
      
      if (isAdmin) {
        toast({
          title: "Admin Access Granted",
          description: "Welcome to the Admin Control Panel.",
        });
        navigate('/admin/panel');
      } else {
        toast({
          title: "Access Denied",
          description: "You do not have admin privileges.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Authentication failed. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-foreground">Admin Access</h1>
              <p className="text-sm text-muted-foreground">Vulnerix Control Panel</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="admin-email" className="text-foreground">Admin Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="admin-email"
                  type="email"
                  placeholder="admin@company.com"
                  className="pl-10"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-password" className="text-foreground">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="admin-password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-10"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              variant="destructive" 
              size="lg" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Authenticating...' : 'Access Admin Panel'}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-start gap-3">
              <img src={vulnerixLogo} alt="Vulnerix" className="h-8 w-8" />
              <div>
                <p className="text-xs text-muted-foreground">
                  This area is restricted to authorized administrators only. 
                  Admin access is verified server-side through role-based access control.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
