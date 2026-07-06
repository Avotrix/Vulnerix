import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, ShieldAlert, ShieldCheck, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import DemoTour from "@/components/DemoTour";
import RequestDemoModal from "@/components/modals/RequestDemoModal";

import vulnerixAnim from "@/assets/vulnerix-anim.gif";
import vulnerixDashboard from "@/assets/vulnerix-dashboard-preview.png";
import vulnerixLogo from "@/assets/vulnerix-logo.png";

// Import client logos
import maxAerospaceLogo from "@/assets/clients/max-aerospace-logo.png";
import glttLogo from "@/assets/clients/gltt-logo.png";
import auxinLogo from "@/assets/clients/auxin-logo.png";
import aagargLogo from "@/assets/clients/aagarg-logo.png";
import samarthWealthLogo from "@/assets/clients/samarth-wealth-logo.png";
import fyndnaLogo from "@/assets/clients/fyndna-logo.svg";
import hemSpicesLogo from "@/assets/clients/hem-spices-logo.png";

// Client data with logo imports (no hyperlinks as per requirement)
const clientData = [
  { name: "Max Aerospace", logo: maxAerospaceLogo },
  { name: "GLTT Travel", logo: glttLogo },
  { name: "FynDNA", logo: fyndnaLogo },
  { name: "Auxin Shipping", logo: auxinLogo },
  { name: "A A Garg & Co", logo: aagargLogo },
  { name: "Samarth Wealth", logo: samarthWealthLogo },
  { name: "Hem Spices", logo: hemSpicesLogo, className: "scale-[1.59]" },
];

