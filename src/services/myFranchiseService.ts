import { fetchArea } from "./areaService";
import { fetchCategory } from "./categoryService";
import { fetchService } from "./servicesService";
import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { showErrorAlert } from "../lib/global/alertHelper";
import { getLocalStorage } from "../lib/global/localStorageHelper";
import { AppConstant, UserRole } from "../lib/global/AppConstant";
import { apiDocumentId } from "../helper/utility";
import { normalizeCalendarYmd } from "../helper/dateFormat";
import { genderForApiPayload } from "../lib/user/genderOptions";
import {
  createOrUpdateUser,
  createWebManagementUser,
  fetchUser,
  fetchUserById,
  menuKeysFromAvailablePages,
  menuKeysFromUserAccess,
  mapMenuKeysToAvailablePages,
  normalizePhoneForUserCreate,
  WEB_MANAGEMENT_USER_TYPE,
} from "./userService";
import type { AvailablePageEntry } from "./userService";

// Keep shapes local to this service so the UI imports a single typed surface.
export type EmployeeRow = {
  _id: string;
  employee_id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  area_name: string;
  is_active: boolean;
  gender?: string;
  date_of_birth?: string;
  profile_url?: string;
  /** Chat can be toggled only when `is_active`; inactive employees force this off. */
  chat_enabled?: boolean;
  /** `page` + `url` rows kept in UI and sent as `available_pages` to API. */
  accessible_screens?: AvailablePageEntry[];
  /** Editable round-trip: selected `mainMenuItems` keys. */
  screenPermissionKeys?: string[];
};

function dobForApiPayload(value?: string | null): string | undefined {
  return normalizeCalendarYmd(value);
}

function dobFromApiRaw(raw: Record<string, unknown>): string | undefined {
  const ymd = dobForApiPayload(
    String(raw.date_of_birth ?? raw.dateOfBirth ?? "").trim() || undefined
  );
  return ymd || undefined;
}

function profileUrlForApi(profileUrl?: string): string | undefined {
  const u = (profileUrl ?? "").trim();
  if (!u || u.startsWith("uploads/")) return undefined;
  return u;
}

export type AreaRow = {
  _id: string;
  area_name: string;
  city_name: string;
  state_name: string;
  /** Single pincode or comma-separated (API / legacy). */
  pincode?: string;
  /** Multiple pincodes when API returns an array. */
  pincodes?: string[] | string;
  pin_codes?: string[] | string;
  is_active: boolean;
};

export type ServiceRow = {
  _id: string;
  service_id: string;
  name: string;
  category_name: string;
  is_active: boolean;
};

export type CategoryRow = {
  _id: string;
  category_id: string;
  name: string;
  is_active: boolean;
  /** From `GET /category/get/:id` when API sends `service_names` (optional). */
  service_names?: string[];
};

export type RequestedApprovalStatus = "pending" | "approved" | "rejected";

export type RequestedServiceRow = {
  _id: string;
  name: string;
  category_id: string;
  category_name: string;
  description: string;
  image_url?: string;
  status: RequestedApprovalStatus;
  rejection_reason?: string;
  requested_by?: { id?: string; name?: string } | string;
};

export type RequestedCategoryRow = {
  _id: string;
  name: string;
  service_ids: string[];
  service_names: string[];
  description: string;
  image_url?: string;
  status: RequestedApprovalStatus;
  rejection_reason?: string;
  requested_by?: { id?: string; name?: string } | string;
};

type MyFranchiseBoxData = {
  employees: EmployeeRow[];
  areas: AreaRow[];
  services: ServiceRow[];
  categories: CategoryRow[];
  requested_services: RequestedServiceRow[];
  requested_categories: RequestedCategoryRow[];
};

/** Subset of `MyFranchiseBoxData` the UI can lazy-load per tab / view mode. */
export type MyFranchiseDataSlice =
  | "employees"
  | "areas"
  | "services"
  | "categories"
  | "requested_services"
  | "requested_categories";

function normalizeBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return String(value ?? "").toLowerCase() === "true";
}

/** Maps API `approval_status` / `is_rejected` (same rules as Service Management). */
export function mapRequestedApprovalStatusFromApi(
  raw: Record<string, unknown> | null | undefined
): RequestedApprovalStatus {
  if (!raw || typeof raw !== "object") return "pending";
  if (raw.is_rejected === true) return "rejected";
  const ap = String(raw.approval_status ?? raw.status ?? "")
    .trim()
    .toLowerCase();
  if (ap === "rejected" || ap === "reject") return "rejected";
  if (ap === "approved" || ap === "approve") return "approved";
  return "pending";
}

function mapApiRequestedServiceRow(raw: any): RequestedServiceRow {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rejection = String(rec.rejection_reason ?? "").trim();
  const requestedBy = rec.requested_by;
  return {
    _id: String(raw?._id ?? ""),
    name: String(raw?.name ?? "").trim() || "-",
    category_id: String(raw?.category_id ?? "").trim(),
    category_name: String(raw?.category_name ?? "").trim() || "-",
    description: String(raw?.desc ?? raw?.description ?? "").trim(),
    image_url: raw?.image_url ? String(raw.image_url) : undefined,
    status: mapRequestedApprovalStatusFromApi(rec),
    ...(rejection ? { rejection_reason: rejection } : {}),
    ...(requestedBy != null && requestedBy !== ""
      ? { requested_by: requestedBy as RequestedServiceRow["requested_by"] }
      : {}),
  };
}

function mapApiRequestedCategoryRow(raw: any): RequestedCategoryRow {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rejection = String(rec.rejection_reason ?? "").trim();
  const requestedBy = rec.requested_by;
  return {
    _id: String(raw?._id ?? ""),
    name: String(raw?.name ?? "").trim() || "-",
    service_ids: Array.isArray(raw?.service_ids)
      ? raw.service_ids.map((id: any) => String(id))
      : [],
    service_names: Array.isArray(raw?.service_names)
      ? raw.service_names.map((s: any) => String(s))
      : [],
    description: String(raw?.desc ?? raw?.description ?? "").trim(),
    image_url: raw?.image_url ? String(raw.image_url) : undefined,
    status: mapRequestedApprovalStatusFromApi(rec),
    ...(rejection ? { rejection_reason: rejection } : {}),
    ...(requestedBy != null && requestedBy !== ""
      ? { requested_by: requestedBy as RequestedCategoryRow["requested_by"] }
      : {}),
  };
}

/**
 * Map `/area/getAll` records into the my-franchise table shape. API uses `name`;
 * the grid expects `area_name` (and optional city/state/pincodes).
 */
function mapApiAreaToFranchiseAreaRow(raw: any): AreaRow {
  if (!raw) {
    return {
      _id: "",
      area_name: "—",
      city_name: "—",
      state_name: "—",
      is_active: false,
    };
  }
  const pincodesRaw =
    raw.pincodes ?? raw.pincode ?? raw.pin_codes ?? (raw as any).pincode_list;
  const pinList = Array.isArray(pincodesRaw)
    ? pincodesRaw.map((p: unknown) => String(p).trim()).filter(Boolean)
    : typeof pincodesRaw === "string"
    ? pincodesRaw
        .split(/[,\n]/)
        .map((p: string) => p.trim())
        .filter(Boolean)
    : [];

  const isActive = (() => {
    if (typeof raw.is_active === "boolean") return raw.is_active;
    if (raw.is_active === 1) return true;
    if (raw.is_active === 0) return false;
    if (
      String(raw.is_active).toLowerCase() === "active" ||
      String(raw.status).toLowerCase() === "active"
    )
      return true;
    if (
      String(raw.is_active).toLowerCase() === "inactive" ||
      String(raw.status).toLowerCase() === "inactive"
    )
      return false;
    return true;
  })();

  return {
    _id: String(raw._id ?? raw.id ?? ""),
    area_name:
      String(raw.area_name ?? raw.name ?? raw.title ?? "").trim() || "—",
    city_name:
      String(
        raw.city_name ??
          (raw.city &&
            (typeof raw.city === "object" ? raw.city.name : raw.city)) ??
          ""
      ).trim() || "—",
    state_name:
      String(
        raw.state_name ??
          (raw.state &&
            (typeof raw.state === "object" ? raw.state.name : raw.state)) ??
          ""
      ).trim() || "—",
    pincodes: pinList,
    pincode:
      typeof raw.pincode === "string" && !pinList.length
        ? raw.pincode
        : undefined,
    is_active: isActive,
  };
}

let cachedSessionFranchiseId: string | null = null;
let sessionFranchiseIdInFlight: Promise<string | undefined> | null = null;

async function resolveSessionFranchiseId(): Promise<string | undefined> {
  if (cachedSessionFranchiseId) return cachedSessionFranchiseId;

  const fromStorage = (getLocalStorage(AppConstant.partnerId) || "").trim();
  if (fromStorage) {
    cachedSessionFranchiseId = fromStorage;
    return fromStorage;
  }

  if (sessionFranchiseIdInFlight) return sessionFranchiseIdInFlight;

  sessionFranchiseIdInFlight = (async () => {
    const currentUserId = (
      getLocalStorage(AppConstant.createdById) || ""
    ).trim();
    if (!currentUserId) return undefined;
    const userRes = await fetchUserById(currentUserId);
    const franchiseId = String(
      (userRes.user as any)?.franchise_id ?? ""
    ).trim();
    if (!franchiseId) return undefined;
    cachedSessionFranchiseId = franchiseId;
    return franchiseId;
  })();

  try {
    return await sessionFranchiseIdInFlight;
  } finally {
    sessionFranchiseIdInFlight = null;
  }
}

type ServiceCatalogHint = { name?: string; category_name?: string };

type CategoryCatalogHint = {
  name?: string;
  service_names?: string[];
};

/** Query options for franchise ↔ catalogue mapping lists (server filters rows). */
export type FranchiseMappingFetchOpts = {
  /** When set, `GET …/franchise-*-category|service/getAll?is_active=…` (franchise on/off). Omit = all. */
  mappingIsActive?: boolean;
  /**
   * `GET …/franchise-service/getAll` → **`services`** (legacy **`all_services`**).
   * `GET …/franchise-category/getAll` → **`categories`** (legacy **`all_categories`**).
   * Query: `search`, `sort_by`, `sort_order` (see API parity docs).
   */
  catalogSearch?: string;
  catalogSortBy?: string;
  catalogSortOrder?: "asc" | "desc";
};

