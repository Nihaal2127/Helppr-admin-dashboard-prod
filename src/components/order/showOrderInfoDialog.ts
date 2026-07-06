import React from "react";
import { openDialog } from "../../lib/global/DialogManager";

/**
 * Opens order details without pulling `OrderInfoDialog` + `lib/order/orders` into the
 * initial chunk of pages that only link to an order (financial lists, etc.).
 */
export function showOrderInfoDialog(
  orderId: string,
  onRefreshData: () => void
): void {
  void import("./OrderInfoDialog").then(({ default: OrderInfoDialog }) => {
    openDialog("order-details-modal", (close) =>
      React.createElement(OrderInfoDialog, {
        orderId,
        onClose: close,
        onRefreshData,
      })
    );
  });
}
