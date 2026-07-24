import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { AreaModel } from "../lib/models/AreaModel";
import { showLog } from "../helper/utility";
import {
  franchiseIdForAreaGetAll,
} from "../lib/franchise/headerFranchisePreference";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";

export const fetchAreaDropDown = async (
  cityId?: string,
  stateId?: string
): Promise<
  { value: string; label: string; pincodes?: string[]; pincode?: string }[]
> => {
  const q = new URLSearchParams();
  if (cityId?.trim()) q.set("city_id", cityId.trim());
  if (stateId?.trim()) q.set("state_id", stateId.trim());
  // Postman collections differ; support both styles.
  if (cityId?.trim()) q.set("cityId", cityId.trim());
  if (stateId?.trim()) q.set("stateId", stateId.trim());
  const qs = q.toString();
  const response = await apiRequest(
    `${ApiPaths.GET_AREA_DROP_DOWN()}${qs ? `?${qs}` : ""}`,
    "GET"
  );

  const data = (response as any).data;
  const records = data?.records ?? (Array.isArray(data) ? data : []);
  if (response.success && Array.isArray(records)) {
    return records
      .map((area: any) => ({
        value: String(area._id ?? area.id ?? ""),
        label: String(area.name ?? area.label ?? ""),
        pincodes: Array.isArray(area.pincodes)
          ? area.pincodes.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
          : [],
        pincode: String(area.pincode ?? "").trim(),
      }))
      .filter((o: { value: string; label: string }) => o.value);
  } else {
    showLog(response.message || "Failed to fetch area");
    return [];
  }
};

export const fetchArea = async (
  page: number,
  pageSize: number,
  filters: {
    name?: string;
    status?: string;
    sort?: string;
    state_id?: string;
    city_id?: string;
    franchise_id?: string;
    /** `my-franchise` — only areas linked to the caller's franchise (`GET /area/getAll?type=my-franchise`). */
    type?: string;
  },
  sortBy: ServerTableSortBy = []
): Promise<{ response: boolean; areas: AreaModel[]; totalPages: number }> => {
  const primarySort = sortBy[0];
  const nameQuery = String(filters.name ?? "").trim();
  const statusRaw = String(filters.status ?? "").trim().toLowerCase();
  const normalizedIsActive =
    statusRaw === "all" || statusRaw === ""
      ? ""
      : statusRaw === "active" || statusRaw === "true"
      ? "true"
      : statusRaw === "inactive" || statusRaw === "false"
      ? "false"
      : statusRaw;
  const franchiseIdQuery = franchiseIdForAreaGetAll(filters.franchise_id);

  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(nameQuery && { name: nameQuery }),
    ...(nameQuery && { keyword: nameQuery }),
    ...(nameQuery && { search: nameQuery }),
    ...(nameQuery && { areaname: nameQuery }),
    ...(normalizedIsActive && { is_active: normalizedIsActive }),
    ...(normalizedIsActive && { isActive: normalizedIsActive }),
    ...(filters.sort && { sort: filters.sort }),
    ...(filters.state_id && { state_id: filters.state_id }),
    ...(filters.state_id && { stateId: filters.state_id }),
    ...(filters.city_id && { city_id: filters.city_id }),
    ...(filters.city_id && { cityId: filters.city_id }),
    ...(franchiseIdQuery && { franchise_id: franchiseIdQuery }),
    ...(franchiseIdQuery && { franchiseId: franchiseIdQuery }),
    ...(String(filters.type ?? "").trim() === "my-franchise"
      ? { type: "my-franchise" }
      : {}),
    ...(primarySort?.id && { sort_by: primarySort.id }),
    ...(primarySort?.id && { sortBy: primarySort.id }),
    ...(primarySort && { sort_order: primarySort.desc ? "desc" : "asc" }),
    ...(primarySort && { sortOrder: primarySort.desc ? "desc" : "asc" }),
  });

  const response = await apiRequest(
    `${ApiPaths.GET_AREA()}?${params.toString()}`,
    "GET"
  );

  if (response.success) {
    const d = (response as any).data ?? {};
    const list = d.records ?? d.data?.records;
    const pages = d.totalPages ?? d.data?.totalPages;
    return {
      response: true,
      areas: Array.isArray(list) ? list : [],
      totalPages: typeof pages === "number" ? pages : 0,
    };
  } else {
    showLog(response.message || "Failed to fetch area");
    return {
      response: false,
      areas: [],
      totalPages: 0,
    };
  }
};