/** Options passed from My Franchise UI (summary Total / Active / Inactive + requested sub-mode). */
export type MyFranchiseDataFetchOptions = {
  franchiseMappingFilter?: "all" | "active" | "inactive";
  /** Global `category` / `service` getAll when `is_request=true`; default pending queue. */
  requestedApprovalStatus?: "pending" | "all";
  /** Franchise-service catalogue (`all_services`): server search (name, then category name). */
  serviceCatalogSearch?: string;
  /** `sort_by` for **service** catalogue only — use `name` (service name), not category. */
  serviceCatalogSortBy?: string;
  serviceCatalogSortOrder?: "asc" | "desc";
  /** Franchise-category catalogue (`all_categories`): server search on global category list. */
  categoryCatalogSearch?: string;
  /** `sort_by` for **category** catalogue only — use `name` (category name). */
  categoryCatalogSortBy?: string;
  categoryCatalogSortOrder?: "asc" | "desc";
};

export function myFranchiseDataCacheKey(
  slice: MyFranchiseDataSlice,
  opts?: MyFranchiseDataFetchOptions
): string {
  const m = opts?.franchiseMappingFilter ?? "all";
  const r = opts?.requestedApprovalStatus ?? "pending";
  const svcQ = String(opts?.serviceCatalogSearch ?? "").trim();
  const svcSb = String(opts?.serviceCatalogSortBy ?? "").trim();
  const svcSo = opts?.serviceCatalogSortOrder ?? "";
  const catQ = String(opts?.categoryCatalogSearch ?? "").trim();
  const catSb = String(opts?.categoryCatalogSortBy ?? "").trim();
  const catSo = opts?.categoryCatalogSortOrder ?? "";
  switch (slice) {
    case "categories":
      return `${slice}|m:${m}|q:${catQ}|sb:${catSb}|so:${catSo}`;
    case "services":
      return `${slice}|m:${m}|q:${svcQ}|sb:${svcSb}|so:${svcSo}`;
    case "requested_categories":
    case "requested_services":
      return `${slice}|r:${r}`;
    default:
      return slice;
  }
}

function franchiseMappingIsActiveFromFetchOptions(
  slice: MyFranchiseDataSlice,
  opts?: MyFranchiseDataFetchOptions
): boolean | undefined {
  if (slice !== "categories" && slice !== "services") return undefined;
  const f = opts?.franchiseMappingFilter ?? "all";
  if (f === "all") return undefined;
  return f === "active";
}

/** `GET …/franchise-service|category/getAll` — My Franchise catalogue (see API-Service-Category-Franchise-Requests.txt). */
type FranchiseServiceMapCache = {
  mapId: string;
  franchise_id: string;
  services_list: { service_id: string; is_active: boolean }[];
  /** Same response as `mergeFranchiseServiceListFromAllServices` — join locally, no per-id service GETs. */
  all_services?: unknown[];
  /** Labels from embedded `service_id` on mapping GET (merged after PUT when API returns embeds). */
  serviceCatalogHints?: Record<string, ServiceCatalogHint>;
  /** API may send legacy booleans or string[] of catalogue service ids (staging uses arrays). */
  active_services?: boolean | string[];
  inactive_services?: boolean | string[];
  order_number?: number;
};

type FranchiseCategoryMapCache = {
  mapId: string;
  franchise_id: string;
  categories_list: { category_id: string; is_active: boolean }[];
  /** Same response as `mergeFranchiseCategoryListFromAllCategories` — join locally, no `GET /category/get/:id`. */
  all_categories?: unknown[];
  /** Labels when `categories_list` embeds populated `category_id` objects. */
  categoryCatalogHints?: Record<string, CategoryCatalogHint>;
  active_categories?: boolean;
  inactive_categories?: boolean;
  order_number?: number;
};

let franchiseMapCacheScopeFid: string | null = null;
let cachedFranchiseServiceMap: FranchiseServiceMapCache | null = null;
let cachedFranchiseCategoryMap: FranchiseCategoryMapCache | null = null;

function syncFranchiseMapCacheScope(franchiseId: string) {
  if (franchiseMapCacheScopeFid !== franchiseId) {
    franchiseMapCacheScopeFid = franchiseId;
    cachedFranchiseServiceMap = null;
    cachedFranchiseCategoryMap = null;
  }
}

function listPayloadRecords(data: unknown): any[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const inner =
    d.data && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : d;
  const rec = inner.records ?? d.records;
  return Array.isArray(rec) ? rec : [];
}

function listPayloadTotalPages(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const d = data as Record<string, unknown>;
  const inner =
    d.data && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : d;
  const tp = Number(inner.totalPages ?? d.totalPages ?? 0);
  if (Number.isFinite(tp) && tp > 0) return tp;
  const totalItems = Number(inner.totalItems ?? d.totalItems ?? 0);
  if (Number.isFinite(totalItems) && totalItems > 0) {
    const limitRaw = Number(inner.limit ?? d.limit ?? 0);
    const lim =
      Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
    return Math.max(1, Math.ceil(totalItems / lim));
  }
  return 0;
}

function catalogPayloadRoot(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const d = data as Record<string, unknown>;
  return d.data && typeof d.data === "object" && !Array.isArray(d.data)
    ? (d.data as Record<string, unknown>)
    : d;
}

/** Paginated `GET /franchise-category|service/getAll` — `categories` / `services` + totals. */
function isPaginatedFranchiseCatalogRoot(
  root: Record<string, unknown>,
  pluralKey: "categories" | "services"
): boolean {
  return (
    Array.isArray(root[pluralKey]) &&
    (root.totalPages != null ||
      root.totalItems != null ||
      root.currentPage != null)
  );
}

/** Top-level array on paginated JSON (`categories`, `services`, or legacy `all_*`). */
function listPayloadRootArray(data: unknown, key: string): any[] {
  const root = catalogPayloadRoot(data);
  const arr = root[key];
  return Array.isArray(arr) ? arr : [];
}

function franchiseActiveFromCatalogDoc(
  doc: Record<string, unknown>
): boolean {
  const fa = doc.franchise_active;
  return typeof fa === "boolean" ? fa : normalizeBooleanLike(fa ?? false);
}

function buildCategoryCatalogHintsFromCatalogDocs(
  docs: unknown
): Record<string, CategoryCatalogHint> {
  const hints: Record<string, CategoryCatalogHint> = {};
  if (!Array.isArray(docs)) return hints;
  for (const item of docs) {
    if (!item || typeof item !== "object") continue;
    const doc = item as Record<string, unknown>;
    const id =
      apiDocumentId(doc._id) || apiDocumentId(doc) || String(doc._id ?? "").trim();
    if (!id) continue;
    const key = id.trim().toLowerCase();
    const name = String(doc.name ?? "").trim() || undefined;
    const service_names = serviceNamesFromCategoryDoc(doc);
    hints[key] = {
      ...(hints[key] ?? {}),
      ...(name ? { name } : {}),
      ...(service_names.length ? { service_names } : {}),
    };
  }
  return hints;
}

/** Build toggle cache from paginated `categories[]` (no mapping `records`). */
function buildCategoryMapCacheFromCatalogDocs(
  catalogDocs: unknown[],
  franchiseMeta: Record<string, unknown> | undefined,
  fallbackFranchiseId: string
): FranchiseCategoryMapCache | null {
  if (!catalogDocs.length) return null;
  const rowFid =
    apiDocumentId(franchiseMeta?._id) || String(fallbackFranchiseId ?? "").trim();
  if (!rowFid) return null;
  const categories_list: { category_id: string; is_active: boolean }[] = [];
  for (const item of catalogDocs) {
    if (!item || typeof item !== "object") continue;
    const doc = item as Record<string, unknown>;
    const cid =
      apiDocumentId(doc._id) || apiDocumentId(doc) || String(doc._id ?? "").trim();
    if (!cid) continue;
    categories_list.push({
      category_id: cid,
      is_active: franchiseActiveFromCatalogDoc(doc),
    });
  }
  if (!categories_list.length) return null;
  return {
    mapId: rowFid,
    franchise_id: rowFid,
    categories_list,
    all_categories: catalogDocs,
    categoryCatalogHints: buildCategoryCatalogHintsFromCatalogDocs(catalogDocs),
  };
}

/** Build toggle cache from paginated `services[]` (no mapping `records`). */
function buildServiceMapCacheFromCatalogDocs(
  catalogDocs: unknown[],
  franchiseMeta: Record<string, unknown> | undefined,
  fallbackFranchiseId: string
): FranchiseServiceMapCache | null {
  if (!catalogDocs.length) return null;
  const rowFid =
    apiDocumentId(franchiseMeta?._id) || String(fallbackFranchiseId ?? "").trim();
  if (!rowFid) return null;
  const services_list: { service_id: string; is_active: boolean }[] = [];
  for (const item of catalogDocs) {
    if (!item || typeof item !== "object") continue;
    const doc = item as Record<string, unknown>;
    const sid =
      apiDocumentId(doc._id) || apiDocumentId(doc) || String(doc._id ?? "").trim();
    if (!sid) continue;
    services_list.push({
      service_id: sid,
      is_active: franchiseActiveFromCatalogDoc(doc),
    });
  }
  if (!services_list.length) return null;
  return {
    mapId: rowFid,
    franchise_id: rowFid,
    services_list,
    all_services: catalogDocs,
    serviceCatalogHints: buildServiceCatalogHintsFromServiceDocArray(catalogDocs),
  };
}

