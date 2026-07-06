/** Partner payout — uses global `PAYMENT_METHODS` from `paymentAndCurrency`. */

import { PAYMENT_METHODS, paymentMethodLabel } from "../global/paymentAndCurrency";
import type { PaymentMethodSlug } from "../global/paymentAndCurrency";

export const PARTNER_PAYOUT_PAYMENT_METHODS = PAYMENT_METHODS;

/** Methods accepted by `POST /api/partner_payout/create` (Postman §37). */
export const PARTNER_PAYOUT_CREATE_METHODS = [
  { value: "cash", label: "Cash" },
  // { value: "bank_transfer", label: "Online transfer" },
  { value: "cheque", label: "Cheque" },
  // { value: "other", label: "Other" },
] as const;

export type PartnerPayoutPaymentMethod =
  | PaymentMethodSlug
  | (typeof PARTNER_PAYOUT_CREATE_METHODS)[number]["value"];

export function partnerPayoutPaymentMethodLabel(
  method: string | null | undefined
): string {
  return paymentMethodLabel(method);
}
