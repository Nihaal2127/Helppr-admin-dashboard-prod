import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { CityModel } from "../lib/models/CityModel";
import { showLog } from "../helper/utility";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";
import { fetchArea } from "./areaService";

export type CityDropDownOption = {
  value: string;
  label: string;
  state_id?: string;
  state_name?: string;
};

export const fetchCityDropDown = async (
  stateIdList?: string[]
): Promise<CityDropDownOption[]> => {
  const params = new URLSearchParams();
  if (stateIdList && stateIdList.length > 0) {
    const v = stateIdList.toString();
    params.set("state_id", v);
    params.set("stateId", v);
  }

  const response = await apiRequest(
    `${ApiPaths.GET_CITY_DROP_DOWN()}${params.toString() ? `?${params.toString()}` : ""}`,
    "GET"
  );

  if (response.success) {
    return response.data.records.map((city: any) => ({
      value: city._id,
      label: city.name,
      state_id: city.state_id,
      state_name: city.state_name,
    }));
  } else {
    showLog(response.message || "Failed to fetch city");
    return [];
  }
};

/**
 * Cities for user/partner forms. When `franchiseId` is set, only cities that have at
 * least one area linked to that franchise (in the selected state) are returned.
 */
export async function fetchCityDropDownForForm(
  stateId: string,
  franchiseId?: string
): Promise<CityDropDownOption[]> {
  const sid = String(stateId ?? "").trim();
  if (!sid) return [];

  const fid = String(franchiseId ?? "").trim();
  if (!fid) {
    return fetchCityDropDown([sid]);
  }

  const cityIds = new Set<string>();
  let page = 1;
  const pageSize = 200;

  for (;;) {
    const res = await fetchArea(
      page,
      pageSize,
      { state_id: sid, franchise_id: fid },
      []
    );
    if (!res.response) break;

    for (const area of res.areas ?? []) {
      const cid = String(area.city_id ?? "").trim();
      if (cid) cityIds.add(cid);
    }

    if (!res.totalPages || page >= res.totalPages) break;
    page += 1;
    if (page > 50) break;
  }

  if (cityIds.size === 0) return [];

  const allInState = await fetchCityDropDown([sid]);
  return allInState
    .filter((c) => cityIds.has(String(c.value)))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const fetchCity = async (
  page: number,
  pageSize: number,
  filters: { name?: string; status?: string; sort?: string; state_id?: string },
  sortBy: ServerTableSortBy = []
): Promise<{ response: boolean; cities: CityModel[]; totalPages: number }> => {
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
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(nameQuery && { name: nameQuery }),
    ...(nameQuery && { keyword: nameQuery }),
    ...(nameQuery && { search: nameQuery }),
    ...(normalizedIsActive && { is_active: normalizedIsActive }),
    ...(normalizedIsActive && { isActive: normalizedIsActive }),
    ...(filters.sort && { sort: filters.sort }),
    ...(filters.state_id && { state_id: filters.state_id }),
    ...(filters.state_id && { stateId: filters.state_id }),
    ...(primarySort?.id && { sort_by: primarySort.id }),
    ...(primarySort?.id && { sortBy: primarySort.id }),
    ...(primarySort && { sort_order: primarySort.desc ? "desc" : "asc" }),
    ...(primarySort && { sortOrder: primarySort.desc ? "desc" : "asc" }),
  });

  const response = await apiRequest(
    `${ApiPaths.GET_CITY()}?${params.toString()}`,
    "GET"
  );

  if (response.success) {
    return {
      response: true,
      cities: response.data.records,
      totalPages: response.data.totalPages,
    };
  } else {
    showLog(response.message || "Failed to fetch city");
    return {
      response: false,
      cities: [],
      totalPages: 0,
    };
  }
};

export const deleteCity = async (id: string): Promise<boolean> => {
  const response = await apiRequest(ApiPaths.DELETE_CITY(id), "DELETE");
  if (response.success) {
    return true;
  } else {
    showLog(response.message || "Failed to delete city");
    return false;
  }
};

export const createOrUpdateCity = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const path = isEditable ? ApiPaths.UPDATE_CITY(id!) : ApiPaths.CREATE_CITY;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);
  if (response.success) {
    return true;
  }
  return false;
};
