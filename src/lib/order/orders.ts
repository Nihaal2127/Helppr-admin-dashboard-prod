/**
 * Orders module — types, API calls, payload builders, UI helpers (no invoice PDF).
 */
import { apiRequest } from "../global/remote/apiHelper";
import { ApiPaths } from "../global/remote/apiPaths";
import { showLog } from "../../helper/logger";
import { formatDate, todayLocalYmd } from "../../helper/dateFormat";
import { formatQuoteScheduledDisplay } from "../quote/quoteHelpers";
import type { ServerTableSortBy } from "../global/serverTableSort";
import { sessionMayUseFranchiseIdApiFilter } from "../franchise/headerFranchisePreference";
import type { OfferModel } from "../models/SettingsModel";
import { CategoryModel } from "../models/CategoryModel";
import { CityModel } from "../models/CityModel";
import { ServiceModel } from "../models/ServiceModel";
import { UserModel } from "../models/UserModel";
import {
  customerPaymentStatusLabelFromSlug,
  normalizeCustomerPaymentStatusSlug,
  normalizePartnerPaymentStatusSlug,
  partnerPaymentStatusLabelFromSlug,
} from "../financial/paymentStatus";
import { AppConstant, UserRole } from "../global/AppConstant";
import { getLocalStorage } from "../global/localStorageHelper";
import type { AddQuoteFormValues } from "../types/quoteTypes";
import {
  displayStateName,
  formatQuoteAddressRowAsServiceLine,
  formatQuoteServiceAddressLines,
  parseCatalogAddressRecord,
  parseCompositeServiceAddressLine,
} from "../quote/quoteAddressCore";
import type { QuoteAddressRowUi } from "../quote/quoteAddressCore";
import type { OrderScheduleMetrics } from "./orderScheduleMetrics";
import {
  deriveOrderScheduleMetrics,
  normalizeOrderApiDateYmd,
} from "./orderScheduleMetrics";
import { workTimeToTimeStorage } from "./orderTimeUtils";
import {
  normalizePaymentMethod,
  paymentMethodFromExpenseModeId,
  paymentRowEffectiveAmount,
  roundMoney,
} from "../global/paymentAndCurrency";
import type {
  CustomerPaymentRow,
  OtherChargeRow,
  PartnerPaymentRow,
} from "./orderPaymentRows";
import { orderPartnerPriceAmount } from "./orderPriceAmounts";

export { roundMoney } from "../global/paymentAndCurrency";

export type {
  CustomerPaymentRow,
  OtherChargeRow,
  PartnerPaymentRow,
} from "./orderPaymentRows";


// ========== Types ==========

export { PaymentEnum } from "../global/paymentAndCurrency";

/** Order `payment_mode_id` — used in order dialogs, order list, and invoice (not expense payment method). */
export const OrderPaymentModeEnum = new Map<number, { label: string }>([
  [1, { label: "Paid" }],
  [2, { label: "Pending" }],
  [3, { label: "Partially paid" }],
  [4, { label: "Refunds" }],
  [5, { label: "Partially refund" }],
]);

export const orderPaymentModeSelectOptions: { value: string; label: string }[] =
  Array.from(OrderPaymentModeEnum.entries()).map(([id, v]) => ({
    value: String(id),
    label: v.label,
  }));


export const OrderStatusEnum = new Map<number, { label: string }>([
  [1, { label: "Pending" }],
  [2, { label: "In Progress" }],
  [3, { label: "Completed" }],
  [4, { label: "Cancelled" }],
  [5, { label: "Refunded" }],
]);

/** Structured service locations (create flow); parent serializes to `service_address` for API. */
export type ServiceAddressCard = {
  id: string;
  stateId: string;
  cityId: string;
  postal: string;
  line: string;
  stateLabel?: string;
  cityLabel?: string;
  /** Exactly one card should be active (primary service location). */
  isActive?: boolean;
};

/** Row from `fetchCityDropDown` (create order passes the same list used for order city). */
export type AddressCityDropdownRow = {
  value: string;
  label: string;
  state_id?: string;
  state_name?: string;
};

export interface OrderItemModel {
  _id?: string;
  order_id?: string;
  user_id?: string;
  category_id?: string;
  service_id: string;
  service_price: number;
  partner_id: string;
  service_date: string;
  service_from_time: string;
  service_to_time: string;
  sub_total: number | 0;
  tax: number | 0;
  user_paltform_fee: number | 0;
  partner_commison_platform_fee: number | 0;
  partner_earning: number | 0;
  total_price: number | 0;
  admin_earning: number | 0;
  service_info?: ServiceModel;
  rating?: number | 0;
  cancellation_reasone?: string | null;
  service_status?: number | 0;
  is_paid?: boolean | false;
  partner_info?: UserModel | null;
  per_hour_price?: number;
  hours?: number;
  service_address?: string | null;
  address_cards?: ServiceAddressCard[];
}

export interface OrderModel {
  _id: string;
  user_phone_number: string;
  user_id: string;
  user_name: string;
  user_location: string;
  user_address: string;
  city_id: string;
  category_id: string;
  partner_id: string | null;
  created_by_id: string | null;
  service_items: OrderItemModel[];
  order_status: number;
  order_date: string;
  /** Job schedule start (`YYYY-MM-DD`) — top-level on create/update. */
  from_date?: string | null;
  /** Job schedule end (`YYYY-MM-DD`) — top-level on create/update. */
  to_date?: string | null;
  work_start_time?: string | null;
  work_end_time?: string | null;
  work_hours_per_day?: number | null;
  total_work_hours?: number | null;
  total_price: number;
  comment: string | null;
  is_paid: boolean;
  type: number;
  deleted_at: string | null;
  updated_at: string | null;
  created_at: string;
  created_by_name: string | null;
  unique_id: string | null;
  user_unique_id: string | null;
  address: string | null;
  cancellation_reasone: string | null;
  payment_mode_id: string | null;
  payment_mode: string | null;
  transaction_id: string | null;
  sub_total: number | 0;
  tax: number | 0;
  discount_amount: number | 0;
  user_paltform_fee: number | 0;
  partner_commison_platform_fee: number | 0;
  admin_earning: number | 0;
  created_by_info: UserModel;
  /** Assigned employee on the order (`GET /order/get/:id` — null when none). */
  employee_info?: UserModel | null;
  user_info: UserModel;
  city_info: CityModel;
  category_info: CategoryModel;
  order_status_info: OrderStatusInfoModel[] | [];
  /** Display / API: Paid | Unpaid | Partial — falls back to `is_paid` when absent */
  customer_payment_status?: string | null;
  /** Some order APIs alias customer status as `user_payment_status`. */
  user_payment_status?: string | null;
  partner_payment_status?: string | null;
  partner_paid_amount?: number | null;
  partner_due_amount?: number | null;
  refund_amount?: number | null;
  /** Some APIs use this alias for refund total */
  return_amount?: number | string | null;
  offer_id?: string | null;
  offer_name?: string | null;
  offer_discount_amount?: number | null;
  /** Optional breakdown from API (snake_case) */
  total_offer_value?: number | string | null;
  admin_contribution?: number | string | null;
  partner_contribution?: number | string | null;
  /** How the refunded amount was funded (see `OrderRefundPayload` when refund was processed) */
  amount_from_admin_commission?: number | string | null;
  amount_from_partner_wallet?: number | string | null;
  from_admin_commission?: number | string | null;
  from_partner_wallet?: number | string | null;
  /** Set by client preview merge only — not from API */
  __previewPaymentDummy?: boolean;
  /** From GET detail — server-calculated pricing base */
  total_service_charge?: number | null;
  service_price?: number | null;
  order_description?: string | null;
  customer_description?: string | null;
  payment_status?: string | null;
  customer_paid_amount?: number | null;
  customer_refunded_amount?: number | null;
  customer_net_paid?: number | null;
  customer_due_amount?: number | null;
  order_payments?: Record<string, unknown>[] | null;
  additional_charges?: Record<string, unknown>[] | null;
  /** Denormalized on list/detail when refs are populated */
  partner_name?: string | null;
  category_name?: string | null;
  service_name?: string | null;
  tax_percent?: number | null;
  commission_percent?: number | null;
  /** GET detail — commission rupees (may be pre- or post-offer) */
  commission_amount?: number | null;
  admin_commission?: number | null;
  tax_amount?: number | null;
  /** GET /order/get/:id — populated saved address */
  address_info?: Record<string, unknown> | null;
  /** Populated franchise on order detail. */
  franchise_info?: {
    _id?: string;
    name?: string;
    state_name?: string;
    city_name?: string;
  } | null;
  franchise_name?: string | null;
  partner_info?: UserModel | null;
}

export interface OrderStatusInfoModel {
  status: number;
  updated_at: string | null;
  _id: string;
}


