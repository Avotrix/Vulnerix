import { describe, it, expect } from 'vitest';
import { validatePassword, getPasswordStrength } from './passwordValidator';

describe('Password Validator - Security Tests', () => {
  
  describe('Blocked Weak Passwords', () => {
    const blockedPasswords = [
      'password',
      '123456',
      'admin123',
      'qwerty',
      'letmein',
      'welcome',
      'iloveyou',
      'password123',
    ];

    blockedPasswords.forEach((pwd) => {
      it(`should block weak password: "${pwd}"`, () => {
        const result = validatePassword(pwd);
        expect(result.valid).toBe(false);
        expect(result.rules.notBlocked).toBe(false);
        expect(result.errors).toContain('This password is too common and not allowed');
      });
    });
  });

  describe('Length Requirements', () => {
    it('should reject passwords shorter than 12 characters', () => {
      const result = validatePassword('Short1!aB');
      expect(result.valid).toBe(false);
      expect(result.rules.minLength).toBe(false);
    });

    it('should accept passwords with 12+ characters', () => {
      const result = validatePassword('ValidPass123!@#');
      expect(result.rules.minLength).toBe(true);
    });
  });

  describe('Character Requirements', () => {
    it('should reject password without uppercase', () => {
      const result = validatePassword('nouppercase123!@#');
      expect(result.rules.hasUppercase).toBe(false);
    });

    it('should reject password without lowercase', () => {
      const result = validatePassword('NOLOWERCASE123!@#');
      expect(result.rules.hasLowercase).toBe(false);
    });

    it('should reject password without numbers', () => {
      const result = validatePassword('NoNumbersHere!@#Ab');
      expect(result.rules.hasNumber).toBe(false);
    });

    it('should reject password without special characters', () => {
      const result = validatePassword('NoSpecialChars123Ab');
      expect(result.rules.hasSpecialChar).toBe(false);
    });
  });

  describe('User Context Validation', () => {
    it('should reject password containing email username', () => {
      const result = validatePassword('JohnDoe123!@#Ab', {
        email: 'johndoe@example.com',
      });
      expect(result.rules.notContainsUserInfo).toBe(false);
    });

    it('should reject password containing user name', () => {
      const result = validatePassword('MyNameIsAlice123!', {
        name: 'Alice Smith',
      });
      expect(result.rules.notContainsUserInfo).toBe(false);
    });

    it('should reject password containing organization name', () => {
      const result = validatePassword('AcmeCorp123!@#', {
        org: 'AcmeCorp',
      });
      expect(result.rules.notContainsUserInfo).toBe(false);
    });

    it('should accept password without user info', () => {
      const result = validatePassword('SecurePass123!@#', {
        email: 'alice@example.com',
        name: 'Bob Jones',
        org: 'TechCorp',
      });
      expect(result.rules.notContainsUserInfo).toBe(true);
    });
  });

  describe('Strong Password Acceptance', () => {
    const strongPasswords = [
      'SecureP@ssw0rd!',
      'MyStr0ng#Pass123',
      'Complex!ty2024Ab',
      'V3ryS3cur3P@ss!',
      'H@rdT0Gu3ss2024',
    ];

    strongPasswords.forEach((pwd) => {
      it(`should accept strong password: "${pwd.substring(0, 8)}..."`, () => {
        const result = validatePassword(pwd);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('Password Strength Calculation', () => {
    it('should return "weak" for passwords with few rules passed', () => {
      const result = validatePassword('abc');
      const strength = getPasswordStrength(result.rules);
      expect(strength).toBe('weak');
    });

    it('should return "strong" for passwords with all rules passed', () => {
      const result = validatePassword('SecureP@ssw0rd!');
      const strength = getPasswordStrength(result.rules);
      expect(strength).toBe('strong');
    });
  });

  describe('Security - No Information Leakage', () => {
    it('should not expose password in error messages', () => {
      const testPassword = 'MySecretPass123!';
      const result = validatePassword(testPassword);
      
      // Ensure password is not in any error message
      result.errors.forEach((error) => {
        expect(error).not.toContain(testPassword);
      });
    });
  });
});
