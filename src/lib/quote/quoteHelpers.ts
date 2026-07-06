/**
 * Quote UI helpers: view mapping, franchise pins, addresses, schedule, pricing.
 * Address pure helpers live in quoteAddressCore (quoteService imports that file directly).
 */
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AddQuoteFormValues, QuoteRow, QuoteTabKey } from "../types/quoteTypes";
import { AppConstant } from "../global/AppConstant";
import { formatCurrency, roundMoney } from "../global/paymentAndCurrency";
import { extractMinDepositTypeKey } from "../service/serviceMinDepositDisplay";
import type { ServiceDropDownOption } from "../../services/servicesService";
import {
  buildAddressLocationLookupsFromCustomers,
  displayStateName,
  formatQuoteServiceAddressLines,
  normalizePincodeDigits,
  parseCatalogAddressRecord,
} from "./quoteAddressCore";
import type {
  QuoteAddressFieldFallback,
  QuoteAddressRowUi,
} from "./quoteAddressCore";
import type { FranchiseRelatedCatalogRecord } from "../../services/quoteService";

/** --- Price breakdown --- */

export type QuotePriceBreakdown = {
  base: number;
  commissionPct: number;
  commissionAmount: number;
  subtotalBeforeTax: number;
  taxPct: number;
  taxAmount: number;
  grandTotal: number;
  minDepositTitle: string;
  minDepositAmount: number;
  minDepositNote: string;
};

/** Coupon / offer row from `GET /offer/getAll` (or settings OfferModel). */
export type QuoteCouponInput = {
  type: "percentage" | "fixed";
  /** For `fixed`, total rupee discount split by contributions; for `percentage`, unused for split bases. */
  value: number;
  /** % or rupee share — applied on admin commission amount. */
  adminContribution: number;
  /** % or rupee share — applied on service price. */
  partnerContribution: number;
};

export type QuotePriceBreakdownCouponLines = {
  partnerDiscountOnService: number;
  adminDiscountOnCommission: number;
  serviceAfterCoupon: number;
  commissionAfterCoupon: number;
};

export type QuotePriceBreakdownWithCoupon = QuotePriceBreakdown &
  QuotePriceBreakdownCouponLines & {
    hasCoupon: boolean;
    totalCouponDiscount: number;
  };

export function mapOfferModelToCouponInput(offer: {
  offerType: "percentage" | "fixed";
  totalOfferValue: number;
  adminContribution: number;
  partnerContribution: number;
}): QuoteCouponInput {
  return {
    type: offer.offerType,
    value: Number(offer.totalOfferValue) || 0,
    adminContribution: Number(offer.adminContribution) || 0,
    partnerContribution: Number(offer.partnerContribution) || 0,
  };
}

export type CouponDisplayMeta = {
  type: "percentage" | "fixed";
  partnerContribution: number;
  adminContribution: number;
  totalOfferValue?: number;
};

export type CouponApplicationValidation = {
  valid: boolean;
  reason?: string;
};

/** Human-readable coupon share for breakdown labels (fixed = rupees, percentage = %). */
export function formatCouponContributionLabel(
  type: "percentage" | "fixed",
  contribution: number,
  base: "service" | "commission"
): string {
  const n = Number(contribution) || 0;
  if (type === "percentage") {
    return `${n}${AppConstant.percentageSymbol} on ${base}`;
  }
  return `${formatQuoteRupees(n)} off ${base}`;
}

/**
 * Validates coupon against current service price breakdown before apply.
 * Fixed: partner/admin contribution amounts must not exceed service / commission.
 * Percentage: each share must be 0–100%.
 */
export function validateCouponForPriceBreakdown(
  breakdown: QuotePriceBreakdown,
  coupon: QuoteCouponInput | null | undefined
): CouponApplicationValidation {
  if (!coupon) return { valid: true };

  const service = breakdown.base;
  const commission = breakdown.commissionAmount;

  if (!Number.isFinite(service) || service <= 0.009) {
    return {
      valid: false,
      reason: "Enter a service price before applying a coupon.",
    };
  }

  if (coupon.type === "percentage") {
    const partnerPct = Math.max(0, Number(coupon.partnerContribution) || 0);
    const adminPct = Math.max(0, Number(coupon.adminContribution) || 0);
    if (partnerPct > 100.009) {
      return {
        valid: false,
        reason: `Partner coupon cannot exceed 100% of service price (configured: ${partnerPct}%).`,
      };
    }
    if (adminPct > 100.009) {
      return {
        valid: false,
        reason: `Admin coupon cannot exceed 100% of commission (configured: ${adminPct}%).`,
      };
    }
    if (adminPct > 0.009 && commission <= 0.009) {
      return {
        valid: false,
        reason:
          "This coupon reduces admin commission, but commission is zero for the selected service.",
      };
    }
    return { valid: true };
  }

  const partnerAmt = Math.max(0, Number(coupon.partnerContribution) || 0);
  const adminAmt = Math.max(0, Number(coupon.adminContribution) || 0);

  if (partnerAmt > service + 0.009) {
    return {
      valid: false,
      reason: `Partner coupon (${formatQuoteRupees(partnerAmt)}) cannot exceed service price (${formatQuoteRupees(service)}).`,
    };
  }
  if (adminAmt > 0.009 && commission <= 0.009) {
    return {
      valid: false,
      reason:
        "This coupon reduces admin commission, but commission is zero for the selected service.",
    };
  }
  if (adminAmt > commission + 0.009) {
    return {
      valid: false,
      reason: `Admin coupon (${formatQuoteRupees(adminAmt)}) cannot exceed admin commission (${formatQuoteRupees(commission)}).`,
    };
  }

  const totalOffer = Math.max(0, Number(coupon.value) || 0);
  const parts = partnerAmt + adminAmt;
  if (totalOffer > 0.009 && parts > totalOffer + 0.009) {
    return {
      valid: false,
      reason: `Partner and admin coupon parts (${formatQuoteRupees(parts)}) exceed total offer value (${formatQuoteRupees(totalOffer)}).`,
    };
  }

  return { valid: true };
}

function recalcMinDeposit(
  grandTotal: number,
  opt: ServiceDropDownOption | undefined
): Pick<
  QuotePriceBreakdown,
  "minDepositTitle" | "minDepositAmount" | "minDepositNote"
