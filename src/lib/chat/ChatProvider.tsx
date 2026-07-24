import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppConstant } from "../global/AppConstant";
import { getLocalStorage } from "../global/localStorageHelper";
import {
  ChatMessageModel,
  ChatRecordModel,
  chatParticipantUserIds,
  mapChatRecord,
} from "../models/ChatModel";
import { chatMessagePreviewText } from "./chatDisplayHelpers";
import {
  enrichChatFranchiseFromCache,
  enrichChatInboxFranchiseIds,
  shouldEnrichChatFranchiseIds,
} from "./chatFranchiseHelpers";
import {
  franchiseIdForApiQuery,
  HEADER_FRANCHISE_CHANGED_EVENT,
  readHeaderFranchisePreference,
} from "../franchise/headerFranchisePreference";
import { fetchChatInbox } from "../../services/chatService";
import {
  acquireChatSocket,
  releaseChatSocket,
  emitReadMessages,
  emitSendMessage,
  emitTransferChat,
  getLastChatSocketError,
  isChatSocketConnected,
  joinChatRoom,
  leaveChatRoom,
  onChatConnect,
  onChatConnectError,
  onChatDisconnect,
  onChatError,
  onChatMessageSent,
  onChatReceiveMessage,
  onChatUpdated,
  onTypingStart,
  onTypingStop,
  onMessagesRead,
  onPresenceUpdated,
  ChatSocketSendPayload,
} from "./chatSocket";

type ChatContextValue = {
  inbox: ChatRecordModel[];
  inboxLoading: boolean;
  socketConnected: boolean;
  socketError: string | null;
  typingByChatId: Record<string, string>;
  isChatParticipantOnline: (chat: ChatRecordModel) => boolean;
  refreshInbox: (opts?: { skipLoader?: boolean; force?: boolean }) => Promise<void>;
  /** Resolve franchise ids for inbox filtering (chat/ticket pages only — avoids N× order/get elsewhere). */
  enrichInboxFranchiseIdsIfNeeded: () => Promise<void>;
  setActiveChatId: (chatId: string | null) => void;
  joinChat: (chatId: string) => void;
  leaveChat: (chatId: string) => void;
  sendMessage: (payload: ChatSocketSendPayload) => boolean;
  readMessages: (chatId: string) => void;
  transferChat: (chatId: string, newAssignedTo: string) => boolean;
  subscribeReceive: typeof onChatReceiveMessage;
  subscribeSent: typeof onChatMessageSent;
  subscribeError: typeof onChatError;
  subscribeChatUpdated: typeof onChatUpdated;
  subscribeConnect: typeof onChatConnect;
};

const ChatContext = createContext<ChatContextValue | null>(null);

