/** Shared client-side rules for web user create / franchise employee forms. */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Non-empty after trim. */
export function isNonEmptyName(value: string): boolean {
  return String(value ?? "").trim().length > 0;
}

export function isValidUserEmail(value: string): boolean {
  return EMAIL_PATTERN.test(String(value ?? "").trim());
}

/**
 * E.164-style: optional leading `+`, then digits only; total digits between 7 and 15 (ITU max).
 */
export function isValidE164StylePhone(value: string): boolean {
  const t = String(value ?? "").trim();
  if (!t) return false;
  const body = t.startsWith("+") ? t.slice(1) : t;
  if (!/^\d+$/.test(body)) return false;
  return body.length >= 7 && body.length <= 15;
}

/** Sanitize phone input: optional leading +, digits only, max 15 digit body. */
export function sanitizeE164PhoneInput(raw: string): string {
  let s = String(raw ?? "");
  const hasPlus = s.trim().startsWith("+");
  const digits = s.replace(/\D/g, "").slice(0, 15);
  return hasPlus ? `+${digits}` : digits;
}

/** India franchise UI: national digits only (no +91 in the edit field). Strip leading 91 when present. */
export function nationalDigitsWithoutIndia91(phone: string): string {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.startsWith("91") && d.length >= 11) {
    d = d.slice(2);
  }
  return d.slice(0, 10);
}

/** National segment only (digits), typical IN mobile length. */
export function sanitizeIndiaNationalPhoneInput(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 10);
}

/** Full E.164 used for API (`+91` + national digits). */
export function fullPhoneFromIndiaNational(nationalDigits: string): string {
  const d = nationalDigits.replace(/\D/g, "");
  return d ? `+91${d}` : "";
}

export const WEB_USER_TYPE_MIN = 1;
export const WEB_USER_TYPE_MAX = 6;

export function isValidWebUserType(type: unknown): boolean {
  const n = typeof type === "number" ? type : Number(type);
  return (
    Number.isInteger(n) &&
    n >= WEB_USER_TYPE_MIN &&
    n <= WEB_USER_TYPE_MAX
  );
}

/** Returns error message or null when valid. */
export function validateStrongPassword(password: string): string | null {
  const pw = String(password ?? "");
  if (pw.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[a-z]/.test(pw)) {
    return "Password must include a lowercase letter.";
  }
  if (!/[A-Z]/.test(pw)) {
    return "Password must include an uppercase letter.";
  }
  if (!/\d/.test(pw)) {
    return "Password must include a digit.";
  }
  if (!/[^A-Za-z0-9]/.test(pw)) {
    return "Password must include a special character.";
  }
  return null;
}

export function passwordsMatch(password: string, confirm: string): boolean {
  return String(password ?? "") === String(confirm ?? "");
}
