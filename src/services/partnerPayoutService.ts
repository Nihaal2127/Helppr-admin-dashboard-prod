import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { showLog } from "../helper/utility";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";
import { franchiseIdForApiQuery } from "../lib/franchise/headerFranchisePreference";

/** One row from `GET /api/partner_payout/getAll`. */
export type PartnerPayoutListRow = {
  _id: string;
  partner_id: string;
  partner_name: string;
  total_wallet_amount: number;
  last_withdraw_amount: number;
  last_withdraw_date: string | null;
  wallet_status: string;
};

/** `GET /api/partner_payout/partners` — pay modal dropdown. */
export type PartnerPayoutPartnerOption = {
  _id: string;
  partner_id: string;
  partner_name: string;
  total_wallet_amount: number;
  payable_balance: number;
};

/** `GET /api/partner_payout/show` ledger line. */
export type PartnerPayoutLedgerRow = {
  _id: string;
  transaction_type: "credit" | "debit";
  date?: string;
  created_at?: string;
  order_unique_id?: string | null;
  order_id?: string | null;
  order_mongo_id?: string | null;
  order_payment_id?: string | null;
  description?: string | null;
  payment_method?: string | null;
  amount: number;
};

export type PartnerPayoutShowPartner = {
  _id: string;
  partner_id: string;
  partner_name: string;
  total_wallet_amount: number;
};

export type PartnerPayoutListFilters = {
  search?: string;
  wallet_status?: string;
  from_date?: string;
  to_date?: string;
  franchise_id?: string | null;
};

export type PartnerPayoutShowFilters = {
  id: string;
  search?: string;
  from_date?: string;
  to_date?: string;
  transaction_type?: string;
  page?: number;
  limit?: number;
};

export type PartnerPayoutCreatePayload = {
  /** Partner Mongo `_id` (from list / partners dropdown). */
  partner_id: string;
  pay_now_amount: number;
  payment_method: string;
  description: string;
  franchise_id?: string;
};

function parseListEnvelope(response: {
  success?: boolean;
  data?: Record<string, unknown>;
  message?: string;
}): {
  records: Record<string, unknown>[];
  totalPages: number;
  totalItems?: number;
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
  const totalItemsRaw = inner?.totalItems ?? d.totalItems;
  const totalItemsParsed =
    totalItemsRaw === undefined ||
    totalItemsRaw === null ||
    totalItemsRaw === ""
      ? undefined
      : Number(totalItemsRaw);
  return {
    records: records.filter(
      (r) => r != null && typeof r === "object" && !Array.isArray(r)
    ) as Record<string, unknown>[],
    totalPages: totalPagesVal,
    totalItems:
      totalItemsParsed !== undefined && !Number.isNaN(totalItemsParsed)
        ? totalItemsParsed
        : undefined,
  };
}

function mapListRow(raw: Record<string, unknown>): PartnerPayoutListRow {
  const mongoId = String(raw._id ?? "").trim();
  return {
    _id: mongoId,
    partner_id: String(raw.partner_id ?? raw.user_id ?? "").trim(),
    partner_name: String(raw.partner_name ?? raw.name ?? "").trim(),
    total_wallet_amount: Number(raw.total_wallet_amount ?? raw.total_amount ?? 0),
    last_withdraw_amount: Number(
      raw.last_withdraw_amount ?? raw.last_payout_amount ?? 0
    ),
    last_withdraw_date:
      raw.last_withdraw_date != null
        ? String(raw.last_withdraw_date)
        : raw.last_paid_date != null
          ? String(raw.last_paid_date)
          : null,
    wallet_status: String(raw.wallet_status ?? "").trim().toLowerCase(),
  };
}

