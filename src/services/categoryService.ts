import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { CategoryModel } from "../lib/models/CategoryModel";
import { showLog } from "../helper/utility";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";
import { showErrorAlert } from "../lib/global/alertHelper";
import {
  buildCatalogGetAllQueryParams,
  buildCategoryGetAllPath,
  catalogGetAllDebugLog,
  messageForCatalogGetAllFailure,
  parseFranchiseIdForCatalogGetAll,
} from "../lib/franchise/franchiseCatalog";

const FRANCHISE_SCOPE_ALL = "all";

function unwrapCatalogPayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const root = data as Record<string, unknown>;
  if (
    "all_categories" in root ||
    "all_services" in root ||
    "categories" in root ||
    "services" in root
  ) {
    return root;
  }
  const inner = root.data;
  if (inner && typeof inner === "object")
    return inner as Record<string, unknown>;
  return root;
}

/** `GET /franchise-category/getAll?franchise_id=` — paginated `categories` + `totalPages` / `totalItems`. */
function isPaginatedFranchiseCategoryPayload(
  payload: Record<string, unknown>
): boolean {
  return (
    Array.isArray(payload.categories) &&
    (payload.totalPages != null ||
      payload.totalItems != null ||
      payload.currentPage != null)
  );
}

function extractFranchiseCategoryRows(
  payload: Record<string, unknown>
): unknown[] {
  if (Array.isArray(payload.categories)) return payload.categories;
  if (Array.isArray(payload.all_categories)) return payload.all_categories;
  return [];
}

function rowMatchesCatalogStatus(
  row: Record<string, unknown>,
  status?: string
): boolean {
  if (!status || status === "All") return true;
  const s = String(status).toLowerCase();
  if (s === "true") return row.is_active === true;
  if (s === "false") return row.is_active === false;
  if (s === "blocked") return Boolean(row.is_blocked ?? row.blocked);
  return true;
}

/** Franchise-scoped `all_categories`: prefer `franchise_active` for Active/Inactive filter (see global catalog franchise doc). */
function rowMatchesFranchiseScopedCatalogRow(
  row: Record<string, unknown>,
  status?: string
): boolean {
  if (!status || status === "All") return true;
  const s = String(status).toLowerCase();
  if (s === "blocked") return Boolean(row.is_blocked ?? row.blocked);
  if (s === "true" || s === "false") {
    const fa = row.franchise_active;
    if (fa !== undefined && fa !== null) {
      return s === "true" ? fa === true : fa === false;
    }
  }
  return rowMatchesCatalogStatus(row, status);
}

/** `all_categories[].services` is often id strings; hydrate from `related_services` for table display. */
function hydrateCategoryServicesListFromRelated(
  servicesField: unknown,
  related: unknown
): unknown[] {
  const relatedArr = Array.isArray(related)
    ? (related as Record<string, unknown>[])
    : [];
  const idToDoc = new Map<string, Record<string, unknown>>();
  for (const item of relatedArr) {
    if (!item || typeof item !== "object") continue;
    const id = String(item._id ?? item.service_id ?? "").trim().toLowerCase();
    if (id) idToDoc.set(id, item);
  }

  if (Array.isArray(servicesField) && servicesField.length > 0) {
    const allPrimitiveRefs = servicesField.every(
      (x) =>
        x !== null &&
        (typeof x === "string" || typeof x === "number" || typeof x === "boolean")
    );
    if (allPrimitiveRefs && idToDoc.size > 0) {
      return servicesField.map((ref) => {
        const key = String(ref).trim().toLowerCase();
        return idToDoc.get(key) ?? { _id: ref, name: String(ref) };
      });
    }
    return servicesField as unknown[];
  }

  return relatedArr;
}

function normalizeFranchiseScopedCategoryRow(
  raw: Record<string, unknown>
): CategoryModel {
  const related = raw.related_services;
  const svcList = hydrateCategoryServicesListFromRelated(raw.services, related);
  const _id = String(raw._id ?? raw.id ?? raw.category_id ?? "").trim();
  const franchiseActive = raw.franchise_active;
  return {
    ...(raw as unknown as CategoryModel),
    _id,
    category_id: String(raw.category_id ?? _id).trim(),
    services: svcList as unknown as number,
    franchise_active:
      franchiseActive === true ||
      franchiseActive === "true" ||
      franchiseActive === 1
        ? true
        : franchiseActive === false ||
            franchiseActive === "false" ||
            franchiseActive === 0
          ? false
          : (franchiseActive as boolean | undefined),
  };
}

function extractCategoryDropDownRecords(data: unknown): any[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  if (Array.isArray(root.records)) return root.records as any[];
  const nested = root.data;
  if (nested && typeof nested === "object") {
    const inner = nested as Record<string, unknown>;
    if (Array.isArray(inner.records)) return inner.records as any[];
  }
  return [];
}

