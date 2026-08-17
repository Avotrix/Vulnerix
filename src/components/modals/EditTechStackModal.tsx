import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TechStack } from "@/lib/mockData";

interface EditTechStackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    organization: string;
    vendorName: string;
    productName: string;
    productVersion: string;
    emailList: string;
  }) => void;
  techStack: TechStack | null;
}

const MAX_EMAILS = 5;

const EditTechStackModal = ({ isOpen, onClose, onSubmit, techStack }: EditTechStackModalProps) => {
  const [formData, setFormData] = useState({
    organization: '',
    vendorName: '',
    productName: '',
    productVersion: ''
  });
  const [emails, setEmails] = useState<string[]>(['']);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pre-fill form when techStack changes
  useEffect(() => {
    if (techStack) {
      setFormData({
	organization: techStack.organization || '',
        vendorName: techStack.vendorName,
        productName: techStack.productName,
        productVersion: techStack.productVersion
      });
      // Parse email list
      const emailSource = techStack.emailList || techStack.emailId || '';
      const parsed = emailSource.split(',').map(e => e.trim()).filter(Boolean);
      setEmails(parsed.length > 0 ? parsed : [techStack.emailId || '']);
    }
  }, [techStack]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.vendorName.trim()) {
      newErrors.vendorName = 'Vendor name is required.';
    } else if (formData.vendorName.length < 2) {
      newErrors.vendorName = 'Vendor name must be at least 2 characters.';
    }
    
    if (!formData.productName.trim()) {
      newErrors.productName = 'Product name is required.';
    } else if (formData.productName.length < 2) {
      newErrors.productName = 'Product name must be at least 2 characters.';
    }
    
    if (!formData.productVersion.trim()) {
      newErrors.productVersion = 'Version is required.';
    } else {
      const versionRegex = /^[vV]?[\d]+([._-][\d\w]+)*$/;
      if (!versionRegex.test(formData.productVersion.trim())) {
        newErrors.productVersion = 'Invalid version format (e.g., 1.0.0, v2.1, 2024.1).';
      }
    }

    // Email validation
    const validEmails = emails.filter(e => e.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (validEmails.length === 0) {
      newErrors.emails = 'At least one valid email is required.';
    }

    // Check for duplicate emails
    const uniqueEmails = new Set(validEmails.map(e => e.toLowerCase()));
    if (uniqueEmails.size !== validEmails.length) {
      newErrors.emails = 'Duplicate emails are not allowed.';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      const validEmails = emails.filter(e => e.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      onSubmit({
        ...formData,
        emailList: validEmails.join(',')
      });
      handleClose();
    }
  };

  const handleClose = () => {
    setFormData({ vendorName: '', productName: '', productVersion: '' });
    setEmails(['']);
    setErrors({});
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

  if (!isOpen || !techStack) return null;

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
                <Save className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h2 className="text-xl font-display font-semibold text-foreground">Edit Tech Stack</h2>
                <p className="text-sm text-muted-foreground">Update product information.</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
	    <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">

          {/* Organization (editable) */}
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Input
                id="organization"
                value={formData.organization}
                onChange={(e) => setFormData(prev => ({ ...prev, organization: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendorName">Vendor Name</Label>
              <Input
                id="vendorName"
                placeholder="e.g., Microsoft, Google, Apache, Oracle"
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
                placeholder="e.g., Log4j, SQL Server"
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
                placeholder="e.g., 2.14.1"
                value={formData.productVersion}
                onChange={(e) => setFormData(prev => ({ ...prev, productVersion: e.target.value }))}
                className={errors.productVersion ? 'border-destructive' : ''}
              />
              {errors.productVersion && <p className="text-xs text-destructive">{errors.productVersion}</p>}
            </div>

            {/* Email Fields - Editable */}
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
                      placeholder="email@example.com"
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
                Max {MAX_EMAILS} emails. All emails will receive vulnerability alerts.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="accent" onClick={handleSubmit}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EditTechStackModal;
