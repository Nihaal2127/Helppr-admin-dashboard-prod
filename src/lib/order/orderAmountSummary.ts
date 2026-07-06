/**
 * Order amount summary — quote-style lines for create / view / payment edit.
 * Kept separate from orders.ts so CRA/webpack reliably exports these symbols.
 */
import { roundMoney } from "../global/paymentAndCurrency";
import {
  computeOrderPaymentLineTotals,
  getPrimaryServiceItem,
  getServiceTaxCommissionPercents,
  orderRefundAmount,
  orderRefundBreakdown,
  otherChargesTotal,
  resolveOrderOfferBreakdown,
  resolvePaymentExtension,
} from "./orders";
import { orderPartnerPriceAmount } from "./orderPriceAmounts";

type QuotePriceBreakdownWithCoupon =
  import("../quote/quoteHelpers").QuotePriceBreakdownWithCoupon;
type OtherChargeRow = import("./orderPaymentRows").OtherChargeRow;
type OrderItemModel = import("./orders").OrderItemModel;
type OrderModel = import("./orders").OrderModel;
type OrderOfferBreakdown = import("./orders").OrderOfferBreakdown;
type OrderPaymentExtV1 = import("./orders").OrderPaymentExtV1;
type OrderRefundBreakdown = import("./orders").OrderRefundBreakdown;

export interface OrderAmountSummaryLines {
  serviceBefore: number;
  serviceAfter: number;
  commissionPct: number;
  commissionBefore: number;
  commissionAfter: number;
  subtotalBeforeTax: number;
  taxPct: number;
  taxAmount: number;
  totalInclTax: number;
}

export interface OrderAmountSummaryDisplay {
  lines: OrderAmountSummaryLines;
  otherCharges: OtherChargeRow[];
  offer: OrderOfferBreakdown;
  orderDiscount: number;
  refund: OrderRefundBreakdown;
  refundTotal: number;
  finalTotal: number;
}

function orderAmountSummaryPctLabel(n: number): number {
  const v = Number(n) || 0;
  return Math.round(v * 100) / 100;
}

function orderAmountSummaryServiceBase(
  order?: OrderModel | null,
  primary?: OrderItemModel
): number {
  return orderPartnerPriceAmount(order ?? undefined, primary);
}

/** Build summary from quote-style breakdown (create / edit preview with coupon). */
export function buildOrderAmountSummaryFromQuoteBreakdown(
  breakdown: QuotePriceBreakdownWithCoupon,
  options?: {
    offer?: OrderOfferBreakdown;
    otherCharges?: OtherChargeRow[];
    orderDiscount?: number;
    refund?: OrderRefundBreakdown;
    refundTotal?: number;
    finalTotal?: number;
  }
): OrderAmountSummaryDisplay {
  const partnerDisc = roundMoney(breakdown.partnerDiscountOnService ?? 0);
  const adminDisc = roundMoney(breakdown.adminDiscountOnCommission ?? 0);
  const offer: OrderOfferBreakdown = options?.offer ?? {
    totalOfferValue: breakdown.totalCouponDiscount ?? 0,
    adminContribution: adminDisc,
    partnerContribution: partnerDisc,
    appliedDiscount: breakdown.totalCouponDiscount ?? 0,
  };

  const lines: OrderAmountSummaryLines = {
    serviceBefore: breakdown.base,
    serviceAfter: breakdown.serviceAfterCoupon ?? breakdown.base,
    commissionPct: orderAmountSummaryPctLabel(breakdown.commissionPct),
    commissionBefore: breakdown.commissionAmount,
    commissionAfter:
      breakdown.commissionAfterCoupon ?? breakdown.commissionAmount,
    subtotalBeforeTax: breakdown.subtotalBeforeTax,
    taxPct: orderAmountSummaryPctLabel(breakdown.taxPct),
    taxAmount: breakdown.taxAmount,
    totalInclTax: breakdown.grandTotal,
  };

  return {
    lines,
    otherCharges: options?.otherCharges ?? [],
    offer,
    orderDiscount: Math.max(0, Number(options?.orderDiscount) || 0),
    refund: options?.refund ?? {
      refundAmount: 0,
      adminCommission: 0,
      partnerWallet: 0,
    },
    refundTotal: Math.max(0, Number(options?.refundTotal) || 0),
    finalTotal: roundMoney(options?.finalTotal ?? breakdown.grandTotal),
  };
}