export type AreaFormSelectOption = {
  value: string;
  label: string;
  pincodes: string[];
};

function pincodesFromAreaRecord(row: AreaModel): string[] {
  const raw = Array.isArray(row.pincodes)
    ? row.pincodes
    : Array.isArray(row.pin_codes)
    ? row.pin_codes
    : typeof row.pincode === "string"
    ? row.pincode.split(",")
    : [];
  return Array.from(
    new Set(raw.map((p: unknown) => String(p ?? "").trim()).filter(Boolean))
  );
}

/**
 * Areas for a city via `GET /area/getAll?city_id=` (Add/Edit user & partner forms).
 * When `franchiseId` is set, only areas linked to that franchise are returned.
 */
export async function fetchAreasByCityForForm(
  cityId: string,
  stateId?: string,
  franchiseId?: string
): Promise<AreaFormSelectOption[]> {
  const city = String(cityId ?? "").trim();
  if (!city) return [];

  const state = String(stateId ?? "").trim();
  const franchise = String(franchiseId ?? "").trim();
  const byId = new Map<string, AreaFormSelectOption>();
  let page = 1;
  const pageSize = 200;

  for (;;) {
    const res = await fetchArea(
      page,
      pageSize,
      {
        city_id: city,
        ...(state ? { state_id: state } : {}),
        ...(franchise ? { franchise_id: franchise } : {}),
      },
      []
    );
    if (!res.response) break;

    for (const row of res.areas ?? []) {
      const id = String(row._id ?? "").trim();
      const label = String(row.name ?? "").trim();
      if (!id || !label) continue;
      byId.set(id, {
        value: id,
        label,
        pincodes: pincodesFromAreaRecord(row),
      });
    }

    if (!res.totalPages || page >= res.totalPages) break;
    page += 1;
    if (page > 50) break;
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}

/** Area + pincode options for address modals and user/partner forms. */
export type AreaViewSelectOption = {
  value: string;
  label: string;
  pincodes?: string[];
  pincode?: string;
};

export function mapAreaFormSelectToViewOptions(
  rows: AreaFormSelectOption[]
): AreaViewSelectOption[] {
  return rows.map((r) => ({
    value: r.value,
    label: r.label,
    pincodes: r.pincodes,
    pincode: r.pincodes[0],
  }));
}

export async function fetchAreaViewOptionsByCity(
  cityId: string,
  stateId?: string
): Promise<AreaViewSelectOption[]> {
  const rows = await fetchAreasByCityForForm(cityId, stateId);
  return mapAreaFormSelectToViewOptions(rows);
}

export const deleteArea = async (id: string): Promise<boolean> => {
  const response = await apiRequest(ApiPaths.DELETE_AREA(id), "DELETE");
  if (response.success) return true;

  showLog(response.message || "Failed to delete area");
  return false;
};

/** `GET /area/get/:id` — used to resolve franchise service postcodes from linked `area_id`(s). */
export async function fetchAreaById(
  id: string
): Promise<{ response: boolean; area: Record<string, unknown> | null }> {
  const aid = String(id ?? "").trim();
  if (!aid) return { response: false, area: null };
  const response = await apiRequest(ApiPaths.GET_AREA_BY_ID(aid), "GET");
  if (!response.success) {
    showLog((response as any).message || "Failed to fetch area");
    return { response: false, area: null };
  }
  const payload = (response as any).data ?? {};
  const record =
    payload.record ??
    payload.area ??
    payload.data?.record ??
    (payload.data &&
    typeof payload.data === "object" &&
    !Array.isArray(payload.data) &&
    (payload.data as any)._id
      ? payload.data
      : null);
  return {
    response: true,
    area:
      record && typeof record === "object"
        ? (record as Record<string, unknown>)
        : null,
  };
}

export const createOrUpdateArea = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const path = isEditable ? ApiPaths.UPDATE_AREA(id!) : ApiPaths.CREATE_AREA;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);
  return response.success;
};
