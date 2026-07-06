import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { StateModel } from "../lib/models/StateModel";
import { showLog } from "../helper/utility";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";

function stateDropDownRecords(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  if (Array.isArray(root.records)) return root.records;
  const nested = root.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>;
    if (Array.isArray(inner.records)) return inner.records;
  }
  if (Array.isArray(nested)) return nested;
  return [];
}

export const fetchStateDropDown = async (): Promise<
  { value: string; label: string }[]
> => {
  const response = await apiRequest(`${ApiPaths.GET_STATE_DROP_DOWN()}`, "GET");

  if (response.success) {
    return stateDropDownRecords(response.data)
      .map((row) => {
        const state = row as { _id?: string; name?: string };
        const value = String(state._id ?? "").trim();
        const label = String(state.name ?? "").trim();
        if (!value || !label) return null;
        return { value, label };
      })
      .filter((o): o is { value: string; label: string } => o !== null);
  } else {
    showLog(response.message || "Failed to fetch state");
    return [];
  }
};

export const fetchState = async (
  page: number,
  pageSize: number,
  filters: { name?: string; status?: string; sort?: string },
  sortBy: ServerTableSortBy = []
): Promise<{ response: boolean; states: StateModel[]; totalPages: number }> => {
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
    ...(primarySort?.id && { sort_by: primarySort.id }),
    ...(primarySort?.id && { sortBy: primarySort.id }),
    ...(primarySort && { sort_order: primarySort.desc ? "desc" : "asc" }),
    ...(primarySort && { sortOrder: primarySort.desc ? "desc" : "asc" }),
  });

  const response = await apiRequest(
    `${ApiPaths.GET_STATE()}?${params.toString()}`,
    "GET"
  );

  if (response.success) {
    return {
      response: true,
      states: response.data.records,
      totalPages: response.data.totalPages,
    };
  } else {
    showLog(response.message || "Failed to fetch state");
    return {
      response: false,
      states: [],
      totalPages: 0,
    };
  }
};

export const deleteState = async (id: string): Promise<boolean> => {
  const response = await apiRequest(ApiPaths.DELETE_STATE(id), "DELETE");
  if (response.success) {
    return true;
  } else {
    showLog(response.message || "Failed to delete state");
    return false;
  }
};

export const createOrUpdateState = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const path = isEditable ? ApiPaths.UPDATE_STATE(id!) : ApiPaths.CREATE_STATE;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);
  if (response.success) {
    return true;
  }
  return false;
};
