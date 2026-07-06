import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { FinancialModel } from "../lib/models/FinancialModel";
import { showLog } from "../helper/utility";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";
import { sessionMayUseFranchiseIdApiFilter } from "../lib/franchise/headerFranchisePreference";
import {
  mapFinancialPaymentRecord,
  mapFinancialPaymentRecords,
} from "./financialOrderPaymentsMapper";

export type FinancialListFilters = {
  /** Table search — sent as `search` query param. */
  search?: string;
  /** @deprecated use `search` */
  keyword?: string;
  /** `in_progress` | `completed` | `cancelled` | `refunded` */
  order_status?: string;
  /** Legacy — not sent to financial-payments API */
  service_status?: string;
  user_id?: string;
  partner_id?: string;
  is_paid?: string;
  partner_paid_status?: string;
  sort?: string;
  payment_status?: string;
  customer_payment_status?: string;
  partner_payment_status?: string;
  from_date?: string;
  to_date?: string;
  order_id?: string;
  franchise_id?: string | null;
};

function parseListPayload(response: {
  success?: boolean;
  data?: Record<string, unknown>;
  message?: string;
}): {
  response: boolean;
  financials: FinancialModel[];
  totalPages: number;
  totalItems?: number;
} {
  if (!response.success) {
    showLog(response.message || "Failed to fetch financial order payments");
    return {
      response: false,
      financials: [],
      totalPages: 0,
      totalItems: undefined,
    };
  }

  const d = response.data ?? {};
  const inner =
    d.data != null && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : null;
  const recordsRaw = (inner?.records ?? d.records ?? []) as unknown[];
  const records = mapFinancialPaymentRecords(
    Array.isArray(recordsRaw) ? recordsRaw : []
  );
  const totalPagesVal = Number(inner?.totalPages ?? d.totalPages ?? 0);
  const totalItemsRaw = inner?.totalItems ?? d.totalItems;
  const totalItemsParsed =
    totalItemsRaw === undefined ||
    totalItemsRaw === null ||
    totalItemsRaw === ""
      ? undefined
      : Number(totalItemsRaw);
  const totalItems =
    totalItemsParsed !== undefined && !Number.isNaN(totalItemsParsed)
      ? totalItemsParsed
      : undefined;

  return {
    response: true,
    financials: records,
    totalPages: totalPagesVal,
    totalItems,
  };
}

/** Query params for `GET /api/order/financial-payments/getAll` (Postman §23A). */
function buildFinancialPaymentsQueryParams(
  page: number,
  pageSize: number,
  filters: FinancialListFilters,
  sortBy: ServerTableSortBy
): URLSearchParams {
  const primarySort = sortBy[0];
  const fidRaw = String(filters.franchise_id ?? "").trim();
  const franchiseId =
    fidRaw && fidRaw.toLowerCase() !== "all" && sessionMayUseFranchiseIdApiFilter()
      ? fidRaw
      : "";

  const searchText = (filters.search ?? filters.keyword)?.trim();

  const sortByField = primarySort?.id
    ? String(primarySort.id)
    : filters.sort?.trim() || "created_at";

  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(searchText && { search: searchText }),
    ...(filters.order_status && { order_status: filters.order_status }),
    ...(filters.customer_payment_status && {
      customer_payment_status: filters.customer_payment_status,
    }),
    ...(filters.partner_payment_status && {
      partner_payment_status: filters.partner_payment_status,
    }),
    ...(filters.from_date && { from_date: filters.from_date }),
    ...(filters.to_date && { to_date: filters.to_date }),
    ...(franchiseId ? { franchise_id: franchiseId } : {}),
    sort_by: sortByField,
    sort_order: primarySort ? (primarySort.desc ? "desc" : "asc") : "desc",
  });

  return params;
}

