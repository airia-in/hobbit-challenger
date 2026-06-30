import { parsePhoneNumberFromString } from 'libphonenumber-js';

export class PhoneValidationError extends Error {
  constructor(message = 'Invalid phone number') {
    super(message);
    this.name = 'PhoneValidationError';
  }
}

/** Canonicalize a raw phone input to E.164, defaulting bare 10-digit numbers to +91 (IN). */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PhoneValidationError();
  }

  const parsed = parsePhoneNumberFromString(trimmed, 'IN');
  if (!parsed?.isValid()) {
    throw new PhoneValidationError();
  }

  return parsed.format('E.164');
}
