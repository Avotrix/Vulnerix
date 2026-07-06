import { cn } from "@/lib/utils";

interface SeverityBadgeProps {
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  className?: string;
}

export const SeverityBadge = ({ severity, className }: SeverityBadgeProps) => {
  const colors = {
    Critical: 'bg-severity-critical text-primary-foreground',
    High: 'bg-severity-high text-primary-foreground',
    Medium: 'bg-severity-medium text-foreground',
    Low: 'bg-severity-low text-primary-foreground'
  };

  return (
    <span 
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
        colors[severity],
        className
      )}
    >
      {severity}
    </span>
  );
};