function parseInboxTimestamp(iso?: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function lastMessageTimestamp(chat: ChatRecordModel): number {
  const lm = chat.lastMessage ?? chat.last_message;
  if (!lm || typeof lm === "string") return 0;
  if (typeof lm === "object") {
    return parseInboxTimestamp(String((lm as ChatMessageModel).createdAt ?? ""));
  }
  return 0;
}

function inboxSortKey(chat: ChatRecordModel): number {
  return Math.max(parseInboxTimestamp(chat.updatedAt), lastMessageTimestamp(chat));
}

function sortInboxChats(chats: ChatRecordModel[]): ChatRecordModel[] {
  return [...chats].sort((a, b) => inboxSortKey(b) - inboxSortKey(a));
}

function sameChatId(a: string, b: string): boolean {
  return String(a ?? "").trim() === String(b ?? "").trim();
}

function moveChatToFront(chats: ChatRecordModel[], chatId: string): ChatRecordModel[] {
  const idx = chats.findIndex((chat) => sameChatId(chat._id, chatId));
  if (idx <= 0) return chats;
  const next = [...chats];
  const [chat] = next.splice(idx, 1);
  next.unshift(chat);
  return next;
}

/** Preserve optimistic unread/preview when REST inbox lags behind socket events. */
function mergeInboxFromServer(
  local: ChatRecordModel[],
  remote: ChatRecordModel[]
): ChatRecordModel[] {
  const localById = new Map(local.map((chat) => [chat._id, chat]));
  const remoteIds = new Set(remote.map((chat) => chat._id));

  const merged = remote.map((remoteChat) => {
    const localChat = localById.get(remoteChat._id);
    if (!localChat) return remoteChat;

    const localKey = inboxSortKey(localChat);
    const remoteKey = inboxSortKey(remoteChat);
    const unreadCount = Math.max(localChat.unreadCount ?? 0, remoteChat.unreadCount ?? 0);

    if (localKey >= remoteKey) {
      return mergeChatRecord(remoteChat, {
        ...localChat,
        unreadCount,
        participantUsers: remoteChat.participantUsers ?? localChat.participantUsers,
        assignedToUser: remoteChat.assignedToUser ?? localChat.assignedToUser,
      });
    }

    return mergeChatRecord(localChat, {
      ...remoteChat,
      unreadCount,
    });
  });

  for (const localChat of local) {
    if (!remoteIds.has(localChat._id)) {
      merged.push(localChat);
    }
  }

  return sortInboxChats(merged);
}

function mergeChatRecord(
  existing: ChatRecordModel,
  incoming: ChatRecordModel
): ChatRecordModel {
  const franchiseId =
    String(incoming.franchiseId ?? incoming.franchise_id ?? "").trim() ||
    String(existing.franchiseId ?? existing.franchise_id ?? "").trim() ||
    undefined;

  return {
    ...existing,
    ...incoming,
    participantUsers: incoming.participantUsers ?? existing.participantUsers,
    assignedToUser: incoming.assignedToUser ?? existing.assignedToUser,
    ...(franchiseId
      ? { franchiseId, franchise_id: franchiseId }
      : {}),
  };
}

function patchInboxWithMessage(
  prev: ChatRecordModel[],
  message: ChatMessageModel,
  opts: { activeChatId: string | null; incrementUnread: boolean }
): ChatRecordModel[] {
  const chatId = String(message.chatId ?? "").trim();
  if (!chatId) return prev;

  const myId = String(getLocalStorage(AppConstant.createdById) ?? "").trim();
  const isMine = Boolean(myId && String(message.senderId ?? "") === myId);
  const preview = chatMessagePreviewText(message);
  const idx = prev.findIndex((chat) => sameChatId(chat._id, chatId));

  if (idx < 0) return prev;

  const current = prev[idx];
  const isActiveChat = Boolean(
    opts.activeChatId && sameChatId(opts.activeChatId, chatId)
  );
  const shouldIncrement =
    opts.incrementUnread && !isMine && !isActiveChat;
  const nextChat: ChatRecordModel = {
    ...current,
    lastMessage: {
      content: preview,
      type: message.type,
      createdAt: message.createdAt ?? new Date().toISOString(),
      fileUrl: message.fileUrl,
    },
    unreadCount: shouldIncrement
      ? (current.unreadCount ?? 0) + 1
      : isActiveChat
        ? 0
        : current.unreadCount,
    updatedAt: message.createdAt ?? new Date().toISOString(),
  };

  const next = [...prev];
  next[idx] = nextChat;
  return moveChatToFront(next, chatId);
}

function patchInboxUnread(
  prev: ChatRecordModel[],
  chatId: string,
  unreadCount = 0
): ChatRecordModel[] {
  const idx = prev.findIndex((chat) => sameChatId(chat._id, chatId));
  if (idx < 0) return prev;
  const next = [...prev];
  next[idx] = { ...next[idx], unreadCount };
  return next;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [inbox, setInbox] = useState<ChatRecordModel[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [typingByChatId, setTypingByChatId] = useState<Record<string, string>>({});
  const [onlineByUserId, setOnlineByUserId] = useState<Record<string, boolean>>({});
  const mountedRef = useRef(true);
  const activeChatIdRef = useRef<string | null>(null);
  const inboxRef = useRef<ChatRecordModel[]>([]);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const inboxRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastInboxFetchAtRef = useRef(0);

  inboxRef.current = inbox;

  const applyPresenceEntries = useCallback(
    (entries: { userId: string; isOnline: boolean }[]) => {
      if (!entries.length) return;
      setOnlineByUserId((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          next[entry.userId] = entry.isOnline;
        }
        return next;
      });
    },
    []
  );

  const isChatParticipantOnline = useCallback(
    (chat: ChatRecordModel) => {
      const myId = String(getLocalStorage(AppConstant.createdById) ?? "").trim();
      return chatParticipantUserIds(chat)
        .filter((id) => !myId || id !== myId)
        .some((id) => onlineByUserId[id] === true);
    },
    [onlineByUserId]
  );

  const setActiveChatId = useCallback((chatId: string | null) => {
    const id = String(chatId ?? "").trim() || null;
    activeChatIdRef.current = id;
    if (!id) return;
    setInbox((prev) => patchInboxUnread(prev, id, 0));
  }, []);

  const applyEnrichedInbox = useCallback((enriched: ChatRecordModel[]) => {
    if (!mountedRef.current) return;
    setInbox((prev) => mergeInboxFromServer(prev, enriched));
    enriched.forEach((chat) => joinChatRoom(chat._id));
  }, []);

  const enrichCurrentInbox = useCallback(async () => {
    const current = inboxRef.current;
    if (!current.length || !shouldEnrichChatFranchiseIds()) return;
    const enriched = await enrichChatInboxFranchiseIds(current);
    applyEnrichedInbox(enriched);
  }, [applyEnrichedInbox]);

  const enrichInboxFranchiseIdsIfNeeded = useCallback(async () => {
    await enrichCurrentInbox();
  }, [enrichCurrentInbox]);

  const refreshInbox = useCallback(async (opts?: { skipLoader?: boolean; force?: boolean }) => {
    const silent = opts?.skipLoader ?? true;
    const force = opts?.force ?? false;
    const now = Date.now();
    if (!force && now - lastInboxFetchAtRef.current < 2500 && inboxRef.current.length > 0) {
      return;
    }
    if (inboxRefreshInFlightRef.current) {
      return inboxRefreshInFlightRef.current;
    }

    const showLoader = !silent || inboxRef.current.length === 0;
    if (showLoader) setInboxLoading(true);

    const task = (async () => {
      try {
        const res = await fetchChatInbox({ skipLoader: silent });
        if (!mountedRef.current || !res.response) return;
        lastInboxFetchAtRef.current = Date.now();
        const seeded = res.chats.map(enrichChatFranchiseFromCache);
        applyEnrichedInbox(seeded);
      } finally {
        inboxRefreshInFlightRef.current = null;
        if (mountedRef.current && showLoader) setInboxLoading(false);
      }
    })();

    inboxRefreshInFlightRef.current = task;
    return task;
  }, [applyEnrichedInbox]);

  const applyIncomingMessage = useCallback((message: ChatMessageModel) => {
    const chatId = String(message.chatId ?? "").trim();
    if (chatId) {
      setTypingByChatId((prev) => {
        if (!prev[chatId]) return prev;
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
    }
    setInbox((prev) =>
      patchInboxWithMessage(prev, message, {
        activeChatId: activeChatIdRef.current,
        incrementUnread: true,
      })
    );
  }, []);

  const applyChatUpdatedPayload = useCallback((payload: unknown) => {
    const data =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null;
    if (!data) return;

    if (String(data.type ?? "") === "messages_read") {
      const chatId = String(data.chatId ?? data.chat_id ?? "").trim();
      if (chatId) {
        setInbox((prev) => patchInboxUnread(prev, chatId, 0));
      }
      return;
    }

    const record =
      (data.record && typeof data.record === "object" && !Array.isArray(data.record)
        ? (data.record as Record<string, unknown>)
        : null) ??
      (data.chat && typeof data.chat === "object" && !Array.isArray(data.chat)
        ? (data.chat as Record<string, unknown>)
        : null);

    if (!record) return;

    const updated = enrichChatFranchiseFromCache(mapChatRecord(record));
    setInbox((prev) => {
      const idx = prev.findIndex((chat) => sameChatId(chat._id, updated._id));
      if (idx < 0) return prev;
      const existing = prev[idx];
      const localKey = inboxSortKey(existing);
      const remoteKey = inboxSortKey(updated);
      const unreadCount = Math.max(existing.unreadCount ?? 0, updated.unreadCount ?? 0);
      const merged = enrichChatFranchiseFromCache(
        mergeChatRecord(existing, updated)
      );

      if (localKey >= remoteKey) {
        merged.lastMessage = existing.lastMessage ?? existing.last_message ?? merged.lastMessage;
        merged.updatedAt = existing.updatedAt ?? merged.updatedAt;
      }
      merged.unreadCount = unreadCount;

      const next = [...prev];
      next[idx] = merged;
      return moveChatToFront(next, updated._id);
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const token = localStorage.getItem(AppConstant.authToken);
    if (!token) return () => undefined;

    acquireChatSocket();
    setSocketConnected(isChatSocketConnected());
    setSocketError(getLastChatSocketError() || null);
    void refreshInbox({ skipLoader: true });

    const clearTypingForChat = (chatId: string) => {
      const id = String(chatId ?? "").trim();
      if (!id) return;
      const existing = typingTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      typingTimersRef.current.delete(id);
      setTypingByChatId((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    const scheduleTypingClear = (chatId: string) => {
      const id = String(chatId ?? "").trim();
      if (!id) return;
      const existing = typingTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      typingTimersRef.current.set(
        id,
        setTimeout(() => clearTypingForChat(id), 3200)
      );
    };

    const offConnect = onChatConnect(() => {
      setSocketConnected(true);
      setSocketError(null);
      inboxRef.current.forEach((chat) => joinChatRoom(chat._id));
    });
    const offDisconnect = onChatDisconnect(() => setSocketConnected(false));
    const offConnectError = onChatConnectError((message) => {
      setSocketConnected(false);
      setSocketError(message);
    });
    const offUpdated = onChatUpdated((payload) => {
      applyChatUpdatedPayload(payload);
    });
    const offReceive = onChatReceiveMessage((message) => {
      applyIncomingMessage(message);
    });
    const offSent = onChatMessageSent((message) => {
      applyIncomingMessage(message);
    });
    const offTypingStart = onTypingStart((ev) => {
      const chatId = String(ev.chatId ?? "").trim();
      if (!chatId) return;
      const myId = String(getLocalStorage(AppConstant.createdById) ?? "").trim();
      if (myId && String(ev.userId ?? "") === myId) return;
      setTypingByChatId((prev) => ({
        ...prev,
        [chatId]: String(ev.userName ?? "").trim() || "typing",
      }));
      scheduleTypingClear(chatId);
    });
    const offTypingStop = onTypingStop((ev) => {
      clearTypingForChat(ev.chatId);
    });
    const offMessagesRead = onMessagesRead(({ chatId }) => {
      setInbox((prev) => patchInboxUnread(prev, chatId, 0));
    });
    const offPresenceUpdated = onPresenceUpdated(({ userId, isOnline }) => {
      applyPresenceEntries([{ userId, isOnline }]);
    });

    return () => {
      mountedRef.current = false;
      offConnect();
      offDisconnect();
      offConnectError();
      offUpdated();
      offReceive();
      offSent();
      offTypingStart();
      offTypingStop();
      offMessagesRead();
      offPresenceUpdated();
      typingTimersRef.current.forEach((timer) => clearTimeout(timer));
      typingTimersRef.current.clear();
      releaseChatSocket();
    };
  }, [applyChatUpdatedPayload, applyIncomingMessage, applyPresenceEntries, refreshInbox]);

  useEffect(() => {
    const onFranchiseChange = () => {
      const franchiseId = franchiseIdForApiQuery(readHeaderFranchisePreference());
      if (franchiseId) void enrichCurrentInbox();
    };
    window.addEventListener(HEADER_FRANCHISE_CHANGED_EVENT, onFranchiseChange);
    return () =>
      window.removeEventListener(HEADER_FRANCHISE_CHANGED_EVENT, onFranchiseChange);
  }, [enrichCurrentInbox]);

  useEffect(() => {
    if (!socketConnected) return;
    inbox.forEach((chat) => joinChatRoom(chat._id));
  }, [inbox, socketConnected]);

  const value = useMemo<ChatContextValue>(
    () => ({
      inbox,
      inboxLoading,
      socketConnected,
      socketError,
      typingByChatId,
      isChatParticipantOnline,
      refreshInbox,
      enrichInboxFranchiseIdsIfNeeded,
      setActiveChatId,
      joinChat: joinChatRoom,
      leaveChat: leaveChatRoom,
      sendMessage: emitSendMessage,
      readMessages: emitReadMessages,
      transferChat: emitTransferChat,
      subscribeReceive: onChatReceiveMessage,
      subscribeSent: onChatMessageSent,
      subscribeError: onChatError,
      subscribeChatUpdated: onChatUpdated,
      subscribeConnect: onChatConnect,
    }),
    [inbox, inboxLoading, socketConnected, socketError, typingByChatId, isChatParticipantOnline, refreshInbox, enrichInboxFranchiseIdsIfNeeded, setActiveChatId]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return ctx;
}

/** Safe hook when provider may be absent (returns null). */
export function useOptionalChatContext(): ChatContextValue | null {
  return useContext(ChatContext);
}
