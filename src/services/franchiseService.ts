import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { FranchiseModel } from "../lib/models/FranchiseModels";
import { showLog } from "../helper/utility";
import { sessionMayUseFranchiseIdApiFilter } from "../lib/franchise/headerFranchisePreference";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";

export type FranchiseDropDownOption = {
  value: string;
  label: string;
  state_id?: string;
  city_id?: string;
};

type AdminContact = { email?: string; phone_number?: string };

/** Cache admin contacts used to enrich franchise rows (avoids repeated /user/getAll?type=1 calls). */
let franchiseAdminContactsCache:
  | { map: Map<string, AdminContact>; loadedAt: number }
  | null = null;
let franchiseAdminContactsInFlight: Promise<Map<string, AdminContact>> | null =
  null;
const FRANCHISE_ADMIN_CONTACTS_CACHE_TTL_MS = 5 * 60 * 1000;

function mapAdminContactsById(rows: any[]): Map<string, AdminContact> {
  const out = new Map<string, AdminContact>();
  rows.forEach((u: any) => {
    const id = String(u?._id ?? u?.id ?? "").trim();
    if (!id) return;
    const email = String(u?.email ?? "").trim();
    const phone = String(u?.phone_number ?? u?.phone ?? "").trim();
    out.set(id, {
      ...(email ? { email } : {}),
      ...(phone ? { phone_number: phone } : {}),
    });
  });
  return out;
}

async function fetchAllFranchiseAdmins(): Promise<Map<string, AdminContact>> {
  const pageSize = 200;
  let page = 1;
  const all: any[] = [];
  for (;;) {
    // /user/getAll, only for enriching franchise table admin contact info
    // type=1 => franchise admin
    // eslint-disable-next-line no-await-in-loop
    const res = await apiRequest(
      `${ApiPaths.GET_USER()}?${new URLSearchParams({
        type: "1",
        page: String(page),
        limit: String(pageSize),
      }).toString()}`,
      "GET",
      undefined,
      false,
      true,
      true
    );
    if (!res.success) break;
    const payload = (res as any).data ?? {};
    const inner =
      payload &&
      typeof payload.data === "object" &&
      !Array.isArray(payload.data)
        ? payload.data
        : payload;
    const records = Array.isArray(inner.records)
      ? inner.records
      : Array.isArray(payload.records)
      ? payload.records
      : [];
    all.push(...records);
    const totalPages = Number(inner.totalPages ?? payload.totalPages ?? 0) || 0;
    if (!totalPages || page >= totalPages) break;
    page += 1;
    if (page > 100) break;
  }
  return mapAdminContactsById(all);
}

async function getFranchiseAdminContactsCached(
  forceRefresh = false
): Promise<Map<string, AdminContact>> {
  const now = Date.now();
  if (!forceRefresh && franchiseAdminContactsCache) {
    if (
      now - franchiseAdminContactsCache.loadedAt <=
      FRANCHISE_ADMIN_CONTACTS_CACHE_TTL_MS
    ) {
      return franchiseAdminContactsCache.map;
    }
  }
  if (!forceRefresh && franchiseAdminContactsInFlight) {
    return franchiseAdminContactsInFlight;
  }
  franchiseAdminContactsInFlight = fetchAllFranchiseAdmins()
    .then((map) => {
      franchiseAdminContactsCache = { map, loadedAt: Date.now() };
      return map;
    })
    .finally(() => {
      franchiseAdminContactsInFlight = null;
    });
  return franchiseAdminContactsInFlight;
}

function toIdArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function normalizeBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  const s = String(value ?? "").toLowerCase().trim();
  if (s === "active" || s === "true") return true;
  if (s === "inactive" || s === "false") return false;
  return true;
}

/**
 * Collects catalogue `_id`s from franchise mapping arrays (Postman / staging:
 * `categories_list` / `services_list` as `{ category_id|service_id, is_active }`, or plain id strings).
 */