/** Hoisted so helpers below never see an uninitialized binding (HMR / circular import edge cases). */
export async function fetchCategoryDropDown(
  cityId?: string
): Promise<{ value: string; label: string }[]> {
  const cid = String(cityId ?? "").trim();
  const params = new URLSearchParams({
    ...(cid ? { city_id: cid } : {}),
  });
  const response = await apiRequest(
    `${ApiPaths.GET_CATEGORY_DROP_DOWN()}?${params.toString()}`,
    "GET"
  );

  if (response.success) {
    const rows = extractCategoryDropDownRecords(response.data);
    return rows.map((category: any) => ({
      value: String(category._id ?? ""),
      label: String(category.name ?? ""),
    }));
  } else {
    showLog(response.message || "Failed to fetch category");
    return [];
  }
}

export const fetchCategory = async (
  page: number,
  pageSize: number,
  filters: import("../lib/franchise/franchiseCatalog").FranchiseCatalogListFilters,
  sortBy: ServerTableSortBy = [],
  franchiseId?: string | null
): Promise<{
  response: boolean;
  categories: CategoryModel[];
  totalPages: number;
  totalRecords: number;
  /** When franchise-scoped list clamps `page` to a valid range, sync table state to this value. */
  resolvedPage?: number;
  /** Franchise-scoped `GET /franchise-category/getAll?franchise_id=` — paginated `categories` or legacy `all_categories`. */
  franchiseMappingRecords?: unknown[];
  franchiseMappingTotalPages?: number;
  franchiseMappingTotalItems?: number;
  franchiseMappingCurrentPage?: number;
}> => {
  const primarySort = sortBy[0];
  const rawFid = String(franchiseId ?? "").trim();
  const wantsScope =
    Boolean(rawFid) && rawFid.toLowerCase() !== FRANCHISE_SCOPE_ALL;
  const scopedPathId = wantsScope
    ? parseFranchiseIdForCatalogGetAll(rawFid)
    : null;

  if (wantsScope && !scopedPathId) {
    showErrorAlert(
      "Franchise filter must be a valid 24-character id, or choose All Franchises."
    );
    return {
      response: false,
      categories: [],
      totalPages: 0,
      totalRecords: 0,
    };
  }

  const queryParams = buildCatalogGetAllQueryParams({
    page,
    limit: pageSize,
    filters,
    sortByField: primarySort?.id ? String(primarySort.id) : undefined,
    sortDesc: primarySort?.desc,
  });
  if (scopedPathId) {
    queryParams.set("franchise_id", scopedPathId);
  }
  const path = buildCategoryGetAllPath(scopedPathId ?? rawFid);
  const url = `${path}?${queryParams.toString()}`;
  catalogGetAllDebugLog("category", scopedPathId, url);

  const response = await apiRequest(
    url,
    "GET",
    undefined,
    false,
    false,
    Boolean(scopedPathId)
  );

  if (scopedPathId) {
    if (!response.success) {
      const st = (response as { status?: number }).status;
      const msg = (response as { message?: string }).message;
      showErrorAlert(messageForCatalogGetAllFailure(st, msg));
      showLog(response.message || "Failed to fetch category");
      return {
        response: false,
        categories: [],
        totalPages: 0,
        totalRecords: 0,
      };
    }

    const payload = unwrapCatalogPayload(response.data);
    const mappingRecords = Array.isArray(payload.records)
      ? (payload.records as unknown[])
      : [];
    const franchiseMappingTotalPages = Number(payload.totalPages ?? 0);
    const franchiseMappingTotalItems = Number(payload.totalItems ?? 0);
    const franchiseMappingCurrentPage = Number(
      payload.currentPage ?? page ?? 1
    );

    const rawList = extractFranchiseCategoryRows(payload);
    let rows: CategoryModel[] = (rawList as Record<string, unknown>[]).map(
      normalizeFranchiseScopedCategoryRow
    );

    if (!isPaginatedFranchiseCategoryPayload(payload)) {
      rows = rows.filter((r) =>
        rowMatchesFranchiseScopedCatalogRow(
          r as unknown as Record<string, unknown>,
          filters.status
        )
      );
      if (filters.is_request === "true") {
        rows = rows.filter((r) => r.is_request === true);
      }
      if (filters.is_rejected !== undefined && filters.is_rejected !== "") {
        const want = filters.is_rejected === "true";
        rows = rows.filter((r) =>
          want ? r.is_rejected === true : r.is_rejected !== true
        );
      }

      const totalRecords = rows.length;
      const maxPage =
        totalRecords === 0 ? 0 : Math.ceil(totalRecords / pageSize);
      let effectivePage = page;
      if (maxPage > 0 && effectivePage > maxPage) effectivePage = maxPage;
      if (maxPage > 0 && effectivePage < 1) effectivePage = 1;
      const start = (effectivePage - 1) * pageSize;
      const pageRows = rows.slice(start, start + pageSize);
      const totalPages = maxPage;

      return {
        response: true,
        categories: pageRows,
        totalPages,
        totalRecords,
        franchiseMappingRecords: mappingRecords,
        franchiseMappingTotalPages,
        franchiseMappingTotalItems,
        franchiseMappingCurrentPage,
        ...(effectivePage !== page ? { resolvedPage: effectivePage } : {}),
      };
    }

    const serverPage = Number(payload.currentPage ?? page);
    return {
      response: true,
      categories: rows,
      totalPages: franchiseMappingTotalPages,
      totalRecords: franchiseMappingTotalItems,
      franchiseMappingRecords: mappingRecords,
      franchiseMappingTotalPages,
      franchiseMappingTotalItems,
      franchiseMappingCurrentPage,
      ...(serverPage !== page ? { resolvedPage: serverPage } : {}),
    };
  }

  if (response.success) {
    return {
      response: true,
      categories: response.data.records,
      totalPages: response.data.totalPages,
      totalRecords: Number(
        response.data.totalRecords ??
          response.data.total ??
          response.data.count ??
          (Array.isArray(response.data.records) ? response.data.records.length : 0)
      ),
    };
  } else {
    showLog(response.message || "Failed to fetch category");
    return {
      response: false,
      categories: [],
      totalPages: 0,
      totalRecords: 0,
    };
  }
};

