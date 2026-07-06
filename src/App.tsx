import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AdminProvider, useAdmin } from "@/contexts/AdminContext";
// hasVisited removed - landing page always shows for unauthenticated users
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Advisories from "./pages/Advisories";
import TechStack from "./pages/TechStack";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/AdminLogin";
import AdminPanel from "./pages/AdminPanel";

const queryClient = new QueryClient();

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
};

// Landing Route Component - always show for unauthenticated users
const LandingRoute = () => {
  const { isAuthenticated } = useAuth();
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <LandingPage />;
};

// Admin Protected Route - Server-side role verification
const AdminProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdminAuthenticated, isAdminLoading } = useAdmin();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Show loading while checking auth and admin status
  if (authLoading || isAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }
  
  // Redirect to admin login if not authenticated or not admin
  if (!isAuthenticated || !isAdminAuthenticated) {
    return <Navigate to="/admin" replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();
  
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route 
        path="/auth" 
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <AuthPage />} 
      />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/advisories" 
        element={
          <ProtectedRoute>
            <Advisories />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/tech-stack" 
        element={
          <ProtectedRoute>
            <TechStack />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/settings" 
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/contact" 
        element={
          <ProtectedRoute>
            <Contact />
          </ProtectedRoute>
        } 
      />
      {/* Redirect old inventory route to tech-stack */}
      <Route path="/inventory" element={<Navigate to="/tech-stack" replace />} />
      
      {/* Admin Routes - Separate from user routes */}
      <Route path="/admin" element={<AdminLogin />} />
      <Route 
        path="/admin/panel" 
        element={
          <AdminProtectedRoute>
            <AdminPanel />
          </AdminProtectedRoute>
        } 
      />
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AdminProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </AdminProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
