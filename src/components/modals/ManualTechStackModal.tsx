import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, ExternalLink, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

interface ManualTechStackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    organization: string;
    vendorName: string;
    productName: string;
    productVersion: string;
    emails: string[];
  }) => void;
}

const MAX_EMAILS = 5;

const ManualTechStackModal = ({ isOpen, onClose, onSubmit }: ManualTechStackModalProps) => {
  const { user } = useAuth();
  const userEmail = user?.email || '';
  const userOrganization = user?.user_metadata?.organization || 'Default Organization';

  const [formData, setFormData] = useState({
    vendorName: '',
    productName: '',
    productVersion: '',
  });
  const [emails, setEmails] = useState<string[]>([userEmail]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    // Vendor validation
    if (!formData.vendorName.trim()) {
      newErrors.vendorName = 'Vendor name is required';
    } else if (formData.vendorName.length < 2) {
      newErrors.vendorName = 'Vendor name must be at least 2 characters';
    }
    
    if (!formData.productName.trim()) {
      newErrors.productName = 'Product name is required';
    } else if (formData.productName.length < 2) {
      newErrors.productName = 'Product name must be at least 2 characters';
    }
    
    // Version format validation
    if (!formData.productVersion.trim()) {
      newErrors.productVersion = 'Version is required';
    } else {
      // Allow various version formats: 1.0, 1.0.0, v1.0, 2024.1, etc.
      const versionRegex = /^[vV]?[\d]+([._-][\d\w]+)*$/;
      if (!versionRegex.test(formData.productVersion.trim())) {
        newErrors.productVersion = 'Invalid version format (e.g., 1.0.0, v2.1, 2024.1)';
      }
    }
    
    // Email validation - at least one valid email
    const validEmails = emails.filter(e => e.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (validEmails.length === 0) {
      newErrors.emails = 'At least one valid email is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      // Filter valid emails
      const validEmails = emails.filter(e => e.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      
      onSubmit({
        organization: userOrganization,
        vendorName: formData.vendorName,
        productName: formData.productName,
        productVersion: formData.productVersion,
        emails: validEmails.length > 0 ? validEmails : [userEmail]
      });
      resetForm();
      onClose();
    }
  };

  const resetForm = () => {
    setFormData({
      vendorName: '',
      productName: '',
      productVersion: '',
    });
    setEmails([userEmail]);
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const addEmailField = () => {
    if (emails.length < MAX_EMAILS) {
      setEmails(prev => [...prev, '']);
    }
  };

  const removeEmailField = (index: number) => {
    if (emails.length > 1) {
      setEmails(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateEmail = (index: number, value: string) => {
    setEmails(prev => prev.map((email, i) => i === index ? value : email));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Plus className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h2 className="text-xl font-display font-semibold text-foreground">Add Tech Stack</h2>
                <p className="text-sm text-muted-foreground">Add a product manually</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* NVD CPE Directory Instruction */}
            <div className="p-4 rounded-xl bg-accent/10 border border-accent/30">
              <p className="text-sm text-foreground">
                <strong>Before filling your sheet:</strong> Please find the correct Vendor and Product from the official NVD CPE directory and enter the exact values.
              </p>
              <a 
                href="https://nvd.nist.gov/products/cpe/search" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-accent hover:underline mt-2"
              >
                Open NVD CPE Search <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* CPE Structure Reference */}
            <div className="p-3 rounded-lg bg-muted border border-border text-sm space-y-2">
              <div className="flex items-start gap-2">
                <HelpCircle className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                <p className="text-foreground font-medium">CPE Structure Reference:</p>
              </div>
              <code className="block text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded font-mono break-all whitespace-normal">
                cpe:2.3:type:vendor:product:version
              </code>
              <p className="text-xs">
                <span className="text-foreground font-medium">Example:</span>{" "}
                <code className="text-muted-foreground font-mono">cpe:2.3:a:google:chrome:9.0.597.7</code>
              </p>
            </div>

            {/* Organization (auto-filled, read-only display) */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Organization</Label>
              <div className="px-3 py-2 rounded-md bg-muted/50 border border-border text-foreground text-sm">
                {userOrganization}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendorName">Vendor Name</Label>
              <Input
                id="vendorName"
                placeholder="e.g., google, microsoft, apache, oracle"
                value={formData.vendorName}
                onChange={(e) => setFormData(prev => ({ ...prev, vendorName: e.target.value }))}
                className={errors.vendorName ? 'border-destructive' : ''}
              />
              {errors.vendorName && <p className="text-xs text-destructive">{errors.vendorName}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="productName">Product Name</Label>
              <Input
                id="productName"
                placeholder="e.g., FortiOS, SQL Server"
                value={formData.productName}
                onChange={(e) => setFormData(prev => ({ ...prev, productName: e.target.value }))}
                className={errors.productName ? 'border-destructive' : ''}
              />
              {errors.productName && <p className="text-xs text-destructive">{errors.productName}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="productVersion">Version</Label>
              <Input
                id="productVersion"
                placeholder="e.g., 7.6.4"
                value={formData.productVersion}
                onChange={(e) => setFormData(prev => ({ ...prev, productVersion: e.target.value }))}
                className={errors.productVersion ? 'border-destructive' : ''}
              />
              {errors.productVersion && <p className="text-xs text-destructive">{errors.productVersion}</p>}
            </div>

            {/* Email Fields */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Email ID(s)</Label>
                {emails.length < MAX_EMAILS && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addEmailField}
                    className="text-xs text-accent"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Email
                  </Button>
                )}
              </div>
              
              <div className="space-y-2">
                {emails.map((email, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="email"
                      placeholder={index === 0 ? userEmail : "additional@email.com"}
                      value={email}
                      onChange={(e) => updateEmail(index, e.target.value)}
                      className="flex-1"
                    />
                    {emails.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEmailField(index)}
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              
              {errors.emails && <p className="text-xs text-destructive">{errors.emails}</p>}
              <p className="text-xs text-muted-foreground">
                Max {MAX_EMAILS} emails. Leave blank to use your registered email.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="accent" onClick={handleSubmit}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ManualTechStackModal;