/**
 * Options for admin catalogue UIs (e.g. assign service → category).
 * Paginates `GET /category/getAll` so the list is not limited like `getDropDown`,
 * then merges `getDropDown` rows so nothing is missing if APIs differ.
 */
export const fetchCategoriesAsSelectOptions = async (opts?: {
  pageSize?: number;
  filters?: {
    keyword?: string;
    status?: string;
    sort?: string;
    is_request?: string;
    is_rejected?: string;
  };
}): Promise<{ value: string; label: string }[]> => {
  const pageSize = opts?.pageSize ?? 200;
  const filters = opts?.filters ?? {};
  const byId = new Map<string, { value: string; label: string }>();
  let page = 1;
  for (;;) {
    const res = await fetchCategory(page, pageSize, filters, []);
    if (!res.response) break;
    for (const c of res.categories) {
      const id = String((c as { _id?: string })._id ?? "").trim();
      if (!id) continue;
      byId.set(id, {
        value: id,
        label:
          String((c as { name?: string }).name ?? "").trim() || id,
      });
    }
    if (!res.totalPages || page >= res.totalPages) break;
    page += 1;
    if (page > 50) break;
  }
  try {
    const drop = await fetchCategoryDropDown();
    for (const o of drop) {
      if (o.value && !byId.has(o.value)) byId.set(o.value, o);
    }
  } catch {
    /* ignore */
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
};

export const deleteCategory = async (id: string): Promise<boolean> => {
  const response = await apiRequest(ApiPaths.DELETE_CATEGORY(id), "DELETE");
  if (response.success) {
    return true;
  } else {
    showLog(response.message || "Failed to delete category");
    return false;
  }
};

export const fetchCategoryById = async (
  id: string
): Promise<{ response: boolean; category: CategoryModel | null }> => {
  const response = await apiRequest(ApiPaths.GET_CATEGORY_BY_ID(id), "GET");
  if (response.success) {
    const payload = (response as any).data ?? {};
    const record =
      payload.record ??
      payload.category ??
      payload.data?.record ??
      payload.data?.category ??
      (payload.data && typeof payload.data === "object" && payload.data._id
        ? payload.data
        : null);
    return {
      response: true,
      category: (record as CategoryModel | null) ?? null,
    };
  }
  return { response: false, category: null };
};

export const createOrUpdateCategory = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const result = await createOrUpdateCategoryWithRecord(payload, isEditable, id);
  return result.response;
};

/** Global catalogue row — active flag only (Service Management list toggle). */
export async function patchCategoryCatalogActiveStatus(
  id: string,
  is_active: boolean
): Promise<boolean> {
  const cid = String(id ?? "").trim();
  if (!cid) return false;
  const response = await apiRequest(
    ApiPaths.UPDATE_CATEGORY(cid),
    "PUT",
    { is_active },
    false,
    false,
    false,
    true
  );
  return Boolean(response.success);
}

export const createOrUpdateCategoryWithRecord = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<{ response: boolean; record: CategoryModel | null }> => {
  const isRequestRow = payload?.is_request === true;
  const isModerationCall = payload?.is_rejected === true || payload?.is_rejected === false;
  const path = isEditable
    ? isModerationCall
      ? ApiPaths.UPDATE_CATEGORY(id!)
      : isRequestRow
      ? ApiPaths.UPDATE_CATEGORY_REQUEST(id!)
      : ApiPaths.UPDATE_CATEGORY(id!)
    : isRequestRow
    ? ApiPaths.CREATE_CATEGORY_REQUEST
    : ApiPaths.CREATE_CATEGORY;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);
  if (response.success) {
    return {
      response: true,
      record: (response.data?.record ?? response.data?.records?.[0] ?? null) as
        | CategoryModel
        | null,
    };
  }
  return { response: false, record: null };
};
