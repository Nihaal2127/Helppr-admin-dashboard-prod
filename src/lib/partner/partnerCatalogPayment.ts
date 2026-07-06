/** Human-readable billing cadence from API `payment_type` (e.g. `per_day` → `per day`). */
export function formatServicePaymentCadence(paymentType: string): string {
  const t = String(paymentType ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (!t) return "";
  const map: Record<string, string> = {
    per_hour: "per hour",
    per_month: "per month",
    per_day: "per day",
    per_week: "per week",
    per_service: "per service",
    per_consultancy: "per consultancy",
  };
  if (map[t]) return map[t];
  return t.replace(/_/g, " ");
}

/** Partner catalog price field label — e.g. `per_day` → `Price (per day)`. */
export function partnerCatalogPriceLabel(paymentType?: string | null): string {
  const cadence = formatServicePaymentCadence(String(paymentType ?? ""));
  if (!cadence) return "Price";
  return `Price (${cadence})`;
}
