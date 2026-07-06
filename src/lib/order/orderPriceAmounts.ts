import { roundMoney } from "../global/paymentAndCurrency";

function money(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type OrderUserPriceSource = { total_price?: number | null };
type OrderPartnerPriceSource = {
  service_price?: number | null;
  total_service_charge?: number | null;
};
type OrderLinePartnerPriceSource = { service_price?: number | null };

/** Customer bill — API `total_price` (user price). */
export function orderUserPriceAmount(order?: OrderUserPriceSource): number {
  return roundMoney(Math.max(0, money(order?.total_price)));
}

/** Partner service price — API `service_price` on line or order (not `sub_total`). */
export function orderPartnerPriceAmount(
  order?: OrderPartnerPriceSource,
  primary?: OrderLinePartnerPriceSource
): number {
  const fromItem = money(primary?.service_price);
  if (fromItem > 0) return roundMoney(fromItem);
  const fromOrder = money(order?.service_price);
  if (fromOrder > 0) return roundMoney(fromOrder);
  return roundMoney(money(order?.total_service_charge));
}
