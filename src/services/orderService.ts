/** Re-export orders module (implementation lives in `lib/order/orders.ts`). */
export * from "../lib/order/orders";
export {
  buildOrderAmountSummaryFromOrder,
  buildOrderAmountSummaryFromQuoteBreakdown,
} from "../lib/order/orderAmountSummary";
export type {
  OrderAmountSummaryDisplay,
  OrderAmountSummaryLines,
} from "../lib/order/orderAmountSummary";