/** When `GET …/franchise-service/getAll` embeds populated `service_id` docs, reuse labels and avoid redundant catalogue GETs. */
function buildServiceCatalogHintsFromRawList(
  rawList: unknown
): Record<string, ServiceCatalogHint> {
  const hints: Record<string, ServiceCatalogHint> = {};
  if (!Array.isArray(rawList)) return hints;
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const ref = row.service_id;
    if (!ref || typeof ref !== "object") continue;
    const doc = ref as Record<string, unknown>;
    const id =
      apiDocumentId(doc._id) || apiDocumentId(doc) || String(doc._id ?? "").trim();
    if (!id) continue;
    const key = id.trim().toLowerCase();
    const name = String(doc.name ?? "").trim() || undefined;
    let category_name: string | undefined;
    const flatCn = doc.category_name;
    if (typeof flatCn === "string" && flatCn.trim()) {
      category_name = flatCn.trim();
    } else {
      const cat = doc.category_id;
      if (cat && typeof cat === "object") {
        const nm = String((cat as { name?: unknown }).name ?? "").trim();
        if (nm) category_name = nm;
      }
    }
    hints[key] = { ...(hints[key] ?? {}), name, category_name };
  }
  return hints;
}

function buildCategoryCatalogHintsFromRawList(
  rawList: unknown
): Record<string, CategoryCatalogHint> {
  const hints: Record<string, CategoryCatalogHint> = {};
  if (!Array.isArray(rawList)) return hints;
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const ref = row.category_id;
    if (!ref || typeof ref !== "object") continue;
    const rawDoc = ref as Record<string, unknown>;
    const doc =
      rawDoc._doc &&
      typeof rawDoc._doc === "object" &&
      !Array.isArray(rawDoc._doc)
        ? (rawDoc._doc as Record<string, unknown>)
        : rawDoc;
    const id =
      apiDocumentId(doc._id) || apiDocumentId(doc) || String(doc._id ?? "").trim();
    if (!id) continue;
    const key = id.trim().toLowerCase();
    const name = String(doc.name ?? "").trim() || undefined;
    let service_names: string[] | undefined;
    const fromRelated = serviceNamesFromCategoryDoc(doc);
    if (fromRelated.length) {
      service_names = fromRelated;
    } else {
      const sn = doc.service_names;
      if (Array.isArray(sn)) {
        const names = sn
          .map((x) => (typeof x === "string" ? x : String(x ?? "")).trim())
          .filter(Boolean);
        if (names.length) service_names = names;
      }
    }
    hints[key] = {
      ...(hints[key] ?? {}),
      ...(name ? { name } : {}),
      ...(service_names?.length ? { service_names } : {}),
    };
  }
  return hints;
}

/** Franchise admin / employee JWTs are franchise-scoped; omit `franchise_id` on catalogue mapping GETs. Super admin / staff pass `franchise_id` when filtering. */
function isFranchiseCatalogTokenScoped(): boolean {
  const currentUserRole = String(
    getLocalStorage(AppConstant.userRole) ?? ""
  ).trim();
  return (
    currentUserRole === UserRole.FRANCHISE_ADMIN ||
    currentUserRole === UserRole.EMPLOYEE
  );
}

function orderedCategoryRows(
  rows: { category_id: string; is_active: boolean }[],
  orderIds: unknown
) {
  if (!Array.isArray(orderIds) || !orderIds.length) return rows;
  const pos = new Map(
    orderIds.map((x, i) => [String(x).trim().toLowerCase(), i])
  );
  return [...rows].sort(
    (a, b) =>
      (pos.get(a.category_id.toLowerCase()) ?? 1e9) -
      (pos.get(b.category_id.toLowerCase()) ?? 1e9)
  );
}

/**
 * When `GET …/franchise-category/getAll` returns `all_categories`, use it as the
 * full catalogue for My Franchise while keeping mapping `is_active` when the row
 * exists in `categories_list`, otherwise `franchise_active`. Same `CategoryRow`
 * shape and table columns; expands `categories_list` so toggles resolve every row.
 */
function mergeFranchiseCategoryListFromAllCategories(
  normalizedFromMap: { category_id: string; is_active: boolean }[],
  allCats: unknown[] | undefined,
  orderIds: unknown
): { category_id: string; is_active: boolean }[] {
  if (!Array.isArray(allCats) || !allCats.length) {
    return orderedCategoryRows(normalizedFromMap, orderIds);
  }
  const fromMap = new Map(
    normalizedFromMap.map((c) => [c.category_id.trim().toLowerCase(), c.is_active])
  );
  const seen = new Set<string>();
  const merged: { category_id: string; is_active: boolean }[] = [];

  for (const item of allCats) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const cid =
      apiDocumentId(o._id) || apiDocumentId(o) || String(o._id ?? "").trim();
    if (!cid) continue;
    const key = cid.trim().toLowerCase();
    seen.add(key);
    const fa = o.franchise_active;
    const franchiseActive =
      typeof fa === "boolean" ? fa : normalizeBooleanLike(fa ?? false);
    const is_active = fromMap.has(key) ? fromMap.get(key)! : franchiseActive;
    merged.push({ category_id: cid, is_active });
  }

  for (const row of normalizedFromMap) {
    const key = row.category_id.trim().toLowerCase();
    if (!seen.has(key)) {
      merged.push(row);
      seen.add(key);
    }
  }

  return orderedCategoryRows(merged, orderIds);
}

function orderedServiceRows(
  rows: { service_id: string; is_active: boolean }[],
  orderIds: unknown
) {
  if (!Array.isArray(orderIds) || !orderIds.length) return rows;
  const pos = new Map(
    orderIds.map((x, i) => [String(x).trim().toLowerCase(), i])
  );
  return [...rows].sort(
    (a, b) =>
      (pos.get(a.service_id.toLowerCase()) ?? 1e9) -
      (pos.get(b.service_id.toLowerCase()) ?? 1e9)
  );
}

/**
 * When `GET …/franchise-service/getAll` returns `all_services`, use it as the full
 * catalogue for My Franchise while keeping mapping `is_active` when the row exists
 * in `services_list`, otherwise `franchise_active`. Same shape as category merge.
 */
function mergeFranchiseServiceListFromAllServices(
  normalizedFromMap: { service_id: string; is_active: boolean }[],
  allSvcs: unknown[] | undefined,
  orderIds: unknown
): { service_id: string; is_active: boolean }[] {
  if (!Array.isArray(allSvcs) || !allSvcs.length) {
    return orderedServiceRows(normalizedFromMap, orderIds);
  }
  const fromMap = new Map(
    normalizedFromMap.map((s) => [s.service_id.trim().toLowerCase(), s.is_active])
  );
  const seen = new Set<string>();
  const merged: { service_id: string; is_active: boolean }[] = [];

  for (const item of allSvcs) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const sid =
      apiDocumentId(o._id) || apiDocumentId(o) || String(o._id ?? "").trim();
    if (!sid) continue;
    const docCandidates = catalogueServiceDocIdCandidates(o);
    const cands = docCandidates.length ? docCandidates : [sid];
    for (const c of cands) {
      seen.add(c.trim().toLowerCase());
    }
    const fa = o.franchise_active;
    const franchiseActive =
      typeof fa === "boolean" ? fa : normalizeBooleanLike(fa ?? false);
    const resolved = resolveServiceMappingIsActive(
      fromMap,
      normalizedFromMap,
      cands
    );
    const is_active =
      resolved !== undefined ? resolved : franchiseActive;
    merged.push({ service_id: sid, is_active });
  }

  for (const row of normalizedFromMap) {
    const key = row.service_id.trim().toLowerCase();
    if (!seen.has(key)) {
      merged.push(row);
      seen.add(key);
    }
  }

  return orderedServiceRows(merged, orderIds);
}

/** Hints keyed by catalogue service Mongo `_id` from flat `all_services` docs. */
function buildServiceCatalogHintsFromServiceDocArray(
  docs: unknown
): Record<string, ServiceCatalogHint> {
  const hints: Record<string, ServiceCatalogHint> = {};
  if (!Array.isArray(docs)) return hints;
  for (const item of docs) {
    if (!item || typeof item !== "object") continue;
    const doc = item as Record<string, unknown>;
    const id =
      apiDocumentId(doc._id) || apiDocumentId(doc) || String(doc._id ?? "").trim();
    if (!id) continue;
    const key = id.trim().toLowerCase();
    const name = String(doc.name ?? "").trim() || undefined;
    let category_name: string | undefined;
    const flatCn = doc.category_name;
    if (typeof flatCn === "string" && flatCn.trim()) {
      category_name = flatCn.trim();
    } else {
      const cat = doc.category_id;
      if (cat && typeof cat === "object") {
        category_name =
          String((cat as Record<string, unknown>).name ?? "").trim() ||
          undefined;
      }
    }
    hints[key] = {
      ...(hints[key] ?? {}),
      ...(name ? { name } : {}),
      ...(category_name ? { category_name } : {}),
    };
  }
  return hints;
}

/** Match catalogue `_id` to map `service_id` / `category_id` (case-insensitive 24-hex). */
function idsLooselyEqual(a: string, b: string): boolean {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.toLowerCase() === y.toLowerCase();
}

