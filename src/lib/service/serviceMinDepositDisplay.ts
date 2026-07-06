import { AppConstant } from "../global/AppConstant";

const MIN_DEPOSIT_TYPE_LABELS: Record<string, string> = {
  per_hour: "Per Hour",
  per_day: "Per Day",
  per_month: "Per Month",
  per_consultancy: "Per Consultancy",
};

/**
 * Normalizes a payment / min-deposit type key from API values such as
 * `per_month`, `PER_MONTH`, `per month`, or combined strings like `per_month (10%)`.
 */
export function extractMinDepositTypeKey(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const beforeParen = s.split("(")[0].trim();
  return beforeParen.replace(/\s+/g, "_").replace(/-+/g, "_").toLowerCase();
}

/** Title-case label aligned with service form `CustomFormSelect` options. */
export function labelForMinDepositType(raw: string): string {
  const key = extractMinDepositTypeKey(raw);
  if (!key) return "";
  if (MIN_DEPOSIT_TYPE_LABELS[key]) return MIN_DEPOSIT_TYPE_LABELS[key];
  return key
    .split(/_/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function percentFromCombinedTypeField(combined: string): string {
  const m = String(combined ?? "").match(/\(\s*([\d.]+)\s*%?\s*\)/);
  return m ? m[1].trim() : "";
}

function explicitPercentFromRecord(record: Record<string, unknown>): string {
  const any = record as Record<string, unknown>;
  const v = any.min_deposit_value ?? any.minimum_deposit;
  if (v === undefined || v === null) return "";
  const s = String(v).trim();
  if (s === "") return "";
  return s.replace(/%$/, "").trim();
}

/**
 * One-line display for service min deposit / payment type, e.g. `Per Month (10%)`.
 * Handles split fields (`min_deposit_type` + `min_deposit_value`) and combined
 * `payment_type` strings from the API.
 */
export function formatMinDepositDisplay(
  record: Record<string, unknown> | null | undefined
): string {
  if (!record) return "-";
  const any = record as Record<string, unknown>;
  const rawType = String(
    any.min_deposit_type ?? any.payment_type ?? ""
  ).trim();
  if (!rawType) return "-";
  const label = labelForMinDepositType(rawType);
  if (!label) return "-";
  let pct = explicitPercentFromRecord(record);
  if (pct === "") pct = percentFromCombinedTypeField(rawType);
  if (pct !== "") return `${label} (${pct}${AppConstant.percentageSymbol})`;
  return label;
}

/** Read-only view: payment cadence vs deposit amount/percent (matches add/edit form labels). */
export function getMinDepositViewParts(
  record: Record<string, unknown> | null | undefined
): { paymentTypeLabel: string; minDepositValue: string } {
  if (!record) {
    return { paymentTypeLabel: "-", minDepositValue: "-" };
  }
  const any = record as Record<string, unknown>;
  const rawType = String(
    any.min_deposit_type ?? any.payment_type ?? ""
  ).trim();
  if (!rawType) {
    return { paymentTypeLabel: "-", minDepositValue: "-" };
  }
  const key = extractMinDepositTypeKey(rawType);
  const paymentTypeLabel = labelForMinDepositType(rawType) || "-";

  if (key === "per_consultancy") {
    const v = any.min_deposit_value ?? any.minimum_deposit;
    if (v === undefined || v === null || String(v).trim() === "") {
      return { paymentTypeLabel, minDepositValue: "-" };
    }
    const n = Number(v);
    const minDepositValue = Number.isFinite(n)
      ? `${AppConstant.currencySymbol}${n}`
      : String(v).trim();
    return { paymentTypeLabel, minDepositValue };
  }

  let pct = explicitPercentFromRecord(record);
  if (pct === "") pct = percentFromCombinedTypeField(rawType);
  if (pct === "") {
    return { paymentTypeLabel, minDepositValue: "-" };
  }
  return {
    paymentTypeLabel,
    minDepositValue: `${pct}${AppConstant.percentageSymbol}`,
  };
}
