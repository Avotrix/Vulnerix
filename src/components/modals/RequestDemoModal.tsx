import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface RequestDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[+]?[\d\s()-]{7,15}$/;

const RequestDemoModal = ({ isOpen, onClose }: RequestDemoModalProps) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    organization: "",
    phone: "",
    message: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Name is required";
    } else if (formData.name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
    }

    if (!formData.email.trim()) {
      errors.email = "Email is required";
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = "Enter a valid email address";
    }

    if (!formData.organization.trim()) {
      errors.organization = "Organization is required";
    }

    if (formData.phone.trim() && !phoneRegex.test(formData.phone.trim())) {
      errors.phone = "Enter a valid phone number";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    setIsLoading(true);

    try {
      // Store in database
      const { error: dbError } = await supabase
        .from("demo_requests")
        .insert({
          name: formData.name.trim(),
          email: formData.email.trim(),
          organization: formData.organization.trim(),
          phone: formData.phone.trim() || null,
          message: formData.message.trim() || null,
        });

      if (dbError) throw dbError;

      // Send notification email to support (fire and forget — don't block on email failure)
      supabase.functions.invoke("send-email", {
        body: {
          to: "support@avotrix.com",
          subject: `Demo Request from ${formData.name.trim()} (${formData.organization.trim()})`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1e3a5f;">🎯 New Demo Request</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; font-weight: bold;">Name</td><td style="padding: 8px;">${formData.name.trim()}</td></tr>
                <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;">${formData.email.trim()}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Organization</td><td style="padding: 8px;">${formData.organization.trim()}</td></tr>
                <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold;">Phone</td><td style="padding: 8px;">${formData.phone.trim() || 'Not provided'}</td></tr>
              </table>
              ${formData.message.trim() ? `<h3>Message</h3><p style="color: #374151;">${formData.message.trim()}</p>` : ''}
              <hr />
              <p style="color: #6b7280; font-size: 12px;">Submitted via Vulnerix Demo Request Form</p>
            </div>
          `,
        },
      }).catch(err => console.warn("Email notification failed:", err));

      setIsSuccess(true);
    } catch (err: any) {
      console.error("Demo request error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ name: "", email: "", organization: "", phone: "", message: "" });
    setError("");
    setIsSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative bg-navy-gradient p-6">
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              <h2 className="text-xl font-display font-bold text-white">
                {isSuccess ? "Request Submitted!" : "Request a Demo"}
              </h2>
              <p className="text-white/70 text-sm mt-1">
                {isSuccess
                  ? "Our team will reach out shortly."
                  : "Fill in your details and our team will schedule a personalized demo."}
              </p>
            </div>

            {/* Content */}
            <div className="p-6">
              {isSuccess ? (
                <div className="text-center py-6">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <p className="text-foreground font-medium">Thank you, {formData.name}!</p>
                  <p className="text-muted-foreground text-sm mt-2">
                    We've received your request and will contact you at {formData.email} to schedule the demo.
                  </p>
                  <Button variant="accent" className="mt-6" onClick={handleClose}>
                    Close
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">
                      Full Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="John Doe"
                    />
                    {fieldErrors.name && <p className="text-xs text-destructive mt-1">{fieldErrors.name}</p>}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">
                      Work Email <span className="text-destructive">*</span>
                    </label>
                    <Input
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="john@company.com"
                    />
                    {fieldErrors.email && <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">
                      Organization <span className="text-destructive">*</span>
                    </label>
                    <Input
                      name="organization"
                      value={formData.organization}
                      onChange={handleChange}
                      placeholder="Acme Corp"
                    />
                    {fieldErrors.organization && <p className="text-xs text-destructive mt-1">{fieldErrors.organization}</p>}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">
                      Phone (optional)
                    </label>
                    <Input
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+91 98765 43210"
                    />
                    {fieldErrors.phone && <p className="text-xs text-destructive mt-1">{fieldErrors.phone}</p>}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1">
                      Message (optional)
                    </label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      placeholder="Tell us about your use case..."
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <Button
                    type="submit"
                    variant="accent"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
                    ) : (
                      <><Send className="h-4 w-4 mr-2" />Submit Request</>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RequestDemoModal;