/** Mongo `_id` and any distinct `service_id` on a catalogue row (mapping may key either). */
function catalogueServiceDocIdCandidates(doc: Record<string, unknown>): string[] {
  const raw: string[] = [];
  const mongo =
    apiDocumentId(doc._id) ||
    apiDocumentId(doc) ||
    String(doc._id ?? "").trim();
  if (mongo) raw.push(mongo);
  const refId = apiDocumentId(doc.service_id);
  if (refId) raw.push(refId);
  const plain = doc.service_id;
  if (
    (typeof plain === "string" || typeof plain === "number") &&
    String(plain).trim()
  ) {
    const p = String(plain).trim();
    if (!raw.some((x) => idsLooselyEqual(x, p))) raw.push(p);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const t = x.trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function resolveServiceMappingIsActive(
  fromMap: Map<string, boolean>,
  normalizedRows: { service_id: string; is_active: boolean }[],
  docCandidates: string[]
): boolean | undefined {
  for (const cand of docCandidates) {
    const key = cand.trim().toLowerCase();
    if (fromMap.has(key)) return fromMap.get(key);
  }
  for (const row of normalizedRows) {
    for (const cand of docCandidates) {
      if (idsLooselyEqual(row.service_id, cand)) return row.is_active;
    }
  }
  for (const [mapKey, val] of Array.from(fromMap.entries())) {
    for (const cand of docCandidates) {
      if (idsLooselyEqual(mapKey, cand)) return val;
    }
  }
  return undefined;
}

function findFranchiseServiceListIndex(
  list: { service_id: string; is_active: boolean }[],
  catalogueMongoOrServiceId: string
): number {
  const id = String(catalogueMongoOrServiceId ?? "").trim();
  return list.findIndex((s) => idsLooselyEqual(s.service_id, id));
}

/** Resolve `services_list` row when UI sends catalogue `_id` or `service_id` that must match embedded catalogue docs. */
function resolveFranchiseServiceListIndex(
  map: FranchiseServiceMapCache,
  catalogueMongoOrServiceId: string
): number {
  const id = String(catalogueMongoOrServiceId ?? "").trim();
  if (!id) return -1;
  let idx = findFranchiseServiceListIndex(map.services_list, id);
  if (idx >= 0) return idx;
  for (const item of map.all_services ?? []) {
    if (!item || typeof item !== "object") continue;
    const doc = item as Record<string, unknown>;
    const mongo =
      apiDocumentId(doc._id) ||
      apiDocumentId(doc) ||
      String(doc._id ?? "").trim();
    const altSvc = String(doc.service_id ?? "").trim();
    if (!idsLooselyEqual(mongo, id) && !idsLooselyEqual(altSvc, id)) continue;
    for (const cand of [mongo, altSvc].filter((x) => String(x ?? "").trim())) {
      idx = findFranchiseServiceListIndex(map.services_list, String(cand));
      if (idx >= 0) return idx;
    }
  }
  return -1;
}

function findFranchiseCategoryListIndex(
  list: { category_id: string; is_active: boolean }[],
  catalogueMongoOrCategoryId: string
): number {
  const id = String(catalogueMongoOrCategoryId ?? "").trim();
  return list.findIndex((c) => idsLooselyEqual(c.category_id, id));
}

function pickFranchiseScopedRecord(records: any[], franchiseId: string): any | null {
  if (!Array.isArray(records) || !records.length) return null;
  const fid = String(franchiseId ?? "").trim();
  if (!fid) return records[0];
  return (
    records.find((raw) => apiDocumentId(raw?.franchise_id) === fid) ??
    records[0]
  );
}

const franchiseServiceMapInflight = new Map<
  string,
  Promise<FranchiseServiceMapCache | null>
>();
const franchiseCategoryMapInflight = new Map<
  string,
  Promise<FranchiseCategoryMapCache | null>
>();

async function fetchFranchiseServiceMapForFranchiseDeduped(
  franchiseId: string,
  mapOpts?: FranchiseMappingFetchOpts
): Promise<FranchiseServiceMapCache | null> {
  const fid = String(franchiseId ?? "").trim();
  const scoped = isFranchiseCatalogTokenScoped();
  if (!scoped && !fid) return null;
  const baseKey = fid || (scoped ? "__scoped__" : "");
  if (!baseKey) return null;
  const mapTag =
    mapOpts?.mappingIsActive === true
      ? "1"
      : mapOpts?.mappingIsActive === false
      ? "0"
      : "all";
  const q = String(mapOpts?.catalogSearch ?? "").trim();
  const sb = String(mapOpts?.catalogSortBy ?? "").trim();
  const so = mapOpts?.catalogSortOrder ?? "";
  const dedupeKey = `${baseKey}|svc|map:${mapTag}|q:${q}|sb:${sb}|so:${so}`;
  const existing = franchiseServiceMapInflight.get(dedupeKey);
  if (existing) return existing;
  const p = fetchFranchiseServiceMapForFranchise(fid, mapOpts).finally(() => {
    franchiseServiceMapInflight.delete(dedupeKey);
  });
  franchiseServiceMapInflight.set(dedupeKey, p);
  return p;
}

async function fetchFranchiseCategoryMapForFranchiseDeduped(
  franchiseId: string,
  mapOpts?: FranchiseMappingFetchOpts
): Promise<FranchiseCategoryMapCache | null> {
  const fid = String(franchiseId ?? "").trim();
  const scoped = isFranchiseCatalogTokenScoped();
  if (!scoped && !fid) return null;
  const baseKey = fid || (scoped ? "__scoped__" : "");
  if (!baseKey) return null;
  const mapTag =
    mapOpts?.mappingIsActive === true
      ? "1"
      : mapOpts?.mappingIsActive === false
      ? "0"
      : "all";
  const q = String(mapOpts?.catalogSearch ?? "").trim();
  const sb = String(mapOpts?.catalogSortBy ?? "").trim();
  const so = mapOpts?.catalogSortOrder ?? "";
  const dedupeKey = `${baseKey}|cat|map:${mapTag}|q:${q}|sb:${sb}|so:${so}`;
  const existing = franchiseCategoryMapInflight.get(dedupeKey);
  if (existing) return existing;
  const p = fetchFranchiseCategoryMapForFranchise(fid, mapOpts).finally(() => {
    franchiseCategoryMapInflight.delete(dedupeKey);
  });
  franchiseCategoryMapInflight.set(dedupeKey, p);
  return p;
}

/** Pending franchise catalogue requests (exclude rejected / approved rows). */
function includeInFranchisePendingRequests(record: any): boolean {
  if (!record || typeof record !== "object") return false;
  if (record.is_request === false) return false;
  if (record.is_rejected === true) return false;
  const ap = String(record.approval_status ?? record.status ?? "")
    .trim()
    .toLowerCase();
  if (ap === "rejected" || ap === "reject") return false;
  if (ap === "approve" || ap === "approved") return false;
  return true;
}

function normalizeFranchiseServiceList(
  raw: unknown
): { service_id: string; is_active: boolean }[] {
  if (!Array.isArray(raw)) return [];
  const out: { service_id: string; is_active: boolean }[] = [];
  for (const item of raw) {
    if (item == null) continue;
    if (typeof item === "string" || typeof item === "number") {
      const sid = String(item).trim();
      if (sid) out.push({ service_id: sid, is_active: true });
      continue;
    }
    if (typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const sid =
      apiDocumentId(o.service_id) ||
      apiDocumentId(o._id) ||
      String(o.id ?? "").trim();
    if (!sid) continue;
    /** Row `is_active` = franchise on/off; nested `service_id.is_active` is catalogue (ignored here). */
    const rowActive =
      o.is_active !== undefined && o.is_active !== null
        ? normalizeBooleanLike(o.is_active)
        : true;
    out.push({ service_id: sid, is_active: rowActive });
  }
  return out;
}

function extractFranchiseServiceIdStringsFromArray(arr: unknown[]): string[] {
  const out: string[] = [];
  for (const x of arr) {
    if (x == null) continue;
    if (typeof x === "string" || typeof x === "number") {
      const s = String(x).trim();
      if (s) out.push(s);
      continue;
    }
    if (typeof x === "object") {
      const o = x as Record<string, unknown>;
      const id =
        apiDocumentId(o._id) ||
        apiDocumentId(o) ||
        String(o.id ?? "").trim();
      if (id) out.push(id.trim());
    }
  }
  return out;
}

function idSetFromFranchiseServiceIdArray(arr: unknown[]): Set<string> {
  return new Set(
    extractFranchiseServiceIdStringsFromArray(arr).map((s) => s.toLowerCase())
  );
}

/**
 * Staging franchise-service records use `active_services` / `inactive_services` as id arrays.
 * `services_list[].is_active` alone can disagree with catalogue `franchise_active` after merge — hydrate from arrays first.
 */
function hydrateFranchiseServiceListFromActiveInactiveArrays(
  rows: { service_id: string; is_active: boolean }[],
  activeRaw: unknown,
  inactiveRaw: unknown
): { service_id: string; is_active: boolean }[] {
  const useActive = Array.isArray(activeRaw);
  const useInactive = Array.isArray(inactiveRaw);
  if (!useActive && !useInactive) return rows.map((r) => ({ ...r }));
  const activeSet = useActive ? idSetFromFranchiseServiceIdArray(activeRaw) : null;
  const inactiveSet = useInactive
    ? idSetFromFranchiseServiceIdArray(inactiveRaw)
    : null;
  return rows.map((r) => {
    const k = r.service_id.trim().toLowerCase();
    let is_active = r.is_active;
    if (activeSet?.has(k)) is_active = true;
    else if (inactiveSet?.has(k)) is_active = false;
    return { service_id: r.service_id, is_active };
  });
}

function franchiseServiceActiveInactiveSnapshotFromRecord(
  rec: Record<string, unknown> | null | undefined
): Pick<FranchiseServiceMapCache, "active_services" | "inactive_services"> {
  const snap: Pick<
    FranchiseServiceMapCache,
    "active_services" | "inactive_services"
  > = {};
  if (!rec) return snap;
  const a = rec.active_services;
  const b = rec.inactive_services;
  if (typeof a === "boolean") snap.active_services = a;
  else if (Array.isArray(a)) snap.active_services = extractFranchiseServiceIdStringsFromArray(a);
  if (typeof b === "boolean") snap.inactive_services = b;
  else if (Array.isArray(b))
    snap.inactive_services = extractFranchiseServiceIdStringsFromArray(b);
  return snap;
}

function normalizeFranchiseCategoryList(
  raw: unknown
): { category_id: string; is_active: boolean }[] {
  if (!Array.isArray(raw)) return [];
  const out: { category_id: string; is_active: boolean }[] = [];
  for (const item of raw) {
    if (item == null) continue;
    if (typeof item === "string" || typeof item === "number") {
      const cid = String(item).trim();
      if (cid) out.push({ category_id: cid, is_active: true });
      continue;
    }
    if (typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const cid =
      apiDocumentId(o.category_id) ||
      apiDocumentId(o._id) ||
      String(o.id ?? "").trim();
    if (!cid) continue;
    const rowActive =
      o.is_active !== undefined && o.is_active !== null
        ? normalizeBooleanLike(o.is_active)
        : true;
    out.push({
      category_id: cid,
      is_active: rowActive,
    });
  }
  return out;
}

async function fetchFranchiseServiceMapForFranchise(
  franchiseId: string,
  mapOpts?: FranchiseMappingFetchOpts
): Promise<FranchiseServiceMapCache | null> {
  const fid = String(franchiseId ?? "").trim();
  const scoped = isFranchiseCatalogTokenScoped();
  if (!scoped && !fid) return null;
  const limit = 50;
  const maxPages = 30;
  const accumulatedSvcs: unknown[] = [];
  let franchiseMeta: Record<string, unknown> | undefined;
  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (!scoped && fid) params.set("franchise_id", fid);
    if (mapOpts?.mappingIsActive === true) params.set("is_active", "true");
    else if (mapOpts?.mappingIsActive === false)
      params.set("is_active", "false");
    const searchQ = String(mapOpts?.catalogSearch ?? "").trim();
    if (searchQ) params.set("search", searchQ);
    const sortByApi = String(mapOpts?.catalogSortBy ?? "").trim();
    if (sortByApi) {
      params.set("sort_by", sortByApi);
      params.set(
        "sort_order",
        mapOpts?.catalogSortOrder === "desc" ? "desc" : "asc"
      );
    }
    // eslint-disable-next-line no-await-in-loop
    const response = await apiRequest(
      `${ApiPaths.GET_FRANCHISE_SERVICE_ALL()}?${params.toString()}`,
      "GET",
      undefined,
      false,
      true,
      true,
      true
    );
    if (!response.success) {
      return accumulatedSvcs.length
        ? buildServiceMapCacheFromCatalogDocs(accumulatedSvcs, franchiseMeta, fid)
        : null;
    }
    const root = catalogPayloadRoot(response.data);
    if (isPaginatedFranchiseCatalogRoot(root, "services")) {
      const pageSvcs = Array.isArray(root.services) ? root.services : [];
      accumulatedSvcs.push(...pageSvcs);
      if (root.franchise && typeof root.franchise === "object") {
        franchiseMeta = root.franchise as Record<string, unknown>;
      }
      const totalPages = listPayloadTotalPages(response.data);
      if (!totalPages || page >= totalPages) {
        return buildServiceMapCacheFromCatalogDocs(
          accumulatedSvcs,
          franchiseMeta,
          fid
        );
      }
      continue;
    }
    const records = listPayloadRecords(response.data);
    const raw = pickFranchiseScopedRecord(records, fid);
    if (raw) {
      const rowFid = apiDocumentId(raw?.franchise_id) || fid;
      const rawRec = raw as Record<string, unknown>;
      const normalized = hydrateFranchiseServiceListFromActiveInactiveArrays(
        normalizeFranchiseServiceList(raw?.services_list),
        rawRec.active_services,
        rawRec.inactive_services
      );
      const pageSvcs = listPayloadRootArray(response.data, "services");
      const allSvcs =
        pageSvcs.length > 0
          ? pageSvcs
          : listPayloadRootArray(response.data, "all_services");
      const preserveApiCatalogOrder =
        Boolean(String(mapOpts?.catalogSearch ?? "").trim()) ||
        Boolean(String(mapOpts?.catalogSortBy ?? "").trim());
      const merged = mergeFranchiseServiceListFromAllServices(
        normalized,
        allSvcs,
        preserveApiCatalogOrder ? undefined : raw?.services_order
      );
      const services_list = hydrateFranchiseServiceListFromActiveInactiveArrays(
        merged,
        rawRec.active_services,
        rawRec.inactive_services
      );
      if (services_list.length) {
        const mapId = String(raw?._id ?? "").trim();
        if (mapId) {
          const hintsFromList = buildServiceCatalogHintsFromRawList(
            raw?.services_list
          );
          const hintsFromAll =
            buildServiceCatalogHintsFromServiceDocArray(allSvcs);
          return {
            mapId,
            franchise_id: rowFid,
            services_list,
            ...(allSvcs.length ? { all_services: allSvcs } : {}),
            serviceCatalogHints: { ...hintsFromAll, ...hintsFromList },
            ...franchiseServiceActiveInactiveSnapshotFromRecord(rawRec),
            order_number:
              typeof raw?.order_number === "number"
                ? raw.order_number
                : undefined,
          };
        }
      }
    }
    const totalPages = listPayloadTotalPages(response.data);
    if (!totalPages || page >= totalPages) break;
  }
  return buildServiceMapCacheFromCatalogDocs(accumulatedSvcs, franchiseMeta, fid);
}

async function fetchFranchiseCategoryMapForFranchise(
  franchiseId: string,
  mapOpts?: FranchiseMappingFetchOpts
): Promise<FranchiseCategoryMapCache | null> {
  const fid = String(franchiseId ?? "").trim();
  const scoped = isFranchiseCatalogTokenScoped();
  if (!scoped && !fid) return null;
  const limit = 50;
  const maxPages = 30;
  const accumulatedCats: unknown[] = [];
  let franchiseMeta: Record<string, unknown> | undefined;
  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (!scoped && fid) params.set("franchise_id", fid);
    if (mapOpts?.mappingIsActive === true) params.set("is_active", "true");
    else if (mapOpts?.mappingIsActive === false)
      params.set("is_active", "false");
    const searchQ = String(mapOpts?.catalogSearch ?? "").trim();
    if (searchQ) params.set("search", searchQ);
    const sortByApi = String(mapOpts?.catalogSortBy ?? "").trim();
    if (sortByApi) {
      params.set("sort_by", sortByApi);
      params.set(
        "sort_order",
        mapOpts?.catalogSortOrder === "desc" ? "desc" : "asc"
      );
    }
    // eslint-disable-next-line no-await-in-loop
    const response = await apiRequest(
      `${ApiPaths.GET_FRANCHISE_CATEGORY_ALL()}?${params.toString()}`,
      "GET",
      undefined,
      false,
      true,
      true,
      true
    );
    if (!response.success) {
      return accumulatedCats.length
        ? buildCategoryMapCacheFromCatalogDocs(accumulatedCats, franchiseMeta, fid)
        : null;
    }
    const root = catalogPayloadRoot(response.data);
    if (isPaginatedFranchiseCatalogRoot(root, "categories")) {
      const pageCats = Array.isArray(root.categories) ? root.categories : [];
      accumulatedCats.push(...pageCats);
      if (root.franchise && typeof root.franchise === "object") {
        franchiseMeta = root.franchise as Record<string, unknown>;
      }
      const totalPages = listPayloadTotalPages(response.data);
      if (!totalPages || page >= totalPages) {
        return buildCategoryMapCacheFromCatalogDocs(
          accumulatedCats,
          franchiseMeta,
          fid
        );
      }
      continue;
    }
    const records = listPayloadRecords(response.data);
    const raw = pickFranchiseScopedRecord(records, fid);
    if (raw) {
      const rowFid = apiDocumentId(raw?.franchise_id) || fid;
      const normalized = normalizeFranchiseCategoryList(raw?.categories_list);
      const pageCats = listPayloadRootArray(response.data, "categories");
      const allCats =
        pageCats.length > 0
          ? pageCats
          : listPayloadRootArray(response.data, "all_categories");
      const preserveApiCatalogOrder =
        Boolean(String(mapOpts?.catalogSearch ?? "").trim()) ||
        Boolean(String(mapOpts?.catalogSortBy ?? "").trim());
      const categories_list = mergeFranchiseCategoryListFromAllCategories(
        normalized,
        allCats,
        preserveApiCatalogOrder ? undefined : raw?.categories_order
      );
      if (categories_list.length) {
        const mapId = String(raw?._id ?? "").trim();
        if (mapId) {
          return {
            mapId,
            franchise_id: rowFid,
            categories_list,
            all_categories: allCats,
            categoryCatalogHints: buildCategoryCatalogHintsFromRawList(
              raw?.categories_list
            ),
            active_categories:
              typeof raw?.active_categories === "boolean"
                ? raw.active_categories
                : undefined,
            inactive_categories:
              typeof raw?.inactive_categories === "boolean"
                ? raw.inactive_categories
                : undefined,
            order_number:
              typeof raw?.order_number === "number"
                ? raw.order_number
                : undefined,
          };
        }
      }
    }
    const totalPages = listPayloadTotalPages(response.data);
    if (!totalPages || page >= totalPages) break;
  }
  return buildCategoryMapCacheFromCatalogDocs(accumulatedCats, franchiseMeta, fid);
}

async function fetchAreaRowsForMyFranchise(): Promise<AreaRow[] | null> {
  const filters: { franchise_id?: string } = {};
  const fid = await resolveSessionFranchiseId();
  if (fid) filters.franchise_id = fid;

  const limit = 100;
  const maxPages = 30;
  const all: any[] = [];
  let page = 1;

  for (; page <= maxPages; page += 1) {
    const { response, areas, totalPages } = await fetchArea(
      page,
      limit,
      filters,
      []
    );
    if (!response) {
      return null;
    }
    if (!Array.isArray(areas)) {
      break;
    }
    all.push(...areas);
    const lastPage = !totalPages || page >= totalPages;
    if (lastPage) break;
  }

  if (all.length === 0) {
    return [];
  }
  return all.map(mapApiAreaToFranchiseAreaRow);
}

function serviceNamesFromCategoryDoc(doc: Record<string, unknown>): string[] {
  const related = doc.related_services;
  if (Array.isArray(related) && related.length) {
    const out: string[] = [];
    for (const r of related) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      const nm = String(o.name ?? "").trim();
      if (nm) {
        out.push(nm);
        continue;
      }
      const humanId = String(o.service_id ?? "").trim();
      if (humanId) out.push(humanId);
    }
    if (out.length) return out;
  }

  const sn = doc.service_names;
  if (Array.isArray(sn)) {
    const out = sn
      .map((x) =>
        typeof x === "string" ? x.trim() : String(x ?? "").trim()
      )
      .filter(Boolean);
    if (out.length) return out;
  }

  const idToName = new Map<string, string>();
  if (Array.isArray(related)) {
    for (const r of related) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      const id =
        apiDocumentId(o._id) || apiDocumentId(o) || String(o._id ?? "").trim();
      const nm = String(o.name ?? "").trim();
      if (id && nm) idToName.set(id.trim().toLowerCase(), nm);
    }
  }

  const services = doc.services;
  if (!Array.isArray(services)) return [];
  const names: string[] = [];
  for (const s of services) {
    if (typeof s === "string") {
      const t = s.trim();
      if (!t) continue;
      const resolved = idToName.get(t.toLowerCase());
      if (resolved) {
        names.push(resolved);
      } else if (!/^[a-f0-9]{24}$/i.test(t)) {
        names.push(t);
      }
    } else if (s && typeof s === "object") {
      const nm = String((s as Record<string, unknown>).name ?? "").trim();
      if (nm) names.push(nm);
    }
  }
  return names;
}