function mapPartnerOption(raw: Record<string, unknown>): PartnerPayoutPartnerOption {
  const mongoId = String(raw._id ?? "").trim();
  const wallet = Number(raw.total_wallet_amount ?? raw.total_amount ?? 0);
  const payable = Number(
    raw.payable_balance ?? raw.payable_amount ?? wallet
  );
  return {
    _id: mongoId,
    partner_id: String(raw.partner_id ?? raw.user_id ?? "").trim(),
    partner_name: String(raw.partner_name ?? raw.name ?? "").trim(),
    total_wallet_amount: wallet,
    payable_balance: payable,
  };
}

function mapLedgerRow(raw: Record<string, unknown>): PartnerPayoutLedgerRow {
  const tx = String(raw.transaction_type ?? raw.type ?? "debit")
    .trim()
    .toLowerCase();
  return {
    _id: String(raw._id ?? raw.id ?? ""),
    transaction_type: tx === "credit" ? "credit" : "debit",
    date: raw.date != null ? String(raw.date) : undefined,
    created_at: raw.created_at != null ? String(raw.created_at) : undefined,
    order_unique_id:
      raw.order_unique_id != null ? String(raw.order_unique_id) : null,
    order_id: raw.order_id != null ? String(raw.order_id) : null,
    order_mongo_id:
      raw.order_mongo_id != null
        ? String(raw.order_mongo_id)
        : raw.order_id != null && /^[a-f0-9]{24}$/i.test(String(raw.order_id))
          ? String(raw.order_id)
          : null,
    order_payment_id:
      raw.order_payment_id != null ? String(raw.order_payment_id) : null,
    description: raw.description != null ? String(raw.description) : null,
    payment_method:
      raw.payment_method != null ? String(raw.payment_method) : null,
    amount: Number(raw.amount ?? raw.pay_now_amount ?? 0),
  };
}

function buildListQueryParams(
  page: number,
  pageSize: number,
  filters: PartnerPayoutListFilters,
  sortBy: ServerTableSortBy
): URLSearchParams {
  const primarySort = sortBy[0];
  const fid = franchiseIdForApiQuery(filters.franchise_id);
  const walletStatus = String(filters.wallet_status ?? "").trim();
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(filters.search?.trim() && { search: filters.search.trim() }),
    ...(walletStatus && walletStatus !== "all" && {
      wallet_status: walletStatus,
    }),
    ...(filters.from_date?.trim() && { from_date: filters.from_date.trim() }),
    ...(filters.to_date?.trim() && { to_date: filters.to_date.trim() }),
    ...(fid ? { franchise_id: fid } : {}),
    sort_by: primarySort?.id ? String(primarySort.id) : "partner_name",
    sort_order: primarySort ? (primarySort.desc ? "desc" : "asc") : "asc",
  });
  return params;
}

