import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { ExpenseModel } from "../lib/models/ExpenseModel";
import { showLog } from "../helper/utility";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";

export type ExpensesFilters = {
  search?: string;
  category?: string;
  subCategory?: string;
  franchiseId?: string;
  fromDate?: string;
  toDate?: string;
  sort?: string;
  sortOrder?: "asc" | "desc";
};

const parseExpensesResponse = (
  payload: any
): { records: ExpenseModel[]; totalPages: number; totalItems?: number } => {
  const d = payload ?? {};
  const inner =
    d.data != null && typeof d.data === "object" && !Array.isArray(d.data)
      ? d.data
      : {};
  const records = inner.records ?? d.records ?? [];
  const totalPagesVal = inner.totalPages ?? d.totalPages ?? 0;
  const totalItemsRaw = inner.totalItems ?? d.totalItems;
  const totalItems =
    totalItemsRaw === undefined ||
    totalItemsRaw === null ||
    totalItemsRaw === ""
      ? undefined
      : Number(totalItemsRaw);

  return {
    records: Array.isArray(records) ? records : [],
    totalPages: Number(totalPagesVal) || 0,
    totalItems:
      totalItems !== undefined && !Number.isNaN(totalItems)
        ? totalItems
        : undefined,
  };
};

export const fetchExpenses = async (
  page: number,
  pageSize: number,
  filters: ExpensesFilters,
  requestOpts?: { skipLoader?: boolean },
  sortBy: ServerTableSortBy = []
): Promise<{
  response: boolean;
  expenses: ExpenseModel[];
  totalPages: number;
  totalItems?: number;
}> => {
  const primarySort = sortBy[0];
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.subCategory ? { subCategory: filters.subCategory } : {}),
    ...(filters.franchiseId ? { franchise_id: filters.franchiseId } : {}),
    ...(filters.fromDate ? { fromDate: filters.fromDate } : {}),
    ...(filters.toDate ? { toDate: filters.toDate } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
    ...(primarySort?.id
      ? {
          sort:
            primarySort.id === "category"
              ? "category_name"
              : primarySort.id === "subCategory"
              ? "sub_category_name"
              : primarySort.id === "expenseName"
              ? "expense_name"
              : primarySort.id === "expenseAmount"
              ? "expense_amount"
              : primarySort.id === "expenseDate"
              ? "expense_date"
              : primarySort.id === "franchiseName"
              ? "franchise_name"
              : primarySort.id,
        }
      : {}),
    ...(primarySort || filters.sortOrder
      ? {
          sort_order: primarySort
            ? primarySort.desc
              ? "desc"
              : "asc"
            : filters.sortOrder,
        }
      : {}),
  });

  const response = await apiRequest(
    `${ApiPaths.GET_EXPENSES()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    requestOpts?.skipLoader ?? false
  );

  if (response?.success) {
    const { records, totalPages, totalItems } = parseExpensesResponse(
      response.data
    );
    return { response: true, expenses: records, totalPages, totalItems };
  }

  showLog(response?.message || "Failed to fetch expenses");
  return { response: false, expenses: [], totalPages: 0 };
};

export const fetchAllExpensesMatching = async (
  filters: ExpensesFilters,
  batchSize = 250,
  opts?: { skipLoader?: boolean; sortBy?: ServerTableSortBy }
): Promise<ExpenseModel[] | null> => {
  const first = await fetchExpenses(
    1,
    batchSize,
    filters,
    { skipLoader: opts?.skipLoader ?? true },
    opts?.sortBy ?? []
  );
  if (!first.response) return null;

  let all = [...first.expenses];
  const totalPages = Math.max(1, first.totalPages || 1);

  for (let p = 2; p <= totalPages; p++) {
    // eslint-disable-next-line no-await-in-loop
    const next = await fetchExpenses(
      p,
      batchSize,
      filters,
      { skipLoader: opts?.skipLoader ?? true },
      opts?.sortBy ?? []
    );
    if (!next.response) break;
    all = all.concat(next.expenses);
  }

  return all;
};

export const createOrUpdateExpense = async (
  payload: any,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const path = isEditable
    ? ApiPaths.UPDATE_EXPENSE(id!)
    : ApiPaths.CREATE_EXPENSE;
  const method = isEditable ? "PUT" : "POST";
  const response = await apiRequest(path, method, payload);
  return Boolean(response?.success);
};

export const fetchExpenseById = async (
  id: string,
  requestOpts?: { skipLoader?: boolean; franchiseId?: string }
): Promise<{ response: boolean; expense?: ExpenseModel }> => {
  const franchiseId = requestOpts?.franchiseId?.trim();
  const query = franchiseId
    ? `?${new URLSearchParams({ franchise_id: franchiseId }).toString()}`
    : "";
  const response = await apiRequest(
    `${ApiPaths.GET_EXPENSE_BY_ID(id)}${query}`,
    "GET",
    undefined,
    false,
    requestOpts?.skipLoader ?? false
  );

  if (!response?.success) return { response: false };
  const payload = response.data ?? {};
  const d = payload.data ?? payload;
  const expense = d.record ?? d.expense ?? d;
  return { response: true, expense };
};

export const deleteExpenseById = async (
  id: string,
  franchiseId?: string
): Promise<boolean> => {
  const fid = franchiseId?.trim();
  const query = fid
    ? `?${new URLSearchParams({ franchise_id: fid }).toString()}`
    : "";
  const response = await apiRequest(
    `${ApiPaths.DELETE_EXPENSE(id)}${query}`,
    "DELETE"
  );
  return Boolean(response?.success);
};
