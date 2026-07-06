import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { showLog } from "../helper/utility";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";
import { franchiseIdForApiQuery } from "../lib/franchise/headerFranchisePreference";

/** One row from `GET /api/refund/getAll`. */
export type RefundListRow = {
  _id: string;
  order_id: string;
  order_mongo_id: string;
  order_unique_id: string;
  user_name: string;
  total_amount: number;
  user_paid: number;
  refund_amount: number;
  from_admin_commission: number;
  from_partner_wallet: number;
  date: string | null;
};

/** One row from `GET /api/refund/eligible-orders` (create modal). */
export type RefundEligibleOrder = {
  _id: string;
  order_unique_id: string;
  user_name: string;
  total_amount: number;
  user_paid: number;
  refundable_amount: number;
  admin_payable_amount: number;
  partner_payable_amount: number;
};

export type RefundListFilters = {
  order_id?: string;
  user_name?: string;
  from_date?: string;
  to_date?: string;
  franchise_id?: string | null;
};

export type RefundCreatePayload = {
  order_id: string;
  refund_amount: number;
  from_admin_commission: number;
  from_partner_wallet: number;
  date: string;
  notes?: string;
  payment_method?: string;
  transaction_reference?: string;
};

function parseListEnvelope(response: {
  success?: boolean;
  data?: Record<string, unknown>;
  message?: string;
}): {
  records: Record<string, unknown>[];
  totalPages: number;
} {
  if (!response.success) {
    return { records: [], totalPages: 0 };
  }
  const d = response.data ?? {};
  const inner =
    d.data != null && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : null;
  const recordsRaw = (inner?.records ?? d.records ?? []) as unknown[];
  const records = Array.isArray(recordsRaw) ? recordsRaw : [];
  const totalPagesVal = Number(inner?.totalPages ?? d.totalPages ?? 0);
  return {
    records: records.filter(
      (r) => r != null && typeof r === "object" && !Array.isArray(r)
    ) as Record<string, unknown>[],
    totalPages: totalPagesVal,
  };
}

function mapListRow(raw: Record<string, unknown>): RefundListRow {
  const mongoId = String(raw._id ?? "").trim();
  const displayOrderId = String(raw.order_id ?? "").trim();
  const orderMongo = String(
    raw.order_mongo_id ?? raw.order_id ?? ""
  ).trim();
  return {
    _id: mongoId,
    order_id: orderMongo,
    order_mongo_id: orderMongo,
    order_unique_id: displayOrderId || orderMongo,
    user_name: String(raw.user_name ?? "").trim() || "-",
    total_amount: Number(raw.total_amount ?? 0),
    user_paid: Number(raw.user_paid ?? 0),
    refund_amount: Number(raw.refund_amount ?? 0),
    from_admin_commission: Number(raw.from_admin_commission ?? 0),
    from_partner_wallet: Number(raw.from_partner_wallet ?? 0),
    date:
      raw.date != null
        ? String(raw.date)
        : raw.refund_date != null
          ? String(raw.refund_date)
          : null,
  };
}

function mapEligibleOrder(raw: Record<string, unknown>): RefundEligibleOrder {
  const mongoId = String(raw._id ?? "").trim();
  const userPaid = Number(raw.user_paid ?? 0);
  const refundable = Number(
    raw.refundable_amount ?? raw.refundable_balance ?? userPaid
  );
  return {
    _id: mongoId,
    order_unique_id: String(
      raw.order_id ?? raw.unique_id ?? raw.order_unique_id ?? mongoId
    ).trim(),
    user_name: String(raw.user_name ?? "").trim() || "-",
    total_amount: Number(raw.total_amount ?? 0),
    user_paid: userPaid,
    refundable_amount: refundable,
    admin_payable_amount: Number(
      raw.admin_payable_amount ?? raw.admin_commission ?? 0
    ),
    partner_payable_amount: Number(
      raw.partner_payable_amount ?? raw.partner_wallet_amount ?? 0
    ),
  };
}

function buildListQueryParams(
  page: number,
  pageSize: number,
  filters: RefundListFilters,
  sortBy: ServerTableSortBy
): URLSearchParams {
  const primarySort = sortBy[0];
  const fid = franchiseIdForApiQuery(filters.franchise_id);
  const orderId = String(filters.order_id ?? "").trim();
  const userName = String(filters.user_name ?? "").trim();
  return new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(orderId && { order_id: orderId }),
    ...(userName && { user_name: userName }),
    ...(filters.from_date?.trim() && { from_date: filters.from_date.trim() }),
    ...(filters.to_date?.trim() && { to_date: filters.to_date.trim() }),
    ...(fid ? { franchise_id: fid } : {}),
    sort_by: primarySort?.id ? String(primarySort.id) : "refund_date",
    sort_order: primarySort ? (primarySort.desc ? "desc" : "asc") : "desc",
  });
}