/** `GET /api/partner_payout/getAll` */
export async function fetchPartnerPayoutList(
  page: number,
  pageSize: number,
  filters: PartnerPayoutListFilters,
  sortBy: ServerTableSortBy = [],
  requestOpts?: { skipLoader?: boolean }
): Promise<{
  response: boolean;
  records: PartnerPayoutListRow[];
  totalPages: number;
  totalItems?: number;
}> {
  const params = buildListQueryParams(page, pageSize, filters, sortBy);
  const response = await apiRequest(
    `${ApiPaths.PARTNER_PAYOUT_GET_ALL()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    requestOpts?.skipLoader ?? false
  );
  const { records: raw, totalPages, totalItems } = parseListEnvelope(response);
  if (!response.success) {
    showLog(response.message || "Failed to fetch partner payouts");
    return { response: false, records: [], totalPages: 0 };
  }
  return {
    response: true,
    records: raw.map(mapListRow),
    totalPages: Math.max(0, totalPages),
    totalItems,
  };
}

/** `GET /api/partner_payout/partners` — pay modal. */
export async function fetchPartnerPayoutPartners(args: {
  franchise_id?: string | null;
  search?: string;
  limit?: number;
}): Promise<{ response: boolean; partners: PartnerPayoutPartnerOption[] }> {
  const fid = franchiseIdForApiQuery(args.franchise_id);
  const params = new URLSearchParams({
    limit: String(args.limit ?? 250),
    ...(args.search?.trim() && { search: args.search.trim() }),
    ...(fid ? { franchise_id: fid } : {}),
  });
  const response = await apiRequest(
    `${ApiPaths.PARTNER_PAYOUT_PARTNERS()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    true
  );
  const { records: raw } = parseListEnvelope(response);
  if (!response.success) {
    return { response: false, partners: [] };
  }
  return {
    response: true,
    partners: raw.map(mapPartnerOption),
  };
}

/** `GET /api/partner_payout/show` */
export async function fetchPartnerPayoutShow(
  filters: PartnerPayoutShowFilters,
  requestOpts?: { skipLoader?: boolean }
): Promise<{
  response: boolean;
  partner: PartnerPayoutShowPartner | null;
  rows: PartnerPayoutLedgerRow[];
  totalPages: number;
}> {
  const id = String(filters.id ?? "").trim();
  if (!id) {
    return { response: false, partner: null, rows: [], totalPages: 0 };
  }
  const params = new URLSearchParams({
    id,
    page: String(filters.page ?? 1),
    limit: String(filters.limit ?? 10),
    ...(filters.search?.trim() && { search: filters.search.trim() }),
    ...(filters.from_date?.trim() && { from_date: filters.from_date.trim() }),
    ...(filters.to_date?.trim() && { to_date: filters.to_date.trim() }),
    ...(filters.transaction_type?.trim() &&
      filters.transaction_type !== "all" && {
        transaction_type: filters.transaction_type.trim(),
      }),
  });
  const response = await apiRequest(
    `${ApiPaths.PARTNER_PAYOUT_SHOW()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    requestOpts?.skipLoader ?? false
  );
  if (!response.success) {
    showLog(response.message || "Failed to load partner wallet ledger");
    return { response: false, partner: null, rows: [], totalPages: 0 };
  }
  const d = response.data ?? {};
  const inner =
    d.data != null && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : null;
  const partnerRaw =
    (inner?.partner as Record<string, unknown> | undefined) ??
    (d.partner as Record<string, unknown> | undefined);
  const { records: raw, totalPages } = parseListEnvelope(response);
  let partner: PartnerPayoutShowPartner | null = null;
  if (partnerRaw && typeof partnerRaw === "object") {
    const mapped = mapListRow(partnerRaw);
    partner = {
      _id: mapped._id || id,
      partner_id:
        mapped.partner_id ||
        String(partnerRaw.partner_id ?? partnerRaw.user_id ?? "").trim(),
      partner_name:
        mapped.partner_name ||
        String(partnerRaw.partner_name ?? partnerRaw.name ?? "").trim(),
      total_wallet_amount: Number(
        partnerRaw.total_wallet_amount ??
          partnerRaw.total_amount ??
          mapped.total_wallet_amount ??
          0
      ),
    };
  }
  return {
    response: true,
    partner,
    rows: raw.map(mapLedgerRow),
    totalPages: Math.max(1, Number(totalPages) || 1),
  };
}

/** `POST /api/partner_payout/create` */
export async function createPartnerPayout(
  payload: PartnerPayoutCreatePayload
): Promise<boolean> {
  const body: Record<string, unknown> = {
    partner_id: payload.partner_id,
    pay_now_amount: payload.pay_now_amount,
    payment_method: payload.payment_method,
    description: String(payload.description ?? "").trim(),
  };
  const fid = franchiseIdForApiQuery(payload.franchise_id);
  if (fid) body.franchise_id = fid;

  const response = await apiRequest(
    ApiPaths.PARTNER_PAYOUT_CREATE,
    "POST",
    body,
    false,
    false,
    false,
    true
  );
  if (response.success) return true;
  showLog(response.message || "Payout failed");
  return false;
}