// --- API status slugs (GET /order/getAll) ---
const ORDER_STATUS_API_SLUG: Record<OrderTabKey, string> = {
  2: "in-progress",
  3: "completed",
  4: "cancelled",
  5: "refunded",
};
const API_SLUG_TO_NUM: Record<string, number> = {
  pending: 1,
  "in-progress": 2,
  in_progress: 2,
  completed: 3,
  cancelled: 4,
  canceled: 4,
  refunded: 5,
};
export function normalizeOrderStatusFromApi(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (API_SLUG_TO_NUM[s] != null) return API_SLUG_TO_NUM[s];
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
export function orderStatusToApiSlug(
  status: string | number
): string | undefined {
  const n = Number(status);
  if (Number.isFinite(n) && ORDER_STATUS_API_SLUG[n as OrderTabKey]) {
    return ORDER_STATUS_API_SLUG[n as OrderTabKey];
  }
  const s = String(status).trim().toLowerCase().replace(/_/g, "-");
  if (API_SLUG_TO_NUM[s] != null) {
    return ORDER_STATUS_API_SLUG[API_SLUG_TO_NUM[s] as OrderTabKey];
  }
  if (["in-progress", "completed", "cancelled", "refunded"].includes(s)) {
    return s;
  }
  return undefined;
}

function apiMoney(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n =
    typeof v === "string"
      ? parseFloat(String(v).replace(/,/g, "").trim())
      : Number(v);
  return Number.isFinite(n) && n >= 0 ? roundMoney(n) : 0;
}

function ymdFromIso(isoish: string): string {
  const t = String(isoish ?? "").trim();
  if (!t) return "";
  if (t.length >= 10 && t[4] === "-") return t.slice(0, 10);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function scheduleStorageToIso(
  serviceDateIso: string,
  timeStorage: string
): string {
  const raw = String(timeStorage ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
  const datePart = ymdFromIso(serviceDateIso);
  const m = raw.match(/T(\d{1,2}):(\d{2})/);
  if (datePart && m) {
    return `${datePart}T${String(m[1]).padStart(2, "0")}:${m[2]}:00.000Z`;
  }
  return raw;
}

function isMongoObjectId(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(String(id ?? "").trim());
}

function mapOtherChargesToApi(
  rows: OtherChargeRow[]
): Record<string, unknown>[] {
  return rows
    .filter((r) => apiMoney(r.amount) > 0.009)
    .map((r) => ({
      amount: apiMoney(r.amount),
      label:
        String(r.serviceName ?? r.description ?? "Charge").trim() || "Charge",
      description: String(r.description ?? "").trim() || undefined,
      charge_type: "misc",
    }));
}

function mapCustomerPaymentsToApi(
  rows: CustomerPaymentRow[]
): Record<string, unknown>[] {
  return rows
    .filter((r) => paymentRowEffectiveAmount(r) > 0.009)
    .map((r) => {
      const amount = paymentRowEffectiveAmount(r);
      const paidAt = normalizeOrderApiDateYmd(r.date);
      return {
        payer_type: "customer",
        amount,
        status: "completed",
        payment_method: normalizePaymentMethod(r.type) || "cash",
        transaction_reference: String(r.description ?? "").trim() || undefined,
        notes: String(r.description ?? "").trim() || undefined,
        ...(paidAt ? { paid_at: paidAt } : {}),
      };
    });
}

function mapPartnerPaymentsToApi(
  rows: PartnerPaymentRow[]
): Record<string, unknown>[] {
  return rows
    .filter((r) => paymentRowEffectiveAmount(r) > 0.009)
    .map((r) => {
      const amount = paymentRowEffectiveAmount(r);
      const paidAt = normalizeOrderApiDateYmd(r.date);
      return {
        payer_type: "partner",
        amount,
        status: "completed",
        payment_method: "cash",
        notes: String(r.description ?? "").trim() || undefined,
        ...(paidAt ? { paid_at: paidAt } : {}),
      };
    });
}

/** Top-level `order_date` / `from_date` / `to_date` (Help-PR order create & update). */
export function applyOrderTopLevelScheduleDates(
  body: Record<string, unknown>,
  dates: { from_date: string; to_date: string; order_date?: string }
): void {
  const from = normalizeOrderApiDateYmd(dates.from_date);
  const to = normalizeOrderApiDateYmd(dates.to_date) || from;
  const order = normalizeOrderApiDateYmd(dates.order_date ?? from) || from;
  if (from) {
    body.from_date = from;
    body.order_date = order || from;
  }
  if (to) body.to_date = to;
}

/** Header schedule fields from derived metrics (`order_date` = `from_date`). */
export function applyOrderScheduleMetricsToBody(
  body: Record<string, unknown>,
  metrics?: OrderScheduleMetrics | null
): void {
  if (!metrics) return;
  applyOrderTopLevelScheduleDates(body, {
    from_date: metrics.from_date,
    to_date: metrics.to_date,
    order_date: metrics.from_date,
  });
  body.work_start_time = metrics.work_start_time;
  body.work_end_time = metrics.work_end_time;
  body.work_hours_per_day = metrics.work_hours_per_day;
  body.total_work_hours = metrics.total_work_hours;
}

/** POST /api/order/create — Help-PR Orders Postman. */
export function buildCreateOrderPayload(input: {
  userId: string;
  userUniqueId?: string;
  cityId: string;
  categoryId: string;
  partnerId: string;
  serviceId: string;
  createdById: string;
  address: string;
  addressId?: string;
  orderDateYmd?: string;
  /** When set, top-level schedule + work times come from metrics (`order_date` = `from_date`). */
  scheduleMetrics?: OrderScheduleMetrics | null;
  /** Base service amount (e.g. hours × rate). Excludes tax, commission, coupons. */
  totalServiceCharge: number;
  /** Invoice grand total for customer payment status; defaults to `totalServiceCharge`. */
  invoiceTotal?: number;
  orderDescription?: string;
  customerDescription?: string;
  offerId?: string;
  serviceItem: Pick<
    OrderItemModel,
    "service_date" | "service_from_time" | "service_to_time" | "service_address"
  >;
  paymentExt?: OrderPaymentExtV1;
}): Record<string, unknown> {
  const orderDate =
    input.scheduleMetrics?.from_date ||
    normalizeOrderApiDateYmd(input.orderDateYmd) ||
    todayLocalYmd() ||
    ymdFromIso(String(input.serviceItem.service_date ?? ""));
  const scheduleTo =
    input.scheduleMetrics?.to_date ||
    normalizeOrderApiDateYmd(input.orderDateYmd) ||
    orderDate;
  const rawDate = String(input.serviceItem.service_date ?? orderDate).trim();
  const serviceDate = /^\d{4}-\d{2}-\d{2}T/.test(rawDate)
    ? rawDate
    : scheduleStorageToIso(orderDate, rawDate) || `${orderDate}T00:00:00.000Z`;
  const fromIso = scheduleStorageToIso(
    rawDate || orderDate,
    input.serviceItem.service_from_time ?? ""
  );
  const toIso = scheduleStorageToIso(
    rawDate || orderDate,
    input.serviceItem.service_to_time ?? ""
  );
  const charge = input.totalServiceCharge;
  const invoiceTotal = input.invoiceTotal ?? charge;

  const line: Record<string, unknown> = {
    user_id: input.userId,
    partner_id: input.partnerId,
    category_id: input.categoryId,
    service_id: input.serviceId,
    service_date: serviceDate,
    service_from_time: fromIso,
    service_to_time: toIso,
    total_service_charge: charge,
    ...(input.serviceItem.service_address
      ? { service_address: input.serviceItem.service_address }
      : {}),
  };

  const body: Record<string, unknown> = {
    user_id: input.userId,
    user_unique_id: input.userUniqueId ?? "",
    city_id: input.cityId,
    category_id: input.categoryId,
    created_by_id: input.createdById,
    payment_mode_id: "",
    transaction_id: "",
    address: input.address,
    total_service_charge: charge,
    service_id: input.serviceId,
    type: 2,
    partner_id: input.partnerId,
    ...(input.customerDescription?.trim()
      ? { customer_description: input.customerDescription.trim() }
      : {}),
    order_description: input.orderDescription?.trim() || undefined,
    service_items: [line],
  };

  if (input.addressId?.trim()) body.address_id = input.addressId.trim();
  if (input.offerId?.trim()) body.offer_id = input.offerId.trim();

  if (input.scheduleMetrics) {
    applyOrderScheduleMetricsToBody(body, input.scheduleMetrics);
  } else {
    applyOrderTopLevelScheduleDates(body, {
      from_date: orderDate,
      to_date: scheduleTo,
      order_date: orderDate,
    });
  }

  const ext = input.paymentExt ? normalizePaymentExtForSubmit(input.paymentExt) : undefined;
  const payMeta = deriveOrderCustomerPaymentFields(ext, invoiceTotal);
  /** New orders: API expects `is_paid: false` on create; paid flag is set on update. */
  body.is_paid = false;
  body.customer_payment_method = payMeta.customer_payment_method;
  body.customer_payment_status = payMeta.customer_payment_status;

  if (ext) {
    const charges = mapOtherChargesToApi(ext.otherCharges ?? []);
    const payments = [
      ...mapCustomerPaymentsToApi(ext.customerPayments ?? []),
      ...mapPartnerPaymentsToApi(ext.partnerPayments ?? []),
    ];
    if (charges.length) body.additional_charges = charges;
    if (payments.length) body.order_payments = payments;
  }

  return body;
}

/** PUT /api/order/update/:id — status / payment status header patch. */
export function buildOrderHeaderPatchPayload(input: {
  orderStatus?: number | string;
  customerPaymentStatus?: string;
  partnerPaymentStatus?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const statusSlug = orderStatusToApiSlug(input.orderStatus ?? "");
  if (statusSlug) body.order_status = statusSlug;
  const cSlug = normalizeCustomerPaymentStatusSlug(input.customerPaymentStatus);
  if (cSlug) body.customer_payment_status = cSlug;
  const pSlug = normalizePartnerPaymentStatusSlug(input.partnerPaymentStatus);
  if (pSlug) body.partner_payment_status = pSlug;
  return body;
}

export function buildOrderUserUpdatePayload(
  selected: Pick<UserModel, "_id" | "user_id" | "address" | "name" | "email" | "phone_number">,
  order: OrderModel
): Record<string, unknown> {
  return {
    user_id: selected._id,
    address: selected.address ?? order.address,
  };
}

export function buildOrderEmployeeUpdatePayload(
  employeeId: string
): Record<string, unknown> {
  return { employee_id: employeeId };
}

/** PUT /api/order/update/:id — payments & charges from payment editor. */
export function buildOrderPaymentUpdatePayload(input: {
  order: OrderModel;
  ext: OrderPaymentExtV1;
  totalServiceCharge: number;
}): Record<string, unknown> {
  const extNorm = normalizePaymentExtForSubmit(input.ext);
  const body: Record<string, unknown> = {
    total_service_charge: input.totalServiceCharge,
  };
  const statusSlug = orderStatusToApiSlug(input.order.order_status);
  if (statusSlug) body.order_status = statusSlug;

  const payCreate: Record<string, unknown>[] = [];
  const payUpdate: Record<string, unknown>[] = [];
  for (const r of extNorm.customerPayments ?? []) {
    const amount = paymentRowEffectiveAmount(r);
    if (amount <= 0.009) continue;
    const paidAt = normalizeOrderApiDateYmd(r.date);
    const row = {
      payer_type: "customer",
      amount,
      status: "completed",
      payment_method: normalizePaymentMethod(r.type) || "cash",
      notes: String(r.description ?? "").trim() || undefined,
      ...(paidAt ? { paid_at: paidAt } : {}),
    };
    if (isMongoObjectId(r.id)) payUpdate.push({ _id: r.id, ...row });
    else payCreate.push(row);
  }
  for (const r of extNorm.partnerPayments ?? []) {
    const amount = paymentRowEffectiveAmount(r);
    if (amount <= 0.009) continue;
    const paidAt = normalizeOrderApiDateYmd(r.date);
    const row = {
      payer_type: "partner",
      amount,
      status: "completed",
      payment_method: "cash",
      notes: String(r.description ?? "").trim() || undefined,
      ...(paidAt ? { paid_at: paidAt } : {}),
    };
    if (isMongoObjectId(r.id)) payUpdate.push({ _id: r.id, ...row });
    else payCreate.push(row);
  }
  if (payCreate.length || payUpdate.length) {
    body.order_payments = {
      ...(payCreate.length ? { create: payCreate } : {}),
      ...(payUpdate.length ? { update: payUpdate } : {}),
    };
  }

  const invoiceTotal = orderPaymentInvoiceTotal(
    extNorm,
    input.order,
    getPrimaryServiceItem(input.order)
  );
  const payMeta = deriveOrderCustomerPaymentFields(extNorm, invoiceTotal);
  body.is_paid = payMeta.is_paid;
  body.customer_payment_method = payMeta.customer_payment_method;
  body.customer_payment_status = payMeta.customer_payment_status;

  const chCreate: Record<string, unknown>[] = [];
  const chUpdate: Record<string, unknown>[] = [];
  for (const r of extNorm.otherCharges ?? []) {
    const row = {
      amount: apiMoney(r.amount),
      label:
        String(r.serviceName ?? r.description ?? "Charge").trim() || "Charge",
      description: String(r.description ?? "").trim() || undefined,
      charge_type: "misc",
    };
    if (isMongoObjectId(r.id)) chUpdate.push({ _id: r.id, ...row });
    else chCreate.push(row);
  }
  if (chCreate.length || chUpdate.length) {
    body.additional_charges = {
      ...(chCreate.length ? { create: chCreate } : {}),
      ...(chUpdate.length ? { update: chUpdate } : {}),
    };
  }

  return body;
}

/** Merge payment/charges fields from the payment editor into an order update body. */
export function applyOrderPaymentFieldsToUpdatePayload(
  target: Record<string, unknown>,
  input: {
    order: OrderModel;
    ext: OrderPaymentExtV1;
    totalServiceCharge: number;
  }
): void {
  const payment = buildOrderPaymentUpdatePayload(input);
  if (payment.order_payments) target.order_payments = payment.order_payments;
  if (payment.additional_charges) {
    target.additional_charges = payment.additional_charges;
  }
  target.total_service_charge = payment.total_service_charge;
  target.is_paid = payment.is_paid;
  target.customer_payment_method = payment.customer_payment_method;

  const items = target.service_items as
    | { update?: Record<string, unknown>[] }
    | undefined;
  if (items?.update?.[0]) {
    items.update[0].total_service_charge = input.totalServiceCharge;
  }
}

// ========== API ==========

/** Order list tabs — `order_status` 2–5 (see `OrderStatusEnum`). */
export const ORDER_TAB_KEYS = [2, 3, 4, 5] as const;
export type OrderTabKey = (typeof ORDER_TAB_KEYS)[number];

export type OrderListFilters = {
  keyword?: string;
  status?: string;
  sort?: string;
  from_date?: string | null;
  to_date?: string | null;
  franchise_id?: string | null;
};

function str(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "undefined" || s === "null" ? "" : s;
}

function nestedObj(v: unknown): Record<string, unknown> | undefined {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return undefined;
  return v as Record<string, unknown>;
}

function refId(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return str(v);
  const o = nestedObj(v);
  return o ? str(o._id ?? o.id) : "";
}

function extractPagedRecords(data: unknown): {
  records: unknown[];
  totalPages: number;
  totalCount: number;
} {
  const d = (data ?? {}) as Record<string, unknown>;
  const inner =
    d.data != null && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : d;
  const records = Array.isArray(inner.records)
    ? inner.records
    : Array.isArray(d.records)
      ? d.records
      : [];
  const totalPages = Number(inner.totalPages ?? d.totalPages ?? 0) || 0;
  const rawTotal =
    inner.totalItems ??
    inner.total_count ??
    inner.totalCount ??
    inner.total ??
    inner.count ??
    inner.recordsTotal ??
    inner.total_records ??
    d.totalItems ??
    d.totalCount ??
    d.total ??
    d.recordsTotal ??
    d.count;
  let totalCount = Number(rawTotal);
  if (!Number.isFinite(totalCount) || totalCount < 0) totalCount = 0;
  return { records, totalPages, totalCount };
}

function extractOrderRecord(data: unknown): OrderModel | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const inner =
    d.data != null && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : null;
  const raw =
    d.record ??
    inner?.record ??
    (d._id || d.unique_id ? d : null) ??
    (inner && (inner._id || inner.unique_id) ? inner : null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return mapServerOrderRecord(raw as Record<string, unknown>);
}

/** Normalizes list/detail rows from `GET /order/getAll` and `GET /order/get/:id`. */
export function mapServerOrderRecord(r: Record<string, unknown>): OrderModel {
  const userRef = nestedObj(r.user_id) ?? nestedObj(r.user);
  const partnerRef = nestedObj(r.partner_id);
  const categoryRef = nestedObj(r.category_id);
  const serviceRef = nestedObj(r.service_id);
  const cityRef = nestedObj(r.city_id);
  const createdByRef = nestedObj(r.created_by_id);
  const franchiseRef = nestedObj(r.franchise_info);

  const userInfo =
    nestedObj(r.user_info) ??
    (userRef
      ? {
          ...userRef,
          name: userRef.name ?? userRef.user_name,
        }
      : undefined);

  const orderStatusRaw = r.order_status ?? r.status_code ?? r.status;
  const order_status = normalizeOrderStatusFromApi(orderStatusRaw);
  const user_name =
    str(r.user_name) ||
    str(userInfo?.name) ||
    str(userInfo?.user_name) ||
    "";

  const paymentStatusSlug = str(r.payment_status).toLowerCase();
  const customerStatusRaw =
    str(r.customer_payment_status) ||
    str(r.user_payment_status) ||
    str(r.payment_status);
  const customer_payment_status =
    customerStatusRaw ||
    deriveCustomerPaymentStatusSlugFromRecord(r) ||
    null;
  const partnerStatusRaw = str(r.partner_payment_status);
  const partner_payment_status =
    partnerStatusRaw ||
    derivePartnerPaymentStatusSlugFromRecord(r) ||
    null;
  const desc =
    str(r.order_description) || str(r.comments) || str(r.comment) || null;
  const customerDesc = str(r.customer_description) || null;
  const isPaidRaw = r.is_paid;
  const is_paid =
    isPaidRaw === true ||
    isPaidRaw === "true" ||
    paymentStatusSlug === "paid" ||
    customer_payment_status === "paid";

  const partner_name = str(r.partner_name) || str(partnerRef?.name) || null;
  const category_name =
    str(r.category_name) || str(categoryRef?.name) || null;
  const service_name = str(r.service_name) || str(serviceRef?.name) || null;

  const created_by_info =
    (nestedObj(r.created_by_info) as OrderModel["created_by_info"] | undefined) ??
    (createdByRef
      ? ({ ...createdByRef } as unknown as OrderModel["created_by_info"])
      : undefined);

  const employee_info = ((): OrderModel["employee_info"] => {
    if (r.employee_info === null) return null;
    const fromInfo = nestedObj(r.employee_info);
    if (fromInfo) {
      return {
        ...fromInfo,
        name: str(fromInfo.name ?? fromInfo.user_name),
      } as unknown as UserModel;
    }
    return undefined;
  })();

  const category_info =
    (nestedObj(r.category_info) as OrderModel["category_info"] | undefined) ??
    (categoryRef
      ? ({
          ...categoryRef,
          name: str(categoryRef.name) || category_name || "",
        } as unknown as OrderModel["category_info"])
      : undefined);

  const city_info =
    (nestedObj(r.city_info) as OrderModel["city_info"] | undefined) ??
    (cityRef
      ? ({ ...cityRef } as unknown as OrderModel["city_info"])
      : undefined);

  return {
    ...(r as unknown as OrderModel),
    _id: str(r._id) || str(r.id),
    user_id: refId(r.user_id) || refId(userRef) || str(r.user_id),
    user_name,
    user_info:
      (userInfo as unknown as OrderModel["user_info"]) ??
      (r.user_info as OrderModel["user_info"]),
    partner_id: refId(r.partner_id) || refId(partnerRef) || null,
    category_id: refId(r.category_id) || refId(categoryRef) || str(r.category_id),
    city_id: refId(r.city_id) || refId(cityRef) || str(r.city_id),
    created_by_id:
      refId(r.created_by_id) || refId(createdByRef) || str(r.created_by_id) || null,
    created_by_name:
      str(r.created_by_name) || str(createdByRef?.name) || null,
    created_by_info: created_by_info ?? (r.created_by_info as OrderModel["created_by_info"]),
    employee_info,
    franchise_info: franchiseRef
      ? {
          _id: str(franchiseRef._id),
          name: str(franchiseRef.name),
          state_name: str(franchiseRef.state_name),
          city_name: str(franchiseRef.city_name),
        }
      : r.franchise_info === null
        ? null
        : undefined,
    franchise_name: str(franchiseRef?.name) || str(r.franchise_name) || null,
    category_info: category_info ?? (r.category_info as OrderModel["category_info"]),
    city_info: city_info ?? (r.city_info as OrderModel["city_info"]),
    order_status: Number.isFinite(order_status) ? order_status : Number(r.order_status) || 0,
    unique_id: str(r.unique_id) || str(r.order_unique_id) || null,
    service_items: Array.isArray(r.service_items)
      ? (r.service_items as OrderModel["service_items"])
      : [],
    comment: desc,
    order_description: str(r.order_description) || desc,
    customer_description: customerDesc,
    order_date:
      normalizeOrderApiDateYmd(r.order_date) ||
      normalizeOrderApiDateYmd(r.from_date) ||
      str(r.order_date),
    from_date: normalizeOrderApiDateYmd(r.from_date) || null,
    to_date: normalizeOrderApiDateYmd(r.to_date) || null,
    work_start_time: str(r.work_start_time) || null,
    work_end_time: str(r.work_end_time) || null,
    work_hours_per_day: Number(r.work_hours_per_day) || 0,
    total_work_hours: Number(r.total_work_hours) || 0,
    payment_status: str(r.payment_status) || null,
    customer_paid_amount: apiMoney(r.customer_paid_amount),
    customer_refunded_amount: apiMoney(r.customer_refunded_amount),
    customer_net_paid: apiMoney(r.customer_net_paid),
    customer_due_amount: apiMoney(r.customer_due_amount),
    user_payment_status: str(r.user_payment_status) || null,
    partner_paid_amount: apiMoney(r.partner_paid_amount),
    partner_due_amount: apiMoney(r.partner_due_amount),
    customer_payment_status,
    partner_payment_status,
    partner_name,
    category_name,
    service_name,
    total_service_charge: apiMoney(r.total_service_charge),
    is_paid,
    order_payments: Array.isArray(r.order_payments)
      ? (r.order_payments as Record<string, unknown>[])
      : null,
    additional_charges: Array.isArray(r.additional_charges)
      ? (r.additional_charges as Record<string, unknown>[])
      : null,
    address_info: nestedObj(r.address_info) ?? null,
    partner_info:
      (nestedObj(r.partner_info) as OrderModel["partner_info"] | undefined) ??
      (r.partner_info as OrderModel["partner_info"]),
    ...((): Partial<OrderModel> => {
      const offerRec = nestedObj(r.order_offer);
      if (!offerRec) return {};
      const disc = parseOrderMoneyField(
        offerRec.offer_discount_amount ?? offerRec.discount_amount
      );
      return {
        offer_id:
          str(offerRec._id) ||
          str(offerRec.offer_id) ||
          str(r.offer_id) ||
          null,
        offer_name:
          str(offerRec.name) ||
          str(offerRec.offer_name) ||
          str(r.offer_name) ||
          null,
        offer_discount_amount:
          disc > 0 ? disc : apiMoney(r.offer_discount_amount),
        total_offer_value: parseOrderMoneyField(
          offerRec.total_offer_value ?? offerRec.value ?? r.total_offer_value
        ),
        admin_contribution: parseOrderMoneyField(
          offerRec.admin_contribution ?? r.admin_contribution
        ),
        partner_contribution: parseOrderMoneyField(
          offerRec.partner_contribution ?? r.partner_contribution
        ),
      };
    })(),
  };
}

/**
 * Maps `POST /getCount` `type: order-management` `record` into tab totals (status 2–5).
 */
export function mapOrderTabCountsFromRecord(
  record: Record<string, unknown> | null | undefined
): Partial<Record<OrderTabKey, number>> | null {
  if (!record || typeof record !== "object") return null;
  const byLower = new Map(
    Object.entries(record).map(([k, v]) => [k.toLowerCase(), v])
  );
  const pick = (...aliases: string[]): number | null => {
    for (const a of aliases) {
      const v = byLower.get(a.toLowerCase());
      if (v !== undefined && v !== null) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };
  const out: Partial<Record<OrderTabKey, number>> = {};
  const assign = (key: OrderTabKey, ...aliases: string[]) => {
    const n = pick(...aliases);
    if (n !== null) out[key] = n;
  };
  assign(
    2,
    "order_in_progress",
    "in_progress",
    "in_progress_order",
    "orders_in_progress",
    "order_status_2",
    "status_2",
    "total_order_in_progress",
    "total_in_progress_orders"
  );
  assign(
    3,
    "order_completed",
    "completed",
    "completed_order",
    "orders_completed",
    "order_status_3",
    "status_3",
    "total_order_completed",
    "total_completed_orders"
  );
  assign(
    4,
    "order_cancelled",
    "cancelled",
    "cancelled_order",
    "orders_cancelled",
    "order_status_4",
    "status_4",
    "total_order_cancelled"
  );
  assign(
    5,
    "order_refunded",
    "refunded",
    "orders_refunded",
    "order_status_5",
    "status_5",
    "total_order_refunded"
  );
  // Numeric status keys returned by some API shapes
  assign(2, "2");
  assign(3, "3");
  assign(4, "4");
  assign(5, "5");
  if (Object.keys(out).length === 0) return null;
  for (const k of ORDER_TAB_KEYS) {
    if (out[k] === undefined) out[k] = 0;
  }
  return out;
}

function resolveFranchiseIdForQuery(franchiseId?: string | null): string {
  const fidRaw = str(franchiseId);
  if (!fidRaw || fidRaw.toLowerCase() === "all") return "";
  return sessionMayUseFranchiseIdApiFilter() ? fidRaw : "";
}

/**
 * Paginated order list — `GET /order/getAll` (Help-PR Postman → Order).
 */
export const fetchOrder = async (
  page: number,
  pageSize: number,
  filters: OrderListFilters,
  sortBy: ServerTableSortBy = []
): Promise<{
  response: boolean;
  orders: OrderModel[];
  totalPages: number;
  totalCount: number;
}> => {
  const primarySort = sortBy[0];
  const kw = filters.keyword?.trim();
  const statusSlug =
    filters.status && filters.status !== "All"
      ? orderStatusToApiSlug(filters.status)
      : undefined;
  const fid = resolveFranchiseIdForQuery(filters.franchise_id);

  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(kw && { keyword: kw, search: kw }),
    ...(statusSlug && { order_status: statusSlug }),
    ...(filters.sort && { sort: filters.sort }),
    ...(filters.from_date && { from_date: filters.from_date }),
    ...(filters.to_date && { to_date: filters.to_date }),
    ...(primarySort?.id && { sort_by: primarySort.id }),
    ...(primarySort && { sort_order: primarySort.desc ? "desc" : "asc" }),
    ...(fid ? { franchise_id: fid } : {}),
  });

  if (!primarySort?.id) {
    params.set("sort_by", "created_at");
    params.set("sort_order", "desc");
  }

  const response = await apiRequest(
    `${ApiPaths.GET_ORDER()}?${params.toString()}`,
    "GET"
  );

  if (!response.success) {
    showLog(response.message || "Failed to fetch orders");
    return { response: false, orders: [], totalPages: 0, totalCount: 0 };
  }

  const { records, totalPages, totalCount: tc } = extractPagedRecords(
    response.data
  );
  let totalCount = tc;
  const orders = records.map((row) =>
    mapServerOrderRecord(row as Record<string, unknown>)
  );

  if (!Number.isFinite(totalCount) || totalCount < 0) {
    totalCount =
      totalPages > 0
        ? Math.max(0, (totalPages - 1) * pageSize + orders.length)
        : orders.length;
  }

  return { response: true, orders, totalPages, totalCount };
};

/** `GET /order/get/:id` */
export const fetchOrderById = async (
  id: string,
  options?: { skipLoader?: boolean }
): Promise<{ response: boolean; order: OrderModel | null }> => {
  const response = await apiRequest(
    `${ApiPaths.GET_ORDER_BY_ID()}/${id}`,
    "GET",
    undefined,
    false,
    options?.skipLoader ?? false
  );
  if (response.success) {
    const order = extractOrderRecord(response.data);
    return { response: Boolean(order), order };
  }
  return { response: false, order: null };
};

/** `GET /order/getCustomerOrder` — optional `user_id` query. */
export const fetchCustomerOrders = async (
  userId?: string
): Promise<{ response: boolean; orders: OrderModel[] }> => {
  const params = new URLSearchParams();
  const uid = str(userId);
  if (uid) params.set("user_id", uid);

  const qs = params.toString();
  const path = qs
    ? `${ApiPaths.GET_CUSTOMER_ORDERS}?${qs}`
    : ApiPaths.GET_CUSTOMER_ORDERS;

  const response = await apiRequest(path, "GET", undefined, false, true);
  if (!response.success) {
    showLog(response.message || "Failed to fetch customer orders");
    return { response: false, orders: [] };
  }

  const d = response.data ?? {};
  const list = Array.isArray(d.records)
    ? d.records
    : Array.isArray(d)
      ? d
      : Array.isArray((d as { data?: unknown }).data)
        ? ((d as { data: unknown[] }).data as unknown[])
        : [];

  return {
    response: true,
    orders: list.map((row: unknown) =>
      mapServerOrderRecord(row as Record<string, unknown>)
    ),
  };
};

export const deleteOrder = async (id: string): Promise<boolean> => {
  const response = await apiRequest(ApiPaths.DELETE_ORDER(id), "DELETE");
  if (response.success) return true;
  showLog(response.message || "Failed to delete order");
  return false;
};

export const createOrUpdateOrder = async (
  payload: Record<string, unknown>,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const path = isEditable ? ApiPaths.UPDATE_ORDER(id!) : ApiPaths.CREATE_ORDER;
  const method = isEditable ? "PUT" : "POST";
  const response = await apiRequest(path, method, payload);
  if (response.success) return true;
  showLog(response.message || "Failed to create or update order");
  return false;
};

export const cancelOrderService = async (
  orderId: string,
  payload: Record<string, unknown>
): Promise<boolean> => {
  const response = await apiRequest(
    ApiPaths.ORDER_CANCLE_SERVICE(orderId),
    "PUT",
    payload
  );
  if (response.success) return true;
  showLog(response.message || "Failed to cancel order service");
  return false;
};

export const cancelOrder = async (
  id: string,
  payload: Record<string, unknown>
): Promise<boolean> => {
  const response = await apiRequest(ApiPaths.CANCLE_ORDER(id), "PUT", payload);
  if (response.success) return true;
  showLog(response.message || "Failed to cancel order");
  return false;
};

export const updateOrderService = async (
  payload: Record<string, unknown>,
  id: string
): Promise<boolean> => {
  const response = await apiRequest(
    ApiPaths.ORDER_UPDATE_SERVICE(id),
    "PUT",
    payload
  );
  if (response.success) return true;
  showLog(response.message || "Failed to update order service");
  return false;
};

export const payComission = async (
  payload: Record<string, unknown>
): Promise<boolean> => {
  try {
    const response = await apiRequest(ApiPaths.PAY_COMISSION, "POST", payload);
    return Boolean(response.success);
  } catch {
    return false;
  }
};

export type OrderRefundPayload = {
  order_id: string;
  refund_amount: number;
  from_admin_commission: boolean;
  from_partner_wallet: boolean;
  amount_from_admin_commission?: number;
  amount_from_partner_wallet?: number;
  description?: string;
};

export const submitOrderRefund = async (
  payload: OrderRefundPayload
): Promise<boolean> => {
  try {
    const response = await apiRequest(ApiPaths.ORDER_REFUND, "POST", payload);
    if (response.success) return true;
    showLog(response.message || "Refund failed");
    return false;
  } catch (error) {
    showLog(error);
    return false;
  }
};

// ========== Helpers ==========

export function getPrimaryServiceItem(
  order?: OrderModel
): OrderItemModel | undefined {
  const items = order?.service_items;
  if (!items?.length) return undefined;
  return items[0];
}

/** Partner profile from order `partner_info`, populated `partner_id`, or line item. */
export function getOrderPartnerRef(
  order?: OrderModel
): Record<string, unknown> | undefined {
  if (!order) return undefined;
  const rec = order as unknown as Record<string, unknown>;
  const fromOrder = nestedObj(rec.partner_info) ?? order.partner_info;
  if (fromOrder && typeof fromOrder === "object" && str(fromOrder.name)) {
    return fromOrder as unknown as Record<string, unknown>;
  }
  const nested = nestedObj(order.partner_id);
  if (nested?.name) return nested;
  const fromItem = getPrimaryServiceItem(order)?.partner_info;
  if (fromItem && typeof fromItem === "object") {
    return fromItem as unknown as Record<string, unknown>;
  }
  return nested;
}

/** Saved address on detail (`address_info`) or populated list row (`address_id` object). */
function orderAddressRecord(
  order: Record<string, unknown>
): Record<string, unknown> | undefined {
  return nestedObj(order.address_info) ?? nestedObj(order.address_id);
}

export function getOrderPartnerDisplayName(order?: OrderModel): string {
  const root = str(order?.partner_name);
  if (root) return root;
  const fromRef = str(getOrderPartnerRef(order)?.name);
  if (fromRef) return fromRef;
  const fromItem = getPrimaryServiceItem(order)?.partner_info?.name;
  if (fromItem) return fromItem;
  return "-";
}

export function getOrderCategoryName(order?: OrderModel): string {
  const root = str(order?.category_name);
  if (root) return root;
  const fromInfo = str(order?.category_info?.name);
  if (fromInfo) return fromInfo;
  const fromRef = str(nestedObj(order?.category_id)?.name);
  if (fromRef) return fromRef;
  return "-";
}

function deriveCustomerPaymentStatusSlugFromRecord(
  r: Record<string, unknown>
): string {
  const due = apiMoney(r.customer_due_amount);
  const paid =
    apiMoney(r.customer_net_paid) || apiMoney(r.customer_paid_amount);
  const total = apiMoney(r.total_price);
  if (paid > 0.009 && due > 0.009) return "partially_paid";
  if (
    paid > 0.009 &&
    due <= 0.05 &&
    (total <= 0.009 || paid >= total - 0.05)
  ) {
    return "paid";
  }
  if (paid <= 0.009) return "unpaid";
  return "";
}

function derivePartnerPaymentStatusSlugFromRecord(
  r: Record<string, unknown>
): string {
  const paid = apiMoney(r.partner_paid_amount);
  const due = apiMoney(r.partner_due_amount);
  if (paid > 0.009 && due > 0.009) return "partially_paid";
  if (due <= 0.05 && paid > 0.009) return "paid";
  if (paid <= 0.009 && due > 0.009) return "unpaid";
  if (paid > 0.009) return "partially_paid";
  return "";
}

export function resolveCustomerPaymentStatusSlug(
  order?: OrderModel | null
): string {
  if (!order) return "";
  const statusRaw =
    order.customer_payment_status?.trim() ||
    order.user_payment_status?.trim() ||
    order.payment_status?.trim() ||
    "";
  const slug = normalizeCustomerPaymentStatusSlug(statusRaw);
  if (slug) return slug;
  return deriveCustomerPaymentStatusSlugFromRecord(
    order as unknown as Record<string, unknown>
  );
}

/** Completed tab orders with outstanding customer balance may be edited (payments). */
export function isCompletedOrderWithPartialCustomerPayment(
  order?: OrderModel | null
): boolean {
  return (
    order?.order_status === 3 &&
    resolveCustomerPaymentStatusSlug(order) === "partially_paid"
  );
}

/** Completed tab orders with unpaid partner balance may edit partner payments only. */
export function isCompletedOrderWithUnpaidPartnerPayment(
  order?: OrderModel | null
): boolean {
  return (
    order?.order_status === 3 &&
    resolvePartnerPaymentStatusSlug(order) === "unpaid"
  );
}

/** Completed orders editable via limited payment sections (user and/or partner). */
export function isCompletedOrderLimitedPaymentEdit(
  order?: OrderModel | null
): boolean {
  return (
    isCompletedOrderWithPartialCustomerPayment(order) ||
    isCompletedOrderWithUnpaidPartnerPayment(order)
  );
}

export function resolvePartnerPaymentStatusSlug(
  order?: OrderModel | null
): string {
  if (!order) return "";
  const slug = normalizePartnerPaymentStatusSlug(order.partner_payment_status);
  if (slug) return slug;
  if (orderUsesApiPaymentLedger(order)) {
    const paid = sumApiPaymentsByPayer(order, "partner");
    const due = apiMoney(order.partner_due_amount);
    if (paid > 0.009 && due > 0.009) return "partially_paid";
    if (due <= 0.05 && paid > 0.009) return "paid";
    if (paid <= 0.009 && due > 0.009) return "unpaid";
    if (paid > 0.009) return "partially_paid";
  }
  return derivePartnerPaymentStatusSlugFromRecord(
    order as unknown as Record<string, unknown>
  );
}

export function getCustomerPaymentStatusLabel(order?: OrderModel): string {
  const slug = resolveCustomerPaymentStatusSlug(order);
  if (slug) {
    const label = customerPaymentStatusLabelFromSlug(slug);
    if (label) return label;
  }
  const statusRaw =
    order?.customer_payment_status?.trim() ||
    order?.user_payment_status?.trim() ||
    order?.payment_status?.trim() ||
    "";
  if (statusRaw) return statusRaw.replace(/_/g, " ");
  return "Unpaid";
}

export function getPartnerPaymentStatusLabel(order?: OrderModel): string {
  const slug = resolvePartnerPaymentStatusSlug(order);
  if (slug) {
    const label = partnerPaymentStatusLabelFromSlug(slug);
    if (label) return label;
  }
  const raw = order?.partner_payment_status?.trim();
  if (raw) return raw.replace(/_/g, " ");

  if (order && orderUsesApiPaymentLedger(order)) {
    const primary = getPrimaryServiceItem(order);
    const partnerDue = roundMoney(
      Math.max(
        0,
        Number(primary?.service_price ?? 0) ||
          Number(order.service_price ?? 0) ||
          Number(order.total_service_charge ?? 0)
      )
    );
    const paid = sumApiPaymentsByPayer(order, "partner");
    if (partnerDue > 0.009) {
      if (paid >= partnerDue - 0.01) return "Paid";
      if (paid > 0.009) return "Partially paid";
      return "Unpaid";
    }
    if (paid > 0.009) return "Partially paid";
  }

  const items = order?.service_items ?? [];
  if (!items.length) return "-";
  const paid = items.filter((i) => i.is_paid).length;
  if (paid === items.length) return "Paid";
  if (paid > 0) return "Partially paid";
  return "Unpaid";
}

/** Dropdown labels for edit-order payment status (matches `buildOrderHeaderPatchPayload`). */
export const ORDER_CUSTOMER_PAYMENT_STATUS_OPTIONS: { value: string; label: string }[] =
  [
    { value: "Paid", label: "Paid" },
    { value: "Unpaid", label: "Unpaid" },
    { value: "Partially paid", label: "Partially paid" },
    { value: "Refund", label: "Refund" },
    { value: "Partially Refund", label: "Partially Refund" },
    { value: "Completed", label: "Completed" },
  ];

export const ORDER_PARTNER_PAYMENT_STATUS_OPTIONS: { value: string; label: string }[] =
  [
    { value: "Paid", label: "Paid" },
    { value: "Unpaid", label: "Unpaid" },
    { value: "Partially paid", label: "Partially paid" },
    { value: "Completed", label: "Completed" },
  ];

export function formatServiceScheduleLine(
  item?: OrderItemModel,
  order?: OrderModel
): string {
  const primary = item ?? getPrimaryServiceItem(order);
  if (!primary) return "-";
  const fromYmd =
    normalizeOrderApiDateYmd(order?.from_date) ||
    ymdChunk(String(primary.service_date ?? "")) ||
    normalizeOrderApiDateYmd(order?.order_date);
  const toYmd =
    normalizeOrderApiDateYmd(order?.to_date) || fromYmd;
  let scheduled_date = fromYmd;
  if (toYmd && toYmd !== fromYmd) {
    scheduled_date = `${fromYmd} to ${toYmd}`;
  }
  const fromRaw = String(primary.service_from_time ?? "").trim();
  const toRaw = String(primary.service_to_time ?? "").trim();
  const scheduled = formatQuoteScheduledDisplay({
    scheduled_date: scheduled_date || fromYmd,
    service_from_time: fromRaw,
    service_to_time: toRaw,
  });
  if (scheduled !== "-") return scheduled;
  const d = fromYmd ? formatDate(fromYmd) : "";
  return d || "-";
}

/** Parses API money fields that may be number, string, or null. */
export function parseOrderMoneyField(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n =
    typeof v === "string"
      ? parseFloat(String(v).replace(/,/g, "").trim())
      : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function aggregateOrderRefundsFromList(
  order?: OrderModel | null
): OrderRefundBreakdown | null {
  if (!order) return null;
  const rows = (order as unknown as Record<string, unknown>).refunds;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let refundAmount = 0;
  let adminCommission = 0;
  let partnerWallet = 0;
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    refundAmount += parseOrderMoneyField(r.refund_amount);
    adminCommission += parseOrderMoneyField(r.from_admin_commission);
    partnerWallet += parseOrderMoneyField(r.from_partner_wallet);
  }
  if (refundAmount <= 0.009 && adminCommission <= 0.009 && partnerWallet <= 0.009) {
    return null;
  }
  return {
    refundAmount:
      refundAmount > 0.009 ? refundAmount : adminCommission + partnerWallet,
    adminCommission,
    partnerWallet,
  };
}

/** Refund / return total on the order (supports string amounts from API). */
export function orderRefundAmount(order?: OrderModel): number {
  if (!order) return 0;
  const fromList = aggregateOrderRefundsFromList(order);
  if (fromList) return fromList.refundAmount;
  const raw = order.return_amount ?? order.refund_amount;
  return parseOrderMoneyField(raw);
}

/** True when the order has any offer metadata worth showing. */
export function orderHasOffer(order?: OrderModel): boolean {
  if (!order) return false;
  const id = order.offer_id != null && String(order.offer_id).trim() !== "";
  const name = Boolean(order.offer_name?.trim());
  const disc = parseOrderMoneyField(order.offer_discount_amount as unknown);
  return id || name || disc > 0;
}

export function orderOfferDiscountAmount(order?: OrderModel): number {
  if (!order) return 0;
  return parseOrderMoneyField(order.offer_discount_amount as unknown);
}

/** Split of how a refund was covered (admin commission vs partner wallet). */
export type OrderRefundBreakdown = {
  refundAmount: number;
  adminCommission: number;
  partnerWallet: number;
};

export function orderRefundBreakdown(order?: OrderModel): OrderRefundBreakdown {
  const fromList = aggregateOrderRefundsFromList(order);
  if (fromList) return fromList;
  const refundAmount = orderRefundAmount(order);
  const adminCommission = parseOrderMoneyField(
    order?.amount_from_admin_commission ?? order?.from_admin_commission
  );
  const partnerWallet = parseOrderMoneyField(
    order?.amount_from_partner_wallet ?? order?.from_partner_wallet
  );
  return { refundAmount, adminCommission, partnerWallet };
}

/** Master offer template (value + who contributes) plus discount applied on this order. */
export type OrderOfferBreakdown = {
  totalOfferValue: number;
  adminContribution: number;
  partnerContribution: number;
  appliedDiscount: number;
  offerName?: string;
  /** Business / settings offer id for display */
  offerCode?: string;
  /** Create-order preview: % taken off `discountBaseForPercent` when offer is percentage (or unknown id fallback). */
  percentOffOrder?: number | null;
  /** Create-order preview: monetary base the % was applied to (prefers order total, else subtotal). */
  discountBaseForPercent?: number;
};

/** When an offer is selected on create order but not found in settings, use this % off order total. */
export const CREATE_ORDER_OFFER_FALLBACK_PERCENT = 20;

/**
 * Rupee discount for create-order preview / payment total.
 * - `percentage`: `totalOfferValue` is the percent (e.g. 20 → 20% of order total).
 * - `fixed`: `totalOfferValue` is max rupee discount, capped by order total (or subtotal if total is 0).
 */
export function computeCreateOrderOfferDiscountRupees(args: {
  offerId: string;
  fromSettings?: OfferModel;
  orderTotalPrice: number;
  orderSubTotal: number;
}): { discount: number; percentOff: number | null; baseUsed: number } {
  const id = args.offerId.trim();
  if (!id) return { discount: 0, percentOff: null, baseUsed: 0 };

  const total = Math.max(0, Number(args.orderTotalPrice) || 0);
  const sub = Math.max(0, Number(args.orderSubTotal) || 0);
  const base = total > 0.009 ? total : sub;

  if (!args.fromSettings) {
    const pct = CREATE_ORDER_OFFER_FALLBACK_PERCENT;
    const discount = Math.min((base * pct) / 100, base);
    return { discount, percentOff: pct, baseUsed: base };
  }

  if (args.fromSettings.offerType === "percentage") {
    const pct = Number(args.fromSettings.totalOfferValue) || 0;
    const discount = Math.min((base * pct) / 100, base);
    return { discount, percentOff: pct, baseUsed: base };
  }

  const flat = Math.max(0, Number(args.fromSettings.totalOfferValue) || 0);
  return { discount: Math.min(flat, base), percentOff: null, baseUsed: base };
}

/** Split a rupee discount between admin / partner using template ratio (or 60/40 if template has no parts). */
export function splitOfferContributionAmounts(
  discountRupees: number,
  template?: Pick<OfferModel, "adminContribution" | "partnerContribution">
): { admin: number; partner: number } {
  if (discountRupees <= 0.00001) return { admin: 0, partner: 0 };

  const adminT = Math.max(0, Number(template?.adminContribution) || 0);
  const partnerT = Math.max(0, Number(template?.partnerContribution) || 0);
  const parts = adminT + partnerT;
  if (parts > 0.009) {
    return {
      admin: discountRupees * (adminT / parts),
      partner: discountRupees * (partnerT / parts),
    };
  }

  return { admin: discountRupees * 0.6, partner: discountRupees * 0.4 };
}

/**
 * Resolves offer display: prefers explicit API fields on the order, else matches `offer_id`
 * to settings offers (same source as Create Order offer list).
 */
export function resolveOrderOfferBreakdown(
  order?: OrderModel
): OrderOfferBreakdown {
  const appliedDiscount = orderOfferDiscountAmount(order);
  const codeFromOrder =
    order?.offer_id != null
      ? String(order.offer_id).trim() || undefined
      : undefined;
  const empty: OrderOfferBreakdown = {
    totalOfferValue: 0,
    adminContribution: 0,
    partnerContribution: 0,
    appliedDiscount,
    offerName: order?.offer_name?.trim() || undefined,
    offerCode: codeFromOrder,
  };
  if (!order) return empty;

  const fromApiTotal = parseOrderMoneyField(order.total_offer_value as unknown);
  const fromApiAdmin = parseOrderMoneyField(
    order.admin_contribution as unknown
  );
  const fromApiPartner = parseOrderMoneyField(
    order.partner_contribution as unknown
  );
  if (fromApiTotal > 0 || fromApiAdmin > 0 || fromApiPartner > 0) {
    return {
      totalOfferValue: fromApiTotal || appliedDiscount,
      adminContribution: fromApiAdmin,
      partnerContribution: fromApiPartner,
      appliedDiscount,
      offerName: order.offer_name?.trim() || undefined,
      offerCode: codeFromOrder,
    };
  }

  if (orderHasOffer(order) && appliedDiscount > 0) {
    const split = splitOfferContributionAmounts(appliedDiscount);
    return {
      totalOfferValue: appliedDiscount,
      adminContribution: split.admin,
      partnerContribution: split.partner,
      appliedDiscount,
      offerName: order.offer_name?.trim() || undefined,
      offerCode: codeFromOrder,
    };
  }

  return empty;
}

/** When refund was applied, partner-side payment rows must stay read-only. */
export function partnerPaymentsEditLocked(order?: OrderModel): boolean {
  if (order?.__previewPaymentDummy) return false;
  return orderRefundAmount(order) > 0;
}

export type OrderServiceAddressDisplay = {
  state: string;
  city: string;
  area: string;
  pincode: string;
  addressLine: string;
};

/** Structured service address (State / City / Area / Pin / street) — matches quote view. */
export function getOrderServiceAddressDisplay(
  order?: OrderModel
): OrderServiceAddressDisplay {
  const dash = "-";
  const empty: OrderServiceAddressDisplay = {
    state: dash,
    city: dash,
    area: dash,
    pincode: dash,
    addressLine: dash,
  };
  if (!order) return empty;

  const rec = order as unknown as Record<string, unknown>;
  const addrRef = orderAddressRecord(rec);
  const parsed = addrRef ? parseCatalogAddressRecord(addrRef) : null;

  const primary = getPrimaryServiceItem(order);
  const flat =
    order.address?.trim() ||
    primary?.service_address?.trim() ||
    order.user_info?.address?.trim() ||
    "";
  const franchiseRec = nestedObj(rec.franchise_info);
  const composite = flat
    ? parseCompositeServiceAddressLine(
        flat,
        str(addrRef?.pincode ?? addrRef?.postal_code)
      )
    : null;

  if (parsed) {
    let state = displayStateName(parsed.stateName);
    let city = str(parsed.cityName);
    let area = str(parsed.areaName);
    let pincode = str(parsed.pincode);
    let addressLine = [parsed.streetAddress, parsed.landmark]
      .map((s) => str(s))
      .filter(Boolean)
      .join(", ");
    if (!addressLine) {
      addressLine =
        str(addrRef?.address) ||
        str(addrRef?.street ?? addrRef?.address_line) ||
        str(parsed.areaName) ||
        "";
    }
    if (composite && (!state || !city || !area)) {
      if (!state) state = composite.state;
      if (!city) city = composite.city;
      if (!area) area = composite.area;
      if (!pincode) pincode = composite.pincode;
      if (!addressLine || addressLine === str(addrRef?.address)) {
        addressLine = composite.addressLine || addressLine;
      }
    }
    if (!state) {
      state = displayStateName(str(franchiseRec?.state_name));
    }
    return {
      state: state || dash,
      city: city || dash,
      area: area || dash,
      pincode: pincode || dash,
      addressLine: addressLine || dash,
    };
  }

  const cityRef = nestedObj(rec.city_id);
  const city =
    str((order as OrderModel & { city_name?: string }).city_name) ||
    str(order.city_info?.name) ||
    str(cityRef?.name) ||
    (composite?.city ?? "");
  const state =
    displayStateName(
      str(addrRef?.state) ||
        str(nestedObj(addrRef?.state_id)?.name) ||
        str((order.city_info as { state_name?: string } | undefined)?.state_name) ||
        str(franchiseRec?.state_name) ||
        (composite?.state ?? "")
    ) || "";

  if (composite) {
    return {
      state: state || composite.state || dash,
      city: city || composite.city || dash,
      area: composite.area || dash,
      pincode: composite.pincode || str(addrRef?.pincode) || dash,
      addressLine: composite.addressLine || dash,
    };
  }

  return {
    state: state || dash,
    city: city || dash,
    area: dash,
    pincode: str(addrRef?.pincode) || dash,
    addressLine: flat || dash,
  };
}

/** Order-level or primary line service address for display (multi-line when structured). */
export function getOrderServiceAddress(order?: OrderModel): string {
  const parts = getOrderServiceAddressDisplay(order);
  const formatted = formatQuoteServiceAddressLines({
    street: parts.addressLine !== "-" ? parts.addressLine : "",
    area: parts.area !== "-" ? parts.area : "",
    landmark: "",
    city: parts.city !== "-" ? parts.city : "",
    state: parts.state !== "-" ? parts.state : "",
    pincode: parts.pincode !== "-" ? parts.pincode : "",
  });
  if (formatted && formatted !== "-") return formatted;

  const primary = getPrimaryServiceItem(order);
  const fromOrder = order?.address?.trim();
  const fromLine = primary?.service_address?.trim();
  const fromUser = order?.user_info?.address?.trim();
  return fromOrder || fromLine || fromUser || "-";
}

export function serviceNamesJoined(order?: OrderModel): string {
  const root = str(order?.service_name);
  if (root) return root;
  const fromServiceRef = str(
    nestedObj((order as Record<string, unknown> | undefined)?.service_id)?.name
  );
  if (fromServiceRef) return fromServiceRef;
  const raw =
    order?.service_items
      ?.map((s) => s.service_info?.name)
      .filter((n): n is string => Boolean(n)) ?? [];
  if (!raw.length) return "-";
  const uniq: string[] = [];
  for (const n of raw) {
    if (!uniq.includes(n)) uniq.push(n);
  }
  return uniq.join(", ");
}

export const ORDER_PAYMENT_MARKER = "__OPAY1__";

export type OrderPaymentExtV1 = {
  v: 1;
  serviceAmount: number;
  taxPercent: number;
  commissionPercent: number;
  otherCharges: OtherChargeRow[];
  customerPayments: CustomerPaymentRow[];
  partnerPayments: PartnerPaymentRow[];
};

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function stripPaymentExtension(
  comment: string | null | undefined
): string {
  if (!comment) return "";
  const i = comment.indexOf(ORDER_PAYMENT_MARKER);
  return (i >= 0 ? comment.slice(0, i) : comment).trimEnd();
}

export function parsePaymentExtension(
  comment: string | null | undefined
): OrderPaymentExtV1 | null {
  if (!comment || !comment.includes(ORDER_PAYMENT_MARKER)) return null;
  const jsonPart = comment.slice(
    comment.indexOf(ORDER_PAYMENT_MARKER) + ORDER_PAYMENT_MARKER.length
  );
  try {
    const parsed = JSON.parse(jsonPart) as OrderPaymentExtV1;
    if (parsed?.v !== 1) return null;
    if (Array.isArray(parsed.otherCharges)) {
      parsed.otherCharges = parsed.otherCharges.map((r) => ({
        ...r,
        serviceName:
          typeof (r as OtherChargeRow).serviceName === "string"
            ? (r as OtherChargeRow).serviceName
            : "",
      }));
    }
    return parsed;
  } catch {
    return null;
  }
}

export function mergePaymentExtension(
  humanComment: string | null | undefined,
  ext: OrderPaymentExtV1
): string {
  const base = stripPaymentExtension(humanComment);
  const sep = base && !base.endsWith("\n") ? "\n" : "";
  return `${base}${sep}${ORDER_PAYMENT_MARKER}${JSON.stringify(ext)}`;
}

function impliedPercent(amount: number, base: number): number {
  if (
    !Number.isFinite(amount) ||
    !Number.isFinite(base) ||
    base <= 0 ||
    amount <= 0
  )
    return 0;
  return Math.min(100, Math.round((amount / base) * 10000) / 100);
}

/**
 * Tax / commission % for payment math: prefers `service_info`, then implied rates from
 * line-item amounts, then order-level amounts when the catalog fields are missing or zero.
 */
export function getServiceTaxCommissionPercents(
  primary?: OrderItemModel,
  order?: OrderModel
): { taxPct: number; commissionPct: number } {
  const catalogTax = Number(primary?.service_info?.tax ?? 0);
  const catalogComm = Number(primary?.service_info?.commission ?? 0);
  const orderTaxPct = Number(order?.tax_percent ?? 0);
  const orderCommPct = Number(order?.commission_percent ?? 0);

  const itemSub = Number(primary?.sub_total ?? 0);
  const itemTaxAmt = Number(primary?.tax ?? 0);
  const itemCommAmt = Number(primary?.partner_commison_platform_fee ?? 0);

  const orderSub = Number(order?.sub_total ?? 0);
  const orderTaxAmt = Number(order?.tax ?? 0);
  const orderCommAmt = Number(order?.partner_commison_platform_fee ?? 0);

  let taxPct = Number.isFinite(catalogTax) && catalogTax > 0 ? catalogTax : 0;
  let commissionPct =
    Number.isFinite(catalogComm) && catalogComm > 0 ? catalogComm : 0;

  if (taxPct <= 0 && Number.isFinite(orderTaxPct) && orderTaxPct > 0) {
    taxPct = orderTaxPct;
  }
  if (commissionPct <= 0 && Number.isFinite(orderCommPct) && orderCommPct > 0) {
    commissionPct = orderCommPct;
  }

  if (taxPct <= 0) taxPct = impliedPercent(itemTaxAmt, itemSub);
  if (taxPct <= 0) taxPct = impliedPercent(orderTaxAmt, orderSub);

  if (commissionPct <= 0) commissionPct = impliedPercent(itemCommAmt, itemSub);
  if (commissionPct <= 0)
    commissionPct = impliedPercent(orderCommAmt, orderSub);

  return {
    taxPct: Number.isFinite(taxPct) ? taxPct : 0,
    commissionPct: Number.isFinite(commissionPct) ? commissionPct : 0,
  };
}

/**
 * Base service price for payment editor & amount summary (line `service_price` /
 * `total_service_charge`) — not `sub_total` or `total_price`.
 */
export function orderPaymentSummaryServiceAmount(
  order?: OrderModel,
  primary?: OrderItemModel
): number {
  return orderPartnerPriceAmount(order, primary);
}

export {
  orderPartnerPriceAmount,
  orderUserPriceAmount,
} from "./orderPriceAmounts";

/**
 * Order/quote pricing: commission on (service + additional charges), then tax on subtotal.
 * Matches `computeQuotePriceBreakdown` in quoteHelpers.
 */
export function computeOrderPaymentLineTotals(
  serviceAmount: number,
  otherChargesSum: number,
  taxPct: number,
  commissionPct: number
): {
  commissionBase: number;
  commissionAmount: number;
  subtotalBeforeTax: number;
  taxAmount: number;
  totalInclTax: number;
} {
  const commissionBase = roundMoney(
    Math.max(0, Number(serviceAmount) || 0) +
      Math.max(0, Number(otherChargesSum) || 0)
  );
  const commissionAmount = roundMoney(
    (commissionBase * Math.max(0, Number(commissionPct) || 0)) / 100
  );
  const subtotalBeforeTax = roundMoney(commissionBase + commissionAmount);
  const taxAmount = roundMoney(
    (subtotalBeforeTax * Math.max(0, Number(taxPct) || 0)) / 100
  );
  const totalInclTax = roundMoney(subtotalBeforeTax + taxAmount);
  return {
    commissionBase,
    commissionAmount,
    subtotalBeforeTax,
    taxAmount,
    totalInclTax,
  };
}

/** @deprecated Prefer `computeOrderPaymentLineTotals` (tax is on subtotal, not parallel on base). */
export function computeTaxCommissionAmounts(
  serviceAmount: number,
  taxPct: number,
  commissionPct: number
): { taxAmount: number; commissionAmount: number } {
  const line = computeOrderPaymentLineTotals(
    serviceAmount,
    0,
    taxPct,
    commissionPct
  );
  return {
    taxAmount: line.taxAmount,
    commissionAmount: line.commissionAmount,
  };
}

/** User invoice total from payment editor rows (incl. tax, offers, discounts, refunds). */
export function orderPaymentInvoiceTotal(
  ext: OrderPaymentExtV1,
  order: OrderModel,
  primary?: OrderItemModel
): number {
  const { taxPct, commissionPct } = getServiceTaxCommissionPercents(
    primary,
    order
  );
  const otherSum = otherChargesTotal(ext.otherCharges ?? []);
  const pricing = computeOrderPaymentLineTotals(
    ext.serviceAmount,
    otherSum,
    taxPct,
    commissionPct
  );
  const offer = resolveOrderOfferBreakdown(order);
  const refundN = orderRefundAmount(order);
  const orderDiscount = Math.max(0, Number(order.discount_amount ?? 0));
  return Math.max(
    0,
    roundMoney(
      pricing.totalInclTax -
        offer.appliedDiscount -
        orderDiscount -
        refundN
    )
  );
}

/** When no saved extension, show sensible default rows (matches common invoice-style lines). */
export function buildDefaultPaymentExtension(
  order: OrderModel,
  primary?: OrderItemModel
): OrderPaymentExtV1 {
  const { taxPct, commissionPct } = getServiceTaxCommissionPercents(
    primary,
    order
  );
  const serviceAmount = orderPaymentSummaryServiceAmount(order, primary);
  void computeTaxCommissionAmounts(serviceAmount, taxPct, commissionPct);
  const payMode =
    normalizePaymentMethod(order.payment_mode) ||
    paymentMethodFromExpenseModeId(order.payment_mode_id ?? "") ||
    "cash";

  const d = order.order_date ? formatDate(order.order_date) : "";
  const userTotalRounded = roundMoney(
    Math.max(0, Number(order.total_price ?? 0))
  );

  const sub = serviceAmount;
  /** Partner obligation for this template (no extra charges / offer in defaults). */
  const partnerDue = roundMoney(Math.max(0, sub));

  /**
   * Unpaid defaults: two instalments (~25% + ~25%, each at least ₹1 when cap ≥ 2) so both Paid amount
   * cells show values; footer Total Paid / Balance still use cap − sum. Paid: full amount on row 1 only.
   */
  const defaultUnpaidTwoRowAmounts = (
    cap: number
  ): { first: number; second: number } => {
    const c = Math.max(0, cap);
    if (c <= 0) return { first: 0, second: 0 };
    if (c === 1) return { first: 1, second: 0 };
    let a = Math.max(1, roundMoney(c * 0.25));
    let b = Math.max(1, roundMoney(c * 0.25));
    if (a + b > c) {
      a = Math.max(1, Math.floor(c / 2));
      b = Math.max(1, c - a);
      if (a + b > c) {
        a = Math.max(1, c - 1);
        b = 1;
      }
    }
    return { first: a, second: b };
  };

  let customerRow1: number;
  let customerRow2: number;
  if (order.is_paid) {
    customerRow1 = userTotalRounded;
    customerRow2 = 0;
  } else {
    const split = defaultUnpaidTwoRowAmounts(userTotalRounded);
    customerRow1 = split.first;
    customerRow2 = split.second;
  }

  let partnerRow1: number;
  let partnerRow2: number;
  if (order.is_paid) {
    partnerRow1 = partnerDue;
    partnerRow2 = 0;
  } else {
    const split = defaultUnpaidTwoRowAmounts(partnerDue);
    partnerRow1 = split.first;
    partnerRow2 = split.second;
  }

  return {
    v: 1,
    serviceAmount,
    taxPercent: taxPct,
    commissionPercent: commissionPct,
    otherCharges: [],
    customerPayments: [
      {
        id: newId(),
        date: d,
        amount: customerRow1,
        type: payMode || "—",
        description: "Paid amount",
      },
      {
        id: newId(),
        date: d,
        amount: customerRow2,
        type: payMode || "—",
        description: "Balance amount",
      },
    ],
    partnerPayments: [
      { id: newId(), date: d, amount: partnerRow1, description: "Paid amount" },
      {
        id: newId(),
        date: d,
        amount: partnerRow2,
        description: "Balance amount",
      },
    ],
  };
}

/** True when `GET /order/get/:id` included an `order_payments` array (may be empty). */
export function orderUsesApiPaymentLedger(order: OrderModel): boolean {
  return Array.isArray(order.order_payments);
}

function sumApiPaymentsByPayer(
  order: OrderModel,
  payer: "customer" | "partner"
): number {
  const target = payer === "partner" ? "partner" : "customer";
  let sum = 0;
  for (const p of order.order_payments ?? []) {
    const pt = String(p.payer_type ?? "").trim().toLowerCase();
    if (pt === (target === "partner" ? "partner" : "customer")) {
      sum += apiMoney(p.amount);
    }
  }
  return roundMoney(sum);
}

/** Map `order_payments` / `additional_charges` from API into the payment editor model. */
function buildPaymentExtensionFromApiLedger(
  order: OrderModel,
  primary?: OrderItemModel
): OrderPaymentExtV1 {
  const payments = order.order_payments ?? [];
  const charges = order.additional_charges ?? [];

  const { taxPct, commissionPct } = getServiceTaxCommissionPercents(
    primary,
    order
  );
  const serviceAmount = orderPaymentSummaryServiceAmount(order, primary);

  const customerPayments: CustomerPaymentRow[] = [];
  const partnerPayments: PartnerPaymentRow[] = [];
  for (const p of payments) {
    const payer = String(p.payer_type ?? "").trim().toLowerCase();
    const amount = apiMoney(p.amount);
    if (amount <= 0) continue;
    const id = str(p._id) || newId();
    const date = str(p.paid_at) || ymdFromIso(order.order_date ?? "");
    if (payer === "partner") {
      partnerPayments.push({
        id,
        date,
        amount,
        description: str(p.notes) || str(p.transaction_reference) || "",
      });
    } else {
      customerPayments.push({
        id,
        date,
        amount,
        type: normalizePaymentMethod(str(p.payment_method)) || "cash",
        description: str(p.notes) || str(p.transaction_reference) || "",
      });
    }
  }

  const otherCharges: OtherChargeRow[] = charges.map((c) => ({
    id: str(c._id) || newId(),
    amount: apiMoney(c.amount),
    description: str(c.description) || "",
    serviceName: str(c.label) || str(c.description) || "",
  }));

  return {
    v: 1,
    serviceAmount,
    taxPercent: taxPct,
    commissionPercent: commissionPct,
    otherCharges,
    customerPayments,
    partnerPayments,
  };
}

export function resolvePaymentExtension(
  order: OrderModel,
  primary?: OrderItemModel
): OrderPaymentExtV1 {
  if (orderUsesApiPaymentLedger(order)) {
    return buildPaymentExtensionFromApiLedger(order, primary);
  }
  return (
    parsePaymentExtension(order.comment) ??
    buildDefaultPaymentExtension(order, primary)
  );
}

export function otherChargesTotal(charges: OtherChargeRow[]): number {
  return roundMoney(
    charges.reduce((a, c) => a + Math.max(0, Number(c.amount) || 0), 0)
  );
}

export function sumCustomerAmounts(rows: CustomerPaymentRow[]): number {
  return roundMoney(
    rows.reduce((a, r) => a + Math.max(0, paymentRowEffectiveAmount(r)), 0)
  );
}

export function sumPartnerAmounts(rows: PartnerPaymentRow[]): number {
  return roundMoney(
    rows.reduce((a, r) => a + Math.max(0, paymentRowEffectiveAmount(r)), 0)
  );
}

/** Flush draft `amountInput` into `amount` before create/update API payloads. */
export function normalizePaymentExtForSubmit(
  ext: OrderPaymentExtV1
): OrderPaymentExtV1 {
  return {
    ...ext,
    customerPayments: (ext.customerPayments ?? []).map((r) => ({
      ...r,
      amount: paymentRowEffectiveAmount(r),
      amountInput: undefined,
    })),
    partnerPayments: (ext.partnerPayments ?? []).map((r) => ({
      ...r,
      amount: paymentRowEffectiveAmount(r),
      amountInput: undefined,
    })),
  };
}

export type PaymentCapsValidation = {
  valid: boolean;
  reason?: string;
};

function formatCapMoney(n: number): string {
  return `${AppConstant.currencySymbol}${roundMoney(Math.max(0, n)).toFixed(2)}`;
}

/** User/partner paid sums must not exceed their respective invoice caps. */
export function validatePaymentExtAgainstCaps(
  ext: OrderPaymentExtV1,
  customerInvoiceCap: number,
  partnerServiceCap: number
): PaymentCapsValidation {
  const customerPaid = sumCustomerAmounts(ext.customerPayments);
  const partnerPaid = sumPartnerAmounts(ext.partnerPayments);
  const custCap = Math.max(0, roundMoney(customerInvoiceCap));
  const partCap = Math.max(0, roundMoney(partnerServiceCap));

  if (customerPaid > custCap + 0.01) {
    return {
      valid: false,
      reason: `User payments (${formatCapMoney(customerPaid)}) cannot exceed the order total (${formatCapMoney(custCap)}). Reduce or remove user payment rows before changing the total or applying an offer.`,
    };
  }
  if (partnerPaid > partCap + 0.01) {
    return {
      valid: false,
      reason: `Partner payments (${formatCapMoney(partnerPaid)}) cannot exceed the partner service amount (${formatCapMoney(partCap)}). Reduce or remove partner payment rows first.`,
    };
  }
  return { valid: true };
}

function clampPaymentRowsToCap<
  T extends { amount: number; amountInput?: string },
>(rows: T[], cap: number): T[] {
  const capN = Math.max(0, roundMoney(cap));
  const sum = roundMoney(
    rows.reduce((a, r) => a + paymentRowEffectiveAmount(r), 0)
  );
  if (sum <= capN + 0.01) return rows;

  let over = sum - capN;
  const out = rows.map((r) => ({ ...r }));
  for (let i = out.length - 1; i >= 0 && over > 0.01; i--) {
    const a = paymentRowEffectiveAmount(out[i]);
    const d = Math.min(a, over);
    out[i] = {
      ...out[i],
      amount: roundMoney(a - d),
      amountInput: undefined,
    };
    over -= d;
  }
  return out;
}

/** Trim payment rows from the bottom when caps shrink (e.g. after applying an offer). */
export function clampPaymentExtToCaps(
  ext: OrderPaymentExtV1,
  customerInvoiceCap: number,
  partnerServiceCap: number,
  options?: { clampPartner?: boolean }
): OrderPaymentExtV1 {
  const clampPartner = options?.clampPartner !== false;
  const customerPayments = clampPaymentRowsToCap(
    ext.customerPayments,
    customerInvoiceCap
  );
  const partnerPayments = clampPartner
    ? clampPaymentRowsToCap(ext.partnerPayments, partnerServiceCap)
    : ext.partnerPayments;
  return { ...ext, customerPayments, partnerPayments };
}

export function isCustomerPaymentRowComplete(row: CustomerPaymentRow): boolean {
  return paymentRowEffectiveAmount(row) > 0.009;
}

export function isPartnerPaymentRowComplete(row: PartnerPaymentRow): boolean {
  return paymentRowEffectiveAmount(row) > 0.009;
}

/** True when any user or partner payment row has a non-zero paid amount. */
export function hasRecordedOrderPayments(ext: OrderPaymentExtV1): boolean {
  return (
    ext.customerPayments.some(isCustomerPaymentRowComplete) ||
    ext.partnerPayments.some(isPartnerPaymentRowComplete)
  );
}

export type CanAddPaymentRowResult = {
  allowed: boolean;
  reason: string | null;
};

/** Block adding another row until the last row has a paid amount. */
export function canAddAnotherCustomerPayment(
  rows: CustomerPaymentRow[],
  balanceRemaining: number
): CanAddPaymentRowResult {
  if (balanceRemaining <= 0.009) {
    return { allowed: false, reason: null };
  }
  const last = rows[rows.length - 1];
  if (last && !isCustomerPaymentRowComplete(last)) {
    return {
      allowed: false,
      reason:
        "Enter paid amount on the current user payment row before adding another.",
    };
  }
  return { allowed: true, reason: null };
}

export function canAddAnotherPartnerPayment(
  rows: PartnerPaymentRow[],
  balanceRemaining: number
): CanAddPaymentRowResult {
  if (balanceRemaining <= 0.009) {
    return { allowed: false, reason: null };
  }
  const last = rows[rows.length - 1];
  if (last && !isPartnerPaymentRowComplete(last)) {
    return {
      allowed: false,
      reason:
        "Enter paid amount on the current partner payment row before adding another.",
    };
  }
  return { allowed: true, reason: null };
}

/**
 * Order create/update customer payment header fields from user payment rows.
 *
 * - `is_paid`: `true` when customer payment rows cover the invoice total (uses draft amounts too).
 * - `customer_payment_method`: first row with amount &gt; 0 (method column), else `cash` when unpaid with no rows.
 * - `customer_payment_status`: `paid` | `partially_paid` | `unpaid`.
 */
export function deriveOrderCustomerPaymentFields(
  ext: OrderPaymentExtV1 | undefined,
  invoiceTotal: number
): {
  is_paid: boolean;
  customer_payment_method: string;
  customer_payment_status: string;
} {
  const inv = Math.max(0, roundMoney(Number(invoiceTotal) || 0));
  const rows = ext?.customerPayments ?? [];
  const totalPaid = sumCustomerAmounts(rows);
  const balance = Math.max(0, roundMoney(inv - totalPaid));
  const is_paid =
    inv > 0.009 && totalPaid > 0.009 && balance <= 0.05;

  const withAmount = rows.filter((r) => paymentRowEffectiveAmount(r) > 0.009);
  const pick = withAmount[0] ?? rows[0];
  const customer_payment_method =
    withAmount.length > 0
      ? normalizePaymentMethod(pick?.type) || "cash"
      : "cash";

  let customer_payment_status = "unpaid";
  if (totalPaid > 0.009) {
    customer_payment_status = is_paid ? "paid" : "partially_paid";
  }

  return { is_paid, customer_payment_method, customer_payment_status };
}

function normPaymentDescription(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Returns the amount on the first row whose description matches (case-insensitive), or null. */
export function amountForPaymentDescription(
  rows: { amount: number; description?: string }[],
  description: string
): number | null {
  const target = description.trim().toLowerCase();
  const row = rows.find(
    (r) => normPaymentDescription(r.description) === target
  );
  if (!row) return null;
  return Number(row.amount) || 0;
}

/**
 * Legacy default template may start with a non-payment “echo” line (empty description, amount ≈ invoice)
 * while “Paid amount” + “Balance amount” already add up to the invoice. That first line must not count
 * toward Total Paid. If those template lines do not cover the invoice, the empty-desc rows are treated
 * as real payment lines (e.g. user cleared template rows and entered the full amount on line 1).
 */
function isDefaultStyleMirrorRow<
  T extends { amount: number; description?: string }
>(rows: T[], rowIndex: number, r: T, invoiceTotal: number): boolean {
  const d = normPaymentDescription(r.description);
  if (rowIndex !== 0 || d !== "") return false;
  const paidAmt = amountForPaymentDescription(rows, "Paid amount");
  const balAmt = amountForPaymentDescription(rows, "Balance amount");
  if (paidAmt === null || balAmt === null) return false;
  const inv = Math.max(0, Number(invoiceTotal) || 0);
  if (Math.abs(paidAmt + balAmt - inv) > 0.02) return false;
  return Math.abs((Number(r.amount) || 0) - inv) < 0.01;
}

/** Sum of cash lines for template tables: every row except balance, minus the first-row invoice echo when present. */
function sumTemplateSideCountedPayments<
  T extends { amount: number; description?: string }
>(rows: T[], invoiceTotal: number): number {
  return roundMoney(
    rows.reduce((acc, r, idx) => {
      if (normPaymentDescription(r.description) === "balance amount")
        return acc;
      if (isDefaultStyleMirrorRow(rows, idx, r, invoiceTotal)) return acc;
      return acc + Math.max(0, Number(r.amount) || 0);
    }, 0)
  );
}

/** User-facing headline: amount paid so far vs remaining due. */
export function customerPaidBalanceHeadline(
  ext: OrderPaymentExtV1,
  invoiceTotal: number,
  _orderIsPaid: boolean,
  order?: OrderModel
): { totalPaid: number; balance: number } {
  const inv = Math.max(0, Number(invoiceTotal) || 0);

  if (order && orderUsesApiPaymentLedger(order)) {
    const netPaid = apiMoney(order.customer_net_paid);
    const paidAmount = apiMoney(order.customer_paid_amount);
    const dueAmount = apiMoney(order.customer_due_amount);
    const rowSum = sumCustomerAmounts(ext.customerPayments);

    let totalPaid = 0;
    if (netPaid > 0.009) totalPaid = netPaid;
    else if (paidAmount > 0.009) totalPaid = paidAmount;
    else totalPaid = rowSum;

    totalPaid = Math.min(inv, Math.max(0, roundMoney(totalPaid)));
    const balance =
      dueAmount > 0.009
        ? roundMoney(dueAmount)
        : Math.max(0, roundMoney(inv - totalPaid));
    return { totalPaid, balance };
  }

  const totalPaidRaw = hasCustomerPaymentTemplateRows(ext)
    ? sumTemplateSideCountedPayments(ext.customerPayments, inv)
    : sumCustomerAmounts(ext.customerPayments);
  const totalPaid = Math.min(inv, Math.max(0, totalPaidRaw));
  const balance = Math.max(0, roundMoney(inv - totalPaid));
  return { totalPaid, balance };
}

/** View / read-only: same as `customerPaidBalanceHeadline` with order context for API ledger. */
export function customerPaidBalanceHeadlineForView(
  ext: OrderPaymentExtV1,
  invoiceTotal: number,
  order: OrderModel
): { totalPaid: number; balance: number } {
  return customerPaidBalanceHeadline(
    ext,
    invoiceTotal,
    !!order.is_paid,
    order
  );
}

/** Partner headline: paid vs balance (`invoiceTotal` = partner obligation before tax/commission). */
export function partnerPaidBalanceHeadline(
  ext: OrderPaymentExtV1,
  invoiceTotal: number,
  _serviceAmount: number,
  _orderIsPaid: boolean,
  order?: OrderModel
): { totalPaid: number; balance: number } {
  const inv = Math.max(0, Number(invoiceTotal) || 0);

  if (order && orderUsesApiPaymentLedger(order)) {
    const paidAmount = apiMoney(order.partner_paid_amount);
    const dueAmount = apiMoney(order.partner_due_amount);
    const rowSum = sumPartnerAmounts(ext.partnerPayments);

    let totalPaid = 0;
    if (paidAmount > 0.009) totalPaid = paidAmount;
    else totalPaid = rowSum;

    totalPaid = Math.min(inv, Math.max(0, roundMoney(totalPaid)));
    const balance =
      dueAmount > 0.009
        ? roundMoney(dueAmount)
        : Math.max(0, roundMoney(inv - totalPaid));
    return { totalPaid, balance };
  }

  const totalPaidRaw = hasPartnerPaymentTemplateRows(ext)
    ? sumTemplateSideCountedPayments(ext.partnerPayments, inv)
    : sumPartnerAmounts(ext.partnerPayments);
  const totalPaid = Math.min(inv, Math.max(0, totalPaidRaw));
  const balance = Math.max(0, roundMoney(inv - totalPaid));
  return { totalPaid, balance };
}

function hasCustomerPaymentTemplateRows(ext: OrderPaymentExtV1): boolean {
  return ext.customerPayments.some((r) => {
    const n = normPaymentDescription(r.description);
    return n === "paid amount" || n === "balance amount";
  });
}

function hasPartnerPaymentTemplateRows(ext: OrderPaymentExtV1): boolean {
  return ext.partnerPayments.some((r) => {
    const n = normPaymentDescription(r.description);
    return n === "paid amount" || n === "balance amount";
  });
}

/**
 * Customer paid / balance for the payment editor: **sum of every row’s amount** (real-time with the table).
 * Balance is the remainder against the invoice cap. Read-only views still use `customerPaidBalanceHeadline`.
 */
export function customerPaidBalanceForEdit(
  ext: OrderPaymentExtV1,
  invoiceTotal: number,
  _orderIsPaid: boolean
): {
  totalPaid: number;
  balance: number;
} {
  const inv = Math.max(0, Number(invoiceTotal) || 0);
  const totalPaid = sumCustomerAmounts(ext.customerPayments);
  return { totalPaid, balance: Math.max(0, roundMoney(inv - totalPaid)) };
}

/** Partner paid / balance for the editor — sum of all partner payment rows vs partner obligation cap. */
export function partnerPaidBalanceForEdit(
  ext: OrderPaymentExtV1,
  invoiceTotal: number,
  _serviceAmount: number,
  _orderIsPaid: boolean
): { totalPaid: number; balance: number } {
  const inv = Math.max(0, Number(invoiceTotal) || 0);
  const totalPaid = sumPartnerAmounts(ext.partnerPayments);
  return { totalPaid, balance: Math.max(0, roundMoney(inv - totalPaid)) };
}

/**
 * Set to `false` when the API returns real offer/refund fields and you no longer need sample rows.
 * Dummy data is only merged when the order has no real offer and/or no real refund.
 */
/** When `false`, Order information shows only API offer/refund fields (no sample rows). */
export const ORDER_PAYMENT_PREVIEW_DUMMY = false;

function hashOrderKey(order: OrderModel): number {
  const s = String(order._id || order.unique_id || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function hasRealOfferFields(order: OrderModel): boolean {
  return (
    orderOfferDiscountAmount(order) > 0 ||
    parseOrderMoneyField(order.total_offer_value as unknown) > 0 ||
    parseOrderMoneyField(order.admin_contribution as unknown) > 0 ||
    parseOrderMoneyField(order.partner_contribution as unknown) > 0
  );
}

function hasRealRefundFields(order: OrderModel): boolean {
  return orderRefundAmount(order) > 0;
}

/**
 * For UI preview only: adds sample offer and/or refund breakdown on some orders
 * when the API did not send any (deterministic by order id).
 */
export function applyOrderPaymentPreviewDummy(order: OrderModel): OrderModel {
  if (!ORDER_PAYMENT_PREVIEW_DUMMY) return order;

  const v = hashOrderKey(order) % 10;
  const wantOfferDummy = !hasRealOfferFields(order) && (v <= 2 || v === 6);
  const wantRefundDummy = !hasRealRefundFields(order) && v >= 3 && v <= 5;
  const wantBothDummy =
    !hasRealOfferFields(order) && !hasRealRefundFields(order) && v === 7;

  if (!wantOfferDummy && !wantRefundDummy && !wantBothDummy) return order;

  const next: OrderModel = { ...order };
  let touched = false;

  if (wantOfferDummy || wantBothDummy) {
    next.offer_id = next.offer_id?.toString().trim() || "PREVIEW-OFR";
    next.offer_name = next.offer_name?.trim() || "Sample offer (UI preview)";
    next.total_offer_value = next.total_offer_value ?? 500;
    next.admin_contribution = next.admin_contribution ?? 200;
    next.partner_contribution = next.partner_contribution ?? 300;
    /** Keep in sync with total split (200+300) so the main offer line matches the breakdown. */
    next.offer_discount_amount =
      next.offer_discount_amount ??
      (parseOrderMoneyField(next.total_offer_value as unknown) || 500);
    touched = true;
  }

  if (wantRefundDummy || wantBothDummy) {
    next.refund_amount = next.refund_amount ?? 1919;
    next.amount_from_admin_commission = next.amount_from_admin_commission ?? 38;
    next.amount_from_partner_wallet = next.amount_from_partner_wallet ?? 0;
    touched = true;
  }

  if (!touched) return order;

  (
    next as OrderModel & { __previewPaymentDummy?: boolean }
  ).__previewPaymentDummy = true;
  return next;
}

export type EditOrderFormValues = AddQuoteFormValues & {
  order_status: string;
  customer_payment_status: string;
  partner_payment_status: string;
  offer_id?: string;
};

function ymdChunk(isoish: string): string {
  const x = isoish.trim();
  if (!x) return "";
  if (x.length >= 10 && x[4] === "-") return x.slice(0, 10);
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return x;
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveFranchiseIdForOrderForm(selectedFranchiseId: string): string {
  const role = String(getLocalStorage(AppConstant.userRole) ?? "");
  const selected = str(selectedFranchiseId);
  if (
    role === UserRole.FRANCHISE_ADMIN ||
    role === UserRole.EMPLOYEE
  ) {
    return str(getLocalStorage(AppConstant.partnerId)) || selected;
  }
  return selected;
}

/** Franchise scope for edit-order catalog (`franchise_id` on row, partner, or session). */
export function resolveOrderEditFranchiseId(order: OrderModel): string {
  const rec = order as OrderModel & {
    franchise_id?: string;
    franchise_info?: { _id?: string };
  };
  const userRec = order.user_info as { franchise_id?: string } | undefined;
  const partnerRec = order.partner_info as { franchise_id?: string } | undefined;
  return (
    String(rec.franchise_id ?? "").trim() ||
    String(partnerRec?.franchise_id ?? "").trim() ||
    String(userRec?.franchise_id ?? "").trim() ||
    String(rec.franchise_info?._id ?? "").trim() ||
    resolveFranchiseIdForOrderForm("")
  );
}

/** Seed edit-all form from `GET /order/get/:id` row (primary service line). */
export function seedEditOrderFormFromRow(order: OrderModel): EditOrderFormValues {
  const primary = getPrimaryServiceItem(order);
  const orderRec = order as OrderModel & {
    franchise_id?: string;
    service_id?: string;
    service_price?: number;
    service_info?: { _id?: string };
  };
  const franchiseRaw = resolveOrderEditFranchiseId(order);
  const serviceId = String(
    primary?.service_id ??
      orderRec.service_id ??
      orderRec.service_info?._id ??
      ""
  ).trim();
  const partnerId = String(
    primary?.partner_id ?? order.partner_id ?? order.partner_info?._id ?? ""
  ).trim();
  const categoryId = String(
    order.category_id ?? primary?.category_id ?? order.category_info?._id ?? ""
  ).trim();
  const primaryCharge = (primary as OrderItemModel & { total_service_charge?: number })
    ?.total_service_charge;
  const priceRaw =
    primary?.service_price ??
    primaryCharge ??
    order.total_service_charge ??
    orderRec.service_price ??
    order.sub_total;
  const priceNum = Number(priceRaw);

  return {
    franchise_id: franchiseRaw,
    user_id: order.user_id,
    user_name: order.user_name ?? order.user_info?.name ?? "",
    requested_services: serviceId,
    requested_partner: partnerId,
    employee_id: String(order.created_by_id ?? "").trim(),
    category_id: categoryId,
    requested_date:
      normalizeOrderApiDateYmd(order.from_date) ||
      (primary?.service_date ? ymdChunk(primary.service_date) : "") ||
      normalizeOrderApiDateYmd(order.order_date),
    requested_date_to:
      normalizeOrderApiDateYmd(order.to_date) ||
      normalizeOrderApiDateYmd(order.from_date) ||
      "",
    requested_time: "",
    requested_time_from: workTimeToTimeStorage(primary?.service_from_time ?? ""),
    requested_time_to: workTimeToTimeStorage(primary?.service_to_time ?? ""),
    service_price:
      Number.isFinite(priceNum) && priceNum >= 0 ? String(priceNum) : "",
    user_description: String(order.customer_description ?? "").trim(),
    admin_description: String(order.order_description ?? "").trim(),
    order_status: String(order.order_status ?? 1),
    customer_payment_status: getCustomerPaymentStatusLabel(order),
    partner_payment_status: getPartnerPaymentStatusLabel(order),
    offer_id: String(
      order.offer_id ??
        (order as OrderModel & { order_offer_id?: string }).order_offer_id ??
        ""
    ).trim(),
  };
}

function orderUpdatePayloadValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || a === "") {
    return b == null || b === "";
  }
  if (b == null || b === "") return false;
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 0.009;
  }
  if (typeof a === "object" && typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a).trim() === String(b).trim();
}

function pickChangedServiceItemsBlock(
  next: unknown,
  baseline: unknown
): { update: Record<string, unknown>[] } | undefined {
  const nWrap = next as { update?: Record<string, unknown>[] } | undefined;
  const bWrap = baseline as { update?: Record<string, unknown>[] } | undefined;
  const n0 = nWrap?.update?.[0];
  if (!n0) return undefined;
  const b0 = bWrap?.update?.[0];
  const line: Record<string, unknown> = {};
  if (n0._id != null && String(n0._id).trim()) {
    line._id = n0._id;
  }
  for (const key of Object.keys(n0)) {
    if (key === "_id") continue;
    if (!orderUpdatePayloadValuesEqual(n0[key], b0?.[key])) {
      line[key] = n0[key];
    }
  }
  const changedKeys = Object.keys(line).filter((k) => k !== "_id");
  if (changedKeys.length === 0) return undefined;
  return { update: [line] };
}

/** True when payment editor state differs from the loaded order snapshot. */
export function orderPaymentExtensionChanged(
  current: OrderPaymentExtV1,
  baseline: OrderPaymentExtV1
): boolean {
  return (
    JSON.stringify(normalizePaymentExtForSubmit(current)) !==
    JSON.stringify(normalizePaymentExtForSubmit(baseline))
  );
}

/**
 * Keep only top-level (and service line) fields that changed vs the dialog open snapshot.
 * PUT `/order/update/:id` — partial body.
 */
export function pickChangedOrderEditAllUpdatePayload(
  next: Record<string, unknown>,
  baseline: Record<string, unknown>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const keys = Array.from(
    new Set([...Object.keys(next), ...Object.keys(baseline)])
  );

  for (const key of keys) {
    if (key === "service_items") continue;
    const n = next[key];
    const b = baseline[key];
    if (!orderUpdatePayloadValuesEqual(n, b)) {
      if (n !== undefined) patch[key] = n;
    }
  }

  const serviceItems = pickChangedServiceItemsBlock(
    next.service_items,
    baseline.service_items
  );
  if (serviceItems) patch.service_items = serviceItems;

  return patch;
}

/** PUT `/order/update/:id` body for edit-all (Help-PR Postman). */
export function buildOrderEditAllUpdatePayload(input: {
  order: OrderModel;
  form: EditOrderFormValues;
  scheduleMode: "single" | "range" | "hourly";
  servicePrice: number;
  addressLine: string;
  selectedAddressId: string;
  paymentExt?: OrderPaymentExtV1;
  invoiceTotal?: number;
}): Record<string, unknown> | null {
  const { order, form, scheduleMode, servicePrice, addressLine } = input;
  const primary = getPrimaryServiceItem(order);
  if (!primary) return null;

  const metrics = deriveOrderScheduleMetrics({
    scheduleMode,
    requested_date: form.requested_date,
    requested_date_to: form.requested_date_to,
    requested_time: form.requested_time,
    requested_time_from: form.requested_time_from,
    requested_time_to: form.requested_time_to,
  });
  if (!metrics) return null;

  const categoryId = String(form.category_id ?? "").trim();
  const serviceId = String(form.requested_services ?? "").trim();
  const partnerId = String(form.requested_partner ?? "").trim();
  const employeeId = String(form.employee_id ?? "").trim();
  const statusSlug =
    orderStatusToApiSlug(form.order_status) ??
    orderStatusToApiSlug(order.order_status) ??
    "in-progress";

  const customerPaySlug = normalizeCustomerPaymentStatusSlug(
    getCustomerPaymentStatusLabel(order)
  );
  const partnerPaySlug = normalizePartnerPaymentStatusSlug(
    getPartnerPaymentStatusLabel(order)
  );
  const offerId = String(form.offer_id ?? order.offer_id ?? "").trim();

  const serviceDateIso = scheduleStorageToIso(
    form.requested_date,
    form.requested_time_from
  );
  const fromIso = scheduleStorageToIso(
    form.requested_date,
    form.requested_time_from
  );
  const toIso = scheduleStorageToIso(form.requested_date, form.requested_time_to);

  const lineUpdate: Record<string, unknown> = {
    partner_id: partnerId,
    service_date: serviceDateIso || form.requested_date,
    service_from_time: fromIso,
    service_to_time: toIso,
    total_service_charge: servicePrice,
  };
  if (primary._id) lineUpdate._id = primary._id;

  const userId = String(form.user_id ?? "").trim();
  const payload: Record<string, unknown> = {
    partner_id: partnerId,
    employee_id: employeeId || order.created_by_id || null,
    category_id: categoryId,
    service_id: serviceId,
    address: addressLine || order.address,
    customer_description:
      String(form.user_description ?? "").trim() || undefined,
    order_description:
      String(form.admin_description ?? "").trim() || undefined,
    order_status: statusSlug,
    total_service_charge: servicePrice,
    service_items: { update: [lineUpdate] },
  };
  applyOrderScheduleMetricsToBody(payload, metrics);

  if (userId) payload.user_id = userId;
  if (customerPaySlug) payload.customer_payment_status = customerPaySlug;
  if (partnerPaySlug) payload.partner_payment_status = partnerPaySlug;
  if (offerId) payload.offer_id = offerId;

  if (input.selectedAddressId.trim()) {
    payload.address_id = input.selectedAddressId.trim();
  }

  if (input.paymentExt) {
    const charge = input.paymentExt.serviceAmount;
    applyOrderPaymentFieldsToUpdatePayload(payload, {
      order,
      ext: input.paymentExt,
      totalServiceCharge: charge,
    });
  } else {
    const payMeta = deriveOrderCustomerPaymentFields(
      undefined,
      input.invoiceTotal ?? servicePrice
    );
    payload.is_paid = payMeta.is_paid;
    payload.customer_payment_method = payMeta.customer_payment_method;
    payload.customer_payment_status = payMeta.customer_payment_status;
  }

  return payload;
}

export function orderEditAllAddressLine(
  rows: QuoteAddressRowUi[],
  selectedAddressId: string,
  fallback: string
): string {
  const row = rows.find((r) => r.id === selectedAddressId);
  if (row) return formatQuoteAddressRowAsServiceLine(row);
  return fallback;
}
