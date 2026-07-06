/**
 * Financial order payments — customer / partner payment status slugs (query filters)
 * and display labels (API response + UI).
 */

export type CustomerPaymentStatusSlug =
  | "paid"
  | "unpaid"
  | "partially_paid"
  | "refund"
  | "partially_refund"
  | "completed";

export type PartnerPaymentStatusSlug =
  | "paid"
  | "unpaid"
  | "partially_paid"
  | "completed";

export const CUSTOMER_PAYMENT_STATUS_LABELS = [
  "Paid",
  "Unpaid",
  "Partially paid",
  "Refund",
  "Partially Refund",
  "Completed",
] as const;

export const PARTNER_PAYMENT_STATUS_LABELS = [
  "Paid",
  "Unpaid",
  "Partially paid",
  "Completed",
] as const;

export type CustomerPaymentStatusLabel =
  (typeof CUSTOMER_PAYMENT_STATUS_LABELS)[number];
export type PartnerPaymentStatusLabel =
  (typeof PARTNER_PAYMENT_STATUS_LABELS)[number];

const CUSTOMER_SLUG_TO_LABEL: Record<CustomerPaymentStatusSlug, CustomerPaymentStatusLabel> = {
  paid: "Paid",
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  refund: "Refund",
  partially_refund: "Partially Refund",
  completed: "Completed",
};

const PARTNER_SLUG_TO_LABEL: Record<PartnerPaymentStatusSlug, PartnerPaymentStatusLabel> = {
  paid: "Paid",
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  completed: "Completed",
};

const CUSTOMER_LABEL_TO_SLUG: Record<string, CustomerPaymentStatusSlug> = {
  paid: "paid",
  unpaid: "unpaid",
  "partially paid": "partially_paid",
  partially_paid: "partially_paid",
  partial: "partially_paid",
  refund: "refund",
  refunded: "refund",
  "partially refund": "partially_refund",
  "partially refunded": "partially_refund",
  partially_refund: "partially_refund",
  partially_refunded: "partially_refund",
  completed: "completed",
  complete: "completed",
  pending: "unpaid",
};

const PARTNER_LABEL_TO_SLUG: Record<string, PartnerPaymentStatusSlug> = {
  paid: "paid",
  unpaid: "unpaid",
  "partially paid": "partially_paid",
  partially_paid: "partially_paid",
  partial: "partially_paid",
  completed: "completed",
  complete: "completed",
  pending: "unpaid",
};

/** React-select options — plain `{ value, label }` for filter dropdowns. */
export function customerPaymentStatusFilterSelectOptions(): {
  value: string;
  label: string;
}[] {
  return CUSTOMER_PAYMENT_STATUS_FILTER_OPTIONS.map((o) => ({
    value: String(o.value),
    label: o.label,
  }));
}

export function partnerPaymentStatusFilterSelectOptions(): {
  value: string;
  label: string;
}[] {
  return PARTNER_PAYMENT_STATUS_FILTER_OPTIONS.map((o) => ({
    value: String(o.value),
    label: o.label,
  }));
}

export function customerPaymentStatusLabelFromSlug(
  slug: string | null | undefined
): CustomerPaymentStatusLabel | "" {
  const normalized = normalizeCustomerPaymentStatusSlug(slug);
  if (normalized) return CUSTOMER_SLUG_TO_LABEL[normalized];
  return "";
}

export function partnerPaymentStatusLabelFromSlug(
  slug: string | null | undefined
): PartnerPaymentStatusLabel | "" {
  const normalized = normalizePartnerPaymentStatusSlug(slug);
  if (normalized) return PARTNER_SLUG_TO_LABEL[normalized];
  return "";
}

export function normalizeCustomerPaymentStatusSlug(
  raw: string | null | undefined
): CustomerPaymentStatusSlug | "" {
  const k = String(raw ?? "").trim().toLowerCase();
  return (CUSTOMER_LABEL_TO_SLUG[k] as CustomerPaymentStatusSlug | undefined) ?? "";
}

export function normalizePartnerPaymentStatusSlug(
  raw: string | null | undefined
): PartnerPaymentStatusSlug | "" {
  const k = String(raw ?? "").trim().toLowerCase();
  return (PARTNER_LABEL_TO_SLUG[k] as PartnerPaymentStatusSlug | undefined) ?? "";
}

export const CUSTOMER_PAYMENT_STATUS_FILTER_OPTIONS: {
  value: "" | CustomerPaymentStatusSlug;
  label: string;
}[] = [
  { value: "", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "refund", label: "Refund" },
  { value: "partially_refund", label: "Partially Refund" },
 
];

export const PARTNER_PAYMENT_STATUS_FILTER_OPTIONS: {
  value: "" | PartnerPaymentStatusSlug;
  label: string;
}[] = [
  { value: "", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially paid" },
  
];

export const customerPaymentStatusSelectOptions = CUSTOMER_PAYMENT_STATUS_LABELS.map(
  (label) => ({ value: label, label })
);

export const partnerPaymentStatusSelectOptions = PARTNER_PAYMENT_STATUS_LABELS.map(
  (label) => ({ value: label, label })
);