/** One franchise-category GET supplies mapping + catalogue rows — no per-id category GETs. */
function categoryRowsFromFranchiseCategoryMap(
  catMap: FranchiseCategoryMapCache
): CategoryRow[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of catMap.all_categories ?? []) {
    if (!item || typeof item !== "object") continue;
    const doc = item as Record<string, unknown>;
    const id =
      apiDocumentId(doc._id) ||
      apiDocumentId(doc) ||
      String(doc._id ?? "").trim();
    if (id) byId.set(id.trim().toLowerCase(), doc);
  }

  return catMap.categories_list
    .map((entry): CategoryRow | null => {
      const cid = String(entry.category_id ?? "").trim();
      if (!cid) return null;
      const key = cid.toLowerCase();
      const hint = catMap.categoryCatalogHints?.[key];
      const doc = byId.get(key);
      const name =
        (hint?.name && String(hint.name).trim()) ||
        (doc ? String(doc.name ?? "").trim() : "") ||
        "-";
      const fromHint = hint?.service_names?.length
        ? hint.service_names.map((x) => String(x).trim()).filter(Boolean)
        : [];
      const fromDoc = doc ? serviceNamesFromCategoryDoc(doc) : [];
      const service_names = fromHint.length > 0 ? fromHint : fromDoc;
        return {
        _id: cid,
        category_id: cid,
        name,
          is_active: entry.is_active,
          ...(service_names.length ? { service_names } : {}),
      };
    })
    .filter((r): r is CategoryRow => r != null);
}