function mergeCatalogLinks(
  lists: unknown[],
  idKeys: string[]
): { ids: string[]; activeById: Record<string, boolean> } {
  const idOrder: string[] = [];
  const seen = new Set<string>();
  const activeById: Record<string, boolean> = {};

  const pushId = (id: string) => {
    const t = id.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    idOrder.push(t);
  };

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item == null) continue;
      if (typeof item === "string" || typeof item === "number") {
        pushId(String(item));
        continue;
      }
      if (typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      let id = "";
      for (const k of idKeys) {
        const v = o[k];
        if (v != null && String(v).trim()) {
          id = String(v).trim();
          break;
        }
      }
      if (!id) continue;
      pushId(id);
      if ("is_active" in o && o.is_active !== undefined && o.is_active !== null) {
        activeById[id] = normalizeBooleanLike(o.is_active);
      } else if (!(id in activeById)) {
        activeById[id] = true;
      }
    }
  }
  return { ids: idOrder, activeById };
}

function mapFranchiseRow(
  raw: any,
  adminContacts?: Map<string, AdminContact>
): FranchiseModel {
  const admin = raw?.admin && typeof raw.admin === "object" ? raw.admin : null;
  const adminInfo =
    raw?.admin_info && typeof raw.admin_info === "object"
      ? raw.admin_info
      : null;
  const adminId = String(
    raw?.admin_id ?? admin?._id ?? adminInfo?._id ?? ""
  ).trim();
  const fromAdminList = adminId ? adminContacts?.get(adminId) : undefined;
  const mappedEmail = String(
    raw?.email ??
      raw?.admin_email ??
      fromAdminList?.email ??
      admin?.email ??
      adminInfo?.email ??
      ""
  ).trim();
  const mappedPhone = String(
    raw?.phone_number ??
      raw?.phone ??
      raw?.admin_phone ??
      fromAdminList?.phone_number ??
      admin?.phone_number ??
      admin?.phone ??
      adminInfo?.phone_number ??
      adminInfo?.phone ??
      ""
  ).trim();

  const categoryLinkSources: unknown[] = [
    raw?.categories_list,
    raw?.franchise_categories,
    raw?.franchise_category,
    raw?.category_list,
  ];
  if (
    Array.isArray(raw?.categories) &&
    raw.categories.length &&
    typeof raw.categories[0] === "object"
  ) {
    categoryLinkSources.push(raw.categories);
  }
  const categoryLinks = mergeCatalogLinks(
    categoryLinkSources.filter((x) => x != null),
    ["category_id", "_id", "id"]
  );

  const serviceLinkSources: unknown[] = [
    raw?.services_list,
    raw?.franchise_services,
    raw?.franchise_service,
    raw?.service_list,
  ];
  if (
    Array.isArray(raw?.services) &&
    raw.services.length &&
    typeof raw.services[0] === "object"
  ) {
    serviceLinkSources.push(raw.services);
  }
  const serviceLinks = mergeCatalogLinks(
    serviceLinkSources.filter((x) => x != null),
    ["service_id", "_id", "id"]
  );

  const categoriesPrimitiveIds =
    Array.isArray(raw?.categories) &&
    raw.categories.length &&
    typeof raw.categories[0] !== "object"
      ? toIdArray(raw.categories)
      : [];
  const servicesPrimitiveIds =
    Array.isArray(raw?.services) &&
    raw.services.length &&
    typeof raw.services[0] !== "object"
      ? toIdArray(raw.services)
      : [];

  const categoryIdsMerged = Array.from(
    new Set([
      ...toIdArray(raw?.category_ids),
      ...categoriesPrimitiveIds,
      ...categoryLinks.ids,
    ])
  );
  const serviceIdsMerged = Array.from(
    new Set([
      ...toIdArray(raw?.service_ids),
      ...servicesPrimitiveIds,
      ...serviceLinks.ids,
    ])
  );

  const franchise_category_active =
    Object.keys(categoryLinks.activeById).length > 0
      ? categoryLinks.activeById
      : undefined;
  const franchise_service_active =
    Object.keys(serviceLinks.activeById).length > 0
      ? serviceLinks.activeById
      : undefined;

  return {
    ...raw,
    email: mappedEmail || undefined,
    phone_number: mappedPhone || undefined,
    ...(categoryIdsMerged.length ? { category_ids: categoryIdsMerged } : {}),
    ...(serviceIdsMerged.length ? { service_ids: serviceIdsMerged } : {}),
    ...(franchise_category_active
      ? { franchise_category_active }
      : {}),
    ...(franchise_service_active ? { franchise_service_active } : {}),
  } as FranchiseModel;
}

