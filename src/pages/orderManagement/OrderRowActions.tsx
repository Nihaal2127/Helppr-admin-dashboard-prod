import React from "react";
import eyeIcon from "../../assets/icons/eye.svg";

const ORDER_ACTION_ICON_PX = 22;

const orderTableActionIconStyle: React.CSSProperties = {
  cursor: "pointer",
  width: ORDER_ACTION_ICON_PX,
  height: ORDER_ACTION_ICON_PX,
  fontSize: ORDER_ACTION_ICON_PX,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

export type OrderRowActionsProps = {
  onView: () => void;
  onInvoice: () => void;
  onVoid: () => void;
};

export default function OrderRowActions({
  onView,
  onInvoice,
  onVoid,
}: OrderRowActionsProps) {
  return (
    <div className="d-inline-flex align-items-center gap-2">
      <img
        src={eyeIcon}
        alt="View order"
        title="View details"
        width={ORDER_ACTION_ICON_PX}
        height={ORDER_ACTION_ICON_PX}
        onClick={onView}
        style={{ cursor: "pointer", flexShrink: 0 }}
      />
      <i
        className="bi bi-file-earmark-pdf"
        role="button"
        tabIndex={0}
        title="Download invoice"
        aria-label="Download invoice"
        onClick={onInvoice}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onInvoice();
        }}
        style={orderTableActionIconStyle}
      />
      {/* <i
        className="bi bi-ban"
        role="button"
        tabIndex={0}
        title="Void order"
        aria-label="Void order"
        onClick={onVoid}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onVoid();
        }}
        style={orderTableActionIconStyle}
      /> */}
    </div>
  );
}
