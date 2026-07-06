import { CountModel } from "../lib/models/CountModel";
import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { showLog } from "../helper/utility";
import { franchiseIdForUserGetAll } from "../lib/franchise/headerFranchisePreference";

const COUNT_RECORD_HINT_KEYS = [
  "total_user",
  "total_partner",
  "total_franchise",
  "order_in_progress",
  "quote_new",
  "total_service",
  "total_category",
  "total_state",
  "received_amount",
  "pending_order",
  "in_progress_order",
  "published",
  "hidden",
  "removed",
  "reviewed",
  "dismissed",
];

/** API count payloads are dynamic; coerce after hint-key check (avoids unsafe direct casts). */
function coerceCountModel(raw: Record<string, unknown>): CountModel {
  return JSON.parse(JSON.stringify(raw)) as CountModel;
}

function extractCountRecord(
  inner: Record<string, unknown> | undefined,
  d: Record<string, unknown> | undefined
): CountModel | null {
  const explicit =
    (inner?.record as CountModel | null | undefined) ??
    (d?.record as CountModel | null | undefined);
  if (explicit && typeof explicit === "object") return explicit;
  const candidate = inner ?? d;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const hasHint = COUNT_RECORD_HINT_KEYS.some((k) => k in candidate);
  if (hasHint) return coerceCountModel(candidate);
  return null;
}

/** Optional fields merged into `POST /getCount` after `type` (when super admin / staff scope dashboards by franchise). */
export type GetCountExtra = {
  franchise_id?: string;
  from_date?: string;
  to_date?: string;
};

/** Builds `POST /getCount?franchise_id=…` query string (same scoping as `GET …/getAll?franchise_id=`). */
function buildGetCountEndpoint(extra?: GetCountExtra): string {
  const params = new URLSearchParams();
  const franchiseIdQuery = franchiseIdForUserGetAll(extra?.franchise_id);
  if (franchiseIdQuery) params.set("franchise_id", franchiseIdQuery);
  if (extra?.from_date?.trim()) params.set("from_date", extra.from_date.trim());
  if (extra?.to_date?.trim()) params.set("to_date", extra.to_date.trim());
  const qs = params.toString();
  return qs ? `${ApiPaths.GET_COUNT}?${qs}` : ApiPaths.GET_COUNT;
}

export const getCount = async (
  /**
   * Required by the API (`POST /getCount` returns 400 if `type` is missing).
   * Examples: `"service-management"`, `"user-management"`, `"order-management"`, `"franchise-management"`, `"my-franchise"`, `"quote-management"`, or numeric codes where the API still expects them (e.g. location `1`).
   */
  type: number | string,
  extra?: GetCountExtra
): Promise<{
  countModel: CountModel | null | null;
  responseCount: boolean;
}> => {
  try {
    const payload: Record<string, unknown> = { type };
    const franchiseIdQuery = franchiseIdForUserGetAll(extra?.franchise_id);
    if (franchiseIdQuery) {
      payload.franchise_id = franchiseIdQuery;
    }
    if (extra?.from_date?.trim()) {
      payload.from_date = extra.from_date.trim();
    }
    if (extra?.to_date?.trim()) {
      payload.to_date = extra.to_date.trim();
    }
    const response = await apiRequest(
      buildGetCountEndpoint(extra),
      "POST",
      payload,
      false,
      false,
      false,
      true
    );
    if (response.success) {
      const d = response.data as Record<string, unknown> | undefined;
      const inner =
        d &&
        typeof d.data === "object" &&
        d.data !== null &&
        !Array.isArray(d.data)
          ? (d.data as Record<string, unknown>)
          : d;
      const record = extractCountRecord(inner, d);
      return {
        countModel: record,
        responseCount: true,
      };
    } else {
      showLog("Get count failed:", response.message || "Unknown error");
      return {
        countModel: null,
        responseCount: false,
      };
    }
  } catch (error) {
    showLog("Error during get count:", error);
    return {
      countModel: null,
      responseCount: false,
    };
  }
};