/** Same query string → one network round-trip (e.g. `CustomHeader` + quote page both mount together). */
const FRANCHISE_DROPDOWN_CACHE_MS = 5 * 60 * 1000;

type FranchiseDropdownCacheEntry = {
  data: FranchiseDropDownOption[];
  expiresAt: number;
  inflight?: Promise<FranchiseDropDownOption[]>;
};

const franchiseDropdownCache = new Map<string, FranchiseDropdownCacheEntry>();

function franchiseDropdownCacheKey(options?: {
  onlyUnassigned?: boolean;
  fullList?: boolean;
  assignedAdminDropdown?: boolean;
}) {
  if (options?.assignedAdminDropdown) return "assigned_admin";
  if (options?.onlyUnassigned) return "only_unassigned";
  if (options?.fullList) return "full_list";
  return "all";
}

function cloneFranchiseDropdownRows(
  rows: FranchiseDropDownOption[]
): FranchiseDropDownOption[] {
  return rows.map((o) => ({ ...o }));
}

/** Resolve franchise rows whether API uses `data.records`, top-level `records`, or nested `data`. */
function normalizeFranchiseDropdownRecords(payload: unknown): any[] {
  const root = payload as Record<string, unknown> | null | undefined;
  if (!root || typeof root !== "object") return [];
  const direct = root.records;
  if (Array.isArray(direct)) return direct;
  const inner = root.data as Record<string, unknown> | undefined;
  if (inner && typeof inner === "object") {
    if (Array.isArray(inner.records)) return inner.records as any[];
    if (Array.isArray(inner)) return inner as any[];
  }
  return [];
}

type FranchiseByIdLightCacheEntry = {
  name: string;
  expiresAt: number;
};
const franchiseByIdLightCache = new Map<string, FranchiseByIdLightCacheEntry>();
const FRANCHISE_BY_ID_LIGHT_CACHE_MS = 10 * 60 * 1000;

/** Call after creating/updating a franchise so the next dropdown/list fetch is fresh. */
export function clearFranchiseDropdownCache(): void {
  franchiseDropdownCache.clear();
  franchiseByIdLightCache.clear();
  franchiseAdminContactsCache = null;
}

