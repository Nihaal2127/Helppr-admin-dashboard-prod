import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { TicketModel } from "../lib/models/TicketModel";
import { showLog } from "../helper/utility";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";

export const fetchTicket = async (
  page: number,
  pageSize: number,
  filters: { keyword?: string; status?: string; sort?: string },
  sortBy: ServerTableSortBy = []
): Promise<{
  response: boolean;
  tickets: TicketModel[];
  totalPages: number;
}> => {
  const primarySort = sortBy[0];
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(filters.keyword && { keyword: filters.keyword }),
    ...(filters.status &&
      filters.status !== "All" && { is_active: filters.status.toLowerCase() }),
    ...(filters.sort && { sort: filters.sort }),
    ...(primarySort?.id && { sort_by: primarySort.id }),
    ...(primarySort && { sort_order: primarySort.desc ? "desc" : "asc" }),
  });

  const response = await apiRequest(
    `${ApiPaths.GET_TICKET()}?${params.toString()}`,
    "GET"
  );

  if (response.success) {
    return {
      response: true,
      tickets: response.data.records,
      totalPages: response.data.totalPages,
    };
  } else {
    showLog(response.message || "Failed to fetch ticket");
    return {
      response: false,
      tickets: [],
      totalPages: 0,
    };
  }
};

export const fetchTicketById = async (
  id: string
): Promise<{ response: boolean; ticket: TicketModel | null }> => {
  const response = await apiRequest(
    `${ApiPaths.GET_TICKET_BY_ID()}/${id}`,
    "GET"
  );
  if (response.success) {
    return {
      response: true,
      ticket: response.data.record,
    };
  } else {
    return {
      response: false,
      ticket: null,
    };
  }
};

export const deleteTicket = async (id: string): Promise<boolean> => {
  const response = await apiRequest(ApiPaths.DELETE_TICKET(id), "DELETE");
  if (response.success) {
    return true;
  } else {
    showLog(response.message || "Failed to delete ticket");
    return false;
  }
};

export const createOrUpdateTicket = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const path = isEditable
    ? ApiPaths.UPDATE_TICKET_STATUS(id!)
    : ApiPaths.CREATE_TICKET;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);
  if (response.success) {
    return true;
  }
  return false;
};