> {
  const typeKey = extractMinDepositTypeKey(
    String(opt?.min_deposit_type ?? opt?.payment_type ?? "")
  );
  let minDepositAmount = 0;
  let minDepositTitle = "Minimum deposit";
  let minDepositNote = "";

  if (typeKey === "per_consultancy") {
    const flat = Number(opt?.min_deposit_value ?? opt?.minimum_deposit ?? 0);
    minDepositAmount = Number.isFinite(flat) ? roundQuoteMoney(flat) : 0;
    minDepositNote = "(fixed amount for this billing type)";
  } else {
    let pct =
      Number(opt?.min_deposit_value ?? opt?.minimum_deposit ?? NaN) || 0;
    if (!Number.isFinite(pct) || pct <= 0) {
      const rawType = String(opt?.min_deposit_type ?? opt?.payment_type ?? "");
      const m = rawType.match(/\(\s*([\d.]+)\s*%?\s*\)/);
      if (m) pct = Number(m[1]) || 0;
    }
    pct = Math.max(0, pct);
    minDepositAmount = roundQuoteMoney(grandTotal * (pct / 100));
    minDepositNote =
      pct > 0
        ? `(${pct}${AppConstant.percentageSymbol} of total incl. tax)`
        : "";
  }

  return { minDepositTitle, minDepositAmount, minDepositNote };
}

/**
 * Partner contribution reduces service price; admin contribution reduces commission;
 * tax is calculated on the post-coupon subtotal (service + commission).
 */
export function applyCouponToQuotePriceBreakdown(
  breakdown: QuotePriceBreakdown,
  coupon: QuoteCouponInput | null | undefined,
  feeOpt?: ServiceDropDownOption
): QuotePriceBreakdownWithCoupon {
  const emptyCoupon: QuotePriceBreakdownCouponLines = {
    partnerDiscountOnService: 0,
    adminDiscountOnCommission: 0,
    serviceAfterCoupon: breakdown.base,
    commissionAfterCoupon: breakdown.commissionAmount,
  };

  if (!coupon) {
    return {
      ...breakdown,
      ...emptyCoupon,
      hasCoupon: false,
      totalCouponDiscount: 0,
    };
  }

  let partnerDiscountOnService = 0;
  let adminDiscountOnCommission = 0;

  if (coupon.type === "percentage") {
    const partnerPct = Math.max(0, Number(coupon.partnerContribution) || 0);
    const adminPct = Math.max(0, Number(coupon.adminContribution) || 0);
    partnerDiscountOnService = roundQuoteMoney(
      breakdown.base * (partnerPct / 100)
    );
    adminDiscountOnCommission = roundQuoteMoney(
      breakdown.commissionAmount * (adminPct / 100)
    );
  } else {
    const total = Math.max(0, Number(coupon.value) || 0);
    const adminPart = Math.max(0, Number(coupon.adminContribution) || 0);
    const partnerPart = Math.max(0, Number(coupon.partnerContribution) || 0);
    const parts = adminPart + partnerPart;
    if (parts > 0.009) {
      partnerDiscountOnService = roundQuoteMoney(
        Math.min(total * (partnerPart / parts), breakdown.base)
      );
      adminDiscountOnCommission = roundQuoteMoney(
        Math.min(total * (adminPart / parts), breakdown.commissionAmount)
      );
    } else {
      partnerDiscountOnService = roundQuoteMoney(
        Math.min(total / 2, breakdown.base)
      );
      adminDiscountOnCommission = roundQuoteMoney(
        Math.min(total / 2, breakdown.commissionAmount)
      );
    }
  }

  const serviceAfterCoupon = roundQuoteMoney(
    Math.max(0, breakdown.base - partnerDiscountOnService)
  );
  const commissionAfterCoupon = roundQuoteMoney(
    Math.max(0, breakdown.commissionAmount - adminDiscountOnCommission)
  );
  const subtotalBeforeTax = roundQuoteMoney(
    serviceAfterCoupon + commissionAfterCoupon
  );
  const taxAmount = roundQuoteMoney(
    subtotalBeforeTax * (breakdown.taxPct / 100)
  );
  const grandTotal = roundQuoteMoney(subtotalBeforeTax + taxAmount);
  const minDeposit = recalcMinDeposit(grandTotal, feeOpt);
  const totalCouponDiscount = roundQuoteMoney(
    partnerDiscountOnService + adminDiscountOnCommission
  );

  return {
    ...breakdown,
    ...minDeposit,
    commissionAmount: breakdown.commissionAmount,
    subtotalBeforeTax,
    taxAmount,
    grandTotal,
    partnerDiscountOnService,
    adminDiscountOnCommission,
    serviceAfterCoupon,
    commissionAfterCoupon,
    hasCoupon: totalCouponDiscount > 0.009,
    totalCouponDiscount,
  };
}

export function roundQuoteMoney(n: number): number {
  return roundMoney(n);
}

export function formatQuoteRupees(amount: number): string {
  return formatCurrency(amount);
}

export function computeQuotePriceBreakdown(
  servicePrice: string | number | undefined | null,
  opt: ServiceDropDownOption | undefined
): QuotePriceBreakdown | null {
  const base = Number.parseFloat(String(servicePrice ?? "").trim());
  if (!Number.isFinite(base) || base < 0) return null;
  const taxPct = Math.max(0, Number(opt?.tax ?? 0) || 0);
  const commissionPct = Math.max(0, Number(opt?.commission ?? 0) || 0);
  const commissionAmount = roundQuoteMoney(base * (commissionPct / 100));
  const subtotalBeforeTax = roundQuoteMoney(base + commissionAmount);
  const taxAmount = roundQuoteMoney(subtotalBeforeTax * (taxPct / 100));
  const grandTotal = roundQuoteMoney(subtotalBeforeTax + taxAmount);

  const minDeposit = recalcMinDeposit(grandTotal, opt);

  return {
    base,
    commissionPct,
    commissionAmount,
    subtotalBeforeTax,
    taxPct,
    taxAmount,
    grandTotal,
    ...minDeposit,
  };
}

export type QuoteRowPriceFields = Pick<
  QuoteRow,
  | "total_service_charge"
  | "service_price"
  | "commission_percent"
  | "commission_amount"
  | "tax_percent"
  | "tax_amount"
  | "sub_total"
  | "total_price"
  | "minimum_deposit_percent"
  | "minimum_deposit_amount"
>;

/** True when GET quote returned server-computed totals (`total_price`). */
export function quoteHasApiPriceBreakdown(
  row: Partial<QuoteRowPriceFields>
): boolean {
  return (
    row.total_price != null && Number.isFinite(Number(row.total_price))
  );
}

