import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { ServiceModel } from "../lib/models/ServiceModel";
import { showLog } from "../helper/utility";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";
import { showErrorAlert } from "../lib/global/alertHelper";
import {
  buildCatalogGetAllQueryParams,
  buildServiceGetAllPath,
  catalogGetAllDebugLog,
  messageForCatalogGetAllFailure,
  parseFranchiseIdForCatalogGetAll,
} from "../lib/franchise/franchiseCatalog";

const FRANCHISE_SCOPE_ALL = "all";

function unwrapServiceFranchisePayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const root = data as Record<string, unknown>;
  if ("all_services" in root || "services" in root) return root;
  const inner = root.data;
  if (inner && typeof inner === "object")
    return inner as Record<string, unknown>;
  return root;
}

/** `GET /franchise-service/getAll?franchise_id=` — paginated `services` + `totalPages` / `totalItems`. */
function isPaginatedFranchiseServicePayload(
  payload: Record<string, unknown>
): boolean {
  return (
    Array.isArray(payload.services) &&
    (payload.totalPages != null ||
      payload.totalItems != null ||
      payload.currentPage != null)
  );
}

function extractFranchiseServiceRows(
  payload: Record<string, unknown>
): unknown[] {
  if (Array.isArray(payload.services)) return payload.services;
  if (Array.isArray(payload.all_services)) return payload.all_services;
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

/** Franchise-scoped `all_services`: prefer `franchise_active` for Active/Inactive filter (see global catalog franchise doc). */
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

/** Resolves `category_id` whether API sends a string id or a populated `{ _id, name }`. */
export function normalizeServiceCategoryRef(id: unknown): string {
  if (id == null) return "";
  if (typeof id === "object") {
    const o = id as Record<string, unknown>;
    const cand = o._id ?? o.id ?? o.category_id;
    if (cand != null && typeof cand === "object") {
      return normalizeServiceCategoryRef(cand);
    }
    if (cand != null) {
      const s = String(cand).trim();
      if (s && s !== "undefined" && s !== "null") return s;
    }
    return "";
  }
  const s = String(id).trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function normalizeFranchiseScopedServiceRow(
  raw: Record<string, unknown>
): ServiceModel {
  const cat = raw.category_id;
  let category_name = String(raw.category_name ?? "").trim();
  let category_id_str = "";
  if (cat && typeof cat === "object") {
    const o = cat as Record<string, unknown>;
    category_name = String(o.name ?? category_name).trim();
    category_id_str = String(o._id ?? o.id ?? "").trim();
  } else {
    category_id_str = normalizeServiceCategoryRef(raw.category_id);
  }
  const _id = String(raw._id ?? raw.id ?? raw.service_id ?? "").trim();
  const franchiseActive = raw.franchise_active;
  return {
    ...(raw as unknown as ServiceModel),
    _id,
    service_id: String(raw.service_id ?? _id).trim(),
    category_id: category_id_str,
    category_name,
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

export type ServiceDropDownOption = {
  value: string;
  label: string;
  price?: number;
  /** Present when options are built from franchise catalogue (filter by category in UI). */
  category_id?: string;
  /** Billing cadence from API (`per_hour`, `per_day`, …) — drives quote schedule UI. */
  payment_type?: string;
  /** Percent; from global / franchise service row for quote pricing breakdown. */
  tax?: number;
  /** Admin commission percent. */
  commission?: number;
  minimum_deposit?: number;
  min_deposit_type?: string;
  min_deposit_value?: number;
};

export const fetchServiceDropDown = async (
  categoryId?: string
): Promise<ServiceDropDownOption[]> => {
  const params = new URLSearchParams({
    ...(categoryId && { category_id: categoryId }),
  });

  const response = await apiRequest(
    `${ApiPaths.GET_SERVICE_DROP_DOWN()}?${params.toString()}`,
    "GET"
  );

  if (response.success) {
    return response.data.records.map((service: any) => ({
      value: String(service._id ?? ""),
      label: String(service.name ?? ""),
      price: service.price,
      payment_type: String(
        service.payment_type ?? service.min_deposit_type ?? ""
      ).trim(),
      tax:
        service.tax != null && Number.isFinite(Number(service.tax))
          ? Number(service.tax)
          : undefined,
      commission:
        service.commission != null &&
        Number.isFinite(Number(service.commission))
          ? Number(service.commission)
          : undefined,
      minimum_deposit:
        service.minimum_deposit != null &&
        Number.isFinite(Number(service.minimum_deposit))
          ? Number(service.minimum_deposit)
          : undefined,
      min_deposit_type: String(
        service.min_deposit_type ?? service.payment_type ?? ""
      ).trim(),
      min_deposit_value:
        service.min_deposit_value != null &&
        Number.isFinite(Number(service.min_deposit_value))
          ? Number(service.min_deposit_value)
          : service.minimum_deposit != null &&
            Number.isFinite(Number(service.minimum_deposit))
          ? Number(service.minimum_deposit)
          : undefined,
      category_id:
        normalizeServiceCategoryRef(service.category_id) || undefined,
    }));
  } else {
    showLog(response.message || "Failed to fetch service");
    return [];
  }
};

type ServiceDropDownRowWithCat = {
  value: string;
  label: string;
  price?: number;
  cat: string;
};

function toDropDownOption(
  r: ServiceDropDownRowWithCat
): { value: string; label: string; price?: number } {
  return { value: r.value, label: r.label, price: r.price };
}

export const fetchServicesForCategoryDialog = async (opts: {
  mode: "add" | "edit";
  /** Draft or saved category id for add-with-draft; required for edit (via `mode`). */
  categoryId?: string;
}): Promise<{ value: string; label: string; price?: number }[]> => {
  const response = await apiRequest(`${ApiPaths.GET_SERVICE_DROP_DOWN()}`, "GET");

  if (!response.success) {
    showLog(response.message || "Failed to fetch service");
    return [];
  }

  const rawRecords = response.data?.records;
  const records: unknown[] = Array.isArray(rawRecords) ? rawRecords : [];

  const rows: ServiceDropDownRowWithCat[] = [];
  for (const item of records) {
    const service = item as Record<string, unknown>;
    const value = String(service._id ?? "");
    if (!value) continue;
    rows.push({
      value,
      label: String(service.name ?? ""),
      price: service.price as number | undefined,
      cat: normalizeServiceCategoryRef(service.category_id),
    });
  }

  if (opts.mode === "edit") {
    const id = normalizeServiceCategoryRef(opts.categoryId);
    if (!id) return [];
    const out: { value: string; label: string; price?: number }[] = [];
    for (const r of rows) {
      if (r.cat === id) out.push(toDropDownOption(r));
    }
    return out;
  }

  const allow = normalizeServiceCategoryRef(opts.categoryId);
  const out: { value: string; label: string; price?: number }[] = [];
  for (const r of rows) {
    if (allow) {
      if (!r.cat || r.cat === allow) out.push(toDropDownOption(r));
    } else if (!r.cat) {
      out.push(toDropDownOption(r));
    }
  }
  return out;
};

export const fetchService = async (
  page: number,
  pageSize: number,
  filters: import("../lib/franchise/franchiseCatalog").FranchiseCatalogListFilters & {
    city_id?: string;
    state_id?: string;
  },
  sortBy: ServerTableSortBy = [],
  franchiseId?: string | null
): Promise<{
  response: boolean;
  services: ServiceModel[];
  totalPages: number;
  totalRecords: number;
  resolvedPage?: number;
  franchiseMappingRecords?: unknown[];
  franchiseMappingTotalPages?: number;
  franchiseMappingTotalItems?: number;
  franchiseMappingCurrentPage?: number;
}> => {
  const primarySort = sortBy[0];
  const cityId = String(filters.city_id ?? "").trim();
  const stateId = String(filters.state_id ?? "").trim();
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
      services: [],
      totalPages: 0,
      totalRecords: 0,
    };
  }

  const listFilters: import("../lib/franchise/franchiseCatalog").FranchiseCatalogListFilters = {
    keyword: filters.keyword,
    status: filters.status,
    sort: filters.sort,
    is_request: filters.is_request,
    is_rejected: filters.is_rejected,
    q: filters.q,
    order: filters.order,
  };

  const queryParams = buildCatalogGetAllQueryParams({
    page,
    limit: pageSize,
    filters: listFilters,
    sortByField: primarySort?.id ? String(primarySort.id) : undefined,
    sortDesc: primarySort?.desc,
    city_id: cityId,
    state_id: stateId,
  });
  if (scopedPathId) {
    queryParams.set("franchise_id", scopedPathId);
  }
  const path = buildServiceGetAllPath(scopedPathId ?? rawFid);
  const url = `${path}?${queryParams.toString()}`;
  catalogGetAllDebugLog("service", scopedPathId, url);

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
      showLog(response.message || "Failed to fetch service");
      return {
        response: false,
        services: [],
        totalPages: 0,
        totalRecords: 0,
      };
    }

    const payload = unwrapServiceFranchisePayload(response.data);
    const mappingRecords = Array.isArray(payload.records)
      ? (payload.records as unknown[])
      : [];
    const franchiseMappingTotalPages = Number(payload.totalPages ?? 0);
    const franchiseMappingTotalItems = Number(payload.totalItems ?? 0);
    const franchiseMappingCurrentPage = Number(
      payload.currentPage ?? page ?? 1
    );

    const rawList = extractFranchiseServiceRows(payload);
    let rows: ServiceModel[] = (rawList as Record<string, unknown>[]).map(
      normalizeFranchiseScopedServiceRow
    );

    if (!isPaginatedFranchiseServicePayload(payload)) {
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
        services: pageRows,
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
      services: rows,
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
    const payload = (response as { data?: unknown }).data;
    const rawRecords =
      payload &&
      typeof payload === "object" &&
      Array.isArray((payload as { records?: unknown }).records)
        ? (payload as { records: ServiceModel[] }).records
        : payload &&
            typeof payload === "object" &&
            (payload as { data?: { records?: unknown } }).data &&
            Array.isArray(
              (payload as { data: { records?: unknown } }).data.records
            )
        ? (payload as { data: { records: ServiceModel[] } }).data.records
        : [];

    return {
      response: true,
      services: rawRecords,
      totalPages: Number(
        (payload as { totalPages?: number })?.totalPages ??
          (payload as { data?: { totalPages?: number } })?.data?.totalPages ??
          0
      ),
      totalRecords: Number(
        (payload as { totalRecords?: number })?.totalRecords ??
          (payload as { total?: number })?.total ??
          (payload as { count?: number })?.count ??
          (Array.isArray(rawRecords) ? rawRecords.length : 0)
      ),
    };
  } else {
    showLog(response.message || "Failed to fetch service");
    return {
      response: false,
      services: [],
      totalPages: 0,
      totalRecords: 0,
    };
  }
};

export const deleteService = async (id: string): Promise<boolean> => {
  const response = await apiRequest(ApiPaths.DELETE_SERVICE(id), "DELETE");
  if (response.success) {
    return true;
  } else {
    showLog(response.message || "Failed to delete service");
    return false;
  }
};

export const fetchServiceById = async (
  id: string
): Promise<{ response: boolean; service: ServiceModel | null }> => {
  const response = await apiRequest(ApiPaths.GET_SERVICE_BY_ID(id), "GET");
  if (response.success) {
    const payload = (response as any).data ?? {};
    const record =
      payload.record ??
      payload.service ??
      payload.data?.record ??
      payload.data?.service ??
      (payload.data && typeof payload.data === "object" && payload.data._id
        ? payload.data
        : null);
    return {
      response: true,
      service: (record as ServiceModel | null) ?? null,
    };
  }
  return { response: false, service: null };
};

/** Global catalogue row — active flag only (Service Management list toggle). */
export async function patchServiceCatalogActiveStatus(
  id: string,
  is_active: boolean
): Promise<boolean> {
  const sid = String(id ?? "").trim();
  if (!sid) return false;
  const response = await apiRequest(
    ApiPaths.UPDATE_SERVICE(sid),
    "PUT",
    { is_active },
    false,
    false,
    false,
    true
  );
  return Boolean(response.success);
}

export const createOrUpdateService = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const isRequestRow = payload?.is_request === true;
  const isModerationCall = payload?.is_rejected === true || payload?.is_rejected === false;
  const path = isEditable
    ? isModerationCall
      ? ApiPaths.UPDATE_SERVICE(id!)
      : isRequestRow
      ? ApiPaths.UPDATE_SERVICE_REQUEST(id!)
      : ApiPaths.UPDATE_SERVICE(id!)
    : isRequestRow
    ? ApiPaths.CREATE_SERVICE_REQUEST
    : ApiPaths.CREATE_SERVICE;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);
  if (response.success) {
    return true;
  }
  return false;
};