/** Build summary from stored order + optional payment extension (view / payment edit). */
export function buildOrderAmountSummaryFromOrder(
  order: OrderModel,
  options?: {
    primary?: OrderItemModel;
    paymentExt?: OrderPaymentExtV1;
    finalTotal?: number;
    orderDiscount?: number;
  }
): OrderAmountSummaryDisplay {
  const primary = options?.primary ?? getPrimaryServiceItem(order);
  const ext =
    options?.paymentExt ?? resolvePaymentExtension(order, primary);
  const offer = resolveOrderOfferBreakdown(order);
  const { taxPct, commissionPct } = getServiceTaxCommissionPercents(
    primary,
    order
  );

  const otherCharges = ext.otherCharges ?? [];
  const otherSum = otherChargesTotal(otherCharges);

  const partnerDisc = roundMoney(offer.partnerContribution);
  const adminDisc = roundMoney(offer.adminContribution);

  let serviceAfter = orderAmountSummaryServiceBase(order, primary);
  if (serviceAfter <= 0.009) {
    serviceAfter = roundMoney(Math.max(0, ext.serviceAmount));
  }
  const serviceBefore = roundMoney(serviceAfter + partnerDisc);

  const pricing = computeOrderPaymentLineTotals(
    serviceAfter,
    otherSum,
    taxPct,
    commissionPct
  );
  const grossCommission = pricing.commissionAmount;

  const orderDetail = order as OrderModel & {
    commission_amount?: number | null;
    admin_commission?: number | null;
    tax_amount?: number | null;
  };

  let commissionStored = roundMoney(
    Math.max(
      0,
      Number(orderDetail.commission_amount ?? 0) ||
        Number(order.partner_commison_platform_fee ?? 0) ||
        Number(orderDetail.admin_commission ?? 0) ||
        Number(primary?.partner_commison_platform_fee ?? 0) ||
        0
    )
  );
  if (commissionStored <= 0.009) {
    commissionStored = grossCommission;
  }

  let commissionBefore = grossCommission;
  let commissionAfter = commissionStored;

  if (adminDisc > 0.009) {
    const expectedAfter = roundMoney(Math.max(0, grossCommission - adminDisc));
    if (Math.abs(commissionStored - grossCommission) <= 0.01) {
      commissionAfter = expectedAfter;
      commissionBefore = grossCommission;
    } else if (Math.abs(commissionStored - expectedAfter) <= 0.01) {
      commissionAfter = commissionStored;
      commissionBefore = grossCommission;
    } else {
      commissionBefore = roundMoney(commissionStored + adminDisc);
      commissionAfter = commissionStored;
    }
  } else {
    commissionBefore = commissionStored;
    commissionAfter = commissionStored;
  }

  const hasOfferSplit = partnerDisc > 0.009 || adminDisc > 0.009;
  let subtotalBeforeTax = roundMoney(Number(order.sub_total ?? 0));
  if (subtotalBeforeTax <= 0.009 || hasOfferSplit) {
    subtotalBeforeTax = roundMoney(
      serviceAfter + otherSum + commissionAfter
    );
  }

  const taxPctDisplay = orderAmountSummaryPctLabel(
    Number(order.tax_percent ?? taxPct)
  );
  let taxAmount = roundMoney(
    Number(orderDetail.tax_amount ?? order.tax ?? 0)
  );
  if (taxAmount <= 0.009 || hasOfferSplit) {
    taxAmount = pricing.taxAmount;
  }

  let totalInclTax = roundMoney(Number(order.total_price ?? 0));
  if (totalInclTax <= 0.009 || hasOfferSplit) {
    totalInclTax = pricing.totalInclTax;
  }

  const refund = orderRefundBreakdown(order);
  const refundTotal = orderRefundAmount(order);
  const orderDiscount = Math.max(
    0,
    Number(options?.orderDiscount ?? order.discount_amount ?? 0)
  );

  const finalTotal =
    options?.finalTotal != null
      ? roundMoney(options.finalTotal)
      : totalInclTax;

  return {
    lines: {
      serviceBefore,
      serviceAfter,
      commissionPct: orderAmountSummaryPctLabel(commissionPct),
      commissionBefore,
      commissionAfter,
      subtotalBeforeTax,
      taxPct: taxPctDisplay,
      taxAmount,
      totalInclTax,
    },
    otherCharges,
    offer,
    orderDiscount,
    refund,
    refundTotal,
    finalTotal,
  };
}
