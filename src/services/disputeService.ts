import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import {
  DisputeRecordModel,
  DisputeStatus,
  mapDisputeRecord,
} from "../lib/models/ChatModel";

export type DisputesFilters = {
  search?: string;
  status?: DisputeStatus;
  franchiseId?: string;
  orderId?: string;
  page?: number;
  limit?: number;
};

function pickDisputeRecords(payload: Record<string, unknown>): Record<string, unknown>[] {
  const data = payload.data;
  if (Array.isArray(payload.records)) return payload.records as Record<string, unknown>[];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = data as Record<string, unknown>;
    if (Array.isArray(inner.records)) return inner.records as Record<string, unknown>[];
  }
  return [];
}

function pickDisputeRecord(payload: Record<string, unknown>): Record<string, unknown> | null {
  const record = payload.record ?? payload.data;
  if (record && typeof record === "object" && !Array.isArray(record)) {
    return record as Record<string, unknown>;
  }
  return null;
}

export const fetchDisputesPage = async (
  page = 1,
  limit = 10,
  filters: DisputesFilters = {},
  opts?: { skipLoader?: boolean }
): Promise<{
  response: boolean;
  disputes: DisputeRecordModel[];
  totalPages: number;
  totalItems?: number;
}> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.orderId ? { order_id: filters.orderId } : {}),
    ...(filters.franchiseId ? { franchise_id: filters.franchiseId } : {}),
  });

  const res = await apiRequest(
    `${ApiPaths.GET_DISPUTES()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    opts?.skipLoader ?? false,
    false,
    true
  );

  if (!res.success) {
    return { response: false, disputes: [], totalPages: 0 };
  }

  const payload = (res.data ?? {}) as Record<string, unknown>;
  const disputes = pickDisputeRecords(payload).map(mapDisputeRecord);

  const data = payload.data;
  const inner =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;

  const totalPagesRaw =
    inner?.totalPages ?? payload.totalPages ?? payload.total_pages ?? 0;
  const totalItemsRaw =
    inner?.totalItems ?? payload.totalItems ?? payload.total_items;

  let totalPages = Number(totalPagesRaw) || 0;
  const totalItemsParsed =
    totalItemsRaw === undefined || totalItemsRaw === null || totalItemsRaw === ""
      ? undefined
      : Number(totalItemsRaw);

  if (!Number.isFinite(totalPages) || totalPages < 1) {
    totalPages = disputes.length < limit ? Math.max(1, page) : page + 1;
  }

  return {
    response: true,
    disputes,
    totalPages: Math.max(1, totalPages),
    totalItems:
      totalItemsParsed !== undefined && !Number.isNaN(totalItemsParsed)
        ? totalItemsParsed
        : undefined,
  };
};

export const fetchDisputeById = async (
  id: string,
  opts?: { skipLoader?: boolean }
): Promise<{ response: boolean; dispute?: DisputeRecordModel }> => {
  const disputeId = String(id ?? "").trim();
  if (!disputeId) return { response: false };

  const res = await apiRequest(
    ApiPaths.GET_DISPUTE_BY_ID(disputeId),
    "GET",
    undefined,
    false,
    opts?.skipLoader ?? true,
    true,
    true
  );

  if (!res.success) return { response: false };
  const row = pickDisputeRecord((res.data ?? {}) as Record<string, unknown>);
  if (!row) return { response: false };
  return { response: true, dispute: mapDisputeRecord(row) };
};

export const updateDisputeStatus = async (
  id: string,
  status: DisputeStatus,
  opts?: { skipLoader?: boolean }
): Promise<boolean> => {
  const disputeId = String(id ?? "").trim();
  if (!disputeId) return false;

  const res = await apiRequest(
    ApiPaths.UPDATE_DISPUTE(disputeId),
    "PUT",
    { status },
    false,
    opts?.skipLoader ?? false,
    false,
    false
  );
  return Boolean(res.success);
};

export function countDisputesByStatus(
  disputes: DisputeRecordModel[],
  status: DisputeStatus
): number {
  return disputes.filter(
    (d) => String(d.status ?? "").toLowerCase() === status.toLowerCase()
  ).length;
}

/** Fetch all disputes for hub counts (paginated walk). */
export const fetchAllDisputesForCounts = async (
  filters: Omit<DisputesFilters, "page" | "limit"> = {},
  opts?: { skipLoader?: boolean }
): Promise<DisputeRecordModel[]> => {
  const batch = 100;
  let page = 1;
  const all: DisputeRecordModel[] = [];

  for (;;) {
    const chunk = await fetchDisputesPage(page, batch, filters, {
      skipLoader: opts?.skipLoader ?? true,
    });
    if (!chunk.response || chunk.disputes.length === 0) break;
    all.push(...chunk.disputes);
    if (chunk.disputes.length < batch) break;
    page += 1;
    if (page > 50) break;
  }

  return all;
};
