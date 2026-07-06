import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";

export type ContentItem = {
  id: string;
  title: string;
  description: string;
  last_updated: string;
};

type FetchContentListResult = {
  items: ContentItem[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
};

function extractPayloadRoot(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function pickArray(raw: Record<string, unknown>): Record<string, unknown>[] {
  const data = asRecord(raw.data);
  const records = data?.records;
  if (Array.isArray(records)) return records as Record<string, unknown>[];
  const nestedData = data?.data;
  if (Array.isArray(nestedData)) return nestedData as Record<string, unknown>[];
  if (Array.isArray(raw.records))
    return raw.records as Record<string, unknown>[];
  if (Array.isArray(raw.data)) return raw.data as Record<string, unknown>[];
  return [];
}

function pickSingle(
  raw: Record<string, unknown>
): Record<string, unknown> | null {
  const data = asRecord(raw.data);
  const recordFromData = asRecord(data?.record);
  if (recordFromData) return recordFromData;
  const rawRecord = asRecord(raw.record);
  if (rawRecord) return rawRecord;
  const nestedData = asRecord(data?.data);
  if (nestedData) return nestedData;
  return data;
}

function toIsoLike(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return new Date().toISOString();
  return text;
}

function mapContentItem(raw: Record<string, unknown>): ContentItem {
  return {
    id: String(raw._id ?? raw.id ?? ""),
    title: String(raw.title ?? "").trim(),
    description: String(raw.description ?? "").trim(),
    last_updated: toIsoLike(
      raw.updated_at ?? raw.last_updated ?? raw.created_at
    ),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeEditorHtml(value: string): string {
  const content = String(value ?? "").trim();
  if (!content || content === "<p><br></p>") return "";
  const hasHtmlTag = /<[^>]+>/.test(content);
  if (hasHtmlTag) return content;
  return `<p>${escapeHtml(content)}</p>`;
}

export async function fetchContentList(
  page: number,
  limit: number,
  filters?: { search?: string; sort?: string; sortOrder?: "asc" | "desc" }
): Promise<FetchContentListResult | null> {
  const trimmedSearch = String(filters?.search ?? "").trim();
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(trimmedSearch ? { search: trimmedSearch } : {}),
    ...(filters?.sort ? { sort: filters.sort } : {}),
    ...(filters?.sortOrder ? { sort_order: filters.sortOrder } : {}),
    _ts: String(Date.now()),
  });
  const res = await apiRequest(
    `${ApiPaths.CONTENT_MANAGEMENT_GET_ALL()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!res.success) return null;

  const root = extractPayloadRoot(res.data);
  const rows = pickArray(root);
  const data = asRecord(root.data);
  return {
    items: rows.map(mapContentItem),
    totalItems:
      Number(data?.totalItems ?? root.totalItems ?? rows.length) || rows.length,
    totalPages: Number(data?.totalPages ?? root.totalPages ?? 1) || 1,
    currentPage: Number(data?.currentPage ?? root.currentPage ?? page) || page,
  };
}

export async function fetchContentById(
  id: string
): Promise<ContentItem | null> {
  const targetId = String(id ?? "").trim();
  if (!targetId) return null;
  const res = await apiRequest(
    ApiPaths.CONTENT_MANAGEMENT_GET(targetId),
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!res.success) return null;

  const root = extractPayloadRoot(res.data);
  const item = pickSingle(root);
  if (!item) return null;
  return mapContentItem(item);
}

export async function saveContentWithApi(payload: {
  id?: string;
  title: string;
  description: string;
}): Promise<{ ok: true; id: string } | { ok: false }> {
  const contentId = String(payload.id ?? "").trim();
  const body = {
    title: String(payload.title ?? "").trim(),
    description: normalizeEditorHtml(payload.description),
  };
  const isUpdate = Boolean(contentId);
  const res = await apiRequest(
    isUpdate
      ? ApiPaths.CONTENT_MANAGEMENT_UPDATE(contentId)
      : ApiPaths.CONTENT_MANAGEMENT_CREATE,
    isUpdate ? "PUT" : "POST",
    body
  );
  if (!res.success) return { ok: false };

  const root = extractPayloadRoot(res.data);
  const record = pickSingle(root);
  const savedId = String(record?._id ?? record?.id ?? contentId).trim();
  if (!savedId) return { ok: false };
  return { ok: true, id: savedId };
}