async function fetchFranchiseDropDownUncached(
  options?: {
    onlyUnassigned?: boolean;
    fullList?: boolean;
    assignedAdminDropdown?: boolean;
  }
): Promise<FranchiseDropDownOption[]> {
  if (options?.assignedAdminDropdown) {
    const url = ApiPaths.GET_FRANCHISE_DROP_DOWN_ASSIGNED();
    const response = await apiRequest(url, "GET");
    if (response.success) {
      const payload = (response as { data?: unknown }).data;
      const rows = normalizeFranchiseDropdownRecords(payload);
      return rows
        .map((franchise: any) => {
          const value = String(
            franchise?._id ?? franchise?.id ?? ""
          ).trim();
          const label =
            String(franchise?.name ?? franchise?.franchise_name ?? "").trim() ||
            value;
          return {
            value,
            label,
            state_id: franchise.state_id
              ? String(franchise.state_id)
              : undefined,
            city_id: franchise.city_id ? String(franchise.city_id) : undefined,
          };
        })
        .filter((o) => Boolean(o.value));
    }
    showLog(response.message || "Failed to fetch franchise");
    return [];
  }
  const query = new URLSearchParams();
  if (options?.onlyUnassigned) {
    query.set("only_unassigned", "true");
  } else if (
    options?.fullList &&
    !String(ApiPaths.GET_FRANCHISE_DROP_DOWN()).includes("full_list")
  ) {
    query.set("full_list", "true");
  }
  const basePath = ApiPaths.GET_FRANCHISE_DROP_DOWN();
  const queryString = query.toString();
  const url =
    queryString.length > 0
      ? `${basePath}${basePath.includes("?") ? "&" : "?"}${queryString}`
      : basePath;
  const response = await apiRequest(url, "GET");

  if (response.success) {
    const payload = (response as { data?: unknown }).data;
    const rows = normalizeFranchiseDropdownRecords(payload);
    return rows
      .map((franchise: any) => {
        const value = String(
          franchise?._id ?? franchise?.id ?? ""
        ).trim();
        const label =
          String(franchise?.name ?? franchise?.franchise_name ?? "").trim() ||
          value;
        return {
          value,
          label,
          state_id: franchise.state_id ? String(franchise.state_id) : undefined,
          city_id: franchise.city_id ? String(franchise.city_id) : undefined,
        };
      })
      .filter((o) => Boolean(o.value));
  }
  // Some roles/environments deny `/franchise/getDropDown` (403) while allowing `/franchise/getAll`.
  // Fallback to getAll so dropdown behavior matches super-admin visibility.
  if (options?.onlyUnassigned) {
    showLog(response.message || "Failed to fetch franchise");
    return [];
  }
  const pageSize = 200;
  let page = 1;
  const rows: any[] = [];
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const listRes = await apiRequest(
      `${ApiPaths.GET_FRANCHISE()}?${new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      }).toString()}`,
      "GET",
      undefined,
      false,
      true,
      true
    );
    if (!listRes.success) break;
    const payload = (listRes as any).data ?? {};
    const inner =
      payload &&
      typeof payload.data === "object" &&
      !Array.isArray(payload.data)
        ? payload.data
        : payload;
    const records = Array.isArray(inner.records)
      ? inner.records
      : Array.isArray(payload.records)
      ? payload.records
      : [];
    rows.push(...records);
    const totalPages = Number(inner.totalPages ?? payload.totalPages ?? 0) || 0;
    if (!totalPages || page >= totalPages) break;
    page += 1;
    if (page > 100) break;
  }
  const unique = new Map<string, FranchiseDropDownOption>();
  rows.forEach((franchise: any) => {
    const value = String(franchise?._id ?? franchise?.id ?? "").trim();
    if (!value) return;
    if (unique.has(value)) return;
    unique.set(value, {
      value,
      label: String(franchise?.name ?? "").trim() || value,
      state_id: franchise?.state_id ? String(franchise.state_id) : undefined,
      city_id: franchise?.city_id ? String(franchise.city_id) : undefined,
    });
  });
  return Array.from(unique.values());
}

export const fetchFranchiseDropDown = async (
  options?: {
    onlyUnassigned?: boolean;
    fullList?: boolean;
    assignedAdminDropdown?: boolean;
  }
): Promise<FranchiseDropDownOption[]> => {
  const key = franchiseDropdownCacheKey(options);
  const now = Date.now();
  let bucket = franchiseDropdownCache.get(key);

  if (bucket?.inflight) {
    return cloneFranchiseDropdownRows(await bucket.inflight);
  }
  if (bucket && bucket.expiresAt > now) {
    return cloneFranchiseDropdownRows(bucket.data);
  }

  const inflight = fetchFranchiseDropDownUncached(options)
    .then((data) => {
      franchiseDropdownCache.set(key, {
        data,
        expiresAt: Date.now() + FRANCHISE_DROPDOWN_CACHE_MS,
      });
      return data;
    })
    .catch((err) => {
      franchiseDropdownCache.delete(key);
      throw err;
    });

  franchiseDropdownCache.set(key, {
    data: bucket?.data ?? [],
    expiresAt: bucket?.expiresAt ?? 0,
    inflight,
  });

  const data = await inflight;
  return cloneFranchiseDropdownRows(data);
};

