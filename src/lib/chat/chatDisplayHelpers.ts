import { AppConstant, getChatServiceUrl } from "../global/AppConstant";
import { resolveMediaAssetSrc } from "../../services/documentUploadService";
import {
  ChatMessageModel,
  ChatRecordModel,
  chatLinkedOrderId,
  chatLinkedOrderUniqueId,
} from "../models/ChatModel";

export type ChatAttachmentItem = {
  id: string;
  fileName: string;
  url: string;
  mediaKey?: string;
  isImage: boolean;
};

export type ChatGalleryImageItem = {
  id: string;
  fileUrl: string;
  fileName: string;
  alt: string;
};

export type ChatTransferHistoryItem = {
  employeeName: string;
  date: string;
  note?: string;
};

export function resolveChatAvatarUrl(profileUrl?: string | null): string | null {
  const raw = String(profileUrl ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${AppConstant.IMAGE_BASE_URL}${raw.replace(/^\//, "")}`;
}

export function resolveServiceImageUrl(imagePath?: string | null): string | null {
  return resolveChatAvatarUrl(imagePath);
}

/** Display id for order-linked chats (prefer business unique_id e.g. O1029). */
export function formatOrderChatLabel(orderId?: string | null, uniqueId?: string | null): string {
  const business = String(uniqueId ?? "").trim();
  if (business) return business;
  const id = String(orderId ?? "").trim();
  if (!id) return "—";
  if (id.length <= 8) return id;
  return id.slice(-6);
}

export function orderChatTitle(orderId?: string | null, uniqueId?: string | null): string {
  return `Order - ${formatOrderChatLabel(orderId, uniqueId)}`;
}

export function orderChatTitleFromRecord(chat: ChatRecordModel): string {
  return orderChatTitle(
    chatLinkedOrderId(chat),
    chatLinkedOrderUniqueId(chat)
  );
}

/** Parse business dispute code from a system line like "Dispute D1002 opened." */
export function parseDisputeCodeFromOpenedMessage(
  content?: string | null
): string {
  const match = String(content ?? "").match(/Dispute\s+(\S+)\s+opened/i);
  return match?.[1]?.trim() ?? "";
}

/** Enrich dispute-opened system text with order unique id when available. */
export function formatDisputeOpenedSystemContent(
  content?: string | null,
  orderUniqueId?: string | null
): string {
  const text = String(content ?? "").trim();
  const order = String(orderUniqueId ?? "").trim();
  if (!text) return "";
  if (!order) return text;
  if (/opened for order/i.test(text)) return text;

  const code = parseDisputeCodeFromOpenedMessage(text);
  if (code) return `Dispute ${code} opened for order - ${order}`;

  return text;
}

export function disputeOpenedSummaryLabel(
  disputeCode?: string | null,
  orderUniqueId?: string | null
): string {
  const code = String(disputeCode ?? "").trim();
  const order = String(orderUniqueId ?? "").trim();
  if (code && order) return `Dispute ${code} opened for order - ${order}`;
  if (code) return `Dispute ${code} opened.`;
  return "";
}

export type MessageTickStatus = "sending" | "sent" | "delivered" | "read" | "failed";

/** Other participants who should receive/read this message (everyone except sender). */
export function messageRecipientIds(
  participantIds: string[],
  senderId?: string
): string[] {
  const sender = String(senderId ?? "").trim();
  const seen: Record<string, true> = {};
  const ids: string[] = [];
  for (const rawId of participantIds) {
    const id = String(rawId).trim();
    if (!id || seen[id]) continue;
    seen[id] = true;
    ids.push(id);
  }
  if (!sender) return ids;
  return ids.filter((id) => id !== sender);
}

export function messageTickStatus(
  msg: ChatMessageModel,
  participantIds?: string[]
): MessageTickStatus {
  if (msg.sendStatus === "failed") return "failed";
  if (msg.sendStatus === "sending") return "sending";

  const recipients = messageRecipientIds(participantIds ?? [], msg.senderId);
  const hasReceiptArrays =
    (msg.deliveredTo?.length ?? 0) > 0 || (msg.readBy?.length ?? 0) > 0;

  if (recipients.length > 0 && (recipients.length > 1 || hasReceiptArrays)) {
    const delivered = new Set(
      (msg.deliveredTo ?? []).map((entry) => String(entry.userId).trim()).filter(Boolean)
    );
    const read = new Set(
      (msg.readBy ?? []).map((entry) => String(entry.userId).trim()).filter(Boolean)
    );
    for (const userId of Array.from(read)) delivered.add(userId);

    if (recipients.every((userId) => read.has(userId))) return "read";
    if (recipients.every((userId) => delivered.has(userId))) return "delivered";
    return "sent";
  }

  const delivery = String(msg.deliveryStatus ?? "").toLowerCase();
  if (delivery === "read") return "read";
  if (delivery === "delivered") return "delivered";
  return "sent";
}

export function initialsFromName(name?: string): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

/** CDN for chat attachments (web uploads via document_upload type 7). */
const CHAT_MEDIA_CDN_BASE = "https://d2snwgkdggvp65.cloudfront.net/";

/** Document upload `type` → CDN folder(s). Web chat uses type 7; mobile chat uses type 24. */
const DOCUMENT_UPLOAD_FOLDERS_BY_TYPE: Record<string, string[]> = {
  "2": ["category"],
  "4": ["userinformation", "UserInformation"],
  "7": ["chat_attachment"],
  "24": ["24", "chat", "chat_attachment"],
};

function parseDocumentUploadTypeFromFilename(name: string): string | null {
  const match = name.match(/_(\d+)\.(png|jpe?g|gif|webp|bmp|svg)$/i);
  return match?.[1] ?? null;
}

function pushUniqueUrl(urls: string[], value: string) {
  const v = String(value ?? "").trim();
  if (v && !urls.includes(v)) urls.push(v);
}

function pushStorageKey(urls: string[], storageKey: string) {
  const key = String(storageKey ?? "").trim().replace(/^\//, "");
  if (!key) return;
  const resolved = resolveMediaAssetSrc(key);
  pushUniqueUrl(urls, resolved);
  if (!/^https?:\/\//i.test(resolved)) {
    pushUniqueUrl(urls, `${CHAT_MEDIA_CDN_BASE}${key}`);
  }
}

function appendStorageCandidatesForFileName(urls: string[], fileName: string) {
  const name = String(fileName ?? "").trim();
  if (!name || name.includes("/")) return;

  const uploadType = parseDocumentUploadTypeFromFilename(name);
  if (uploadType) {
    for (const folder of DOCUMENT_UPLOAD_FOLDERS_BY_TYPE[uploadType] ?? []) {
      pushStorageKey(urls, `${folder}/${name}`);
    }
    return;
  }

  pushStorageKey(urls, `chat_attachment/${name}`);
}

/** Build candidate URLs for chat attachments (CDN and storage-key fallbacks). */
export function resolveChatMediaUrlCandidates(fileUrl?: string | null): string[] {
  const raw = String(fileUrl ?? "").trim();
  if (!raw) return [];

  if (raw.startsWith("blob:") || raw.startsWith("data:")) {
    return [raw];
  }

  if (raw.startsWith("//")) {
    return [`https:${raw}`];
  }

  if (/^https?:\/\//i.test(raw)) {
    return [raw];
  }

  const urls: string[] = [];
  const chatBase = getChatServiceUrl().replace(/\/$/, "");
  const normalized = raw.replace(/^\//, "");

  if (raw.startsWith(chatBase)) {
    const path = raw.slice(chatBase.length).replace(/^\//, "");
    if (path) pushStorageKey(urls, path);
    return urls;
  }

  if (raw.startsWith("/api/") || raw.startsWith("/uploads/") || raw.startsWith("/files/")) {
    pushUniqueUrl(urls, `${chatBase}${raw}`);
    pushStorageKey(urls, normalized);
    return urls;
  }

  if (!normalized.includes("/")) {
    appendStorageCandidatesForFileName(urls, normalized);
    return urls;
  }

  pushStorageKey(urls, normalized);
  return urls;
}

/** Resolve chat attachment URL — full CDN links from API are returned unchanged. */
export function resolveChatMediaUrl(fileUrl?: string | null): string {
  const raw = String(fileUrl ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("blob:") || raw.startsWith("data:")) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  const candidates = resolveChatMediaUrlCandidates(raw);
  return candidates[0] ?? "";
}

/** Storage key / URL for a message attachment (fileUrl, metadata, or content filename). */
export function chatMessageMediaKey(msg: ChatMessageModel): string {
  const fromFile = String(msg.fileUrl ?? "").trim();
  if (fromFile) return fromFile;

  const meta = msg.metadata;
  if (meta && typeof meta === "object") {
    const row = meta as Record<string, unknown>;
    const fromMeta = String(
      row.fileUrl ??
        row.file_url ??
        row.url ??
        row.storagePath ??
        row.storage_path ??
        row.path ??
        ""
    ).trim();
    if (fromMeta) return fromMeta;
  }

  const content = String(msg.content ?? "").trim();
  if (!content || content === "[Attachment]") return "";

  if (
    msg.type === "image" ||
    msg.type === "file" ||
    /\.(png|jpe?g|gif|webp|bmp|svg|pdf|docx?|xlsx?)(\?.*)?$/i.test(content)
  ) {
    return content;
  }

  return "";
}

/** Inbox list timestamp: today → 3:43PM, yesterday → yesterday, else D/M/YYYY. */
export function formatChatInboxListTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";

  const startOfDay = (date: Date) => {
    const x = new Date(date);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const today = startOfDay(new Date());
  const msgDay = startOfDay(d);
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);

  if (diffDays === 0) {
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const minStr = minutes < 10 ? `0${minutes}` : String(minutes);
    return `${hours}:${minStr}${ampm}`;
  }
  if (diffDays === 1) return "yesterday";

  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Date label for chat message grouping: today, yesterday, or DD/MM/YYYY. */
export function chatDateDividerLabel(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;

  const startOfDay = (date: Date) => {
    const x = new Date(date);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const today = startOfDay(new Date());
  const msgDay = startOfDay(d);
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function chatMessagePreviewText(msg: ChatMessageModel): string {
  const content = String(msg.content ?? "").trim();
  if (msg.type === "image") {
    const looksLikeFileName =
      /^\S+\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(content) &&
      !content.includes("/");
    if (!content || /^image$/i.test(content) || looksLikeFileName) return "Photo";
    return content;
  }
  if (msg.type === "file" || msg.fileUrl) {
    return chatMessageAttachmentLabel(msg);
  }
  return content;
}

export function chatMessageAttachmentLabel(msg: ChatMessageModel): string {
  const content = String(msg.content ?? "").trim();
  if (content && content !== "[Attachment]") return content;
  const url = String(msg.fileUrl ?? "");
  const segment = url.split("/").pop() || "Attachment";
  return decodeURIComponent(segment.split("?")[0] || "Attachment");
}

/** Preferred download/display filename for image attachments (metadata first). */
export function chatMessageImageFileName(msg: ChatMessageModel): string {
  const meta = msg.metadata;
  if (meta && typeof meta === "object") {
    const row = meta as Record<string, unknown>;
    const fromMeta = String(row.fileName ?? row.file_name ?? "").trim();
    if (fromMeta) return fromMeta;
  }
  return chatMessageAttachmentLabel(msg);
}

export function isImageAttachment(msg: ChatMessageModel): boolean {
  if (msg.type === "image") return true;
  const url = chatMessageMediaKey(msg);
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url)) return true;
  const meta = msg.metadata;
  if (meta && typeof meta === "object") {
    const mime = String(
      (meta as Record<string, unknown>).mimeType ??
        (meta as Record<string, unknown>).mime_type ??
        ""
    ).toLowerCase();
    return mime.startsWith("image/");
  }
  return false;
}

export function isPdfAttachment(msg: ChatMessageModel): boolean {
  const url = chatMessageMediaKey(msg);
  if (/\.pdf(\?.*)?$/i.test(url)) return true;
  const content = String(msg.content ?? "").trim();
  if (/\.pdf(\?.*)?$/i.test(content)) return true;
  return /\.pdf(\?.*)?$/i.test(chatMessageAttachmentLabel(msg));
}

/**
 * Open/download a chat attachment via direct URL (no fetch — avoids CORS on S3).
 * Preview still uses <img>; downloads use <a target="_blank"> per backend guidance.
 */
export function downloadChatMediaFile(
  fileUrl: string,
  fileName?: string
): boolean {
  const raw = String(fileUrl ?? "").trim();
  if (!raw) return false;

  const url = resolveChatMediaUrl(raw);
  if (!url) return false;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  const name = String(fileName ?? "").trim();
  if (name) anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

export function messageHasAttachment(msg: ChatMessageModel): boolean {
  return Boolean(chatMessageMediaKey(msg)) || msg.type === "image" || msg.type === "file";
}

export function collectChatAttachments(messages: ChatMessageModel[]): ChatAttachmentItem[] {
  const items: ChatAttachmentItem[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    const url = chatMessageMediaKey(msg);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    items.push({
      id: msg._id || url,
      fileName: isImageAttachment(msg) ? chatMessageImageFileName(msg) : chatMessageAttachmentLabel(msg),
      url: resolveChatMediaUrl(url),
      mediaKey: url,
      isImage: isImageAttachment(msg),
    });
  }

  return items.reverse();
}

/** Chronological image messages for in-thread gallery navigation. */
export function collectChatGalleryImages(
  messages: ChatMessageModel[]
): ChatGalleryImageItem[] {
  const items: ChatGalleryImageItem[] = [];

  for (const msg of messages) {
    const mediaUrl = chatMessageMediaKey(msg);
    if (!mediaUrl || !isImageAttachment(msg)) continue;

    items.push({
      id: String(msg._id || msg.clientMessageId || `${items.length}-${mediaUrl}`),
      fileUrl: mediaUrl,
      fileName: chatMessageImageFileName(msg),
      alt: chatMessageAttachmentLabel(msg),
    });
  }

  return items;
}

function formatTransferHistoryDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function parseTransferSystemContent(content: string): string {
  const raw = String(content ?? "").trim();
  const match = raw.match(/transferred from\s+(.+?)\s+to\s+(.+?)$/i);
  if (match) {
    return `${match[1].trim()} → ${match[2].trim()}`;
  }
  return raw || "System";
}

export function transferHistoryFromMessages(
  messages: ChatMessageModel[]
): ChatTransferHistoryItem[] {
  return messages
    .filter(
      (m) =>
        m.type === "system" &&
        /transfer|assigned|reassign|handed/i.test(String(m.content ?? ""))
    )
    .map((m) => ({
      employeeName: parseTransferSystemContent(String(m.content ?? "")),
      date: formatTransferHistoryDate(m.createdAt),
    }));
}

export function inferAttachmentMessageType(
  file: File
): "image" | "file" {
  return file.type.startsWith("image/") ? "image" : "file";
}
