import { cn } from "@/lib/utils";

const TechStackFlowDiagram = () => {
  return (
    <section className="w-full flex justify-center py-6 mt-6">
      <div className="max-w-4xl w-full px-4 md:px-6">
        {/* Outer Box Container - Dark cybersecurity theme */}
        <div className="rounded-2xl border border-blue-500/30 bg-slate-950 shadow-2xl p-6 md:p-10 relative overflow-hidden">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-emerald-500/5 pointer-events-none" />
          
          {/* Diagram Container */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 relative">
            
            {/* Left Column - Input Sources */}
            <div className="flex flex-col gap-6 z-10">
              <DiagramNode>NVD CVE Feed</DiagramNode>
              <DiagramNode>CERT-In Advisories</DiagramNode>
            </div>

            {/* Center Column - Engine */}
            <div className="flex flex-col z-10">
              <EngineNode>
                Relevance Engine
                <span className="block text-xs text-slate-400 font-normal mt-2">
                  Asset & Version Matching
                </span>
              </EngineNode>
            </div>

            {/* Right Column - Outputs */}
            <div className="flex flex-col gap-6 z-10">
              <DiagramNode>Final Vulnerability Alerts</DiagramNode>
              <DiagramNode>Interactive Dashboards</DiagramNode>
            </div>

            {/* SVG Connection Lines - Hidden on mobile */}
            <svg 
              className="hidden md:block absolute inset-0 w-full h-full z-0 pointer-events-none"
              viewBox="0 0 800 400" 
              preserveAspectRatio="none"
            >
              {/* Left to Center connections */}
              <path 
                className="connection-line"
                d="M 230 120 C 300 120, 300 200, 370 200" 
              />
              <path 
                className="connection-line"
                d="M 230 280 C 300 280, 300 200, 370 200" 
              />
              
              {/* Center to Right connections */}
              <path 
                className="connection-line"
                d="M 580 200 C 650 200, 650 120, 720 120" 
              />
              <path 
                className="connection-line"
                d="M 580 200 C 650 200, 650 280, 720 280" 
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Scoped styles for animations */}
      <style>{`
        .connection-line {
          fill: none;
          stroke: #3b82f6;
          stroke-width: 2;
          stroke-dasharray: 10, 10;
          opacity: 0.6;
          animation: flowLine 3s linear infinite;
        }
        
        @keyframes flowLine {
          to {
            stroke-dashoffset: -20;
          }
        }
        
        .engine-glow {
          animation: enginePulse 4s infinite ease-in-out;
        }
        
        @keyframes enginePulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
          }
          50% {
            box-shadow: 0 0 35px rgba(16, 185, 129, 0.7);
            border-color: #34d399;
          }
        }
      `}</style>
    </section>
  );
};

interface DiagramNodeProps {
  children: React.ReactNode;
  className?: string;
}

const DiagramNode = ({ children, className }: DiagramNodeProps) => {
  return (
    <div 
      className={cn(
        "bg-slate-900 border-2 border-blue-500 rounded-xl px-6 py-4 md:px-8 md:py-5",
        "text-center font-semibold text-white text-sm md:text-base",
        "shadow-[0_0_15px_rgba(59,130,246,0.3)]",
        "min-w-[160px] md:min-w-[180px]",
        "transition-all duration-300 ease-out",
        "hover:-translate-y-1 hover:shadow-[0_0_25px_rgba(59,130,246,0.6)]",
        className
      )}
    >
      {children}
    </div>
  );
};

interface EngineNodeProps {
  children: React.ReactNode;
}

const EngineNode = ({ children }: EngineNodeProps) => {
  return (
    <div 
      className={cn(
        "bg-slate-900 border-2 border-emerald-500 rounded-xl px-8 py-6 md:px-10 md:py-8",
        "text-center font-semibold text-white text-lg md:text-xl",
        "min-w-[180px] md:min-w-[220px]",
        "transition-all duration-300 ease-out",
        "hover:-translate-y-1",
        "engine-glow"
      )}
    >
      {children}
    </div>
  );
};

export default TechStackFlowDiagram;
