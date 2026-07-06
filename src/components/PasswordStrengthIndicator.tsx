import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PasswordRuleStatus, getPasswordStrength } from "@/utils/passwordValidator";

interface PasswordStrengthIndicatorProps {
  rules: PasswordRuleStatus;
  showChecklist?: boolean;
}

const PasswordStrengthIndicator = ({ rules, showChecklist = true }: PasswordStrengthIndicatorProps) => {
  const strength = getPasswordStrength(rules);
  const passedRules = Object.values(rules).filter(Boolean).length;
  const totalRules = Object.values(rules).length;
  const progressPercentage = (passedRules / totalRules) * 100;
  
  const strengthConfig = {
    weak: {
      label: 'Weak',
      color: 'bg-destructive',
      textColor: 'text-destructive',
    },
    fair: {
      label: 'Fair',
      color: 'bg-yellow-500',
      textColor: 'text-yellow-500',
    },
    strong: {
      label: 'Strong',
      color: 'bg-green-500',
      textColor: 'text-green-500',
    },
  };
  
  const config = strengthConfig[strength];
  
  const ruleLabels: { key: keyof PasswordRuleStatus; label: string }[] = [
    { key: 'minLength', label: 'At least 12 characters' },
    { key: 'hasUppercase', label: 'One uppercase letter' },
    { key: 'hasLowercase', label: 'One lowercase letter' },
    { key: 'hasNumber', label: 'One number' },
    { key: 'hasSpecialChar', label: 'One special character (!@#$%^&*)' },
    { key: 'notBlocked', label: 'Not a common password' },
    { key: 'notContainsUserInfo', label: 'No personal info' },
  ];
  
  return (
    <div className="space-y-3">
      {/* Strength bar */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">Password strength</span>
          <span className={cn("font-medium", config.textColor)}>
            {config.label}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all duration-300 rounded-full", config.color)}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>
      
      {/* Rule checklist */}
      {showChecklist && (
        <div className="grid grid-cols-1 gap-1.5">
          {ruleLabels.map(({ key, label }) => (
            <div
              key={key}
              className={cn(
                "flex items-center gap-2 text-xs transition-colors",
                rules[key] ? "text-green-500" : "text-muted-foreground"
              )}
            >
              {rules[key] ? (
                <Check className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <X className="h-3.5 w-3.5 flex-shrink-0" />
              )}
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PasswordStrengthIndicator;
