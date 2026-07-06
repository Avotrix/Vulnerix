/**
 * Password Validation Utility
 * 
 * Defense-in-depth security layer for client-side password validation.
 * This does NOT replace Supabase Auth security - it's a pre-check only.
 * 
 * SECURITY RULES:
 * - No password logging
 * - No password storage
 * - No localStorage/sessionStorage
 * - No caching
 * - No analytics logging
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  rules: PasswordRuleStatus;
}

export interface PasswordRuleStatus {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
  notBlocked: boolean;
  notContainsUserInfo: boolean;
}

export interface UserContext {
  email?: string;
  name?: string;
  org?: string;
}

// Blocked common/weak passwords
const BLOCKED_PASSWORDS = [
  'password',
  '123456',
  'admin123',
  'qwerty',
  'letmein',
  'welcome',
  'iloveyou',
  'password123',
  'password1',
  '12345678',
  '123456789',
  '1234567890',
  'admin',
  'administrator',
  'root',
  'test',
  'guest',
  'master',
  'changeme',
  'abc123',
  'monkey',
  'dragon',
  'princess',
  'football',
  'baseball',
  'soccer',
  'hockey',
  'batman',
  'superman',
  'trustno1',
  'passw0rd',
];

const MIN_PASSWORD_LENGTH = 12;

/**
 * Validates a password against security rules
 * 
 * @param password - The password to validate (never logged or stored)
 * @param userContext - Optional user context to check for personal info in password
 * @returns Validation result with errors and rule status
 */
export function validatePassword(
  password: string,
  userContext?: UserContext
): PasswordValidationResult {
  const errors: string[] = [];
  
  // Rule checks
  const minLength = password.length >= MIN_PASSWORD_LENGTH;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password);
  
  // Check if password is in blocked list
  const passwordLower = password.toLowerCase();
  const notBlocked = !BLOCKED_PASSWORDS.includes(passwordLower);
  
  // Check if password contains user info
  let notContainsUserInfo = true;
  if (userContext) {
    const lowerPassword = password.toLowerCase();
    
    // Check email (without domain)
    if (userContext.email) {
      const emailLocalPart = userContext.email.split('@')[0].toLowerCase();
      if (emailLocalPart.length >= 3 && lowerPassword.includes(emailLocalPart)) {
        notContainsUserInfo = false;
      }
    }
    
    // Check name parts
    if (userContext.name) {
      const nameParts = userContext.name.toLowerCase().split(/\s+/);
      for (const part of nameParts) {
        if (part.length >= 3 && lowerPassword.includes(part)) {
          notContainsUserInfo = false;
          break;
        }
      }
    }
    
    // Check organization name
    if (userContext.org) {
      const orgLower = userContext.org.toLowerCase();
      // Only check if org name is substantial (3+ chars)
      if (orgLower.length >= 3 && lowerPassword.includes(orgLower)) {
        notContainsUserInfo = false;
      }
    }
  }
  
  // Build error messages
  if (!minLength) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!hasUppercase) {
    errors.push('Password must contain at least 1 uppercase letter');
  }
  if (!hasLowercase) {
    errors.push('Password must contain at least 1 lowercase letter');
  }
  if (!hasNumber) {
    errors.push('Password must contain at least 1 number');
  }
  if (!hasSpecialChar) {
    errors.push('Password must contain at least 1 special character');
  }
  if (!notBlocked) {
    errors.push('This password is too common and not allowed');
  }
  if (!notContainsUserInfo) {
    errors.push('Password cannot contain your name, email, or organization');
  }
  
  const rules: PasswordRuleStatus = {
    minLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialChar,
    notBlocked,
    notContainsUserInfo,
  };
  
  const valid = Object.values(rules).every(Boolean);
  
  return {
    valid,
    errors,
    rules,
  };
}

/**
 * Get a human-readable strength label
 */
export function getPasswordStrength(rules: PasswordRuleStatus): 'weak' | 'fair' | 'strong' {
  const passedRules = Object.values(rules).filter(Boolean).length;
  
  if (passedRules <= 3) return 'weak';
  if (passedRules <= 5) return 'fair';
  return 'strong';
}
