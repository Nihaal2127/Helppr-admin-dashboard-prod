import {
  NotificationCategory,
  NotificationFilters,
  NotificationListFilters,
  NotificationListResult,
  NotificationModel,
} from "../lib/models/NotificationModel";
import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import {
  franchiseIdForApiQuery,
  readHeaderFranchisePreference,
} from "../lib/franchise/headerFranchisePreference";
import { parseNotificationEntityFields } from "../lib/notifications/notificationNavigation";

const API_CATEGORIES = new Set<NotificationCategory>([
  "order",
  "quote",
  "subscription",
  "wallet",
  "ticket",
  "chat",
  "system",
  "reminder",
  "admin",
  "user",
  "partner",
  "category",
  "expense",
]);

function dispatchNotificationsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("notifications-updated"));
  }
}

function unwrapPayload(
  data: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!data) return {};
  const inner = data.data;
  if (inner != null && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return data;
}

function normalizeCategory(raw: unknown): NotificationCategory {
  const s = String(raw ?? "").trim().toLowerCase();
  if (API_CATEGORIES.has(s as NotificationCategory)) {
    return s as NotificationCategory;
  }
  if (s === "payment") return "wallet";
  if (s === "document" || s === "verification") return "user";
  return "system";
}

function mapNotificationRecord(
  raw: Record<string, unknown>
): NotificationModel | null {
  const id = String(raw._id ?? raw.id ?? "").trim();
  if (!id) return null;

  const isRead =
    raw.is_read === true ||
    raw.is_read === 1 ||
    String(raw.is_read).toLowerCase() === "true" ||
    String(raw.status ?? "").toLowerCase() === "read";

  const category = normalizeCategory(raw.category ?? raw.module);
  const event = String(
    raw.event ?? raw.eventType ?? raw.event_type ?? ""
  ).trim();
  const { entity, metadata, referenceId } =
    parseNotificationEntityFields(raw);

  return {
    id,
    title: String(raw.title ?? "").trim() || "Notification",
    message: String(
      raw.body ?? raw.message ?? raw.description ?? raw.content ?? ""
    ).trim(),
    category,
    module: category,
    event,
    eventType: event,
    status: isRead ? "read" : "unread",
    franchiseId:
      raw.franchise_id != null
        ? String(raw.franchise_id).trim() || undefined
        : undefined,
    referenceId,
    createdAt: String(
      raw.created_at ?? raw.createdAt ?? new Date().toISOString()
    ),
    readAt:
      raw.read_at != null
        ? String(raw.read_at)
        : raw.readAt != null
          ? String(raw.readAt)
          : null,
    entity,
    metadata,
  };
}

function parseListEnvelope(response: {
  success?: boolean;
  data?: Record<string, unknown>;
}): NotificationListResult {
  const empty: NotificationListResult = {
    records: [],
    totalItems: 0,
    totalPages: 1,
    currentPage: 1,
    limit: 20,
    unreadCount: 0,
  };
  if (!response.success) return empty;

  const payload = unwrapPayload(response.data);
  const recordsRaw = (payload.records ?? []) as unknown[];
  const records = (Array.isArray(recordsRaw) ? recordsRaw : [])
    .filter((r) => r != null && typeof r === "object" && !Array.isArray(r))
    .map((r) => mapNotificationRecord(r as Record<string, unknown>))
    .filter((r): r is NotificationModel => r != null);

  return {
    records,
    totalItems: Number(
      payload.totalItems ?? payload.total_items ?? records.length
    ),
    totalPages: Math.max(
      1,
      Number(payload.totalPages ?? payload.total_pages ?? 1)
    ),
    currentPage: Math.max(
      1,
      Number(payload.currentPage ?? payload.current_page ?? 1)
    ),
    limit: Math.max(1, Number(payload.limit ?? 20)),
    unreadCount: Number(payload.unreadCount ?? payload.unread_count ?? 0),
  };
}

function buildListQueryParams(
  page: number,
  limit: number,
  filters: NotificationListFilters
): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(Math.min(100, Math.max(1, limit))),
  });

  if (filters.is_read === true) params.set("is_read", "true");
  if (filters.is_read === false) params.set("is_read", "false");

  const category = String(filters.category ?? "").trim();
  if (category && category !== "all") params.set("category", category);

  const event = String(filters.event ?? "").trim();
  if (event) params.set("event", event);

  const fromDate = String(filters.from_date ?? "").trim();
  if (fromDate) params.set("from_date", fromDate);

  const toDate = String(filters.to_date ?? "").trim();
  if (toDate) params.set("to_date", toDate);

  const fid = franchiseIdForApiQuery(filters.franchise_id);
  if (fid) params.set("franchise_id", fid);

  return params.toString();
}