export type FetchFranchiseByIdOptions = {
  /**
   * When true, skip loading all franchise admins (`/user/getAll?type=1`) to enrich email/phone.
   * Use for lightweight UI (e.g. header subtitle) that only needs franchise fields from GET.
   */
  skipAdminContactEnrichment?: boolean;
};

/** Single franchise by id (GET /franchise/get/:id). Used when header filters to one franchise. */
export const fetchFranchiseById = async (
  id: string,
  options?: FetchFranchiseByIdOptions
): Promise<FranchiseModel | null> => {
  const targetId = String(id ?? "").trim();
  if (!targetId) return null;
  const skipAdmin = options?.skipAdminContactEnrichment === true;
  if (skipAdmin) {
    const cached = franchiseByIdLightCache.get(targetId);
    if (cached && cached.expiresAt > Date.now()) {
      return { _id: targetId, name: cached.name } as FranchiseModel;
    }
  }
  const response = await apiRequest(
    ApiPaths.GET_FRANCHISE_BY_ID(targetId),
    "GET",
    undefined,
    false,
    false,
    true
  );
  if (!response.success) return null;
  const payload = (response as any).data ?? {};
  const d =
    payload.data !== undefined &&
    typeof payload.data === "object" &&
    !Array.isArray(payload.data)
      ? payload.data
      : payload;
  const raw =
    d?.record ??
    d?.franchise ??
    (d && typeof d === "object" && d._id ? d : null);
  if (!raw || typeof raw !== "object") return null;
  const adminContacts = skipAdmin
    ? undefined
    : await getFranchiseAdminContactsCached();
  const mapped = mapFranchiseRow(raw, adminContacts);
  if (skipAdmin && mapped) {
    const name = String(mapped.name ?? "").trim();
    if (name) {
      franchiseByIdLightCache.set(targetId, {
        name,
        expiresAt: Date.now() + FRANCHISE_BY_ID_LIGHT_CACHE_MS,
      });
    }
  }
  return mapped;
};

export type FetchFranchiseOptions = {
  /** Bypass cached franchise-admin contact map (after create/update). */
  forceRefreshAdminContacts?: boolean;
};

