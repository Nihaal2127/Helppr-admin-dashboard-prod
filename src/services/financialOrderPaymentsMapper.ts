import type { FinancialModel } from "../lib/models/FinancialModel";
import {
  normalizeCustomerPaymentStatusSlug,
  normalizePartnerPaymentStatusSlug,
} from "../lib/financial/paymentStatus";

function str(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "undefined" || s === "null" ? "" : s;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n =
    typeof v === "string"
      ? parseFloat(String(v).replace(/,/g, "").trim())
      : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

/**
 * Maps `GET /api/order/financial-payments/*` rows to `FinancialModel` for the grid.
 * @see Help-PR-All-APIs.postman_collection.json → 23A — Financial order payments
 */
export function mapFinancialPaymentRecord(
  raw: Record<string, unknown>
): FinancialModel {
  const mongoId = str(raw._id ?? raw.order_mongo_id);
  const orderId = str(raw.order_id ?? raw._id ?? mongoId);
  const totalAmount = num(raw.total_amount ?? raw.total_price);
  const customerPaid = num(
    raw.customer_paid_amount ?? raw.customer_paid ?? raw.user_paid_amount
  );
  const customerPending = num(
    raw.customer_pending_amount ?? raw.customer_pending ?? raw.user_pending_amount
  );
  const partnerPaid = num(
    raw.paid_to_partner ?? raw.partner_paid_amount ?? raw.partner_paid
  );
  const partnerPending = num(
    raw.pending_to_partner ?? raw.partner_pending_amount ?? raw.partner_pending
  );
  const partnerTotal = num(
    raw.total_partner_amount ??
      raw.total_service_amount ??
      raw.partner_total_amount ??
      raw.service_amount ??
      raw.service_price
  );

  const customerStatusRaw = str(
    raw.customer_payment_status ?? raw.user_payment_status
  );
  const partnerStatusRaw = str(raw.partner_payment_status);
  const customerStatus =
    normalizeCustomerPaymentStatusSlug(customerStatusRaw) ||
    customerStatusRaw;
  const partnerStatus =
    normalizePartnerPaymentStatusSlug(partnerStatusRaw) || partnerStatusRaw;
  const partnerInfo =
    raw.partner_info != null && typeof raw.partner_info === "object"
      ? (raw.partner_info as Record<string, unknown>)
      : null;
  const partnerMongoId = str(
    raw.partner_mongo_id ??
      raw.partner_user_mongo_id ??
      partnerInfo?._id
  );

  return {
    ...(raw as unknown as FinancialModel),
    _id: mongoId || orderId,
    order_id: orderId || mongoId,
    order_unique_id: str(raw.order_unique_id ?? raw.unique_id) || null,
    user_id: str(raw.user_id) || null,
    user_unique_id: str(raw.user_unique_id) || null,
    user_name: str(raw.user_name ?? raw.customer_name) || null,
    partner_id: str(raw.partner_id) || null,
    partner_mongo_id: partnerMongoId || null,
    partner_unique_id: str(raw.partner_unique_id) || null,
    partner_name: str(raw.partner_name) || null,
    category_id: str(raw.category_id) || null,
    category_name: str(raw.category_name) || null,
    service_id: str(raw.service_id) || null,
    service_name: str(raw.service_name) || null,
    service_date: str(raw.service_date ?? raw.order_date) || null,
    service_from_time: str(raw.service_from_time) || null,
    service_to_time: str(raw.service_to_time) || null,
    order_status: str(raw.order_status) || null,
    service_status: num(raw.service_status),
    customer_payment_status: customerStatus || null,
    partner_payment_status: partnerStatus || null,
    total_price: totalAmount,
    total_amount: totalAmount,
    sub_total: num(raw.sub_total ?? raw.total_service_charge),
    tax: num(raw.tax),
    service_price: num(raw.service_price ?? partnerTotal),
    total_service_amount: partnerTotal,
    customer_paid_amount: customerPaid,
    customer_pending_amount: customerPending,
    paid_to_partner: partnerPaid,
    pending_to_partner: partnerPending,
    commission_percentage:
      raw.commission_percentage != null
        ? num(raw.commission_percentage)
        : raw.commission_percent != null
          ? num(raw.commission_percent)
          : null,
    commission_percent:
      raw.commission_percent != null ? num(raw.commission_percent) : null,
    commission_amount:
      raw.commission_amount != null ? num(raw.commission_amount) : null,
    tax_percentage:
      raw.tax_percentage != null
        ? num(raw.tax_percentage)
        : raw.tax_percent != null
          ? num(raw.tax_percent)
          : null,
    tax_percent: raw.tax_percent != null ? num(raw.tax_percent) : null,
    tax_amount: raw.tax_amount != null ? num(raw.tax_amount) : null,
    is_paid: bool(raw.is_paid) || customerStatus === "paid",
    partner_earning: num(raw.partner_earning),
    admin_earning: num(raw.admin_earning),
    payment_mode_id: num(raw.payment_mode_id),
    cancellation_reasone: str(raw.cancellation_reasone) || null,
    rating: num(raw.rating),
    deleted_at: str(raw.deleted_at) || null,
    created_at: str(raw.created_at) || null,
    updated_at: str(raw.updated_at) || null,
  };
}

export function mapFinancialPaymentRecords(
  rows: unknown[]
): FinancialModel[] {
  return rows
    .filter((r) => r != null && typeof r === "object" && !Array.isArray(r))
    .map((r) => mapFinancialPaymentRecord(r as Record<string, unknown>));
}
