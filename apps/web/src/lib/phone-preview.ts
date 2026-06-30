/** Lightweight IN (+91) preview for register — server canonicalizes authoritatively. */
export function formatRegisterPhonePreview(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  }

  if (digits.length > 10) {
    digits = digits.slice(-10);
  }

  const grouped =
    digits.length <= 5 ? digits : `${digits.slice(0, 5)} ${digits.slice(5)}`;

  return `+91 ${grouped}`;
}
