import { chatApiRequest } from "../lib/global/remote/chatApiHelper";
import { ChatApiPaths } from "../lib/global/remote/chatApiPaths";
import {
  franchiseIdForApiQuery,
  sessionMayUseFranchiseIdApiFilter,
} from "../lib/franchise/headerFranchisePreference";
import { resolveChatFranchiseId } from "../lib/chat/chatFranchiseHelpers";
import {
  ChatMessageModel,
  ChatRecordModel,
  ChatType,
  mapChatMessage,
  mapChatRecord,
} from "../lib/models/ChatModel";

function pickRecords(payload: Record<string, unknown>): Record<string, unknown>[] {
  const data = payload.data;
  if (Array.isArray(payload.records)) return payload.records as Record<string, unknown>[];
  if (Array.isArray(payload.messages)) return payload.messages as Record<string, unknown>[];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = data as Record<string, unknown>;
    if (Array.isArray(inner.records)) return inner.records as Record<string, unknown>[];
    if (Array.isArray(inner.messages)) return inner.messages as Record<string, unknown>[];
  }
  return [];
}

function pickRecord(payload: Record<string, unknown>): Record<string, unknown> | null {
  const record = payload.record ?? payload.data;
  if (record && typeof record === "object" && !Array.isArray(record)) {
    return record as Record<string, unknown>;
  }
  return null;
}

export type ChatInboxFilters = {
  type?: ChatType;
  status?: string;
};

export const fetchChatInbox = async (
  opts?: { skipLoader?: boolean; filters?: ChatInboxFilters }
): Promise<{ response: boolean; chats: ChatRecordModel[] }> => {
  const params = new URLSearchParams();
  if (opts?.filters?.type) params.set("type", opts.filters.type);
  if (opts?.filters?.status) params.set("status", opts.filters.status);
  const qs = params.toString();
  const path = `${ChatApiPaths.CHAT_INBOX()}${qs ? `?${qs}` : ""}`;

  const res = await chatApiRequest(path, "GET", undefined, {
    skipLoader: opts?.skipLoader ?? false,
    suppressErrorAlert: opts?.skipLoader ?? false,
  });

  if (!res.success) return { response: false, chats: [] };

  const payload = (res.data ?? {}) as Record<string, unknown>;
  const rows = pickRecords(payload).map(mapChatRecord);
  return { response: true, chats: rows };
};

export const fetchChatById = async (
  chatId: string,
  opts?: { skipLoader?: boolean }
): Promise<{ response: boolean; chat?: ChatRecordModel }> => {
  const id = String(chatId ?? "").trim();
  if (!id) return { response: false };

  const res = await chatApiRequest(ChatApiPaths.CHAT_BY_ID(id), "GET", undefined, {
    skipLoader: opts?.skipLoader ?? true,
    suppressErrorAlert: true,
  });

  if (!res.success) return { response: false };
  const row = pickRecord((res.data ?? {}) as Record<string, unknown>);
  if (!row) return { response: false };
  return { response: true, chat: mapChatRecord(row) };
};

export const fetchChatByOrderId = async (
  orderId: string,
  opts?: { skipLoader?: boolean }
): Promise<{ response: boolean; chat?: ChatRecordModel }> => {
  const id = String(orderId ?? "").trim();
  if (!id) return { response: false };

  const res = await chatApiRequest(ChatApiPaths.CHAT_BY_ORDER(id), "GET", undefined, {
    skipLoader: opts?.skipLoader ?? true,
    suppressErrorAlert: true,
  });

  if (!res.success) return { response: false };
  const row = pickRecord((res.data ?? {}) as Record<string, unknown>);
  if (!row) return { response: false };
  return { response: true, chat: mapChatRecord(row) };
};

export type FetchMessagesParams = {
  chatId: string;
  limit?: number;
  before?: string;
  after?: string;
};

export const fetchChatMessages = async (
  params: FetchMessagesParams,
  opts?: { skipLoader?: boolean }
): Promise<{ response: boolean; messages: ChatMessageModel[] }> => {
  const chatId = String(params.chatId ?? "").trim();
  if (!chatId) return { response: false, messages: [] };

  const qs = new URLSearchParams({
    chatId,
    limit: String(params.limit ?? 50),
  });
  if (params.before) qs.set("before", params.before);
  if (params.after) qs.set("after", params.after);

  const res = await chatApiRequest(
    `${ChatApiPaths.CHAT_MESSAGES()}?${qs.toString()}`,
    "GET",
    undefined,
    { skipLoader: opts?.skipLoader ?? true, suppressErrorAlert: true }
  );

  if (!res.success) return { response: false, messages: [] };

  const payload = (res.data ?? {}) as Record<string, unknown>;
  const rows = pickRecords(payload).map(mapChatMessage);
  return { response: true, messages: rows };
};

export type SendMessagePayload = {
  chatId: string;
  type?: "text" | "image" | "file";
  content: string;
  fileUrl?: string;
  clientMessageId?: string;
  metadata?: Record<string, unknown>;
};

