import React from "react";
import { AppConstant } from "../../lib/global/AppConstant";
import { QUOTE_SECTION_TITLE_CLASS } from "../../lib/quote/quoteHelpers";
import type { OrderAmountSummaryDisplay } from "../../lib/order/orderAmountSummary";
import type { OtherChargeRow } from "../../lib/order/orderPaymentRows";

/** @deprecated Prefer `.order-amount-summary` classes; kept for callers passing inline `style`. */
export const orderAmountSummaryShell: React.CSSProperties = {
  borderRadius: "10px",
  border: "1px solid var(--txtfld-border, rgba(0, 0, 0, 0.1))",
  backgroundColor: "var(--bg-color)",
};

export const orderAmountSummaryPanelWrap: React.CSSProperties = {
  ...orderAmountSummaryShell,
  padding: "14px 16px",
};

const sym = () => AppConstant.currencySymbol;

function money(n: number): string {
  return `${sym()}${n.toFixed(2)}`;
}

function SummaryRow({
  label,
  amount,
  original,
  showStrike,
  valueModifier = "",
  labelExtra,
}: {
  label: React.ReactNode;
  amount: number;
  original?: number;
  showStrike?: boolean;
  valueModifier?: string;
  labelExtra?: React.ReactNode;
}) {
  const struck =
    showStrike &&
    original != null &&
    Math.abs(original - amount) > 0.009;

  return (
    <div className="order-amount-summary__row">
      <span className="order-amount-summary__label">
        {label}
        {labelExtra}
      </span>
      <span
        className={`order-amount-summary__value ${valueModifier}`.trim()}
      >
        {struck ? (
          <>
            <span className="order-amount-summary__struck">{money(original!)}</span>
            <span>{money(amount)}</span>
          </>
        ) : (
          money(amount)
        )}
      </span>
    </div>
  );
}

function DeductionRow({
  label,
  amount,
  detail,
}: {
  label: React.ReactNode;
  amount: number;
  detail?: React.ReactNode;
}) {
  if (amount <= 0.009) return null;
  return (
    <div className="order-amount-summary__row">
      <div className="order-amount-summary__label-block">
        <span className="order-amount-summary__label">{label}</span>
        {detail ? (
          <div className="order-amount-summary__detail">{detail}</div>
        ) : null}
      </div>
      <span className="order-amount-summary__value order-amount-summary__value--deduction">
        −{money(amount)}
      </span>
    </div>
  );
}

function RefundRow({
  refundAmount,
  adminCommission,
  partnerWallet,
}: {
  refundAmount: number;
  adminCommission: number;
  partnerWallet: number;
}) {
  return (
    <div className="order-amount-summary__row">
      <span className="order-amount-summary__label order-amount-summary__label--refund">
        Refund (from admin: {adminCommission}, from partner: {partnerWallet})
      </span>
      <span className="order-amount-summary__value order-amount-summary__value--refund">
        {money(refundAmount)}
      </span>
    </div>
  );
}

export type OrderAmountSummaryPanelProps = {
  display: OrderAmountSummaryDisplay;
  title?: string;
  finalTotalLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  /** `view` = order/quote info modal (section title, calmer typography). */
  variant?: "default" | "view";
  children?: React.ReactNode;
};