function buildUnreadCountQueryParams(filters: NotificationListFilters): string {
  const params = new URLSearchParams();
  const category = String(filters.category ?? "").trim();
  if (category && category !== "all") params.set("category", category);

  const event = String(filters.event ?? "").trim();
  if (event) params.set("event", event);

  const fromDate = String(filters.from_date ?? "").trim();
  if (fromDate) params.set("from_date", fromDate);

  const toDate = String(filters.to_date ?? "").trim();
  if (toDate) params.set("to_date", toDate);

  const fid = franchiseIdForApiQuery(filters.franchise_id);
  if (fid) params.set("franchise_id", fid);

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function resolveNotificationFranchiseScope(
  franchiseId?: string | null
): string | undefined {
  const fid = franchiseIdForApiQuery(
    franchiseId ?? readHeaderFranchisePreference()
  );
  return fid || undefined;
}

export function toNotificationListFilters(
  filters: NotificationFilters
): NotificationListFilters {
  const category = filters.category ?? filters.module;
  const status = filters.status;
  return {
    ...(status === "read" ? { is_read: true } : {}),
    ...(status === "unread" ? { is_read: false } : {}),
    ...(category && category !== "all" ? { category } : {}),
    ...(filters.fromDate?.trim()
      ? { from_date: filters.fromDate.trim() }
      : {}),
    ...(filters.toDate?.trim() ? { to_date: filters.toDate.trim() } : {}),
    ...(filters.event?.trim() ? { event: filters.event.trim() } : {}),
    franchise_id: filters.franchiseId,
  };
}

export async function fetchNotificationList(
  page: number,
  limit: number,
  filters: NotificationListFilters = {},
  options?: { skipLoader?: boolean }
): Promise<{ response: boolean; result: NotificationListResult }> {
  const qs = buildListQueryParams(page, limit, filters);
  const endpoint = `${ApiPaths.GET_NOTIFICATIONS()}?${qs}`;
  const res = await apiRequest(
    endpoint,
    "GET",
    undefined,
    false,
    options?.skipLoader
  );
  return {
    response: Boolean(res.success),
    result: parseListEnvelope(res),
  };
}

export async function fetchNotificationUnreadCount(
  filters: NotificationListFilters = {},
  options?: { skipLoader?: boolean }
): Promise<number> {
  const qs = buildUnreadCountQueryParams(filters);
  const endpoint = `${ApiPaths.GET_NOTIFICATIONS_UNREAD_COUNT()}${qs}`;
  const res = await apiRequest(
    endpoint,
    "GET",
    undefined,
    false,
    options?.skipLoader
  );
  if (!res.success) return 0;
  const payload = unwrapPayload(res.data as Record<string, unknown>);
  return Number(
    payload.unreadCount ?? payload.unread_count ?? payload.count ?? 0
  );
}

export async function fetchRecentNotifications(
  limit = 8,
  filters: NotificationListFilters = {}
): Promise<NotificationModel[]> {
  const { response, result } = await fetchNotificationList(1, limit, filters, {
    skipLoader: true,
  });
  if (!response) return [];
  return result.records;
}

export async function getUnreadNotificationCount(
  filters: NotificationListFilters = {}
): Promise<number> {
  return fetchNotificationUnreadCount(filters, { skipLoader: true });
}

/** @deprecated Use fetchNotificationList — kept for gradual migration */
export async function fetchNotifications(
  filters: NotificationFilters = {}
): Promise<NotificationModel[]> {
  const listFilters = toNotificationListFilters({
    ...filters,
    franchiseId: filters.franchiseId ?? resolveNotificationFranchiseScope(),
  });
  const { response, result } = await fetchNotificationList(
    1,
    100,
    listFilters,
    { skipLoader: true }
  );
  if (!response) return [];

  const keyword = String(filters.keyword ?? "").trim().toLowerCase();
  if (!keyword) return result.records;

  return result.records.filter((item) => {
    return (
      item.title.toLowerCase().includes(keyword) ||
      item.message.toLowerCase().includes(keyword) ||
      (item.referenceId || "").toLowerCase().includes(keyword) ||
      item.event.toLowerCase().includes(keyword)
    );
  });
}

export async function markNotificationAsRead(id: string): Promise<boolean> {
  const trimmed = String(id ?? "").trim();
  if (!trimmed) return false;
  const res = await apiRequest(
    ApiPaths.PUT_NOTIFICATION_READ(trimmed),
    "PUT",
    undefined,
    false,
    true,
    false,
    true
  );
  if (res.success) dispatchNotificationsUpdated();
  return Boolean(res.success);
}

export async function markAllNotificationsAsRead(
  category?: NotificationCategory | "all"
): Promise<boolean> {
  const body =
    category && category !== "all" ? { category } : undefined;
  const res = await apiRequest(
    ApiPaths.PUT_NOTIFICATIONS_READ_ALL(),
    "PUT",
    body,
    false,
    true,
    false,
    true
  );
  if (res.success) dispatchNotificationsUpdated();
  return Boolean(res.success);
}

/** No-op — inbox is API-backed; kept so callers do not break. */
export const seedNotificationData = () => undefined;

export const storeForegroundNotification = (_payload: unknown) => {
  dispatchNotificationsUpdated();
};
