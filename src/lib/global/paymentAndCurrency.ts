/**
 * Global payment methods and currency — single place to update site-wide.
 * API payloads may use slug (`cash`) or label (`Cash`); UI uses slugs as option values.
 */

export const CURRENCY = {
  code: "INR",
  symbol: "₹",
  locale: "en-IN",
} as const;

/** Canonical payment method slugs (order payments, payouts, expenses). */
export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "online", label: "Online" },
  { value: "bank_transfer", label: "Bank transfer" },
] as const;

export type PaymentMethodSlug = (typeof PAYMENT_METHODS)[number]["value"];

const LABEL_BY_SLUG = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label])
) as Record<PaymentMethodSlug, string>;

const SLUG_SET = new Set<string>(PAYMENT_METHODS.map((m) => m.value));

/** Maps legacy UI/API strings to a canonical slug. */
const LEGACY_TO_SLUG: Record<string, PaymentMethodSlug> = {
  cod: "cash",
  "cash on delivery": "cash",
  "razor pay": "online",
  razor_pay: "online",
  razorpay: "online",
  "razor-pay": "online",
  imps: "bank_transfer",
  neft: "bank_transfer",
  rtgs: "bank_transfer",
  banktransfer: "bank_transfer",
  "bank transfer": "bank_transfer",
  bank_transfer: "bank_transfer",
  wallet: "online",
};

/** Expense list historically used numeric `payment_mode_id`. */
const EXPENSE_MODE_ID_TO_SLUG: Record<number, PaymentMethodSlug> = {
  1: "cash",
  2: "online",
};

export function normalizePaymentMethod(
  raw: string | number | null | undefined
): PaymentMethodSlug | "" {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return EXPENSE_MODE_ID_TO_SLUG[raw] ?? "";
  }
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return "";
  const lower = trimmed.toLowerCase();
  const slugKey = lower.replace(/\s+/g, "_");
  if (SLUG_SET.has(slugKey)) return slugKey as PaymentMethodSlug;
  const alias =
    LEGACY_TO_SLUG[lower] ??
    LEGACY_TO_SLUG[slugKey] ??
    LEGACY_TO_SLUG[lower.replace(/_/g, " ")];
  if (alias) return alias;
  return "";
}

export function paymentMethodLabel(
  raw: string | number | null | undefined
): string {
  const slug = normalizePaymentMethod(raw);
  if (slug) return LABEL_BY_SLUG[slug];
  const s = String(raw ?? "").trim();
  if (!s || s === "—") return "—";
  return s.replace(/_/g, " ");
}

export function paymentMethodSelectOptions(): {
  value: string;
  label: string;
}[] {
  return PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }));
}

export function paymentMethodApiValue(
  raw: string | number | null | undefined
): string {
  const slug = normalizePaymentMethod(raw);
  return slug ? LABEL_BY_SLUG[slug] : "";
}

export function paymentMethodFromExpenseModeId(
  id: number | string | null | undefined
): PaymentMethodSlug | "" {
  const n = Number(id);
  if (!Number.isFinite(n)) return normalizePaymentMethod(id);
  return EXPENSE_MODE_ID_TO_SLUG[n] ?? "";
}

/** Round to 2 decimal places — use for all money math site-wide. */
export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Display numeric part with exactly 2 decimals (no currency symbol). */
export function formatMoney2(amount: number): string {
  return roundMoney(amount).toFixed(2);
}

/** While typing money: digits, optional `.`, max 2 fraction digits (does not round). */
export function sanitizeMoneyInput(raw: string): string {
  const cleaned = String(raw ?? "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dotIdx = cleaned.indexOf(".");
  if (dotIdx === -1) return cleaned;
  const intPart = cleaned.slice(0, dotIdx + 1);
  const frac = cleaned.slice(dotIdx + 1).replace(/\./g, "").slice(0, 2);
  return intPart + frac;
}

/** Parse sanitized money text to a rounded number (`""` / `"."` → 0). */
export function parseMoneyInput(raw: string): number {
  const t = sanitizeMoneyInput(raw).trim();
  if (!t || t === ".") return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundMoney(n);
}

/** Paid-amount field display: show in-progress text while typing, else formatted amount. */
export function paymentAmountFieldValue(row: {
  amount: number;
  amountInput?: string;
}): string {
  if (row.amountInput != null) return row.amountInput;
  if (!row.amount) return "";
  return formatMoney2(row.amount);
}

/** Effective rupee value from stored amount + optional draft input. */
export function paymentRowEffectiveAmount(row: {
  amount: number;
  amountInput?: string;
}): number {
  const draft = row.amountInput?.trim();
  if (draft && draft !== ".") return parseMoneyInput(draft);
  return roundMoney(Number(row.amount) || 0);
}

export function formatCurrency(
  amount: number,
  opts?: { decimals?: number; symbol?: string }
): string {
  const rounded = roundMoney(amount);
  const negative = rounded < -0.00001;
  const abs = Math.abs(rounded);
  const decimals = opts?.decimals ?? 2;
  const s =
    decimals === 0 ? String(Math.round(abs)) : abs.toFixed(decimals);
  const sym = opts?.symbol ?? CURRENCY.symbol;
  const formatted = `${sym}${s}`;
  return negative ? `-${formatted}` : formatted;
}

/** @deprecated Prefer `paymentMethodSelectOptions` + slug values; kept for expense export. */
export const PaymentEnum = new Map<number, { label: string; slug: PaymentMethodSlug }>(
  PAYMENT_METHODS.map((m, i) => [i + 1, { label: m.label, slug: m.value }])
);