/** Map API quote price fields → amount breakdown panel (view / list). */
export function quotePriceBreakdownFromRow(
  row: Partial<QuoteRowPriceFields>
): QuotePriceBreakdown | null {
  if (!quoteHasApiPriceBreakdown(row)) return null;

  const base = Number(
    row.total_service_charge ?? row.service_price ?? 0
  );
  const commissionAmount = Number(row.commission_amount ?? 0);
  const commissionPct = Number(row.commission_percent ?? 0);
  const subtotalBeforeTax = Number(
    row.sub_total ??
      roundQuoteMoney(
        (Number.isFinite(base) ? base : 0) +
          (Number.isFinite(commissionAmount) ? commissionAmount : 0)
      )
  );
  const taxAmount = Number(row.tax_amount ?? 0);
  const taxPct = Number(row.tax_percent ?? 0);
  const grandTotal = Number(row.total_price ?? 0);
  const minPct = row.minimum_deposit_percent;
  const minAmt = row.minimum_deposit_amount;
  const sym = AppConstant.percentageSymbol;

  let minDepositTitle = "Minimum deposit";
  let minDepositNote = "";
  if (minPct != null && Number.isFinite(minPct) && minPct > 0) {
    minDepositNote = `(${minPct}${sym} of total)`;
  }

  return {
    base: Number.isFinite(base) ? base : 0,
    commissionPct: Number.isFinite(commissionPct) ? commissionPct : 0,
    commissionAmount: Number.isFinite(commissionAmount)
      ? commissionAmount
      : 0,
    subtotalBeforeTax: Number.isFinite(subtotalBeforeTax)
      ? subtotalBeforeTax
      : 0,
    taxPct: Number.isFinite(taxPct) ? taxPct : 0,
    taxAmount: Number.isFinite(taxAmount) ? taxAmount : 0,
    grandTotal: Number.isFinite(grandTotal) ? grandTotal : 0,
    minDepositTitle,
    minDepositAmount:
      minAmt != null && Number.isFinite(minAmt) ? minAmt : 0,
    minDepositNote,
  };
}

/** --- View --- */

/** Shared quote view shape (modal + list mapping). */
export type QuoteViewData = {
  /** Quote document Mongo id (used on quote API paths as the path segment id). */
  _id?: string;
  quote_id: string;
  status: string;
  requested_services: string;
  requested_partner: string;
  user_name: string;
  user_id?: string;
  phone_number?: string;
  user_email?: string;
  user_city?: string;
  profile_url?: string | null;
  partner_profile_url?: string | null;
  employee_profile_url?: string | null;
  category_id?: string;
  category_name?: string;
  requested_date: string;
  requested_time: string;
  from_date?: string;
  to_date?: string;
  work_start_time?: string;
  work_end_time?: string;
  work_hours_per_day?: number;
  total_work_hours?: number;
  door_no: string;
  street: string;
  city: string;
  area?: string;
  landmark?: string;
  state?: string;
  address_line?: string;
  pincode?: string;
  service_id?: string;
  partner_id?: string;
  /** Accepted (and similar) quote view */
  partner_name?: string;
  partner_user_id?: string;
  partner_phone?: string;
  partner_city?: string;
  partner_email?: string;
  franchise_id?: string;
  franchise_name?: string;
  franchise_state_name?: string;
  franchise_city_name?: string;
  address_id?: string;
  /** Employee shown in quote view */
  employee_id?: string;
  employee_name?: string;
  employee_phone?: string;
  employee_email?: string;
  total_service_charge?: number;
  service_price?: number;
  commission_percent?: number;
  commission_amount?: number;
  tax_percent?: number;
  tax_amount?: number;
  sub_total?: number;
  total_price?: number;
  minimum_deposit_percent?: number;
  minimum_deposit_amount?: number;
  scheduled_date?: string;
  scheduled_time_from?: string;
  scheduled_time_to?: string;
  /** Success (completed order) quote view */
  order_id?: string;
  order_status?: string;
  services_summary?: string;
  final_price?: number;
  payment_method?: string;
  payment_status?: string;
  payment_reference?: string;
  payment_date?: string;
  description?: string;
  admin_description?: string;
  cancellation_reason?: string;
  rejection_reason?: string;
};

export type QuoteServiceAddressDisplay = {
  state: string;
  city: string;
  area: string;
  pincode: string;
  addressLine: string;
};

/** Structured service address for quote view (matches order info layout). */
export function getQuoteServiceAddressDisplay(
  q?: Pick<
    QuoteViewData,
    "state" | "city" | "area" | "pincode" | "address_line" | "street"
  >
): QuoteServiceAddressDisplay {
  const dash = "-";
  if (!q) {
    return {
      state: dash,
      city: dash,
      area: dash,
      pincode: dash,
      addressLine: dash,
    };
  }
  return {
    state: displayStateName(q.state ?? "") || dash,
    city: String(q.city ?? "").trim() || dash,
    area: String(q.area ?? "").trim() || dash,
    pincode: String(q.pincode ?? "").trim() || dash,
    addressLine:
      String(q.address_line ?? "").trim() ||
      String(q.street ?? "").trim() ||
      dash,
  };
}

/** Section headings in quote view (Quote details, Customer, Amount breakdown, etc.). */
export const QUOTE_SECTION_TITLE_CLASS = "quote-section-title fw-bold mb-3";

/** Shared width (1040px) + 90vh cap with scrollable body for quote add / edit / view modals. */
export const QUOTE_MODAL_LAYOUT = {
  centered: true,
  size: "xl" as const,
  scrollable: true,
  dialogClassName: "add-quote-modal-dialog modal-vh-90",
  contentClassName: "add-quote-modal-content",
} as const;

/** Calendar date `YYYY-MM-DD` for quote / order schedule fields. */
export function toIsoCalendarDate(date: Date | null): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfTodayLocal(): Date {
  return startOfLocalDay(new Date());
}

