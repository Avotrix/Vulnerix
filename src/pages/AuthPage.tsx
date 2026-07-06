import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, User, Building2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import vulnerixLogo from "@/assets/vulnerix-logo.png";
import ForgotPasswordModal from "@/components/modals/ForgotPasswordModal";
import PasswordStrengthIndicator from "@/components/PasswordStrengthIndicator";
import { validatePassword, PasswordRuleStatus } from "@/utils/passwordValidator";

const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const { toast } = useToast();
  
  const [isLogin, setIsLogin] = useState(searchParams.get('mode') !== 'register');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    organization: ''
  });

  // Password validation for signup (defense-in-depth)
  const passwordValidation = useMemo(() => {
    if (isLogin || !formData.password) {
      return {
        valid: true,
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
    
    return validatePassword(formData.password, {
      email: formData.email,
      name: formData.name,
      org: formData.organization,
    });
  }, [formData.password, formData.email, formData.name, formData.organization, isLogin]);

  const isSignupDisabled = !isLogin && (!passwordValidation.valid || isLoading);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        const result = await login(formData.email, formData.password);
        if (result.success) {
          toast({
            title: "Welcome back!",
            description: "You've successfully logged in.",
          });
          navigate('/dashboard');
        } else {
          toast({
            title: "Login failed",
            description: result.error,
            variant: "destructive"
          });
        }
      } else {
        if (!formData.name || !formData.organization) {
          toast({
            title: "Missing information",
            description: "Please fill in all fields.",
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }

        // Validate password before sending to Supabase (defense-in-depth)
        if (!passwordValidation.valid) {
          toast({
            title: "Password does not meet requirements",
            description: passwordValidation.errors[0],
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }
        
        const result = await register(
          formData.email, 
          formData.password, 
          formData.name, 
          formData.organization
        );
        
        if (result.success) {
          toast({
            title: "Account created!",
            description: "Welcome to Vulnerix. Let's secure your stack.",
          });
          navigate('/dashboard');
        } else {
          toast({
            title: "Registration failed",
            description: result.error,
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 py-12">
        <div className="max-w-md w-full mx-auto">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2 mb-8">
              <img src={vulnerixLogo} alt="Vulnerix Logo" className="h-10 w-10" />
              <span className="text-2xl font-display font-bold text-foreground">Vulnerix</span>
            </div>

            <h1 className="text-3xl font-display font-bold text-foreground mb-2">
              {isLogin ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-muted-foreground mb-8">
              {isLogin 
                ? 'Enter your credentials to access your dashboard'
                : 'Start protecting your tech stack in minutes'
              }
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {!isLogin && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="name"
                        type="text"
                        placeholder="John Doe"
                        className="pl-10"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        required={!isLogin}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="organization">Organization</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="organization"
                        type="text"
                        placeholder="Acme Corp"
                        className="pl-10"
                        value={formData.organization}
                        onChange={(e) => setFormData(prev => ({ ...prev, organization: e.target.value }))}
                        required={!isLogin}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    className="pl-10"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    required
                    minLength={isLogin ? 6 : 12}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                
                {/* Password strength indicator for signup */}
                {!isLogin && formData.password && (
                  <div className="mt-3">
                    <PasswordStrengthIndicator rules={passwordValidation.rules} />
                  </div>
                )}
              </div>

              {isLogin && (
                <div className="flex justify-end">
                  <button 
                    type="button" 
                    className="text-sm text-accent hover:underline"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button 
                type="submit" 
                variant="navy" 
                size="lg" 
                className="w-full"
                disabled={isLogin ? isLoading : isSignupDisabled}
              >
                {isLoading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-accent font-medium hover:underline"
                >
                  {isLogin ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Panel - Visual */}
      <div className="hidden lg:flex flex-1 bg-navy-gradient items-center justify-center p-12">
        <div className="max-w-lg text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="inline-flex items-center justify-center h-24 w-24 rounded-2xl bg-accent/20 mb-8">
              <img src={vulnerixLogo} alt="Vulnerix Logo" className="h-16 w-16" />
            </div>
            
            <h2 className="text-3xl font-display font-bold text-white mb-4">
              Secure Your Technology Stack
            </h2>
            <p className="text-cyan-100 text-lg leading-relaxed">
              Join thousands of security teams who trust Vulnerix to monitor vulnerabilities 
              and protect their infrastructure from emerging threats.
            </p>

            <div className="mt-12 grid grid-cols-3 gap-6">
              {[
                { label: 'CVEs Tracked', value: '50K+' },
                { label: 'Companies', value: '50+' },
                { label: 'Alerts Sent', value: '1000+' }
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl font-display font-bold text-cyan-400">{stat.value}</div>
                  <div className="text-sm text-cyan-200">{stat.label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <ForgotPasswordModal 
        isOpen={showForgotPassword} 
        onClose={() => setShowForgotPassword(false)} 
      />
    </div>
  );
};

export default AuthPage;