export default function OrderAmountSummaryPanel({
  display,
  title = "Amount summary",
  finalTotalLabel = "Total price (incl. tax)",
  className = "",
  style,
  variant = "default",
  children,
}: OrderAmountSummaryPanelProps) {
  const { lines, otherCharges, offer, orderDiscount, refund, refundTotal, finalTotal } =
    display;
  const pctSym = AppConstant.percentageSymbol;
  const isView = variant === "view";

  const serviceStrike =
    offer.partnerContribution > 0.009 ||
    Math.abs(lines.serviceBefore - lines.serviceAfter) > 0.009;
  const commissionStrike =
    offer.adminContribution > 0.009 ||
    Math.abs(lines.commissionBefore - lines.commissionAfter) > 0.009;

  const showPartnerOffer = offer.partnerContribution > 0.009;
  const showAdminOffer = offer.adminContribution > 0.009;
  const showOfferBlock =
    showPartnerOffer ||
    showAdminOffer ||
    offer.appliedDiscount > 0.009 ||
    Boolean(offer.offerCode?.trim()) ||
    Boolean(offer.offerName?.trim());

  const otherSum = otherCharges.reduce(
    (a: number, c: OtherChargeRow) => a + Math.max(0, Number(c.amount) || 0),
    0
  );

  const showRefund =
    refund.refundAmount > 0 ||
    refund.adminCommission > 0 ||
    refund.partnerWallet > 0 ||
    refundTotal > 0;

  const refundAmount = Math.max(refund.refundAmount, refundTotal);
  const displayFinalTotal = showRefund
    ? Math.max(0, finalTotal - refundAmount)
    : finalTotal;

  const offerDiscount =
    offer.appliedDiscount > 0.009
      ? offer.appliedDiscount
      : offer.partnerContribution + offer.adminContribution;

  return (
    <div
      className={`order-amount-summary${
        isView ? " order-amount-summary--view" : ""
      } ${className}`.trim()}
      style={style}
    >
      {isView ? (
        <h6 className={QUOTE_SECTION_TITLE_CLASS}>{title}</h6>
      ) : (
        <div className="order-amount-summary__heading">{title}</div>
      )}

      <div className="order-amount-summary__body">
        <SummaryRow
          label="Service amount"
          original={lines.serviceBefore}
          amount={lines.serviceAfter}
          showStrike={serviceStrike}
        />

        {otherCharges.map((c: OtherChargeRow) => (
          <div key={c.id} className="order-amount-summary__row">
            <div className="order-amount-summary__label-block">
              <span className="order-amount-summary__label">
                {c.serviceName?.trim() ||
                  c.description?.trim() ||
                  "Additional charge"}
              </span>
              {c.serviceName?.trim() && c.description?.trim() ? (
                <div className="order-amount-summary__detail">
                  {c.description.trim()}
                </div>
              ) : null}
            </div>
            <span className="order-amount-summary__value">
              {money(Number(c.amount || 0))}
            </span>
          </div>
        ))}

        {otherCharges.length > 1 ? (
          <SummaryRow label="Additional charges (total)" amount={otherSum} />
        ) : null}

        <SummaryRow
          label={
            <>
              Admin commission ({lines.commissionPct}
              {pctSym} on service
              {otherSum > 0.009 ? " + additional charges" : ""})
            </>
          }
          original={lines.commissionBefore}
          amount={lines.commissionAfter}
          showStrike={commissionStrike}
        />

        <SummaryRow label="Subtotal (before tax)" amount={lines.subtotalBeforeTax} />

        <SummaryRow
          label={
            <>
              Tax ({lines.taxPct}
              {pctSym} on subtotal)
            </>
          }
          amount={lines.taxAmount}
        />

        {showOfferBlock ? (
          <DeductionRow
            label={
              <>
                Offer
                {offer.offerCode ? (
                  <span className="order-amount-summary__badge ms-2">
                    {offer.offerCode}
                  </span>
                ) : null}
                {offer.offerName?.trim() ? (
                  <span className="order-amount-summary__offer-name ms-1">
                    {offer.offerName.trim()}
                  </span>
                ) : null}
              </>
            }
            amount={offerDiscount}
            detail={
              showPartnerOffer || showAdminOffer ? (
                <>
                  {showPartnerOffer
                    ? `Partner −${money(offer.partnerContribution)}`
                    : null}
                  {showPartnerOffer && showAdminOffer ? " · " : null}
                  {showAdminOffer
                    ? `Admin −${money(offer.adminContribution)}`
                    : null}
                </>
              ) : undefined
            }
          />
        ) : null}

        {orderDiscount > 0.009 ? (
          <DeductionRow label="Discount" amount={orderDiscount} />
        ) : null}

        {showRefund ? (
          <DeductionRow
            label="Refund"
            amount={refundAmount}
            detail={
              <>
                Admin commission {money(refund.adminCommission)}
                <span className="mx-1">·</span>
                Partner wallet {money(refund.partnerWallet)}
              </>
            }
          />
        ) : null}
      </div>

      <div className="order-amount-summary__total">
        <span className="order-amount-summary__total-label">{finalTotalLabel}</span>
        <span className="order-amount-summary__total-value">
          {money(displayFinalTotal)}
        </span>
      </div>

      {children ? (
        <div className="order-amount-summary__footer">{children}</div>
      ) : null}
    </div>
  );
}
