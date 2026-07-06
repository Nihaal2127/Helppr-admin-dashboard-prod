import React from "react";
import { Button } from "react-bootstrap";

export type OrderCouponActionProps = {
  hasCoupon: boolean;
  onApply: () => void;
  onRemove: () => void;
  disabled?: boolean;
};

/** Coupon apply / remove control for order create & edit amount summary. */
export default function OrderCouponAction({
  hasCoupon,
  onApply,
  onRemove,
  disabled = false,
}: OrderCouponActionProps) {
  if (hasCoupon) {
    return (
      <div className="order-coupon-action order-coupon-action--applied">
        <span className="order-coupon-action__status">
          <i className="bi bi-tag-fill" aria-hidden />
          Coupon applied
        </span>
        <Button
          type="button"
          variant="outline-danger"
          size="sm"
          className="order-coupon-action__btn"
          disabled={disabled}
          onClick={onRemove}
        >
          Remove coupon
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline-primary"
      size="sm"
      className="order-coupon-action__btn order-coupon-action__btn--apply"
      disabled={disabled}
      onClick={onApply}
    >
      <i className="bi bi-tag" aria-hidden />
      Apply coupon
    </Button>
  );
}
