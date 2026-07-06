import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MessageSquare, Send, Phone, MapPin, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const Contact = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.subject.trim()) newErrors.subject = 'Subject is required';
    if (!formData.message.trim()) newErrors.message = 'Message is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      // Store in database
      const { error: dbError } = await supabase
        .from("contact_messages")
        .insert({
          name: formData.name.trim(),
          email: formData.email.trim(),
          subject: formData.subject.trim(),
          message: formData.message.trim(),
          user_id: user?.id || null,
        });

      if (dbError) throw dbError;

      // Send email notification to support
      supabase.functions.invoke("send-email", {
        body: {
          to: "support@avotrix.com",
          subject: `[Vulnerix Contact] ${formData.subject.trim()}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1e3a5f;">📩 New Contact Message</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; font-weight: bold;">From</td><td style="padding: 8px;">${formData.name.trim()}</td></tr>
                <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;">${formData.email.trim()}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Subject</td><td style="padding: 8px;">${formData.subject.trim()}</td></tr>
              </table>
              <h3>Message</h3>
              <p style="color: #374151; white-space: pre-wrap;">${formData.message.trim()}</p>
              <hr />
              <p style="color: #6b7280; font-size: 12px;">Sent via Vulnerix Contact Form by ${user?.email || 'unknown'}</p>
            </div>
          `,
        },
      }).catch(err => console.warn("Email notification failed:", err));

      setIsSubmitted(true);
      toast({
        title: "Message sent!",
        description: "We'll get back to you as soon as possible.",
      });
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (err: any) {
      console.error("Contact form error:", err);
      toast({
        title: "Failed to send",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setIsSubmitted(false);
    setFormData({ name: '', email: '', subject: '', message: '' });
    setErrors({});
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-navy">Contact Us</h1>
          <p className="text-muted-foreground">Get in touch with our support team</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contact Info Cards */}
          <div className="lg:col-span-1 space-y-4">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-card rounded-xl border border-border p-6"
            >
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                <Mail className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-semibold text-navy mb-1">Email</h3>
              <p className="text-sm text-muted-foreground">support@vulnerix.com</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card rounded-xl border border-border p-6"
            >
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                <Phone className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-semibold text-navy mb-1">Phone</h3>
              <p className="text-sm text-muted-foreground">+1 (555) 123-4567</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card rounded-xl border border-border p-6"
            >
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                <MapPin className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-semibold text-navy mb-1">Office</h3>
              <p className="text-sm text-muted-foreground">123 Security St, Tech City</p>
            </motion.div>
          </div>

          {/* Contact Form */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2 bg-card rounded-xl border border-border overflow-hidden"
          >
            {isSubmitted ? (
              <div className="p-12 text-center">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-display font-bold text-navy mb-2">Thank You!</h2>
                <p className="text-muted-foreground mb-6">
                  Your message has been sent successfully. We'll get back to you shortly.
                </p>
                <Button variant="outline" onClick={resetForm}>
                  Send Another Message
                </Button>
              </div>
            ) : (
              <>
                <div className="p-6 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-navy">Send a Message</h2>
                      <p className="text-sm text-muted-foreground">We'll respond within 24 hours</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label htmlFor="name">Your Name</Label>
                      <Input
                        id="name"
                        placeholder="John Doe"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className={errors.name ? 'border-destructive' : ''}
                      />
                      {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="john@company.com"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        className={errors.email ? 'border-destructive' : ''}
                      />
                      {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="How can we help?"
                      value={formData.subject}
                      onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                      className={errors.subject ? 'border-destructive' : ''}
                    />
                    {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="Tell us more about your inquiry..."
                      rows={5}
                      value={formData.message}
                      onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                      className={errors.message ? 'border-destructive' : ''}
                    />
                    {errors.message && <p className="text-xs text-destructive">{errors.message}</p>}
                  </div>

                  <div className="pt-2">
                    <Button type="submit" variant="accent" className="w-full sm:w-auto" disabled={isSubmitting}>
                      {isSubmitting ? (
                        'Sending...'
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send Message
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Contact;
