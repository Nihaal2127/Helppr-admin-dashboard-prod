import { franchiseIdForApiQuery } from "../franchise/headerFranchisePreference";

type ReportOption = { value: string; label: string };

function pickSingleFilterValue(
  selections: ReportOption[],
  allValue = "all"
): string | undefined {
  const picked = selections.filter(
    (item) => item.value && item.value !== allValue
  );
  if (picked.length !== 1) return undefined;
  return picked[0].value;
}

function omitEmptyFields(
  payload: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

const ORDER_STATUS_UI_TO_API: Record<string, string> = {
  "2": "in-progress",
  "3": "completed",
  "4": "cancelled",
  "5": "refunded",
};

function mapOrderStatusUiToApi(uiValue: string): string {
  const mapped = ORDER_STATUS_UI_TO_API[uiValue];
  if (mapped) return mapped;
  const normalized = uiValue.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "in-progress") return "in-progress";
  if (normalized === "completed") return "completed";
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "refunded") return "refunded";
  return uiValue;
}

export function buildOrderReportExportPayload(input: {
  fromDate?: string;
  toDate?: string;
  franchiseId?: string;
  orderStatus?: ReportOption[];
  partnerPaymentStatus?: ReportOption[];
  customerPaymentStatus?: ReportOption[];
  categories?: ReportOption[];
  services?: ReportOption[];
  partners?: ReportOption[];
  users?: ReportOption[];
}): Record<string, string> {
  const orderStatusUi = pickSingleFilterValue(input.orderStatus ?? []);
  const orderStatus = orderStatusUi
    ? mapOrderStatusUiToApi(orderStatusUi)
    : undefined;

  return omitEmptyFields({
    from_date: input.fromDate ?? "",
    to_date: input.toDate ?? "",
    order_status: orderStatus ?? "",
    category_id: pickSingleFilterValue(input.categories ?? []) ?? "",
    service_id: pickSingleFilterValue(input.services ?? []) ?? "",
    partner_id: pickSingleFilterValue(input.partners ?? []) ?? "",
    user_id: pickSingleFilterValue(input.users ?? []) ?? "",
    customer_payment_status:
      pickSingleFilterValue(input.customerPaymentStatus ?? []) ?? "",
    partner_payment_status:
      pickSingleFilterValue(input.partnerPaymentStatus ?? []) ?? "",
    franchise_id: franchiseIdForApiQuery(input.franchiseId),
  });
}

export function buildQuoteReportExportPayload(input: {
  fromDate?: string;
  toDate?: string;
  franchiseId?: string;
  quoteStatus?: ReportOption[];
  categories?: ReportOption[];
  services?: ReportOption[];
  partners?: ReportOption[];
  users?: ReportOption[];
  states?: ReportOption[];
  cities?: ReportOption[];
  areas?: ReportOption[];
  franchises?: ReportOption[];
}): Record<string, string> {
  return omitEmptyFields({
    from_date: input.fromDate ?? "",
    to_date: input.toDate ?? "",
    quote_status: pickSingleFilterValue(input.quoteStatus ?? []) ?? "",
    category_id: pickSingleFilterValue(input.categories ?? []) ?? "",
    service_id: pickSingleFilterValue(input.services ?? []) ?? "",
    partner_id: pickSingleFilterValue(input.partners ?? []) ?? "",
    user_id: pickSingleFilterValue(input.users ?? []) ?? "",
    state_id: pickSingleFilterValue(input.states ?? []) ?? "",
    city_id: pickSingleFilterValue(input.cities ?? []) ?? "",
    area_id: pickSingleFilterValue(input.areas ?? []) ?? "",
    franchise_id:
      pickSingleFilterValue(input.franchises ?? []) ||
      franchiseIdForApiQuery(input.franchiseId),
  });
}

export function buildPartnerReportExportPayload(input: {
  fromDate?: string;
  toDate?: string;
  franchiseId?: string;
  partners?: ReportOption[];
  categories?: ReportOption[];
  services?: ReportOption[];
  states?: ReportOption[];
  cities?: ReportOption[];
  areas?: ReportOption[];
  franchises?: ReportOption[];
}): Record<string, string> {
  return omitEmptyFields({
    from_date: input.fromDate ?? "",
    to_date: input.toDate ?? "",
    partner_id: pickSingleFilterValue(input.partners ?? []) ?? "",
    category_id: pickSingleFilterValue(input.categories ?? []) ?? "",
    service_id: pickSingleFilterValue(input.services ?? []) ?? "",
    state_id: pickSingleFilterValue(input.states ?? []) ?? "",
    city_id: pickSingleFilterValue(input.cities ?? []) ?? "",
    area_id: pickSingleFilterValue(input.areas ?? []) ?? "",
    franchise_id:
      pickSingleFilterValue(input.franchises ?? []) ||
      franchiseIdForApiQuery(input.franchiseId),
  });
}
