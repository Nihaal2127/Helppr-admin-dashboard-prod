import type { ServerTableSortBy } from "../global/serverTableSort";

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function patchPartnerPayoutSearchParams(
  prev: URLSearchParams,
  updates: Record<string, string | number | undefined | null>
): URLSearchParams {
  const next = new URLSearchParams(prev);
  for (const [key, val] of Object.entries(updates)) {
    const empty =
      val === undefined ||
      val === null ||
      val === "" ||
      (key === "wallet_status" && val === "all") ||
      (key === "transaction_type" && val === "all");
    if (empty) {
      next.delete(key);
    } else {
      next.set(key, String(val));
    }
  }
  return next;
}

export function sortByFromUrl(
  sortBy: string | null,
  sortOrder: string | null
): ServerTableSortBy {
  const id = sortBy?.trim();
  if (!id) return [];
  return [{ id, desc: sortOrder?.toLowerCase() === "desc" }];
}

export function sortToUrl(sort: ServerTableSortBy): {
  sort_by?: string;
  sort_order?: string;
} {
  const primary = sort[0];
  if (!primary?.id) return {};
  return {
    sort_by: primary.id,
    sort_order: primary.desc ? "desc" : "asc",
  };
}

/** List page: `/financial-partner-payout` */
export function readPartnerPayoutListUrl(sp: URLSearchParams) {
  return {
    search: sp.get("search")?.trim() ?? "",
    walletStatus: sp.get("wallet_status")?.trim() || "all",
    fromDate: sp.get("from_date")?.trim() ?? "",
    toDate: sp.get("to_date")?.trim() ?? "",
    franchiseId: sp.get("franchise_id")?.trim() ?? "",
    page: parsePositiveInt(sp.get("page"), 1),
    limit: parsePositiveInt(sp.get("limit"), 10),
    sortBy: sortByFromUrl(sp.get("sort_by"), sp.get("sort_order")),
  };
}

/** Detail ledger: `/financial-partner-payout-show` */
export function readPartnerPayoutLedgerUrl(sp: URLSearchParams) {
  const type = sp.get("transaction_type")?.trim() || "all";
  const typeFilter =
    type === "credit" || type === "debit" ? type : ("all" as const);
  return {
    partnerId: sp.get("id")?.trim() ?? "",
    search: sp.get("search")?.trim() ?? "",
    fromDate: sp.get("from_date")?.trim() ?? "",
    toDate: sp.get("to_date")?.trim() ?? "",
    transactionType: typeFilter,
    page: parsePositiveInt(sp.get("page"), 1),
    limit: parsePositiveInt(sp.get("limit"), 10),
  };
}
