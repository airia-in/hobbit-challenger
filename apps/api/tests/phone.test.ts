import { describe, expect, it } from 'vitest';
import { normalizePhone, PhoneValidationError } from '../src/auth/phone';

describe('normalizePhone', () => {
  it('normalizes bare 10-digit Indian numbers to +91 E.164', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
  });

  it('passes through already-valid E.164 numbers', () => {
    expect(normalizePhone('+919876543210')).toBe('+919876543210');
  });

  it('handles whitespace and formatting variants', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+919876543210');
  });

  it('throws for clearly invalid numbers', () => {
    expect(() => normalizePhone('')).toThrow(PhoneValidationError);
    expect(() => normalizePhone('123')).toThrow(PhoneValidationError);
    expect(() => normalizePhone('not-a-phone')).toThrow(PhoneValidationError);
  });
});