export const fetchFranchise = async (
  page: number,
  pageSize: number,
  filters: {
    search?: string;
    name?: string;
    status?: string;
    sort?: string;
    sort_by?: string;
    sort_order?: "asc" | "desc";
    state_id?: string;
    city_id?: string;
    admin_id?: string;
    /** When set, list is scoped to this franchise (header dropdown). */
    franchise_id?: string;
  },
  sortBy: ServerTableSortBy = [],
  options?: FetchFranchiseOptions
): Promise<{
  response: boolean;
  franchises: FranchiseModel[];
  totalPages: number;
  totalItems?: number;
}> => {
  const primarySort = sortBy[0];
  const searchValue = String(filters.search ?? filters.name ?? "").trim();
  const franchiseIdForQuery = sessionMayUseFranchiseIdApiFilter()
    ? String(filters.franchise_id ?? "").trim()
    : "";
  const primarySortId = primarySort?.id ? String(primarySort.id).trim() : "";
  /** Column id from the table (matches API sort_by per franchise/getAll docs). */
  const sortByParam =
    primarySortId || (filters.sort_by ? String(filters.sort_by).trim() : "");

  /**
   * Postman (`Help-PR-All-Routes`): `search` OR-matches name, admin_name, state_name, city_name (and area when supported).
   * Some deployments listen on `keyword` for the same multi-field match (`fetchUser` sends both).
   * Do not send `name` with the same value — that filter is franchise-name-specific and breaks the broad search.
   */
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(searchValue && { search: searchValue }),
    ...(searchValue && { keyword: searchValue }),
    ...(filters.status &&
      filters.status !== "All" && { is_active: filters.status.toLowerCase() }),
    ...(filters.state_id && { state_id: filters.state_id }),
    ...(filters.city_id && { city_id: filters.city_id }),
    ...(filters.admin_id && { admin_id: filters.admin_id }),
    ...(franchiseIdForQuery && { franchise_id: franchiseIdForQuery }),
    ...(sortByParam && { sort_by: sortByParam }),
    ...(primarySort
      ? { sort_order: primarySort.desc ? "desc" : "asc" }
      : filters.sort_order
      ? { sort_order: filters.sort_order }
      : filters.sort
      ? { sort_order: filters.sort === "-1" ? "desc" : "asc" }
      : {}),
  });

  const response = await apiRequest(
    `${ApiPaths.GET_FRANCHISE()}?${params.toString()}`,
    "GET"
  );

  if (response.success) {
    const payload = response.data ?? {};
    const inner =
      payload &&
      typeof payload.data === "object" &&
      !Array.isArray(payload.data)
        ? payload.data
        : payload;
    const records = Array.isArray(inner.records)
      ? inner.records
      : Array.isArray(payload.records)
      ? payload.records
      : [];
    const totalPages = Number(inner.totalPages ?? payload.totalPages ?? 0) || 0;
    const totalItemsRaw =
      inner.totalItems ??
      payload.totalItems ??
      inner.totalCount ??
      payload.totalCount;
    const totalItemsParsed =
      totalItemsRaw === undefined ||
      totalItemsRaw === null ||
      totalItemsRaw === ""
        ? undefined
        : Number(totalItemsRaw);
    const adminContacts = await getFranchiseAdminContactsCached(
      Boolean(options?.forceRefreshAdminContacts)
    );
    const fidFilter = franchiseIdForQuery;
    let franchises = records.map((r: any) => mapFranchiseRow(r, adminContacts));
    if (fidFilter) {
      franchises = franchises.filter(
        (r: FranchiseModel) => String(r._id ?? "") === fidFilter
      );
      const totalItemsFiltered = franchises.length;
      const totalPagesFiltered =
        totalItemsFiltered === 0
          ? 0
          : Math.max(1, Math.ceil(totalItemsFiltered / pageSize));
      const start = (page - 1) * pageSize;
      franchises = franchises.slice(start, start + pageSize);
      return {
        response: true,
        franchises,
        totalPages: totalPagesFiltered,
        totalItems: totalItemsFiltered,
      };
    }
    return {
      response: true,
      franchises,
      totalPages,
      totalItems:
        totalItemsParsed !== undefined && !Number.isNaN(totalItemsParsed)
          ? totalItemsParsed
          : undefined,
    };
  } else {
    showLog(response.message || "Failed to fetch franchise");
    return {
      response: false,
      franchises: [],
      totalPages: 0,
      totalItems: 0,
    };
  }
};

export const deleteFranchise = async (id: string): Promise<boolean> => {
  const response = await apiRequest(ApiPaths.DELETE_FRANCHISE(id), "DELETE");

  if (response.success) {
    return true;
  } else {
    showLog(response.message || "Failed to delete franchise");
    return false;
  }
};

function parseFranchiseIdFromMutationResponse(
  apiData: unknown
): string | undefined {
  if (!apiData || typeof apiData !== "object") return undefined;
  const root = apiData as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const rec = (nested.record ?? nested.franchise ?? root.record) as
    | Record<string, unknown>
    | undefined;
  if (rec && typeof rec === "object") {
    const rid = rec._id ?? rec.id;
    if (rid != null && String(rid).trim()) return String(rid).trim();
  }
  return undefined;
}

export type CreateOrUpdateFranchiseResult = {
  ok: boolean;
  franchiseId?: string;
};

export const createOrUpdateFranchise = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<CreateOrUpdateFranchiseResult> => {
  const path = isEditable
    ? ApiPaths.UPDATE_FRANCHISE(id!)
    : ApiPaths.CREATE_FRANCHISE;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);

  if (response.success) {
    const franchiseId = isEditable
      ? String(id ?? "").trim() || undefined
      : parseFranchiseIdFromMutationResponse(response.data);
    return { ok: true, franchiseId };
  }
  return { ok: false };
};
