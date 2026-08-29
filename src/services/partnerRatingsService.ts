import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { showLog } from "../helper/utility";

export type PartnerRatingsSummary = {
  partner_id: string;
  partner_name: string;
  average_rating: number | null;
  rating_count: number;
};

export type PartnerRatingRow = {
  order_id: string;
  order_unique_id: string;
  user_id: string;
  user_unique_id: string;
  customer_name: string;
  customer_phone_number?: string;
  customer_profile_url?: string | null;
  service_name?: string;
  rating: number;
  review_text: string;
  reviewed_at: string;
};

export type FetchPartnerRatingsResult = {
  ok: boolean;
  summary: PartnerRatingsSummary | null;
  records: PartnerRatingRow[];
  totalPages: number;
  currentPage: number;
  totalItems: number;
};

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRatingRow(raw: Record<string, unknown>): PartnerRatingRow | null {
  const order_id = str(raw.order_id);
  const order_unique_id = str(raw.order_unique_id) || order_id;
  if (!order_id && !order_unique_id) return null;
  return {
    order_id,
    order_unique_id,
    user_id: str(raw.user_id),
    user_unique_id: str(raw.user_unique_id),
    customer_name: str(raw.customer_name) || "—",
    customer_phone_number: str(raw.customer_phone_number) || undefined,
    customer_profile_url:
      str(raw.customer_profile_url ?? raw.profile_url) || null,
    service_name: str(raw.service_name) || undefined,
    rating: Number(raw.rating) || 0,
    review_text: str(raw.review_text),
    reviewed_at: str(raw.reviewed_at),
  };
}

/**
 * `GET /partners/:partnerId/ratings?page=&limit=`
 */
export async function fetchPartnerRatings(
  partnerId: string,
  page = 1,
  limit = 10,
  options?: { keyword?: string; includeUnrated?: boolean }
): Promise<FetchPartnerRatingsResult> {
  const id = str(partnerId);
  if (!id) {
    return {
      ok: false,
      summary: null,
      records: [],
      totalPages: 0,
      currentPage: 1,
      totalItems: 0,
    };
  }

  const params = new URLSearchParams({
    page: String(Math.max(1, page)),
    limit: String(Math.max(1, limit)),
  });
  const keyword = str(options?.keyword);
  if (keyword) params.set("keyword", keyword);
  if (options?.includeUnrated) params.set("include_unrated", "true");

  const response = await apiRequest(
    `${ApiPaths.GET_PARTNER_RATINGS(id)}?${params.toString()}`,
    "GET"
  );

  if (!response.success) {
    showLog(response.message || "Failed to fetch partner ratings");
    return {
      ok: false,
      summary: null,
      records: [],
      totalPages: 0,
      currentPage: page,
      totalItems: 0,
    };
  }

  const data = (response.data ?? {}) as Record<string, unknown>;
  const summaryRaw =
    data.record && typeof data.record === "object" && !Array.isArray(data.record)
      ? (data.record as Record<string, unknown>)
      : null;

  const summary: PartnerRatingsSummary | null = summaryRaw
    ? {
        partner_id: str(summaryRaw.partner_id) || id,
        partner_name: str(summaryRaw.partner_name),
        average_rating: numOrNull(summaryRaw.average_rating),
        rating_count: Number(summaryRaw.rating_count) || 0,
      }
    : null;

  const listRaw = Array.isArray(data.records) ? data.records : [];
  const records = listRaw
    .map((row) =>
      row && typeof row === "object"
        ? mapRatingRow(row as Record<string, unknown>)
        : null
    )
    .filter((r): r is PartnerRatingRow => Boolean(r));

  const totalPages = Number(data.totalPages) || 0;
  const currentPage = Number(data.currentPage) || page;
  const totalItems = Number(data.totalItems) || records.length;

  return {
    ok: true,
    summary,
    records,
    totalPages,
    currentPage,
    totalItems,
  };
}
