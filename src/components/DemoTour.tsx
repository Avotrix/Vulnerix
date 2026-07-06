import React, { useState, useEffect, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, LayoutDashboard, Database, ShieldAlert, User, Settings, Phone, Upload, Edit, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import vulnerixLogo from "@/assets/vulnerix-logo.png";

interface DemoStep {
  title: string;
  description: string;
  icon: React.ElementType;
  features: string[];
}

const demoSteps: DemoStep[] = [
  {
    title: "Dashboard Overview",
    description: "Your central command center for security monitoring. Get a real-time snapshot of your entire security posture at a glance.",
    icon: LayoutDashboard,
    features: [
      "Total Products: View count of all monitored software in your tech stack.",
      "Critical Vulnerabilities: See high-priority threats requiring immediate attention.",
      "Severity Breakdown: Visual charts showing Critical, High, Medium, and Low severity distribution.",
      "Recent Advisories: Quick access to the latest vulnerability alerts with actionable AI insights for your stack.",
      "Trend Analysis: Historical graphs showing vulnerability trends over time."
    ]
  },
  {
    title: "Tech Stack Management",
    description: "Manage your complete technology inventory. Upload, edit, and organize all software assets your organization uses.",
    icon: Database,
    features: [
      "Upload Tech Stack: Import via CSV/Excel with template enforcement (Sr No., Vendor Name, Product Name, Product Version, Email ID).",
      "Manual Entry: Add individual entries with Vendor, Product, Version, and Email ID.",
      "Edit Entries: Update Vendor, Product, Version, and Email ID (Organization is locked).",
      "Search & Filter: Quickly find specific products in your inventory.",
      "Delete Items: Remove outdated or incorrect entries with confirmation."
    ]
  },
  {
    title: "Security Advisories",
    description: "Browse comprehensive vulnerability intelligence. Filter, search, and analyze CVEs affecting your tech stack with detailed remediation guidance.",
    icon: ShieldAlert,
    features: [
      "CVE Database: Access detailed vulnerability information including CVSS scores.",
      "Severity Filtering: Filter by Critical, High, Medium, or Low severity.",
      "Search Functionality: Find specific CVEs, vendors, or products.",
      "View All: Open complete advisory list in a new tab.",
      "Version Information: See affected version ranges when available."
    ]
  },
  {
    title: "Profile & Settings",
    description: "Customize your Vulnerix experience. Manage your personal information and configure notification preferences.",
    icon: User,
    features: [
      "Profile Management: Update your name, email, organization, phone, and role.",
      "Email Notifications: Toggle alerts for new vulnerabilities.",
      "Critical Alerts: Enable instant notifications for high-severity threats.",
      "Weekly Digest: Receive weekly summary reports.",
      "Theme Settings: Choose between light, dark, or system themes.",
      "Auto-Refresh: Configure automatic dashboard data refresh intervals."
    ]
  },
  {
    title: "Contact & Support",
    description: "Get help when you need it. Reach out to our security team for assistance, questions, or feedback.",
    icon: Phone,
    features: [
      "Contact Form: Submit inquiries with subject and detailed message.",
      "Email Support: Direct email contact for urgent matters.",
      "Phone Support: Call our support line during business hours.",
      "Office Location: Find our headquarters address.",
      "Confirmation: Receive acknowledgment when your message is sent."
    ]
  },
  {
    title: "Key Features Summary",
    description: "Vulnerix provides enterprise-grade vulnerability intelligence to protect your organization proactively.",
    icon: Bell,
    features: [
      "Real-time Monitoring: Continuous scanning for new vulnerabilities.",
      "Smart Alerts: Automated email notifications to responsible team members.",
      "Data Persistence: All data stored securely in your browser.",
      "No Backend Required: Frontend-only solution for maximum privacy.",
      "Template-Based Upload: Standardized CSV/Excel import format.",
      "Responsive Design: Works seamlessly on desktop and mobile devices."
    ]
  }
];

interface DemoTourProps {
  isOpen: boolean;
  onClose: () => void;
}

const DemoTour = forwardRef<HTMLDivElement, DemoTourProps>(({ isOpen, onClose }, ref) => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < demoSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  const step = demoSteps[currentStep];
  const Icon = step.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={handleSkip}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative bg-navy-gradient p-6">
              <button
                onClick={handleSkip}
                className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-accent/20 flex items-center justify-center">
                  <Icon className="h-7 w-7 text-accent" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <img src={vulnerixLogo} alt="Vulnerix" className="h-5 w-5" />
                    <p className="text-accent text-sm font-medium">
                      Step {currentStep + 1} of {demoSteps.length}
                    </p>
                  </div>
                  <h3 className="text-xl font-display font-bold text-white">
                    {step.title}
                  </h3>
                </div>
              </div>
            </div>

            {/* Content - Scrollable */}
            <div className="p-6 max-h-[60vh] overflow-y-auto bg-card">
              <p className="text-foreground leading-relaxed mb-6">
                {step.description}
              </p>

              {/* Features List */}
              <div className="bg-muted rounded-xl p-4 border border-border mb-6">
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  Key Features & Options
                </h4>
                <ul className="space-y-2">
                  {step.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-foreground">
                      <ChevronRight className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer - Fixed */}
            <div className="p-6 border-t border-border bg-card">
              {/* Actions */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrev}
                  disabled={currentStep === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                >
                  Skip Tour
                </Button>

                <Button
                  variant="navy"
                  size="sm"
                  onClick={handleNext}
                  className="gap-1"
                >
                  {currentStep === demoSteps.length - 1 ? 'Finish' : 'Next'}
                  {currentStep < demoSteps.length - 1 && <ChevronRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

DemoTour.displayName = 'DemoTour';

export default DemoTour;