/** `GET /api/order/financial-payments/getAll` — Financial → Order Payments grid. */
export const fetchFinancial = async (
  page: number,
  pageSize: number,
  filters: FinancialListFilters,
  requestOpts?: { skipLoader?: boolean },
  sortBy: ServerTableSortBy = []
): Promise<{
  response: boolean;
  financials: FinancialModel[];
  totalPages: number;
  totalItems?: number;
}> => {
  const params = buildFinancialPaymentsQueryParams(
    page,
    pageSize,
    filters,
    sortBy
  );

  const response = await apiRequest(
    `${ApiPaths.ORDER_FINANCIAL_PAYMENTS_GET_ALL()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    requestOpts?.skipLoader ?? false
  );

  return parseListPayload(response);
};

/** `GET /api/order/financial-payments/get/:id` — same shape as one list row. */
export const fetchFinancialOrderById = async (
  id: string,
  requestOpts?: { skipLoader?: boolean }
): Promise<{ response: boolean; record: FinancialModel | null }> => {
  const response = await apiRequest(
    ApiPaths.ORDER_FINANCIAL_PAYMENTS_GET_BY_ID(id),
    "GET",
    undefined,
    false,
    requestOpts?.skipLoader ?? true
  );
  if (!response.success) {
    return { response: false, record: null };
  }
  const d = response.data ?? {};
  const inner =
    d.data != null && typeof d.data === "object" && !Array.isArray(d.data)
      ? d.data
      : d;
  const raw =
    (inner as { record?: Record<string, unknown> }).record ??
    (inner as Record<string, unknown>);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { response: true, record: null };
  }
  return {
    response: true,
    record: mapFinancialPaymentRecord(raw as Record<string, unknown>),
  };
};

/** `GET /order_service/getAll` — Partner Payments page & payout pending lines. */
function buildOrderServiceQueryParams(
  page: number,
  pageSize: number,
  filters: FinancialListFilters,
  sortBy: ServerTableSortBy
): URLSearchParams {
  const primarySort = sortBy[0];
  const fidRaw = String(filters.franchise_id ?? "").trim();
  const franchiseId =
    fidRaw && fidRaw.toLowerCase() !== "all" && sessionMayUseFranchiseIdApiFilter()
      ? fidRaw
      : "";

  const searchText = (filters.search ?? filters.keyword)?.trim();

  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(searchText && { search: searchText }),
    ...(filters.order_status && { order_status: filters.order_status }),
    ...(filters.service_status && { service_status: filters.service_status }),
    ...(filters.user_id && { user_id: filters.user_id }),
    ...(filters.partner_id && { partner_id: filters.partner_id }),
    ...(filters.is_paid && { is_paid: filters.is_paid.toLowerCase() }),
    ...(filters.partner_paid_status && {
      partner_paid_status: filters.partner_paid_status,
    }),
    ...(filters.sort && { sort: filters.sort }),
    ...(primarySort?.id && { sort_by: primarySort.id }),
    ...(primarySort && { sort_order: primarySort.desc ? "desc" : "asc" }),
    ...(filters.payment_status && { payment_status: filters.payment_status }),
    ...(filters.customer_payment_status && {
      customer_payment_status: filters.customer_payment_status,
    }),
    ...(filters.partner_payment_status && {
      partner_payment_status: filters.partner_payment_status,
    }),
    ...(filters.from_date && { from_date: filters.from_date }),
    ...(filters.to_date && { to_date: filters.to_date }),
    ...(filters.order_id && { order_id: filters.order_id }),
    ...(franchiseId ? { franchise_id: franchiseId } : {}),
  });

  return params;
}

export const fetchOrderServiceFinancial = async (
  page: number,
  pageSize: number,
  filters: FinancialListFilters,
  requestOpts?: { skipLoader?: boolean },
  sortBy: ServerTableSortBy = []
): Promise<{
  response: boolean;
  financials: FinancialModel[];
  totalPages: number;
  totalItems?: number;
}> => {
  const params = buildOrderServiceQueryParams(page, pageSize, filters, sortBy);

  const response = await apiRequest(
    `${ApiPaths.GET_ORDER_SERVICE_ALL()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    requestOpts?.skipLoader ?? false
  );

  return parseListPayload(response);
};

/** Paginated financial-payments rows (all pages). */
export async function fetchAllFinancialRowsMatching(
  filters: FinancialListFilters,
  batchSize = 250,
  opts?: { sortBy?: ServerTableSortBy }
): Promise<FinancialModel[] | null> {
  const first = await fetchFinancial(
    1,
    batchSize,
    filters,
    { skipLoader: true },
    opts?.sortBy ?? []
  );
  if (!first.response) return null;
  let all = [...first.financials];
  const totalPages = Math.max(1, first.totalPages);
  for (let p = 2; p <= totalPages; p++) {
    const next = await fetchFinancial(
      p,
      batchSize,
      filters,
      { skipLoader: true },
      opts?.sortBy ?? []
    );
    if (!next.response) break;
    all = all.concat(next.financials);
  }
  return all;
}

/** Paginated order_service rows (partner payout ledger credits). */
export async function fetchAllOrderServiceRowsMatching(
  filters: FinancialListFilters,
  batchSize = 250,
  opts?: { sortBy?: ServerTableSortBy }
): Promise<FinancialModel[] | null> {
  const first = await fetchOrderServiceFinancial(
    1,
    batchSize,
    filters,
    { skipLoader: true },
    opts?.sortBy ?? []
  );
  if (!first.response) return null;
  let all = [...first.financials];
  const totalPages = Math.max(1, first.totalPages);
  for (let p = 2; p <= totalPages; p++) {
    const next = await fetchOrderServiceFinancial(
      p,
      batchSize,
      filters,
      { skipLoader: true },
      opts?.sortBy ?? []
    );
    if (!next.response) break;
    all = all.concat(next.financials);
  }
  return all;
}
