/** Indian postal PIN: exactly 6 digits, numbers only. */
export const INDIAN_PINCODE_REGEX = /^\d{6}$/;

export function sanitizeIndianPincodeInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

/** react-hook-form rules for a required single pincode field. */
export function indianPincodeRequiredRules() {
  return {
    required: "Pincode is required",
    pattern: {
      value: INDIAN_PINCODE_REGEX,
      message: "Pincode must be exactly 6 digits (numbers only)",
    },
  } as const;
}

/** Validate `string[]` of pincodes from multi-row UI (e.g. area dialog). */
export function validateIndianPincodeList(value: unknown): true | string {
  if (!Array.isArray(value)) return "At least one pincode is required";
  const codes = value.map((p) => String(p).trim()).filter(Boolean);
  if (codes.length === 0) return "At least one pincode is required";
  const invalid = codes.find((p) => !INDIAN_PINCODE_REGEX.test(p));
  if (invalid) return "Each pincode must be exactly 6 digits (numbers only)";
  return true;
}