const LandingPage = () => {
  const [showDemo, setShowDemo] = useState(false);
  const [showRequestDemo, setShowRequestDemo] = useState(false);
  const testimonials = [
    {
      name: "Sarah Chen",
      role: "CISO, Max Aerospace",
      content: "Vulnerix transformed our vulnerability management. We now identify and remediate threats 3x faster.",
      avatar: "SC"
    },
    {
      name: "Michael Rodriguez",
      role: "Security Director, Auxin Shipping",
      content: "The automated advisory system has saved us countless hours. Critical vulnerabilities no longer slip through.",
      avatar: "MR"
    },
    {
      name: "Emily Thompson",
      role: "VP Engineering, FynDNA",
      content: "Best vulnerability intelligence platform we've used. The integration with our stack was seamless.",
      avatar: "ET"
    },
    {
      name: "Rajesh Sharma",
      role: "IT Head, A A Garg & Co",
      content: "Vulnerix gave us complete visibility into our tech stack vulnerabilities. Compliance audits are now effortless.",
      avatar: "RS"
    },
    {
      name: "Priya Nair",
      role: "CTO, Samarth Wealth",
      content: "The real-time alerting system is a game-changer. We reduced our mean time to remediate by 60%.",
      avatar: "PN"
    },
    {
      name: "David Kim",
      role: "Security Analyst, GLTT Travel",
      content: "The CERT-In advisory correlation feature is invaluable. It gives us context that no other platform provides.",
      avatar: "DK"
    },
    {
      name: "Dhir Karania",
      role: "Director, Hem Spices",
      content: "Even as a non-tech company, Vulnerix helped us secure our digital infrastructure with minimal effort.",
      avatar: "DK"
    }
  ];
  const features = [{
    icon: ShieldAlert,
    title: "Real-Time Vulnerability Detection",
    description: "Instantly detects vulnerabilities as soon as a vendor, product, and version are added. Delivers detailed vulnerability data including CVE IDs, CVSS scores, severity levels, and affected version ranges."
  }, {
    icon: ShieldCheck,
    title: "Automated CVE & Advisory Correlation",
    description: "Enriches National Vulnerability Database (NVD) findings with CERT-In advisories (CIVN). Adds impact analysis, exploitability context, and regulatory relevance, turning raw data into actionable AI insights."
  }, {
    icon: Shield,
    title: "Smart Alerts & Notifications",
    description: "Critical and high-risk vulnerabilities automatically trigger alerts to relevant teams. Notifications are risk-based and context-aware, enabling faster and more informed remediation."
  }];
  return <>
      <DemoTour isOpen={showDemo} onClose={() => setShowDemo(false)} />
      <RequestDemoModal isOpen={showRequestDemo} onClose={() => setShowRequestDemo(false)} />
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <motion.div initial={{
            opacity: 0,
            x: -20
          }} animate={{
            opacity: 1,
            x: 0
          }} className="flex items-center gap-2">
            <img src={vulnerixLogo} alt="Vulnerix Logo" className="h-10 w-10" />
            <span className="text-2xl font-display font-bold text-foreground">Vulnerix</span>
          </motion.div>
          
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#clients" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Clients</a>
            <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
          </nav>

          <div className="flex items-center gap-4">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/auth?mode=register">
              <Button variant="accent" size="sm">Sign Up</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-hero-gradient opacity-5" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/10 rounded-full blur-3xl" />
        
        <div className="container mx-auto px-6 relative">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div initial={{
              opacity: 0,
              y: 20
            }} animate={{
              opacity: 1,
              y: 0
            }} transition={{
              delay: 0.2
            }}>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6">
                <Shield className="h-4 w-4" />
                Vulnerabilities - Identify. Remediate. Comply.
              </span>
            </motion.div>

            <motion.h1 initial={{
              opacity: 0,
              y: 20
            }} animate={{
              opacity: 1,
              y: 0
            }} transition={{
              delay: 0.3
}} className="text-5xl md:text-6xl lg:text-7xl font-display font-bold text-foreground leading-tight mb-4">
              Close Vulnerability Gaps<br />
              <span className="text-gradient text-[#d43702]">Before Hackers Exploit IT.</span>
            </motion.h1>

            <motion.p initial={{
              opacity: 0,
              y: 20
            }} animate={{
              opacity: 1,
              y: 0
            }} transition={{
              delay: 0.4
            }} className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">Real-time vulnerability monitoring and advisory intelligence for your entire technology stack. Stay ahead of threats with alerts and AI actionable insights.</motion.p>

            <motion.div initial={{
              opacity: 0,
              y: 20
            }} animate={{
              opacity: 1,
              y: 0
            }} transition={{
              delay: 0.5
            }} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/auth?mode=register">
                <Button variant="hero" size="xl">
                  Sign Up
                </Button>
              </Link>
              <Button variant="hero-outline" size="xl" onClick={() => setShowRequestDemo(true)}>
                Request Demo
              </Button>
              <Button variant="hero-outline" size="xl" onClick={() => setShowDemo(true)}>
                Product Tour
              </Button>
            </motion.div>
          </div>

          {/* Animated GIF */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="mt-12 flex justify-center"
          >
            <div className="max-w-4xl w-full rounded-2xl overflow-hidden border border-border shadow-2xl bg-card">
              <img
                src={vulnerixAnim}
                alt="Vulnerix platform animation"
                className="w-full h-auto block"
              />
            </div>
          </motion.div>

          {/* Dashboard Preview Image */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-12 flex justify-center"
          >
            <div className="max-w-5xl w-full rounded-2xl overflow-hidden border border-border shadow-2xl bg-card">
              <img
                src={vulnerixDashboard}
                alt="Vulnerix dashboard preview"
                className="w-full h-auto block"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Clients Section - Infinite Slider */}
      <section id="clients" className="py-16 border-y border-border bg-muted/30 overflow-hidden">
        <div className="container mx-auto px-6">
          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center text-sm font-medium text-foreground mb-8">
            TRUSTED BY OUR CLIENTS
          </motion.p>
        </div>
        <div className="relative group">
          <div className="flex animate-scroll-left gap-6 md:gap-10 w-max group-hover:[animation-play-state:paused]">
            {[...clientData, ...clientData].map((client, i) => (
              <div
                key={`${client.name}-${i}`}
                className="flex items-center justify-center p-4 rounded-xl bg-white border border-border min-w-[140px] h-[80px] shrink-0"
                title={client.name}
              >
                <img 
                  src={client.logo} 
                  alt={`${client.name} logo`}
                  className={`max-h-12 max-w-[120px] object-contain ${(client as any).className || ''}`}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24">
        <div className="container mx-auto px-6">
          <motion.div initial={{
            opacity: 0,
            y: 20
          }} whileInView={{
            opacity: 1,
            y: 0
          }} viewport={{
            once: true
          }} className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl font-display font-bold text-foreground mb-4">
              Core Engine Secrets
            </h2>
            <p className="text-lg text-muted-foreground">
              Powered by advanced threat intelligence and automated vulnerability correlation.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, i) => <motion.div key={feature.title} initial={{
              opacity: 0,
              y: 20
            }} whileInView={{
              opacity: 1,
              y: 0
            }} viewport={{
              once: true
            }} transition={{
              delay: i * 0.1
            }} className="group relative bg-card rounded-2xl border border-border p-8 hover:shadow-xl transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                <div className="relative">
                  <div className="inline-flex items-center justify-center h-14 w-14 rounded-xl bg-accent/10 text-accent mb-6">
                    <feature.icon className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-display font-semibold text-foreground mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>)}
          </div>
        </div>
      </section>

      {/* Testimonials Section - Infinite Slider */}
      <section id="testimonials" className="py-24 bg-navy-gradient overflow-hidden">
        <div className="container mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl font-display font-bold text-white mb-4">
              Trusted by Security Leaders
            </h2>
            <p className="text-lg text-white/80">
              See what our customers say about Vulnerix.
            </p>
          </motion.div>
        </div>

        <div className="relative group">
          <div className="flex animate-scroll-left gap-8 w-max group-hover:[animation-play-state:paused]">
            {[...testimonials, ...testimonials].map((testimonial, i) => (
              <div key={`${testimonial.name}-${i}`} className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-8 min-w-[340px] max-w-[400px] shrink-0">
                <p className="text-white leading-relaxed mb-6">
                  "{testimonial.content}"
                </p>
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-semibold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{testimonial.name}</div>
                    <div className="text-sm text-white/70">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div initial={{
            opacity: 0,
            scale: 0.95
          }} whileInView={{
            opacity: 1,
            scale: 1
          }} viewport={{
            once: true
          }} className="relative max-w-4xl mx-auto text-center bg-card rounded-3xl border border-border p-12 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-navy/5" />
            <div className="relative">
              <h2 className="text-4xl font-display font-bold text-foreground mb-4">
                Ready to Secure Your Stack?
              </h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
                Start monitoring vulnerabilities in minutes. No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link to="/auth">
                  <Button variant="hero" size="xl">
                    Sign In
                  </Button>
                </Link>
                <Button variant="navy-outline" size="xl" onClick={() => setShowRequestDemo(true)}>
                  Request Demo
                </Button>
                <Button variant="navy-outline" size="xl" onClick={() => setShowDemo(true)}>
                  Product Tour
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src={vulnerixLogo} alt="Vulnerix Logo" className="h-8 w-8" />
              <span className="text-xl font-display font-bold text-foreground">Vulnerix</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 Vulnerix. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</a>
            </div>
          </div>
          
        </div>
      </footer>
    </div>
    </>;
};
export default LandingPage;