export function parseIsoDateOnly(iso: string): Date | null {
  const t = String(iso ?? "").trim();
  if (!t) return null;
  const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (!y || !m || !day) return null;
    const d = new Date(y, m - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse `YYYY-MM-DD` for react-datepicker without UTC day shift. */
export function isoCalendarDateToPickerDate(
  iso: string | null | undefined
): Date | null {
  return parseIsoDateOnly(String(iso ?? "").trim());
}

export function isCalendarDateNotBeforeToday(iso: string): boolean {
  const d = parseIsoDateOnly(iso);
  if (!d) return false;
  return startOfLocalDay(d) >= startOfTodayLocal();
}

export function compareIsoDateOnlyAsc(aIso: string, bIso: string): number | null {
  const a = parseIsoDateOnly(aIso);
  const b = parseIsoDateOnly(bIso);
  if (!a || !b) return null;
  return startOfLocalDay(a).getTime() - startOfLocalDay(b).getTime();
}

export function minutesFromScheduleTimeStorage(st: string): number | null {
  const t = String(st ?? "").trim();
  if (!t) return null;
  const m = t.match(/T(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

export function isScheduleEndAfterStartSameDay(
  start: string,
  end: string
): boolean {
  const a = minutesFromScheduleTimeStorage(start);
  const b = minutesFromScheduleTimeStorage(end);
  if (a == null || b == null) return false;
  return b > a;
}

export const quoteScheduleTimePickerAllowAllHours = (): boolean => true;

/** Minute step for schedule start/end time pickers (any minute selectable). */
export const SCHEDULE_TIME_PICKER_INTERVAL_MINUTES = 1;

/** Parse stored schedule time (`2000-01-01T09:30:00`) for react-datepicker without timezone drift. */
export function scheduleTimeStorageToPickerDate(
  storage: string | null | undefined
): Date | null {
  const mins = minutesFromScheduleTimeStorage(String(storage ?? ""));
  if (mins == null) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMinutes(mins);
  return d;
}

/** Earliest selectable end time on the same day (one minute after start). */
export function scheduleEndTimeMinAfterStart(
  startStorage: string
): Date | undefined {
  const startM = minutesFromScheduleTimeStorage(startStorage);
  if (startM == null) return undefined;
  const minM = Math.min(startM + 1, 23 * 60 + 59);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minM);
  return d;
}

export function scheduleEndTimeMaxForDay(): Date {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d;
}

/** End time must be later than start on the same day. */
export function scheduleEndTimeSelectable(
  time: Date,
  startStorage: string
): boolean {
  const startM = minutesFromScheduleTimeStorage(startStorage);
  if (startM == null) return true;
  const cand = time.getHours() * 60 + time.getMinutes();
  return cand > startM;
}

function coalesceText(fresh?: string, keep?: string): string {
  const next = String(fresh ?? "").trim();
  if (next) return next;
  return String(keep ?? "").trim();
}

/** Keep list / prior view values when a detail fetch returns sparse fields. */
export function mergeQuoteViewData(
  fresh: QuoteViewData,
  keep: QuoteViewData
): QuoteViewData {
  const merged: QuoteViewData = { ...keep, ...fresh };
  return {
    ...merged,
    quote_id: coalesceText(fresh.quote_id, keep.quote_id) || merged.quote_id,
    status: coalesceText(fresh.status, keep.status) || merged.status,
    requested_services: coalesceText(
      fresh.requested_services,
      keep.requested_services
    ),
    services_summary:
      coalesceText(fresh.services_summary, keep.services_summary) || undefined,
    requested_partner: coalesceText(
      fresh.requested_partner,
      keep.requested_partner
    ),
    category_name: coalesceText(fresh.category_name, keep.category_name) || undefined,
    description: coalesceText(fresh.description, keep.description) || undefined,
    admin_description:
      coalesceText(fresh.admin_description, keep.admin_description) || undefined,
    requested_date: coalesceText(fresh.requested_date, keep.requested_date),
    requested_time: coalesceText(fresh.requested_time, keep.requested_time),
    from_date: coalesceText(fresh.from_date, keep.from_date) || undefined,
    to_date: coalesceText(fresh.to_date, keep.to_date) || undefined,
    work_start_time:
      coalesceText(fresh.work_start_time, keep.work_start_time) || undefined,
    work_end_time:
      coalesceText(fresh.work_end_time, keep.work_end_time) || undefined,
    scheduled_date:
      coalesceText(fresh.scheduled_date, keep.scheduled_date) || undefined,
    scheduled_time_from:
      coalesceText(fresh.scheduled_time_from, keep.scheduled_time_from) ||
      undefined,
    scheduled_time_to:
      coalesceText(fresh.scheduled_time_to, keep.scheduled_time_to) || undefined,
    user_name: coalesceText(fresh.user_name, keep.user_name),
    user_email: coalesceText(fresh.user_email, keep.user_email) || undefined,
    phone_number: coalesceText(fresh.phone_number, keep.phone_number) || undefined,
    partner_name: coalesceText(fresh.partner_name, keep.partner_name) || undefined,
    partner_email:
      coalesceText(fresh.partner_email, keep.partner_email) || undefined,
    partner_phone:
      coalesceText(fresh.partner_phone, keep.partner_phone) || undefined,
    partner_city: coalesceText(fresh.partner_city, keep.partner_city) || undefined,
    franchise_name:
      coalesceText(fresh.franchise_name, keep.franchise_name) || undefined,
    employee_name:
      coalesceText(fresh.employee_name, keep.employee_name) || undefined,
    employee_email:
      coalesceText(fresh.employee_email, keep.employee_email) || undefined,
    employee_phone:
      coalesceText(fresh.employee_phone, keep.employee_phone) || undefined,
    city: coalesceText(fresh.city, keep.city),
    area: coalesceText(fresh.area, keep.area) || undefined,
    state: coalesceText(fresh.state, keep.state) || undefined,
    pincode: coalesceText(fresh.pincode, keep.pincode) || undefined,
    address_line:
      coalesceText(fresh.address_line, keep.address_line) ||
      coalesceText(fresh.street, keep.street) ||
      undefined,
    street: coalesceText(fresh.street, keep.street),
    total_service_charge:
      fresh.total_service_charge != null &&
      Number.isFinite(fresh.total_service_charge)
        ? fresh.total_service_charge
        : keep.total_service_charge,
    service_price:
      fresh.service_price != null && Number.isFinite(fresh.service_price)
        ? fresh.service_price
        : keep.service_price,
    commission_percent:
      fresh.commission_percent != null &&
      Number.isFinite(fresh.commission_percent)
        ? fresh.commission_percent
        : keep.commission_percent,
    commission_amount:
      fresh.commission_amount != null &&
      Number.isFinite(fresh.commission_amount)
        ? fresh.commission_amount
        : keep.commission_amount,
    tax_percent:
      fresh.tax_percent != null && Number.isFinite(fresh.tax_percent)
        ? fresh.tax_percent
        : keep.tax_percent,
    tax_amount:
      fresh.tax_amount != null && Number.isFinite(fresh.tax_amount)
        ? fresh.tax_amount
        : keep.tax_amount,
    sub_total:
      fresh.sub_total != null && Number.isFinite(fresh.sub_total)
        ? fresh.sub_total
        : keep.sub_total,
    total_price:
      fresh.total_price != null && Number.isFinite(fresh.total_price)
        ? fresh.total_price
        : keep.total_price,
    minimum_deposit_percent:
      fresh.minimum_deposit_percent != null &&
      Number.isFinite(fresh.minimum_deposit_percent)
        ? fresh.minimum_deposit_percent
        : keep.minimum_deposit_percent,
    minimum_deposit_amount:
      fresh.minimum_deposit_amount != null &&
      Number.isFinite(fresh.minimum_deposit_amount)
        ? fresh.minimum_deposit_amount
        : keep.minimum_deposit_amount,
    final_price:
      fresh.final_price != null && Number.isFinite(fresh.final_price)
        ? fresh.final_price
        : fresh.total_price != null && Number.isFinite(fresh.total_price)
          ? fresh.total_price
          : keep.final_price,
  };
}

export function toQuoteViewData(row: QuoteRow): QuoteViewData {
  return {
    _id: row._id,
    quote_id: row.quote_id,
    status: row.status,
    requested_services: row.requested_services,
    requested_partner: row.requested_partner,
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    employee_phone: row.employee_phone,
    employee_email: row.employee_email,
    user_name: row.user_name,
    user_id: row.user_id,
    phone_number: row.phone_number,
    user_email: row.user_email,
    user_city: row.user_city ?? row.city,
    profile_url: row.profile_url,
    partner_profile_url: row.partner_profile_url,
    employee_profile_url: row.employee_profile_url,
    category_id: row.category_id,
    category_name: row.category_name,
    requested_date: row.requested_date,
    requested_time: row.requested_time,
    from_date: row.from_date,
    to_date: row.to_date,
    work_start_time: row.work_start_time,
    work_end_time: row.work_end_time,
    work_hours_per_day: row.work_hours_per_day,
    total_work_hours: row.total_work_hours,
    door_no: row.door_no,
    street: row.street,
    city: row.city,
    area: row.area,
    landmark: row.landmark,
    state: row.state,
    address_line: row.address_line,
    pincode: row.pincode,
    service_id: row.service_id,
    partner_id: row.partner_id,
    partner_name: row.partner_name,
    partner_user_id: row.partner_user_id,
    partner_phone: row.partner_phone,
    partner_city: row.partner_city,
    partner_email: row.partner_email,
    franchise_id: row.franchise_id,
    franchise_name: row.franchise_name,
    franchise_state_name: row.franchise_state_name,
    franchise_city_name: row.franchise_city_name,
    address_id: row.address_id,
    total_service_charge: row.total_service_charge,
    service_price: row.service_price,
    commission_percent: row.commission_percent,
    commission_amount: row.commission_amount,
    tax_percent: row.tax_percent,
    tax_amount: row.tax_amount,
    sub_total: row.sub_total,
    total_price: row.total_price,
    minimum_deposit_percent: row.minimum_deposit_percent,
    minimum_deposit_amount: row.minimum_deposit_amount,
    final_price: row.total_price ?? row.service_price,
    scheduled_date: row.scheduled_date,
    scheduled_time_from: row.service_from_time,
    scheduled_time_to: row.service_to_time,
    order_id: row.order_id,
    order_status: row.order_status,
    services_summary: row.services ?? row.requested_services,
    payment_method: row.payment_method,
    payment_status: row.payment_status,
    payment_reference: row.payment_reference,
    payment_date: row.payment_date,
    description: row.description,
    admin_description: row.admin_description,
    cancellation_reason: row.cancellation_reason,
    rejection_reason: row.rejection_reason,
  };
}

export type QuoteFranchiseCatalogSnapshot = {
  partnerRecords: Record<string, unknown>[];
  employeeRows: Record<string, unknown>[];
};

let snapshot: QuoteFranchiseCatalogSnapshot | null = null;

export function setQuoteFranchiseCatalogSnapshot(
  next: QuoteFranchiseCatalogSnapshot | null
): void {
  snapshot = next;
}

export function getQuoteFranchiseCatalogSnapshot(): QuoteFranchiseCatalogSnapshot | null {
  return snapshot;
}

function str(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "undefined" || s === "null" ? "" : s;
}

function asObjectRecords(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x != null && typeof x === "object") as Record<
    string,
    unknown
  >[];
}

export function collectPincodesFromAreaRecord(
  area: Record<string, unknown> | null | undefined
): string[] {
  if (!area) return [];
  const out: string[] = [];
  const single = str(area.pincode ?? area.postal_code ?? area.postcode);
  if (single) out.push(single);
  const rawList =
    area.pincodes ??
    area.pin_codes ??
    area.postal_codes ??
    area.serviceable_pincodes;
  if (Array.isArray(rawList)) {
    for (const x of rawList) {
      if (x == null) continue;
      if (typeof x === "string" || typeof x === "number") {
        const s = str(x);
        if (s) out.push(s);
        continue;
      }
      if (typeof x === "object") {
        const o = x as Record<string, unknown>;
        const p = str(o.pincode ?? o.code ?? o.postal_code ?? o._id);
        if (p) out.push(p);
      }
    }
  }
  const joined = str(area.pincode_list ?? area.pincodes_csv);
  if (joined && joined.includes(",")) {
    for (const part of joined.split(",")) {
      const p = str(part);
      if (p) out.push(p);
    }
  }
  return out;
}

/** `franchise.area_id` may be a string, array of ids, or array of objects with `_id`. */
export function collectFranchiseAreaIds(
  franchise: Record<string, unknown> | null | undefined
): string[] {
  if (!franchise) return [];
  const raw = franchise.area_id ?? franchise.area_ids ?? franchise.areas;
  const ids: string[] = [];
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (x == null) continue;
      if (typeof x === "string" || typeof x === "number") {
        const id = str(x);
        if (id) ids.push(id);
        continue;
      }
      if (typeof x === "object") {
        const o = x as Record<string, unknown>;
        const id = str(o._id ?? o.id ?? o.area_id);
        if (id) ids.push(id);
      }
    }
    return Array.from(new Set(ids));
  }
  const one = str(raw);
  return one ? [one] : [];
}

function collectPincodesFromFranchiseRecord(
  franchise: Record<string, unknown> | null | undefined
): string[] {
  if (!franchise) return [];
  const out: string[] = [];
  const single = str(
    franchise.pincode ?? franchise.postcode ?? franchise.postal_code
  );
  if (single) out.push(single);
  const raw = franchise.pincodes ?? franchise.serviceable_pincodes;
  if (Array.isArray(raw)) {
    for (const x of raw) out.push(str(x));
  }
  return out.filter(Boolean);
}

function addNormalizedPins(target: Set<string>, rawPins: string[]): void {
  for (const p of rawPins) {
    const n = normalizePincodeDigits(p);
    if (n.length === 6) target.add(n);
  }
}

/**
 * Postcodes served by the franchise using **only** `related-catalog` JSON (no GET /area/get).
 * Sources: `franchise.pincode` / `pincodes`, optional `record.areas` / `franchise_areas`,
 * and `franchise.area_id` when entries are full objects with `pincodes` (not plain id strings).
 */
export function buildFranchisePincodeSetFromRelatedCatalog(
  record: FranchiseRelatedCatalogRecord | null | undefined
): Set<string> {
  const out = new Set<string>();
  if (!record) return out;
  const rec = record as Record<string, unknown>;
  const fr = record.franchise as Record<string, unknown> | undefined;

  addNormalizedPins(out, collectPincodesFromFranchiseRecord(fr));

  for (const a of asObjectRecords(rec.areas)) {
    addNormalizedPins(out, collectPincodesFromAreaRecord(a));
  }
  for (const a of asObjectRecords(rec.franchise_areas)) {
    addNormalizedPins(out, collectPincodesFromAreaRecord(a));
  }

  const rawArea = fr?.area_id ?? fr?.area_ids ?? fr?.areas;
  if (Array.isArray(rawArea)) {
    for (const x of rawArea) {
      if (x != null && typeof x === "object") {
        addNormalizedPins(out, collectPincodesFromAreaRecord(x as Record<string, unknown>));
      }
    }
  }

  return out;
}

/** --- Address panel (React) --- */

export type QuoteAddressUiState = {
  ready: boolean;
  rows: QuoteAddressRowUi[];
  error: string;
};

const emptyUi = (): QuoteAddressUiState => ({
  ready: false,
  rows: [],
  error: "",
});

/**
 * Add Quote / Edit Quote: customer address cards + franchise area / pin rules.
 * When `preferredAddressId` matches a selectable saved address, it is selected by default.
 */
export function useQuoteCustomerAddressPanel(args: {
  userId: string;
  quoteCustomerRecords: Record<string, unknown>[];
  franchiseQuotePinSet: Set<string>;
  franchiseQuoteAreaIdSet: Set<string>;
  franchisePinsLoadDone: boolean;
  preferredAddressId?: string;
  /** Hydrated quote address from GET /quote/get — fills gaps when catalog rows omit city/state names. */
  quoteAddressFallback?: QuoteAddressFieldFallback;
}): {
  addressUi: QuoteAddressUiState;
  selectedAddressId: string;
  setSelectedAddressId: Dispatch<SetStateAction<string>>;
} {
  const {
    userId,
    quoteCustomerRecords,
    franchiseQuotePinSet,
    franchiseQuoteAreaIdSet,
    franchisePinsLoadDone,
    preferredAddressId,
    quoteAddressFallback,
  } = args;

  const [addressUi, setAddressUi] = useState<QuoteAddressUiState>(emptyUi);
  const [selectedAddressId, setSelectedAddressId] = useState("");

  const locationLookups = useMemo(
    () => buildAddressLocationLookupsFromCustomers(quoteCustomerRecords),
    [quoteCustomerRecords]
  );

  useEffect(() => {
    const uid = String(userId ?? "").trim();
    if (!uid) {
      setSelectedAddressId("");
      setAddressUi(emptyUi());
      return;
    }
    if (!franchisePinsLoadDone) {
      setSelectedAddressId("");
      setAddressUi({ ready: false, rows: [], error: "" });
      return;
    }

    const customer =
      quoteCustomerRecords.find(
        (c) => String(c._id ?? c.id ?? "").trim() === uid
      ) ?? null;
    if (!customer) {
      setSelectedAddressId("");
      if (!franchisePinsLoadDone) {
        setAddressUi({ ready: false, rows: [], error: "" });
        return;
      }
      if (quoteCustomerRecords.length === 0) {
        setAddressUi({ ready: true, rows: [], error: "" });
        return;
      }
      setAddressUi({
        ready: true,
        rows: [],
        error:
          "This customer is not in the franchise list from the catalog. Pick another user or refresh.",
      });
      return;
    }

    const addrs = (customer.addresses ?? customer.user_addresses) as
      | unknown[]
      | undefined;
    const parsed = Array.isArray(addrs)
      ? addrs
          .filter((a) => a != null && typeof a === "object")
          .map((a) =>
            parseCatalogAddressRecord(
              a as Record<string, unknown>,
              locationLookups,
              quoteAddressFallback
            )
          )
          .filter((r): r is NonNullable<typeof r> => r != null)
      : [];

    if (!parsed.length) {
      setSelectedAddressId("");
      setAddressUi({ ready: true, rows: [], error: "" });
      return;
    }

    const areaRules = franchiseQuoteAreaIdSet;
    const hasAreaRules = areaRules.size > 0;
    const pinRules = franchiseQuotePinSet;
    const hasPinRules = pinRules.size > 0;

    const rows: QuoteAddressRowUi[] = parsed.map((r) => {
      let selectable = true;
      if (hasAreaRules) {
        selectable = Boolean(r.areaId && areaRules.has(r.areaId));
      } else if (hasPinRules) {
        selectable = Boolean(
          r.pinNorm.length === 6 && pinRules.has(r.pinNorm)
        );
      }
      return {
        id: r.id,
        summary: r.summary,
        selectable,
        contactName: r.contactName,
        stateName: r.stateName,
        cityName: r.cityName,
        areaName: r.areaName,
        streetAddress: r.streetAddress,
        landmark: r.landmark,
        pincode: r.pincode,
      };
    });

    const preferred = String(preferredAddressId ?? "").trim();
    const preferredRow =
      preferred && rows.find((r) => r.id === preferred && r.selectable);

    if (!hasAreaRules && !hasPinRules) {
      setSelectedAddressId(preferredRow ? preferred : parsed[0].id);
      setAddressUi({ ready: true, rows, error: "" });
      return;
    }

    const firstSelectable = rows.find((r) => r.selectable);
    if (!firstSelectable) {
      setSelectedAddressId("");
      setAddressUi({
        ready: true,
        rows,
        error: hasAreaRules
          ? "This customer does not have an address in this franchise's service areas (no matching area)."
          : "This customer does not have an address in this franchise's service area (no matching postcode).",
      });
      return;
    }

    setSelectedAddressId(preferredRow ? preferred : firstSelectable.id);
    setAddressUi({ ready: true, rows, error: "" });
  }, [
    userId,
    quoteCustomerRecords,
    franchiseQuotePinSet,
    franchiseQuoteAreaIdSet,
    franchisePinsLoadDone,
    preferredAddressId,
    quoteAddressFallback,
    locationLookups,
  ]);

  return { addressUi, selectedAddressId, setSelectedAddressId };
}

function normalizeQuoteApiStatusLocal(raw: unknown): string {
  const strVal = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).trim();
    return s === "undefined" || s === "null" ? "" : s;
  };
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const byNumber: Record<number, string> = {
      1: "new",
      2: "pending",
      3: "accepted",
      4: "success",
      5: "failed",
    };
    const mapped = byNumber[raw];
    if (mapped) return mapped;
  }
  const s = strVal(raw).toLowerCase();
  const map: Record<string, string> = {
    new: "new",
    pending: "pending",
    accepted: "accepted",
    approved: "accepted",
    success: "success",
    converted: "success",
    failed: "failed",
    rejected: "failed",
    cancelled: "failed",
    canceled: "failed",
    expired: "failed",
    "1": "new",
    "2": "pending",
    "3": "accepted",
    "4": "success",
    "5": "failed",
  };
  return map[s] || s;
}
/** --- Schedule --- */