/** `GET /api/refund/getAll` */
export async function fetchRefundList(
  page: number,
  pageSize: number,
  filters: RefundListFilters,
  sortBy: ServerTableSortBy = [{ id: "refund_date", desc: true }],
  requestOpts?: { skipLoader?: boolean }
): Promise<{
  response: boolean;
  records: RefundListRow[];
  totalPages: number;
}> {
  const params = buildListQueryParams(page, pageSize, filters, sortBy);
  const response = await apiRequest(
    `${ApiPaths.REFUND_GET_ALL()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    requestOpts?.skipLoader ?? false
  );
  const { records: raw, totalPages } = parseListEnvelope(response);
  if (!response.success) {
    showLog(response.message || "Failed to fetch refunds");
    return { response: false, records: [], totalPages: 0 };
  }
  return {
    response: true,
    records: raw.map(mapListRow),
    totalPages: Math.max(1, totalPages || 1),
  };
}

/** `GET /api/refund/eligible-orders` — orders that can receive a refund. */
export async function fetchRefundEligibleOrders(args: {
  franchise_id?: string | null;
  order_id?: string;
  user_name?: string;
  page?: number;
  limit?: number;
}): Promise<{ response: boolean; orders: RefundEligibleOrder[] }> {
  const fid = franchiseIdForApiQuery(args.franchise_id);
  const params = new URLSearchParams({
    page: String(args.page ?? 1),
    limit: String(args.limit ?? 250),
    sort_by: "order_id",
    sort_order: "asc",
    ...(args.order_id?.trim() && { order_id: args.order_id.trim() }),
    ...(args.user_name?.trim() && { user_name: args.user_name.trim() }),
    ...(fid ? { franchise_id: fid } : {}),
  });
  const response = await apiRequest(
    `${ApiPaths.REFUND_ELIGIBLE_ORDERS()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    true
  );
  const { records: raw } = parseListEnvelope(response);
  if (!response.success) {
    showLog(response.message || "Failed to load eligible orders");
    return { response: false, orders: [] };
  }
  return {
    response: true,
    orders: raw.map(mapEligibleOrder),
  };
}

/** `GET /api/refund/getById/:id` */
export async function fetchRefundById(
  id: string
): Promise<{ response: boolean; refund: RefundListRow | null }> {
  const mongoId = String(id ?? "").trim();
  if (!mongoId) {
    return { response: false, refund: null };
  }
  const response = await apiRequest(
    ApiPaths.REFUND_GET_BY_ID(mongoId),
    "GET",
    undefined,
    false,
    true
  );
  if (!response.success) {
    showLog(response.message || "Failed to load refund");
    return { response: false, refund: null };
  }
  const d = response.data ?? {};
  const row =
    (d.data as Record<string, unknown> | undefined) ??
    (typeof d === "object" && !Array.isArray(d) ? d : null);
  if (!row || typeof row !== "object") {
    return { response: false, refund: null };
  }
  return { response: true, refund: mapListRow(row) };
}

/** Calendar `YYYY-MM-DD` → ISO datetime for API `date` field. */
export function refundDateToApiIso(ymd: string): string {
  const trimmed = ymd.trim();
  if (!trimmed) return new Date().toISOString();
  if (trimmed.includes("T")) return trimmed;
  return `${trimmed}T00:00:00.000Z`;
}

/** `POST /api/refund/create` */
export async function createRefund(
  payload: RefundCreatePayload
): Promise<boolean> {
  const body: Record<string, unknown> = {
    order_id: payload.order_id,
    refund_amount: payload.refund_amount,
    from_admin_commission: payload.from_admin_commission,
    from_partner_wallet: payload.from_partner_wallet,
    date: refundDateToApiIso(payload.date),
    payment_method: payload.payment_method ?? "refund",
    ...(payload.notes?.trim() && { notes: payload.notes.trim() }),
    ...(payload.transaction_reference?.trim() && {
      transaction_reference: payload.transaction_reference.trim(),
    }),
  };

  const response = await apiRequest(
    ApiPaths.REFUND_CREATE,
    "POST",
    body,
    false,
    false,
    false,
    true
  );
  if (response.success) return true;
  showLog(response.message || "Refund failed");
  return false;
}