/** One franchise-service GET supplies mapping + `all_services` catalogue rows — no per-id service GETs. */
function serviceRowsFromFranchiseServiceMap(
  svcMap: FranchiseServiceMapCache
): ServiceRow[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of svcMap.all_services ?? []) {
    if (!item || typeof item !== "object") continue;
    const doc = item as Record<string, unknown>;
    const keys = catalogueServiceDocIdCandidates(doc);
    if (!keys.length) continue;
    for (const c of keys) {
      byId.set(c.trim().toLowerCase(), doc);
    }
  }

  return svcMap.services_list
    .map((entry): ServiceRow | null => {
      const sid = String(entry.service_id ?? "").trim();
      if (!sid) return null;
      const key = sid.toLowerCase();
      const hint = svcMap.serviceCatalogHints?.[key];
      const doc = byId.get(key);
      const mongoId =
        doc
          ? apiDocumentId(doc._id) ||
            apiDocumentId(doc) ||
            String(doc._id ?? "").trim() ||
            sid
          : sid;
      const name =
        (hint?.name && String(hint.name).trim()) ||
        (doc ? String(doc.name ?? "").trim() : "") ||
        "-";
      let category_name =
        (hint?.category_name && String(hint.category_name).trim()) || "";
      if (!category_name && doc) {
        const cat = doc.category_id;
        if (cat && typeof cat === "object") {
          category_name =
            String((cat as Record<string, unknown>).name ?? "").trim() || "";
        }
      }
      if (!category_name) category_name = "-";
      /** Match category rows: one canonical catalogue id for toggle + PUT (merge uses Mongo `_id` when `all_services` is present). */
      const canonicalServiceId = doc ? mongoId : sid;
      return {
        _id: mongoId,
        service_id: canonicalServiceId,
        name,
        category_name,
        is_active: entry.is_active,
      };
    })
    .filter((r): r is ServiceRow => r != null);
}

async function fetchCategoryRowsForMyFranchise(
  mapOpts?: FranchiseMappingFetchOpts
): Promise<CategoryRow[] | null> {
  const fid = (await resolveSessionFranchiseId()) ?? "";
  if (!isFranchiseCatalogTokenScoped() && !fid) return [];
  syncFranchiseMapCacheScope(fid);

  const catMap = await fetchFranchiseCategoryMapForFranchiseDeduped(
    fid,
    mapOpts
  );
  const canonicalMapCache =
    mapOpts?.mappingIsActive === undefined &&
    !String(mapOpts?.catalogSearch ?? "").trim() &&
    !String(mapOpts?.catalogSortBy ?? "").trim();

  if (!catMap?.categories_list?.length) {
    if (canonicalMapCache) {
      cachedFranchiseCategoryMap = null;
    }
    return [];
  }
  if (canonicalMapCache) {
    cachedFranchiseCategoryMap = catMap;
  }

  return categoryRowsFromFranchiseCategoryMap(catMap);
}

async function fetchServiceRowsForMyFranchise(
  mapOpts?: FranchiseMappingFetchOpts
): Promise<ServiceRow[] | null> {
  const fid = (await resolveSessionFranchiseId()) ?? "";
  if (!isFranchiseCatalogTokenScoped() && !fid) return [];
  syncFranchiseMapCacheScope(fid);

  const canonicalMapCache =
    mapOpts?.mappingIsActive === undefined &&
    !String(mapOpts?.catalogSearch ?? "").trim() &&
    !String(mapOpts?.catalogSortBy ?? "").trim();

  const svcMap = await fetchFranchiseServiceMapForFranchiseDeduped(fid, mapOpts);
  if (!svcMap?.services_list?.length) {
    if (canonicalMapCache) {
      cachedFranchiseServiceMap = null;
    }
    return [];
  }
  if (canonicalMapCache) {
    cachedFranchiseServiceMap = svcMap;
  }

  return serviceRowsFromFranchiseServiceMap(svcMap);
}

function mapApiEmployeeToFranchiseEmployeeRow(raw: any): EmployeeRow {
  const id = String(raw?._id ?? raw?.id ?? "").trim();
  const phone = String(raw?.phone_number ?? raw?.phone ?? "").trim();
  const role = String(raw?.role ?? raw?.designation ?? "-").trim() || "-";
  const employeeId = String(raw?.employee_id ?? raw?.user_id ?? "").trim();
  const areaName = String(raw?.area_name ?? raw?.area ?? "-").trim() || "-";
  const isActiveRaw = raw?.is_active;
  const isActive =
    typeof isActiveRaw === "boolean"
      ? isActiveRaw
      : String(isActiveRaw).toLowerCase() === "true" ||
        String(isActiveRaw) === "1";
  const screenPermissionKeys = menuKeysFromUserAccess(
    raw as Record<string, unknown>
  );
  const accessible_screens = mapMenuKeysToAvailablePages(screenPermissionKeys);

  return {
    _id: id,
    employee_id: employeeId || `FE-${id.slice(-6) || "000000"}`,
    name: String(raw?.name ?? "").trim() || "-",
    role,
    phone: phone || "-",
    email: String(raw?.email ?? "").trim() || "-",
    area_name: areaName,
    is_active: isActive,
    gender: genderForApiPayload(raw?.gender) ?? undefined,
    date_of_birth: dobFromApiRaw(raw as Record<string, unknown>),
    profile_url: String(raw?.profile_url ?? "").trim() || undefined,
    chat_enabled: isActive
      ? Boolean(raw?.chat ?? raw?.chat_enabled ?? true)
      : false,
    accessible_screens,
    screenPermissionKeys,
  };
}

async function fetchEmployeeRowsForMyFranchise(
  signal?: AbortSignal
): Promise<EmployeeRow[] | null> {
  const currentUserRole = String(
    getLocalStorage(AppConstant.userRole) ?? ""
  ).trim();
  const isFranchiseScopedByAuth =
    currentUserRole === UserRole.FRANCHISE_ADMIN ||
    currentUserRole === UserRole.EMPLOYEE;
  const franchiseId = isFranchiseScopedByAuth
    ? ""
    : (await resolveSessionFranchiseId()) ?? "";
  if (!isFranchiseScopedByAuth && !franchiseId) return [];

  const pageSize = 200;
  const maxPages = 50;
  const all: any[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    if (signal?.aborted) return null;
    // type=3 => franchise employee
    // franchise_id ensures only current franchise employees are listed.
    // eslint-disable-next-line no-await-in-loop
    const res = await fetchUser(
      false,
      WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE,
      page,
      pageSize,
      franchiseId ? { franchise_id: franchiseId } : {},
      [],
      signal
    );
    if (signal?.aborted) return null;
    if (!res.response) return null;
    all.push(...(res.users ?? []));
    if (!res.totalPages || page >= res.totalPages) break;
  }

  return all.map(mapApiEmployeeToFranchiseEmployeeRow);
}

/**
 * Pending / requested rows for My Franchise — same `GET …/getAll?is_request=true`
 * path as Service Management (token-scoped for franchise admin; not raw `/service/getAll`
 * with unsupported `approval_status` query).
 */
async function fetchAllCategoryRows(isRequest: boolean): Promise<any[] | null> {
  if (!isRequest) return [];
  const fid = (await resolveSessionFranchiseId()) ?? "";
  if (!isFranchiseCatalogTokenScoped() && !fid) return [];

  const franchiseIdArg = isFranchiseCatalogTokenScoped() ? undefined : fid;
  const limit = 200;
  const maxPages = 30;
  const all: any[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { response, categories, totalPages } = await fetchCategory(
      page,
      limit,
      { is_request: "true" },
      [],
      franchiseIdArg
    );
    if (!response) return null;
    if (Array.isArray(categories) && categories.length) {
      all.push(...categories);
    }
    if (!totalPages || page >= totalPages) break;
  }
  return all;
}