export const sendChatMessageFallback = async (
  payload: SendMessagePayload,
  opts?: { skipLoader?: boolean }
): Promise<{ response: boolean; message?: ChatMessageModel; clientMessageId?: string }> => {
  const res = await chatApiRequest(
    ChatApiPaths.CHAT_MESSAGES(),
    "POST",
    {
      chatId: payload.chatId,
      type: payload.type ?? "text",
      content: payload.content,
      ...(payload.fileUrl ? { fileUrl: payload.fileUrl } : {}),
      ...(payload.clientMessageId ? { clientMessageId: payload.clientMessageId } : {}),
      ...(payload.metadata ? { metadata: payload.metadata } : {}),
    },
    { skipLoader: opts?.skipLoader ?? false, suppressSuccessAlert: true }
  );

  if (!res.success) {
    return {
      response: false,
      clientMessageId: payload.clientMessageId,
    };
  }

  const data = (res.data ?? {}) as Record<string, unknown>;
  const row = pickRecord(data) ?? pickRecords(data)[0];
  const clientMessageId = String(
    data.clientMessageId ?? payload.clientMessageId ?? ""
  ).trim() || undefined;

  if (!row) return { response: true, clientMessageId };
  return { response: true, message: mapChatMessage(row), clientMessageId };
};

export const transferChat = async (
  chatId: string,
  newAssignedTo: string,
  opts?: { skipLoader?: boolean }
): Promise<boolean> => {
  const id = String(chatId ?? "").trim();
  const assignee = String(newAssignedTo ?? "").trim();
  if (!id || !assignee) return false;

  const res = await chatApiRequest(
    ChatApiPaths.CHAT_TRANSFER(id),
    "POST",
    { newAssignedTo: assignee },
    { skipLoader: opts?.skipLoader ?? false, suppressSuccessAlert: false }
  );
  return Boolean(res.success);
};

export const updateChatStatus = async (
  chatId: string,
  status: "open" | "closed" | "pending",
  opts?: { skipLoader?: boolean }
): Promise<boolean> => {
  const id = String(chatId ?? "").trim();
  if (!id) return false;

  const res = await chatApiRequest(
    ChatApiPaths.CHAT_STATUS(id),
    "PATCH",
    { status },
    { skipLoader: opts?.skipLoader ?? false, suppressSuccessAlert: false }
  );
  return Boolean(res.success);
};

export const createSupportChat = async (
  payload: {
    customer_id: string;
    employee_id?: string;
    franchise_id?: string;
    initial_message?: string;
  },
  opts?: { skipLoader?: boolean }
): Promise<{ response: boolean; chat?: ChatRecordModel }> => {
  const res = await chatApiRequest(ChatApiPaths.CHAT_SUPPORT(), "POST", payload, {
    skipLoader: opts?.skipLoader ?? false,
    suppressSuccessAlert: false,
  });

  if (!res.success) return { response: false };
  const row = pickRecord((res.data ?? {}) as Record<string, unknown>);
  if (!row) return { response: true };
  return { response: true, chat: mapChatRecord(row) };
};

export function filterChatsByType(
  chats: ChatRecordModel[],
  type: ChatType
): ChatRecordModel[] {
  return chats.filter((c) => c.type === type);
}

/** Super admin / staff inbox filter by header franchise selection. */
export function filterChatsByFranchise(
  chats: ChatRecordModel[],
  selectedFranchiseId?: string | null
): ChatRecordModel[] {
  if (!sessionMayUseFranchiseIdApiFilter()) return chats;
  const franchiseId = franchiseIdForApiQuery(selectedFranchiseId);
  if (!franchiseId) return chats;
  return chats.filter((chat) => resolveChatFranchiseId(chat) === franchiseId);
}

export type ChatPresenceEntry = {
  userId: string;
  isOnline: boolean;
};

function mapPresenceEntry(raw: Record<string, unknown>): ChatPresenceEntry | null {
  const userId = String(
    raw.userId ?? raw.user_id ?? raw._id ?? raw.id ?? ""
  ).trim();
  if (!userId) return null;
  const isOnline = Boolean(
    raw.isOnline ?? raw.is_online ?? raw.online ?? raw.status === "online"
  );
  return { userId, isOnline };
}

function pickPresenceEntries(payload: Record<string, unknown>): ChatPresenceEntry[] {
  const rows = pickRecords(payload);
  const fromRows = rows
    .map((row) => mapPresenceEntry(row))
    .filter((entry): entry is ChatPresenceEntry => entry !== null);
  if (fromRows.length > 0) return fromRows;

  const data = payload.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = data as Record<string, unknown>;
    const nestedRows = pickRecords(inner);
    const fromNested = nestedRows
      .map((row) => mapPresenceEntry(row))
      .filter((entry): entry is ChatPresenceEntry => entry !== null);
    if (fromNested.length > 0) return fromNested;

    for (const key of ["users", "participants", "presence", "records"]) {
      const value = inner[key];
      if (!Array.isArray(value)) continue;
      const fromKey = value
        .map((item) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? mapPresenceEntry(item as Record<string, unknown>)
            : null
        )
        .filter((entry): entry is ChatPresenceEntry => entry !== null);
      if (fromKey.length > 0) return fromKey;
    }
  }

  return [];
}

export const fetchChatPresence = async (
  chatId: string,
  opts?: { skipLoader?: boolean }
): Promise<ChatPresenceEntry[]> => {
  const id = String(chatId ?? "").trim();
  if (!id) return [];

  const res = await chatApiRequest(ChatApiPaths.CHAT_PRESENCE(id), "GET", undefined, {
    skipLoader: opts?.skipLoader ?? true,
    suppressErrorAlert: true,
  });

  if (!res.success) return [];
  return pickPresenceEntries((res.data ?? {}) as Record<string, unknown>);
};

export function countUnreadChats(chats: ChatRecordModel[]): number {
  return chats.filter((c) => (c.unreadCount ?? 0) > 0).length;
}
