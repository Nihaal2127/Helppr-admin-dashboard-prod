/**
 * Franchise-scoped catalog lists use mapping getAll with a query param:
 * `GET /franchise-category/getAll?franchise_id=…` and
 * `GET /franchise-service/getAll?franchise_id=…`
 * Paginated shape: `categories` / `services` + `totalPages` / `totalItems` / `currentPage`.
 * Legacy shape: mapping `records` + `all_categories` / `all_services`.
 */

import { ApiPaths } from "../global/remote/apiPaths";

const MONGO_OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

export function isValidMongoObjectId(id: string): boolean {
  const s = String(id ?? "").trim();
  if (!s || s === "undefined" || s === "null") return false;
  return MONGO_OBJECT_ID_RE.test(s);
}

/**
 * Returns a franchise id safe for scoped catalog requests (`?franchise_id=`), or `null` for global `GET …/getAll`.
 */
export function parseFranchiseIdForCatalogGetAll(
  franchiseId?: string | null
): string | null {
  const s = String(franchiseId ?? "").trim();
  if (!s || s.toLowerCase() === "all") return null;
  if (!isValidMongoObjectId(s)) return null;
  return s;
}

export type FranchiseCatalogListFilters = {
  keyword?: string;
  status?: string;
  sort?: string;
  is_request?: string;
  is_rejected?: string;
  /** Alias of `search` (sent as both when keyword/q used). */
  q?: string;
  /** Alias of `sort_order` when value is `asc` | `desc`. */
  order?: string;
};

export type BuildCatalogQueryInput = {
  page: number;
  limit: number;
  filters: FranchiseCatalogListFilters;
  /** Table sort: column id → API `sort_by`. */
  sortByField?: string;
  /** Table sort direction → `sort_order` unless `filters.order` overrides. */
  sortDesc?: boolean;
  /** Global `GET /service/getAll` only — forwarded when set. */
  city_id?: string;
  state_id?: string;
};

/**
 * Builds query string params documented for franchise + global catalog getAll
 * (`page`, `limit`, `search`/`q`, `sort_by`, `sort_order`/`order`, `is_active`, `is_request`, …).
 */
export function buildCatalogGetAllQueryParams(
  input: BuildCatalogQueryInput
): URLSearchParams {
  const {
    page,
    limit,
    filters,
    sortByField,
    sortDesc,
    city_id,
    state_id,
  } = input;
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("limit", String(limit));

  const kw = String(filters.keyword ?? "").trim();
  const qOnly = String(filters.q ?? "").trim();
  const searchVal = kw || qOnly;
  if (searchVal) {
    p.set("search", searchVal);
    p.set("q", searchVal);
  }

  const status = String(filters.status ?? "").trim();
  if (status && status !== "All") {
    p.set("is_active", status.toLowerCase());
  }

  if (filters.sort) p.set("sort", String(filters.sort));

  if (filters.is_request !== undefined && filters.is_request !== "") {
    p.set("is_request", String(filters.is_request));
  }
  if (filters.is_rejected !== undefined && filters.is_rejected !== "") {
    p.set("is_rejected", String(filters.is_rejected));
  }

  const orderAlias = String(filters.order ?? "").trim().toLowerCase();
  const sortOrderFromTable =
    sortDesc === true ? "desc" : sortDesc === false ? "asc" : undefined;
  const sort_order =
    orderAlias === "asc" || orderAlias === "desc"
      ? orderAlias
      : sortOrderFromTable;
  if (sortByField) p.set("sort_by", sortByField);
  if (sort_order) {
    p.set("sort_order", sort_order);
    p.set("order", sort_order);
  }

  const cid = String(city_id ?? "").trim();
  const sid = String(state_id ?? "").trim();
  if (cid) p.set("city_id", cid);
  if (sid) p.set("state_id", sid);

  return p;
}

export function catalogGetAllDebugLog(
  _label: "category" | "service",
  _franchiseId: string | null | undefined,
  _endpointPathWithQuery: string
): void {}

export function messageForCatalogGetAllFailure(
  status: number | undefined,
  serverMessage?: string
): string {
  const base = String(serverMessage ?? "").trim();
  if (base) return base;
  switch (status) {
    case 400:
      return "Invalid request. Check franchise id and filter values.";
    case 401:
      return "You are not signed in, or your session expired.";
    case 403:
      return "You are not allowed to view this franchise catalog.";
    case 404:
      return "Franchise not found or is no longer available.";
    case 500:
      return "Server error while loading the catalog. Please try again.";
    default:
      return "Failed to load catalog.";
  }
}

/** Path segment only (no `BASE_URL`). Scoped URL only when `franchiseId` is a valid ObjectId — caller must add `franchise_id` to the query string. */
export function buildCategoryGetAllPath(franchiseId?: string | null): string {
  const id = parseFranchiseIdForCatalogGetAll(franchiseId);
  if (id) return ApiPaths.GET_FRANCHISE_CATEGORY_ALL();
  return ApiPaths.GET_CATEGORY();
}

export function buildServiceGetAllPath(franchiseId?: string | null): string {
  const id = parseFranchiseIdForCatalogGetAll(franchiseId);
  if (id) return ApiPaths.GET_FRANCHISE_SERVICE_ALL();
  return ApiPaths.GET_SERVICE();
}