/** e.g. `12 Apr 2026` — YMD strings use local calendar date (no UTC day shift). */
function formatDayDdMmmYyyy(iso: string): string {
  const raw = (iso ?? "").trim();
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const mo = parseInt(ymd[2], 10) - 1;
    const dayNum = parseInt(ymd[3], 10);
    const d = new Date(y, mo, dayNum);
    if (!Number.isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const mon = d.toLocaleString("en-GB", { month: "short" });
      return `${day} ${mon} ${y}`;
    }
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const mon = d.toLocaleString("en-GB", { month: "short" });
  const yr = d.getFullYear();
  return `${day} ${mon} ${yr}`;
}

/**
 * Parses display/storage time → Date on 2000-01-01 for formatting.
 * Supports `10:30 AM`, `17:00`, and ISO fragments (`2000-01-01T11:23:00.000Z`).
 */
function parseTimeToSameDayDate(t: string): Date | null {
  const trimmed = t.trim();
  const isoM = trimmed.match(/T(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?Z?$/i);
  if (isoM) {
    const h = parseInt(isoM[1], 10);
    const min = parseInt(isoM[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return new Date(2000, 0, 1, h, min, 0, 0);
    }
  }
  const m12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const ap = m12[3].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return new Date(2000, 0, 1, h, min, 0, 0);
  }
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!m24) return null;
  const h = parseInt(m24[1], 10);
  const min = parseInt(m24[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return new Date(2000, 0, 1, h, min, 0, 0);
}

/**
 * 12h time for display.
 * `padHour` true → e.g. `05:00 PM` (range lines); false → e.g. `4:30 PM` (single-day line).
 */
function formatTimeAmPm(t: string, padHour = false): string {
  const trimmed = (t ?? "").trim();
  if (!trimmed) return "";
  const d = parseTimeToSameDayDate(trimmed);
  if (!d) return trimmed;
  return d.toLocaleTimeString("en-US", {
    hour: padHour ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function splitHumanTimeRange(t?: string): [string, string] {
  const s = (t ?? "").trim();
  if (!s || s === "-") return ["", ""];
  const parts = s.split(/\s+to\s+/i);
  if (parts.length >= 2) return [parts[0].trim(), parts[1].trim()];
  return [s, ""];
}

function splitDateParts(raw?: string): string[] {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  const parts = trimmed.includes(" to ")
    ? trimmed.split(/\s+to\s+/i).map((p) => p.trim())
    : trimmed.split(/\s+[–—-]\s+/).map((p) => p.trim());
  return parts.filter(Boolean);
}

function buildSingleDayLine(
  dateIso: string,
  timeFrom: string,
  timeTo: string
): string {
  const dStr = formatDayDdMmmYyyy(dateIso);
  if (!dStr) return "-";

  const fa = timeFrom.trim() ? formatTimeAmPm(timeFrom, false) : "";
  const fb = timeTo.trim() ? formatTimeAmPm(timeTo, false) : "";

  if (fa && fb) return `${dStr}, ${fa} to ${fb}`;
  if (fa) return `${dStr}, ${fa}`;
  return dStr;
}

function buildRangeLines(
  fromDateIso: string,
  toDateIso: string,
  timeFrom: string,
  timeTo: string
): string {
  const d1 = formatDayDdMmmYyyy(fromDateIso);
  const d2 = formatDayDdMmmYyyy(toDateIso);
  if (!d1 || !d2) return "-";

  const tf = timeFrom.trim();
  const tt = timeTo.trim();
  const f1 = tf ? formatTimeAmPm(tf, true) : "";
  const f2 = tt ? formatTimeAmPm(tt, true) : "";

  if (tf && !tt) {
    return `From: ${d1}, ${f1}\nTo: ${d2}`;
  }

  const left = f1 ? `${d1}, ${f1}` : d1;
  const right = f2 ? `${d2}, ${f2}` : d2;
  return `From: ${left}\nTo: ${right}`;
}

function buildSingleDayDateOnly(dateIso: string): string {
  return formatDayDdMmmYyyy(dateIso) || "-";
}

function buildRangeDateOnly(fromDateIso: string, toDateIso: string): string {
  const d1 = formatDayDdMmmYyyy(fromDateIso);
  const d2 = formatDayDdMmmYyyy(toDateIso);
  if (!d1) return "-";
  if (!d2 || d1 === d2) return d1;
  return `${d1} to ${d2}`;
}

function formatQuoteDateOnlyFromParts(parts: string[]): string {
  if (parts.length === 0) return "-";
  if (parts.length === 1) return buildSingleDayDateOnly(parts[0]);
  return buildRangeDateOnly(parts[0], parts[1]);
}

/** New / pending / failed rows: requested_date + requested_time */
export function formatQuoteRequestedSchedule(row: {
  requested_date?: string;
  requested_time?: string;
}): string {
  const parts = splitDateParts(row.requested_date);
  if (parts.length === 0) return "-";

  const [tFrom, tTo] = splitHumanTimeRange(row.requested_time);

  if (parts.length === 1) {
    return buildSingleDayLine(parts[0], tFrom, tTo);
  }

  return buildRangeLines(parts[0], parts[1], tFrom, tTo);
}

/** Accepted / success rows: scheduled_date + service time window */
export function formatQuoteScheduledDisplay(row: {
  scheduled_date?: string;
  service_from_time?: string;
  service_to_time?: string;
}): string {
  const parts = splitDateParts(row.scheduled_date);
  if (parts.length === 0) return "-";

  const from = (row.service_from_time ?? "").trim();
  const to = (row.service_to_time ?? "").trim();

  if (parts.length === 1) {
    return buildSingleDayLine(parts[0], from, to);
  }

  return buildRangeLines(parts[0], parts[1], from, to);
}

/** Quote list table — dates only (no times). */
export function formatQuoteScheduleForTable(
  row: QuoteRow,
  tab: QuoteTabKey
): string {
  const fromYmd = row.from_date ? ymdChunk(row.from_date) : "";
  const toYmd = row.to_date ? ymdChunk(row.to_date) : "";
  if (fromYmd) {
    if (toYmd && toYmd !== fromYmd) {
      return buildRangeDateOnly(fromYmd, toYmd);
    }
    return buildSingleDayDateOnly(fromYmd);
  }

  if (tab === "success" || tab === "accepted") {
    const parts = splitDateParts(row.scheduled_date);
    if (parts.length > 0) return formatQuoteDateOnlyFromParts(parts);
  }

  const parts = splitDateParts(row.requested_date);
  return formatQuoteDateOnlyFromParts(parts);
}

export function formatQuoteScheduleForView(row: {
  status: string;
  requested_date: string;
  requested_time: string;
  from_date?: string;
  to_date?: string;
  work_start_time?: string;
  work_end_time?: string;
  scheduled_date?: string;
  scheduled_time_from?: string;
  scheduled_time_to?: string;
}): string {
  const fromYmd = row.from_date ? ymdChunk(row.from_date) : "";
  if (fromYmd) {
    const toYmd = row.to_date ? ymdChunk(row.to_date) : fromYmd;
    const ws = String(row.work_start_time ?? "").trim();
    const we = String(row.work_end_time ?? "").trim();
    if (toYmd && toYmd !== fromYmd) {
      return buildRangeLines(fromYmd, toYmd, ws, we);
    }
    return buildSingleDayLine(fromYmd, ws, we);
  }

  const key = String(row.status ?? "").toLowerCase();
  if (key === "success" || key === "accepted") {
    const scheduled = formatQuoteScheduledDisplay({
      scheduled_date: row.scheduled_date,
      service_from_time: row.scheduled_time_from,
      service_to_time: row.scheduled_time_to,
    });
    if (scheduled !== "-") return scheduled;
  }
  return formatQuoteRequestedSchedule({
    requested_date: row.requested_date,
    requested_time: row.requested_time,
  });
}

export function formatServiceAddressLines(q: {
  door_no?: string;
  street?: string;
  area?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
}): string {
  return formatQuoteServiceAddressLines(q);
}

export type EditQuoteFormValues = AddQuoteFormValues & {
  quote_status: string;
};

function parseTimeAmPmToDate(t: string): Date | null {
  const trimmed = t.trim();
  const m12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m12) return null;
  let h = parseInt(m12[1], 10);
  const min = parseInt(m12[2], 10);
  const ap = m12[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return new Date(2000, 0, 1, h, min, 0, 0);
}

function timeStorageFromDate(date: Date | null): string {
  return date
    ? `2000-01-01T${String(date.getHours()).padStart(2, "0")}:${String(
        date.getMinutes()
      ).padStart(2, "0")}:00`
    : "";
}

/** `HH:mm` / `HH:mm:ss` or `h:mm AM` → CustomTimePicker storage string. */
export function workTimeToTimeStorage(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) {
    const h = Math.min(23, parseInt(m24[1], 10));
    const min = Math.min(59, parseInt(m24[2], 10));
    return `2000-01-01T${String(h).padStart(2, "0")}:${String(
      min
    ).padStart(2, "0")}:00`;
  }
  const d = parseTimeAmPmToDate(s);
  return d ? timeStorageFromDate(d) : "";
}

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

export function seedEditQuoteFormFromRow(row: QuoteRow): EditQuoteFormValues {
  const statusKey = normalizeQuoteApiStatusLocal(row.status) || "new";
  const useScheduled = statusKey === "accepted" || statusKey === "success";

  let requested_date = "";
  let requested_date_to = "";
  let requested_time_from = "";
  let requested_time_to = "";

  if (useScheduled) {
    const sched = String(row.scheduled_date ?? "").trim();
    if (sched) {
      requested_date = ymdChunk(sched);
      requested_time_from = workTimeToTimeStorage(row.service_from_time);
      requested_time_to = workTimeToTimeStorage(row.service_to_time);
    } else {
      // GET /quote/get often has from_date + work_* only (no scheduled_date).
      const fromYmd = row.from_date ? ymdChunk(row.from_date) : "";
      const toYmd = row.to_date ? ymdChunk(row.to_date) : "";
      requested_date = fromYmd;
      requested_date_to = toYmd || "";
      requested_time_from = workTimeToTimeStorage(row.work_start_time);
      requested_time_to = workTimeToTimeStorage(row.work_end_time);
    }
  } else {
    const fromYmd = row.from_date
      ? ymdChunk(row.from_date)
      : "";
    const toYmd = row.to_date ? ymdChunk(row.to_date) : "";

    if (fromYmd) {
      requested_date = fromYmd;
      requested_date_to = toYmd || "";
    } else {
      const dateRaw = String(row.requested_date ?? "").trim();
      const dateParts = dateRaw
        ? dateRaw.split(/\s+to\s+/i).map((p) => p.trim()).filter(Boolean)
        : [];
      requested_date = dateParts[0] ? ymdChunk(dateParts[0]) : "";
      requested_date_to =
        dateParts.length > 1 ? ymdChunk(dateParts[1]) : "";
    }

    if (row.work_start_time || row.work_end_time) {
      requested_time_from = workTimeToTimeStorage(row.work_start_time);
      requested_time_to = workTimeToTimeStorage(row.work_end_time);
    } else {
      const [a, b] = splitHumanTimeRange(row.requested_time);
      requested_time_from = workTimeToTimeStorage(a);
      requested_time_to = workTimeToTimeStorage(b);
    }
  }

  const partnerVal = String(
    row.partner_id ?? row.partner_user_id ?? ""
  ).trim();

  return {
    franchise_id: String(row.franchise_id ?? "").trim(),
    user_id: String(row.user_id ?? "").trim(),
    user_name: String(row.user_name ?? "").trim(),
    requested_services: String(row.service_id ?? "").trim(),
    requested_partner: partnerVal,
    employee_id: String(row.employee_id ?? "").trim(),
    category_id: String(row.category_id ?? "").trim(),
    requested_date,
    requested_date_to,
    requested_time: "",
    requested_time_from,
    requested_time_to,
    service_price: (() => {
      const n =
        row.total_service_charge ?? row.service_price;
      return n != null && Number.isFinite(n) ? String(n) : "";
    })(),
    user_description: String(row.description ?? "").trim(),
    admin_description: String(row.admin_description ?? "").trim(),
    quote_status: statusKey || "new",
  };
}

export {
  buildAddressLocationLookupsFromCustomers,
  displayStateName,
  formatAddressLineFromRecord,
  formatQuoteServiceAddressLines,
  normalizePincodeDigits,
  parseCatalogAddressRecord,
  refIdFromField,
  stripKnownAddressParts,
} from "./quoteAddressCore";

export type {
  AddressLocationLookups,
  ParsedCatalogAddressRow,
  QuoteAddressFieldFallback,
  QuoteAddressRowUi,
  QuoteServiceAddressInput,
} from "./quoteAddressCore";
