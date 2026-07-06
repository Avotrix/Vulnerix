import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'critical' | 'high' | 'medium' | 'low' | 'accent';
  className?: string;
}

export const StatCard = ({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  variant = 'default',
  className 
}: StatCardProps) => {
  const variantStyles = {
    default: 'bg-card border-border',
    critical: 'bg-severity-critical/10 border-severity-critical/30',
    high: 'bg-severity-high/10 border-severity-high/30',
    medium: 'bg-severity-medium/10 border-severity-medium/30',
    low: 'bg-severity-low/10 border-severity-low/30',
    accent: 'bg-accent/10 border-accent/30'
  };

  const iconStyles = {
    default: 'text-muted-foreground bg-muted',
    critical: 'text-severity-critical bg-severity-critical/20',
    high: 'text-severity-high bg-severity-high/20',
    medium: 'text-severity-medium bg-severity-medium/20',
    low: 'text-severity-low bg-severity-low/20',
    accent: 'text-accent bg-accent/20'
  };

  return (
    <div 
      className={cn(
        'relative overflow-hidden rounded-xl border p-6 transition-all duration-300 hover:shadow-lg',
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold font-display text-foreground">{value}</p>
          {trend && (
            <p className={cn(
              "text-xs font-medium",
              trend.isPositive ? "text-severity-low" : "text-severity-critical"
            )}>
              {trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}% from last week
            </p>
          )}
        </div>
        <div className={cn(
          'flex h-12 w-12 items-center justify-center rounded-lg',
          iconStyles[variant]
        )}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
};
