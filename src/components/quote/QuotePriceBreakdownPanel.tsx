import React from "react";
import { Row, Col } from "react-bootstrap";
import {
  formatQuoteRupees,
  formatCouponContributionLabel,
  QUOTE_SECTION_TITLE_CLASS,
} from "../../lib/quote/quoteHelpers";
import type {
  CouponDisplayMeta,
  QuotePriceBreakdown,
  QuotePriceBreakdownWithCoupon,
} from "../../lib/quote/quoteHelpers";
import { AppConstant } from "../../lib/global/AppConstant";

type QuotePriceBreakdownPanelProps = {
  breakdown: QuotePriceBreakdown | QuotePriceBreakdownWithCoupon;
  className?: string;
  variant?: "default" | "view";
  /** Preferred: coupon type + contributions for correct fixed vs % labels. */
  couponMeta?: CouponDisplayMeta | null;
  /** @deprecated Use couponMeta — kept for callers not yet passing type. */
  partnerCouponPct?: number;
  /** @deprecated Use couponMeta */
  adminCouponPct?: number;
};

type BreakdownLineProps = {
  label: React.ReactNode;
  amount: number;
  labelClassName?: string;
  valueClassName?: string;
  divider?: boolean;
};

function BreakdownLine({
  label,
  amount,
  labelClassName = "",
  valueClassName = "",
  divider = false,
}: BreakdownLineProps) {
  return (
    <Row
      className={`mb-2 align-items-baseline g-1${
        divider ? " border-top pt-2 mt-2" : ""
      }`}
    >
      <Col className={`text-break ${labelClassName}`.trim()}>{label}</Col>
      <Col xs="auto" className={`text-end ${valueClassName}`.trim()}>
        {formatQuoteRupees(amount)}
      </Col>
    </Row>
  );
}

function PriceLineWithStrike({
  label,
  original,
  finalAmount,
  showStrike,
  labelClassName = "",
  valueClassName = "",
}: {
  label: React.ReactNode;
  original: number;
  finalAmount: number;
  showStrike: boolean;
  labelClassName?: string;
  valueClassName?: string;
}) {
  const struck =
    showStrike && Math.abs(original - finalAmount) > 0.009;
  return (
    <Row className="mb-2 align-items-baseline g-1">
      <Col className={`text-break ${labelClassName}`.trim()}>{label}</Col>
      <Col
        xs="auto"
        className={`text-end text-nowrap ${valueClassName}`.trim()}
      >
        {struck ? (
          <>
            <span
              className="text-decoration-line-through text-muted me-2"
              style={{ fontSize: "0.92em" }}
            >
              {formatQuoteRupees(original)}
            </span>
            <span className="fw-semibold">{formatQuoteRupees(finalAmount)}</span>
          </>
        ) : (
          formatQuoteRupees(finalAmount)
        )}
      </Col>
    </Row>
  );
}

function isCouponBreakdown(
  b: QuotePriceBreakdown | QuotePriceBreakdownWithCoupon
): b is QuotePriceBreakdownWithCoupon {
  return "hasCoupon" in b && Boolean((b as QuotePriceBreakdownWithCoupon).hasCoupon);
}

function resolveCouponMeta(
  couponMeta: CouponDisplayMeta | null | undefined,
  partnerCouponPct?: number,
  adminCouponPct?: number
): CouponDisplayMeta | null {
  if (couponMeta) return couponMeta;
  if (partnerCouponPct == null && adminCouponPct == null) return null;
  return {
    type: "percentage",
    partnerContribution: Number(partnerCouponPct) || 0,
    adminContribution: Number(adminCouponPct) || 0,
  };
}

export default function QuotePriceBreakdownPanel({
  breakdown,
  className = "",
  variant = "default",
  couponMeta,
  partnerCouponPct,
  adminCouponPct,
}: QuotePriceBreakdownPanelProps) {
  const isView = variant === "view";
  const coupon = isCouponBreakdown(breakdown) ? breakdown : null;
  const sym = AppConstant.percentageSymbol;
  const meta = resolveCouponMeta(couponMeta, partnerCouponPct, adminCouponPct);

  const partnerDisc = coupon?.partnerDiscountOnService ?? 0;
  const adminDisc = coupon?.adminDiscountOnCommission ?? 0;
  const hasPartnerDisc = partnerDisc > 0.009;
  const hasAdminDisc = adminDisc > 0.009;

  const serviceFinal = coupon?.serviceAfterCoupon ?? breakdown.base;
  const commissionFinal =
    coupon?.commissionAfterCoupon ?? breakdown.commissionAmount;

  const partnerCouponHint =
    hasPartnerDisc && meta
      ? formatCouponContributionLabel(
          meta.type,
          meta.partnerContribution,
          "service"
        )
      : null;
  const adminCouponHint =
    hasAdminDisc && meta
      ? formatCouponContributionLabel(
          meta.type,
          meta.adminContribution,
          "commission"
        )
      : null;

  return (
    <div
      className={`border rounded p-3 bg-light${
        isView ? "" : " small"
      } ${className}`.trim()}
    >
      <h6 className={QUOTE_SECTION_TITLE_CLASS}>Amount breakdown</h6>

      <PriceLineWithStrike
        label={
          <>
            Service price
            {partnerCouponHint ? (
              <span className="d-block text-success fw-normal small mt-1">
                Coupon ({partnerCouponHint})
              </span>
            ) : null}
          </>
        }
        original={breakdown.base}
        finalAmount={serviceFinal}
        showStrike={hasPartnerDisc}
      />

      <PriceLineWithStrike
        label={
          <>
            Admin commission ({breakdown.commissionPct}
            {sym} on service)
            {adminCouponHint ? (
              <span className="d-block text-success fw-normal small mt-1">
                Coupon ({adminCouponHint})
              </span>
            ) : null}
          </>
        }
        original={breakdown.commissionAmount}
        finalAmount={commissionFinal}
        showStrike={hasAdminDisc}
      />

      {coupon && coupon.totalCouponDiscount > 0.009 ? (
        <BreakdownLine
          label="Total coupon savings"
          amount={-coupon.totalCouponDiscount}
          valueClassName="text-success fw-semibold"
        />
      ) : null}

      <BreakdownLine label="Subtotal (before tax)" amount={breakdown.subtotalBeforeTax} />
      <BreakdownLine
        label={
          <>
            Tax ({breakdown.taxPct}
            {sym} on subtotal)
          </>
        }
        amount={breakdown.taxAmount}
      />
      <BreakdownLine
        label="Total (incl. tax)"
        amount={breakdown.grandTotal}
        labelClassName="fw-bold"
        valueClassName="fw-bold"
        divider={!isView}
      />
      <BreakdownLine
        label={
          <>
            {breakdown.minDepositTitle}
            {breakdown.minDepositNote ? <> {breakdown.minDepositNote}</> : null}
          </>
        }
        amount={breakdown.minDepositAmount}
        labelClassName={isView ? "text-muted" : "text-muted small"}
        valueClassName={
          isView ? "text-muted fw-semibold" : "text-muted fw-semibold small"
        }
        divider={!isView}
      />
    </div>
  );
}