async function fetchAllServiceRows(isRequest: boolean): Promise<any[] | null> {
  if (!isRequest) return [];
  const fid = (await resolveSessionFranchiseId()) ?? "";
  if (!isFranchiseCatalogTokenScoped() && !fid) return [];

  const franchiseIdArg = isFranchiseCatalogTokenScoped() ? undefined : fid;
  const limit = 200;
  const maxPages = 30;
  const all: any[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { response, services, totalPages } = await fetchService(
      page,
      limit,
      { is_request: "true" },
      [],
      franchiseIdArg
    );
    if (!response) return null;
    if (Array.isArray(services) && services.length) {
      all.push(...services);
    }
    if (!totalPages || page >= totalPages) break;
  }
  return all;
}

const ALL_MY_FRANCHISE_SLICES: MyFranchiseDataSlice[] = [
  "employees",
  "areas",
  "services",
  "categories",
  "requested_services",
  "requested_categories",
];

/** Loads only the requested slices (parallel per slice). Pass `opts` so franchise mapping GETs use server-side filters (Total / Active / Inactive). */
export async function fetchMyFranchiseDataSlices(
  slices: readonly MyFranchiseDataSlice[],
  opts?: MyFranchiseDataFetchOptions
): Promise<Partial<MyFranchiseBoxData>> {
  const need = new Set(slices);
  const out: Partial<MyFranchiseBoxData> = {};
  const tasks: Promise<void>[] = [];

  const svcMapOpts: FranchiseMappingFetchOpts = {
    mappingIsActive: franchiseMappingIsActiveFromFetchOptions("services", opts),
    ...(String(opts?.serviceCatalogSearch ?? "").trim()
      ? { catalogSearch: String(opts!.serviceCatalogSearch).trim() }
      : {}),
    ...(String(opts?.serviceCatalogSortBy ?? "").trim()
      ? {
          catalogSortBy: String(opts!.serviceCatalogSortBy).trim(),
          catalogSortOrder:
            opts?.serviceCatalogSortOrder === "desc" ? "desc" : "asc",
        }
      : {}),
  };
  const catMapOpts: FranchiseMappingFetchOpts = {
    mappingIsActive: franchiseMappingIsActiveFromFetchOptions("categories", opts),
    ...(String(opts?.categoryCatalogSearch ?? "").trim()
      ? { catalogSearch: String(opts!.categoryCatalogSearch).trim() }
      : {}),
    ...(String(opts?.categoryCatalogSortBy ?? "").trim()
      ? {
          catalogSortBy: String(opts!.categoryCatalogSortBy).trim(),
          catalogSortOrder:
            opts?.categoryCatalogSortOrder === "desc" ? "desc" : "asc",
        }
      : {}),
  };

  if (need.has("employees")) {
    tasks.push(
      (async () => {
        const r = await fetchEmployeeRowsForMyFranchise();
        out.employees = r ?? [];
      })()
    );
  }
  if (need.has("areas")) {
    tasks.push(
      (async () => {
        const r = await fetchAreaRowsForMyFranchise();
        out.areas = r ?? [];
      })()
    );
  }
  if (need.has("services")) {
    tasks.push(
      (async () => {
        const r = await fetchServiceRowsForMyFranchise(svcMapOpts);
        out.services = r ?? [];
      })()
    );
  }
  if (need.has("categories")) {
    tasks.push(
      (async () => {
        const r = await fetchCategoryRowsForMyFranchise(catMapOpts);
        out.categories = r ?? [];
      })()
    );
  }
  if (need.has("requested_services")) {
    tasks.push(
      (async () => {
        const raw = await fetchAllServiceRows(true);
        const rows = (raw ?? []).filter(
          (r) => r && typeof r === "object" && (r as { is_request?: boolean }).is_request !== false
        );
        out.requested_services = (
          opts?.requestedApprovalStatus === "pending"
            ? rows.filter(includeInFranchisePendingRequests)
            : rows
        ).map(mapApiRequestedServiceRow);
      })()
    );
  }
  if (need.has("requested_categories")) {
    tasks.push(
      (async () => {
        const raw = await fetchAllCategoryRows(true);
        const rows = (raw ?? []).filter(
          (r) => r && typeof r === "object" && (r as { is_request?: boolean }).is_request !== false
        );
        out.requested_categories = (
          opts?.requestedApprovalStatus === "pending"
            ? rows.filter(includeInFranchisePendingRequests)
            : rows
        ).map(mapApiRequestedCategoryRow);
      })()
    );
  }

  await Promise.all(tasks);
  return out;
}

export async function fetchMyFranchiseBoxData(): Promise<MyFranchiseBoxData> {
  const partial = await fetchMyFranchiseDataSlices(ALL_MY_FRANCHISE_SLICES);
  return {
    employees: partial.employees ?? [],
    areas: partial.areas ?? [],
    services: partial.services ?? [],
    categories: partial.categories ?? [],
    requested_services: partial.requested_services ?? [],
    requested_categories: partial.requested_categories ?? [],
  };
}

export async function setEmployeeChatEnabled(
  employee: EmployeeRow,
  chat_enabled: boolean
): Promise<boolean> {
  const keysFromRow = employee.screenPermissionKeys ?? [];
  const keysFromScreens = menuKeysFromAvailablePages(employee.accessible_screens);
  const screenPermissionKeys =
    keysFromRow.length > 0 ? keysFromRow : keysFromScreens;
  if (!screenPermissionKeys.length) {
    showErrorAlert(
      "Cannot update chat: missing screen permissions for this employee."
    );
    return false;
  }

  return updateFranchiseEmployee(employee._id, {
    name: employee.name,
    phone: employee.phone,
    email: employee.email,
    is_active: employee.is_active,
    chat_enabled: employee.is_active ? chat_enabled : false,
    screenPermissionKeys,
  });
}

async function ensureFranchiseServiceMapLoaded(
  franchiseIdOverride?: string
): Promise<FranchiseServiceMapCache | null> {
  const fid =
    String(franchiseIdOverride ?? "").trim() ||
    (await resolveSessionFranchiseId()) ||
    "";
  if (!fid) return null;
  syncFranchiseMapCacheScope(fid);
  if (cachedFranchiseServiceMap?.services_list?.length) {
    return cachedFranchiseServiceMap;
  }
  const map = await fetchFranchiseServiceMapForFranchiseDeduped(fid, {});
  if (map?.services_list?.length) {
    cachedFranchiseServiceMap = map;
    return map;
  }
  return null;
}

async function ensureFranchiseCategoryMapLoaded(
  franchiseIdOverride?: string
): Promise<FranchiseCategoryMapCache | null> {
  const fid =
    String(franchiseIdOverride ?? "").trim() ||
    (await resolveSessionFranchiseId()) ||
    "";
  if (!fid) return null;
  syncFranchiseMapCacheScope(fid);
  if (cachedFranchiseCategoryMap?.categories_list?.length) {
    return cachedFranchiseCategoryMap;
  }
  const map = await fetchFranchiseCategoryMapForFranchiseDeduped(fid, {});
  if (map?.categories_list?.length) {
    cachedFranchiseCategoryMap = map;
    return map;
  }
  return null;
}

function recordFromUpdateResponse(data: unknown): any | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const inner =
    d.data && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : d;
  const rec = inner.record ?? d.record;
  return rec && typeof rec === "object" ? rec : null;
}

/**
 * Franchise-scoped active flag: `PUT /franchise-service/update/:mapId` with full
 * `services_list` (franchise admin contract). Falls back to `PUT /service/update/:id`
 * when no mapping row exists.
 */
export async function setServiceActive(
  id: string,
  is_active: boolean,
  franchiseIdOverride?: string
): Promise<boolean> {
  const catalogueId = String(id ?? "").trim();
  if (!catalogueId) return false;

  const map = await ensureFranchiseServiceMapLoaded(franchiseIdOverride);
  if (map?.mapId && map.services_list.length) {
    const idx = resolveFranchiseServiceListIndex(map, catalogueId);
    if (idx >= 0) {
      const services_list = map.services_list.map((s, i) =>
        i === idx ? { service_id: s.service_id, is_active } : { ...s }
      );
      const body: Record<string, unknown> = {
        services_list,
        franchise_id: map.franchise_id,
      };
      if (map.active_services !== undefined && typeof map.active_services === "boolean") {
        body.active_services = map.active_services;
      }
      if (
        map.inactive_services !== undefined &&
        typeof map.inactive_services === "boolean"
      ) {
        body.inactive_services = map.inactive_services;
      }
      if (map.order_number !== undefined) {
        body.order_number = map.order_number;
      }
      const response = await apiRequest(
        ApiPaths.UPDATE_FRANCHISE_SERVICE(map.mapId),
        "PUT",
        body,
        false,
        false,
        false,
        true
      );
      if (!response.success) return false;
      const rec = recordFromUpdateResponse(response.data);
      const hintPatch = {
        ...buildServiceCatalogHintsFromServiceDocArray(map.all_services ?? []),
        ...(rec
          ? buildServiceCatalogHintsFromRawList(rec.services_list)
          : {}),
      };
      if (rec) {
        const recObj = rec as Record<string, unknown>;
        const fromNorm = normalizeFranchiseServiceList(rec.services_list);
        const fromRec = hydrateFranchiseServiceListFromActiveInactiveArrays(
          fromNorm,
          recObj.active_services,
          recObj.inactive_services
        );
        const baseList = fromRec.length ? fromRec : services_list;
        const nextRaw = mergeFranchiseServiceListFromAllServices(
          baseList,
          map.all_services,
          rec.services_order
        );
        const next = hydrateFranchiseServiceListFromActiveInactiveArrays(
          nextRaw,
          recObj.active_services,
          recObj.inactive_services
        );
        const snap = franchiseServiceActiveInactiveSnapshotFromRecord(recObj);
        cachedFranchiseServiceMap = {
          ...map,
          services_list: next.length ? next : baseList,
          ...(map.all_services?.length ? { all_services: map.all_services } : {}),
          serviceCatalogHints: {
            ...(map.serviceCatalogHints ?? {}),
            ...hintPatch,
          },
          ...snap,
          order_number:
            typeof rec.order_number === "number"
              ? rec.order_number
              : map.order_number,
        };
      } else {
        const all_services = Array.isArray(map.all_services)
          ? map.all_services.map((item) => {
              if (!item || typeof item !== "object") return item;
              const o = item as Record<string, unknown>;
              const id =
                apiDocumentId(o._id) || String(o._id ?? "").trim();
              if (!idsLooselyEqual(id, catalogueId)) return item;
              return {
                ...o,
                franchise_active: is_active,
                franchise_enabled: is_active,
              };
            })
          : map.all_services;
        cachedFranchiseServiceMap = {
          ...map,
          services_list,
          ...(all_services ? { all_services } : {}),
        };
      }
      return true;
    }
  }

  return false;
}

