import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import vulnerixLogo from "@/assets/vulnerix-logo.png";
import PasswordStrengthIndicator from "@/components/PasswordStrengthIndicator";
import { validatePassword, PasswordRuleStatus } from "@/utils/passwordValidator";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { updatePassword } = useAuth();
  
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  
  const [errors, setErrors] = useState({
    password: '',
    confirmPassword: ''
  });

  // Password validation (defense-in-depth)
  const passwordValidation = useMemo(() => {
    if (!formData.password) {
      return {
        valid: false,
        errors: [],
        rules: {
          minLength: false,
          hasUppercase: false,
          hasLowercase: false,
          hasNumber: false,
          hasSpecialChar: false,
          notBlocked: true,
          notContainsUserInfo: true,
        } as PasswordRuleStatus
      };
    }
    
    return validatePassword(formData.password);
  }, [formData.password]);

  const isSubmitDisabled = !passwordValidation.valid || 
                           formData.password !== formData.confirmPassword ||
                           isLoading;

  useEffect(() => {
    // Check if user has a valid recovery session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Check if this is a recovery session
      if (session) {
        setIsValidSession(true);
      } else {
        // Listen for auth state change (user clicking email link)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY') {
            setIsValidSession(true);
          } else if (event === 'SIGNED_IN' && session) {
            setIsValidSession(true);
          }
        });

        // Wait a moment for the auth state to update
        setTimeout(() => {
          if (isValidSession === null) {
            setIsValidSession(false);
          }
        }, 2000);

        return () => subscription.unsubscribe();
      }
    };

    checkSession();
  }, []);

  const validateForm = () => {
    const newErrors = {
      password: '',
      confirmPassword: ''
    };
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (!passwordValidation.valid) {
      newErrors.password = passwordValidation.errors[0] || 'Password does not meet requirements';
    }
    
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return passwordValidation.valid && !newErrors.confirmPassword;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    
    const result = await updatePassword(formData.password);
    
    if (result.success) {
      setIsSuccess(true);
      toast({
        title: "Password reset successful!",
        description: "Redirecting to dashboard...",
      });
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to reset password. Please try again.",
        variant: "destructive"
      });
    }
    
    setIsLoading(false);
  };

  if (isValidSession === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (!isValidSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="bg-destructive/10 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-6">
            <Lock className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-2">
            Invalid or Expired Link
          </h1>
          <p className="text-muted-foreground mb-6">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Link to="/auth">
            <Button variant="accent">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <div className="bg-accent/10 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-2">
            Password Reset Successful!
          </h1>
          <p className="text-muted-foreground mb-6">
            Your password has been updated. Redirecting to dashboard...
          </p>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent mx-auto"></div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <Link 
          to="/auth" 
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <div className="flex items-center gap-2 mb-8">
          <img src={vulnerixLogo} alt="Vulnerix Logo" className="h-10 w-10" />
          <span className="text-2xl font-display font-bold text-foreground">Vulnerix</span>
        </div>

        <h1 className="text-3xl font-display font-bold text-foreground mb-2">
          Reset Your Password
        </h1>
        <p className="text-muted-foreground mb-8">
          Enter your new password below.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="pl-10 pr-10"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                minLength={12}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            
            {/* Password strength indicator */}
            {formData.password && (
              <div className="mt-3">
                <PasswordStrengthIndicator rules={passwordValidation.rules} />
              </div>
            )}
            
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="pl-10 pr-10"
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword}</p>
            )}
          </div>

          <Button 
            type="submit" 
            variant="navy" 
            size="lg" 
            className="w-full"
            disabled={isSubmitDisabled}
          >
            {isLoading ? 'Resetting Password...' : 'Reset Password'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
