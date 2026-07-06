/** Values sent and returned as `UserModel.is_verified` for partners (`getAll?is_verified=`). */
export const PARTNER_VERIFICATION = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type PartnerVerificationValue =
  (typeof PARTNER_VERIFICATION)[keyof typeof PARTNER_VERIFICATION];

export function normalizePartnerVerification(
  v: boolean | string | null | undefined
): PartnerVerificationValue {
  if (v === true) return PARTNER_VERIFICATION.APPROVED;
  if (v === false || v === null || v === undefined) {
    return PARTNER_VERIFICATION.PENDING;
  }
  const s = String(v).trim();
  if (!s) return PARTNER_VERIFICATION.PENDING;
  const low = s.toLowerCase();
  if (low === "approved" || s === PARTNER_VERIFICATION.APPROVED) {
    return PARTNER_VERIFICATION.APPROVED;
  }
  if (low === "rejected" || s === PARTNER_VERIFICATION.REJECTED) {
    return PARTNER_VERIFICATION.REJECTED;
  }
  if (low === "pending" || s === PARTNER_VERIFICATION.PENDING) {
    return PARTNER_VERIFICATION.PENDING;
  }
  if (low === "true" || s === "1") return PARTNER_VERIFICATION.APPROVED;
  if (low === "false" || s === "0") return PARTNER_VERIFICATION.PENDING;
  return PARTNER_VERIFICATION.PENDING;
}

export function partnerVerificationLabel(
  v: boolean | string | null | undefined
): string {
  const n = normalizePartnerVerification(v);
  if (n === PARTNER_VERIFICATION.APPROVED) return "Approved";
  if (n === PARTNER_VERIFICATION.REJECTED) return "Rejected";
  return "Pending";
}