/**
 * Same pattern as services: `PUT /franchise-category/update/:mapId` with full
 * `categories_list` (no catalogue `PUT /category/update`).
 */
export async function setCategoryActive(
  id: string,
  is_active: boolean,
  franchiseIdOverride?: string
): Promise<boolean> {
  const catalogueId = String(id ?? "").trim();
  if (!catalogueId) return false;

  const map = await ensureFranchiseCategoryMapLoaded(franchiseIdOverride);
  if (map?.mapId && map.categories_list.length) {
    const idx = findFranchiseCategoryListIndex(map.categories_list, catalogueId);
    if (idx >= 0) {
      const categories_list = map.categories_list.map((c, i) =>
        i === idx ? { category_id: c.category_id, is_active } : { ...c }
      );
      const body: Record<string, unknown> = {
        categories_list,
        franchise_id: map.franchise_id,
      };
      if (map.active_categories !== undefined) {
        body.active_categories = map.active_categories;
      }
      if (map.inactive_categories !== undefined) {
        body.inactive_categories = map.inactive_categories;
      }
      if (map.order_number !== undefined) {
        body.order_number = map.order_number;
      }
      const response = await apiRequest(
        ApiPaths.UPDATE_FRANCHISE_CATEGORY(map.mapId),
        "PUT",
        body,
        false,
        false,
        false,
        true
      );
      if (!response.success) return false;
      const rec = recordFromUpdateResponse(response.data);
      if (rec) {
        const next = normalizeFranchiseCategoryList(rec.categories_list);
        if (next.length) {
          cachedFranchiseCategoryMap = {
            ...map,
            categories_list: next,
            active_categories:
              typeof rec.active_categories === "boolean"
                ? rec.active_categories
                : map.active_categories,
            inactive_categories:
              typeof rec.inactive_categories === "boolean"
                ? rec.inactive_categories
                : map.inactive_categories,
            order_number:
              typeof rec.order_number === "number"
                ? rec.order_number
                : map.order_number,
          };
        } else {
          cachedFranchiseCategoryMap = { ...map, categories_list };
        }
      } else {
        const all_categories = Array.isArray(map.all_categories)
          ? map.all_categories.map((item) => {
              if (!item || typeof item !== "object") return item;
              const o = item as Record<string, unknown>;
              const id =
                apiDocumentId(o._id) || String(o._id ?? "").trim();
              if (!idsLooselyEqual(id, catalogueId)) return item;
              return {
                ...o,
                franchise_active: is_active,
                franchise_enabled: is_active,
              };
            })
          : map.all_categories;
        cachedFranchiseCategoryMap = {
          ...map,
          categories_list,
          ...(all_categories ? { all_categories } : {}),
        };
      }
      return true;
    }
  }

  return false;
}

type FranchiseEmployeeInput = {
  name: string;
  phone: string;
  email: string;
  is_active: boolean;
  chat_enabled: boolean;
  screenPermissionKeys: string[];
  gender?: string;
  date_of_birth?: string;
  profile_url?: string;
  imageFile?: File;
  /** Required when creating a new employee (`createFranchiseEmployee`). */
  password?: string;
};

export async function createFranchiseEmployee(
  input: FranchiseEmployeeInput
): Promise<boolean> {
  const keys = input.screenPermissionKeys ?? [];
  const accessible_screens = mapMenuKeysToAvailablePages(keys);

  const createdById = (getLocalStorage(AppConstant.createdById) ?? "").trim();
  const franchiseId = await resolveSessionFranchiseId();
  const useRealCreate = Boolean(createdById);

  if (!useRealCreate) {
    showErrorAlert("Missing session. Please log in again.");
    return false;
  }

  const pwd = String(input.password ?? "").trim();
  if (!pwd) {
    showErrorAlert("Password is required.");
    return false;
  }

  const res = await createWebManagementUser({
    name: input.name.trim(),
    email: input.email.trim(),
    phone_number: input.phone.trim(),
    type: WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE,
    password: pwd,
    status: input.is_active ? "active" : "inactive",
    is_from_web: true,
    created_by_id: createdById,
    ...(franchiseId ? { franchise_id: franchiseId } : {}),
    available_pages: accessible_screens,
    chat_enabled: input.is_active ? input.chat_enabled : false,
    ...(genderForApiPayload(input.gender)
      ? { gender: genderForApiPayload(input.gender) }
      : {}),
    ...(dobForApiPayload(input.date_of_birth)
      ? { date_of_birth: dobForApiPayload(input.date_of_birth) }
      : {}),
    profile_url: profileUrlForApi(input.profile_url),
    imageFile: input.imageFile,
  });
  if (!res.ok) return false;
  return true;
}

export async function updateFranchiseEmployee(
  id: string,
  input: FranchiseEmployeeInput
): Promise<boolean> {
  const userId = String(id ?? "").trim();
  if (!userId) {
    showErrorAlert("Unable to update. ID is missing.");
    return false;
  }

  const keys = input.screenPermissionKeys ?? [];
  const availablePages = mapMenuKeysToAvailablePages(keys);

  const franchiseId = (await resolveSessionFranchiseId())?.trim();
  if (!franchiseId) {
    showErrorAlert("Franchise context is missing. Please log in again.");
    return false;
  }

  const isActive = Boolean(input.is_active);
  const status = isActive ? "active" : "inactive";
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    email: input.email.trim(),
    phone_number: normalizePhoneForUserCreate(input.phone.trim()),
    status,
    is_active: isActive,
    franchise_id: franchiseId,
    available_pages: availablePages,
    accessible_screens: availablePages,
    chat: isActive ? Boolean(input.chat_enabled) : false,
    ...(genderForApiPayload(input.gender)
      ? { gender: genderForApiPayload(input.gender) }
      : {}),
    ...(dobForApiPayload(input.date_of_birth)
      ? { date_of_birth: dobForApiPayload(input.date_of_birth) }
      : {}),
    profile_url: profileUrlForApi(input.profile_url),
  };

  return createOrUpdateUser(
    body,
    true,
    userId,
    input.imageFile ? { image: input.imageFile } : undefined,
    {
      suppressSuccessAlert: true,
    }
  );
}

export async function voidFranchiseEmployee(id: string): Promise<boolean> {
  void id;
  return false;
}

export type RequestedServiceInput = {
  name: string;
  category_id: string;
  description: string;
  image_url?: string;
};

export async function createRequestedService(
  input: RequestedServiceInput
): Promise<boolean> {
  const franchiseId = await resolveSessionFranchiseId();
  const imageUrl = String(input.image_url ?? "").trim();
  const payload = {
    name: input.name.trim(),
    category_id: input.category_id,
    desc: input.description.trim(),
    ...(imageUrl ? { image_url: imageUrl } : {}),
    tax: 0,
    commission: 0,
    payment_type: "per_hour",
    minimum_deposit: 0,
    price: 0,
    is_active: false,
    city_ids: [] as string[],
    state_ids: [] as string[],
    ...(franchiseId ? { franchise_id: franchiseId } : {}),
    is_request: true,
  };
  const response = await apiRequest(
    ApiPaths.CREATE_SERVICE_REQUEST,
    "POST",
    payload,
    false,
    false,
    false,
    true
  );
  return Boolean(response.success);
}

export async function updateRequestedService(
  id: string,
  input: RequestedServiceInput
): Promise<boolean> {
  const imageUrl = String(input.image_url ?? "").trim();
  const payload = {
    name: input.name.trim(),
    category_id: input.category_id,
    desc: input.description.trim(),
    ...(imageUrl ? { image_url: imageUrl } : {}),
    tax: 0,
    commission: 0,
    payment_type: "per_hour",
    minimum_deposit: 0,
    price: 0,
    is_active: false,
    city_ids: [] as string[],
    state_ids: [] as string[],
    is_request: true,
  };
  const response = await apiRequest(
    ApiPaths.UPDATE_SERVICE_REQUEST(id),
    "PUT",
    payload,
    false,
    false,
    false,
    true
  );
  return Boolean(response.success);
}

export async function voidRequestedService(id: string): Promise<boolean> {
  void id;
  return false;
}

export type RequestedCategoryInput = {
  name: string;
  /** Omitted or empty when the request does not attach catalogue services yet. */
  service_ids?: string[];
  description: string;
  image_url?: string;
};

export async function createRequestedCategory(
  input: RequestedCategoryInput
): Promise<boolean> {
  const franchiseId = await resolveSessionFranchiseId();
  const payload = {
    name: input.name.trim(),
    service_ids: input.service_ids ?? [],
    desc: input.description.trim(),
    ...(input.image_url ? { image_url: input.image_url } : {}),
    city_ids: [] as string[],
    state_ids: [] as string[],
    ...(franchiseId ? { franchise_id: franchiseId } : {}),
    is_request: true,
  };
  const response = await apiRequest(
    ApiPaths.CREATE_CATEGORY_REQUEST,
    "POST",
    payload,
    false,
    false,
    false,
    true
  );
  return Boolean(response.success);
}

export async function updateRequestedCategory(
  id: string,
  input: RequestedCategoryInput
): Promise<boolean> {
  const payload = {
    name: input.name.trim(),
    service_ids: input.service_ids ?? [],
    desc: input.description.trim(),
    ...(input.image_url ? { image_url: input.image_url } : {}),
    city_ids: [] as string[],
    state_ids: [] as string[],
    is_request: true,
    is_active: false,
  };
  const response = await apiRequest(
    ApiPaths.UPDATE_CATEGORY_REQUEST(id),
    "PUT",
    payload,
    false,
    false,
    false,
    true
  );
  return Boolean(response.success);
}

export async function voidRequestedCategory(id: string): Promise<boolean> {
  void id;
  return false;
}
