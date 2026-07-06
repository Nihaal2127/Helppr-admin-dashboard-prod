import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessageModel, ChatMessageReceiptEntry } from "../models/ChatModel";
import {
  fetchChatMessages,
  sendChatMessageFallback,
} from "../../services/chatService";
import { useChatContext } from "./ChatProvider";
import {
  onTypingStart,
  onTypingStop,
  onMessageDelivered,
  onMessagesRead,
  emitMessageDelivered,
} from "./chatSocket";
import { AppConstant } from "../global/AppConstant";
import { getLocalStorage } from "../global/localStorageHelper";

function newClientMessageId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortMessagesAsc(messages: ChatMessageModel[]): ChatMessageModel[] {
  return [...messages].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
}

function mergeReceiptEntries(
  existing: ChatMessageReceiptEntry[] | undefined,
  incoming: ChatMessageReceiptEntry[] | undefined
): ChatMessageReceiptEntry[] | undefined {
  const map = new Map<string, ChatMessageReceiptEntry>();
  for (const entry of [...(existing ?? []), ...(incoming ?? [])]) {
    const userId = String(entry.userId ?? "").trim();
    if (!userId) continue;
    map.set(userId, { ...map.get(userId), ...entry, userId });
  }
  return map.size > 0 ? Array.from(map.values()) : undefined;
}

function dedupeMessages(messages: ChatMessageModel[]): ChatMessageModel[] {
  const byKey = new Map<string, ChatMessageModel>();
  const deliveryRank: Record<string, number> = {
    sent: 1,
    delivered: 2,
    read: 3,
  };

  const pickDeliveryStatus = (
    current?: string,
    incoming?: string
  ): string | undefined => {
    const a = String(current ?? "").toLowerCase();
    const b = String(incoming ?? "").toLowerCase();
    if (!a) return incoming;
    if (!b) return current;
    return (deliveryRank[b] ?? 0) >= (deliveryRank[a] ?? 0) ? incoming : current;
  };

  for (const msg of messages) {
    const key =
      msg._id ||
      msg.clientMessageId ||
      msg.metadata?.clientMessageId ||
      `${msg.content}-${msg.createdAt}`;
    const existing = byKey.get(key);
    if (!existing || (msg._id && !existing._id)) {
      byKey.set(key, msg);
      continue;
    }
    byKey.set(key, {
      ...existing,
      ...msg,
      deliveryStatus: pickDeliveryStatus(existing.deliveryStatus, msg.deliveryStatus),
      deliveredTo: mergeReceiptEntries(existing.deliveredTo, msg.deliveredTo),
      readBy: mergeReceiptEntries(existing.readBy, msg.readBy),
      fileUrl: msg.fileUrl || existing.fileUrl,
    });
  }
  return sortMessagesAsc(Array.from(byKey.values()));
}

function isOwnSender(senderId?: string): boolean {
  const myId = String(getLocalStorage(AppConstant.createdById) ?? "").trim();
  if (!myId) return false;
  return String(senderId ?? "") === myId;
}

function applyDeliveryReceipt(
  messages: ChatMessageModel[],
  messageId: string,
  opts?: {
    userId?: string;
    deliveredTo?: ChatMessageReceiptEntry[];
    deliveryStatus?: string;
    record?: ChatMessageModel;
  }
): ChatMessageModel[] {
  return messages.map((m) => {
    if (m._id !== messageId || !isOwnSender(m.senderId)) return m;

    if (opts?.record) {
      return {
        ...m,
        ...opts.record,
        deliveredTo: mergeReceiptEntries(m.deliveredTo, opts.record.deliveredTo),
        readBy: mergeReceiptEntries(m.readBy, opts.record.readBy),
        deliveryStatus: pickDeliveryStatus(m.deliveryStatus, opts.record.deliveryStatus),
        fileUrl: opts.record.fileUrl || m.fileUrl,
      };
    }

    const deliveredTo = mergeReceiptEntries(
      m.deliveredTo,
      opts?.deliveredTo ??
        (opts?.userId
          ? [{ userId: opts.userId, deliveredAt: new Date().toISOString() }]
          : undefined)
    );

    if (deliveredTo) {
      return { ...m, deliveredTo };
    }

    if (opts?.deliveryStatus) {
      return { ...m, deliveryStatus: opts.deliveryStatus };
    }

    return m;
  });
}

function pickDeliveryStatus(
  current?: string,
  incoming?: string
): string | undefined {
  const deliveryRank: Record<string, number> = {
    sent: 1,
    delivered: 2,
    read: 3,
  };
  const a = String(current ?? "").toLowerCase();
  const b = String(incoming ?? "").toLowerCase();
  if (!a) return incoming;
  if (!b) return current;
  return (deliveryRank[b] ?? 0) >= (deliveryRank[a] ?? 0) ? incoming : current;
}

function applyReadReceipt(
  messages: ChatMessageModel[],
  readerId?: string
): ChatMessageModel[] {
  const myId = String(getLocalStorage(AppConstant.createdById) ?? "").trim();
  const reader = String(readerId ?? "").trim();
  if (!reader || reader === myId) return messages;

  const now = new Date().toISOString();
  return messages.map((m) => {
    if (!isOwnSender(m.senderId)) return m;
    return {
      ...m,
      readBy: mergeReceiptEntries(m.readBy, [{ userId: reader, readAt: now }]),
    };
  });
}

function sameChatId(a: string, b: string): boolean {
  return String(a ?? "").trim() === String(b ?? "").trim();
}

export function useChatThread(chatId: string | null | undefined, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const id = String(chatId ?? "").trim();
  const {
    joinChat,
    sendMessage: socketSend,
    readMessages,
    socketConnected,
    setActiveChatId,
    subscribeReceive,
    subscribeSent,
    subscribeError,
    subscribeConnect,
  } = useChatContext();

  const [messages, setMessages] = useState<ChatMessageModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [chatClosed, setChatClosed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typingLabel, setTypingLabel] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const messagesRef = useRef<ChatMessageModel[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const upsertMessage = useCallback((incoming: ChatMessageModel) => {
    setMessages((prev) => {
      const clientId =
        incoming.clientMessageId || incoming.metadata?.clientMessageId;
      const withoutTemp = prev.filter((m) => {
        if (!clientId) return true;
        const mid = m.clientMessageId || m.metadata?.clientMessageId;
        return mid !== clientId;
      });
      return dedupeMessages([...withoutTemp, incoming]);
    });
  }, []);

  const loadInitial = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchChatMessages({ chatId: id, limit: 50 }, { skipLoader: true });
      if (!mountedRef.current) return;
      if (res.response) {
        setMessages(dedupeMessages(res.messages));
        setHasMore(res.messages.length >= 50);
      } else {
        setLoadError("Could not load messages from chat service.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [id]);

  const loadOlder = useCallback(async () => {
    if (!id || loadingMore || !hasMore || messages.length === 0) return;
    const oldest = messages[0]?.createdAt;
    if (!oldest) return;

    setLoadingMore(true);
    try {
      const res = await fetchChatMessages(
        { chatId: id, limit: 50, before: oldest },
        { skipLoader: true }
      );
      if (!mountedRef.current) return;
      if (res.response) {
        setMessages((prev) => dedupeMessages([...res.messages, ...prev]));
        setHasMore(res.messages.length >= 50);
      }
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [id, loadingMore, hasMore, messages]);

  const gapFillMessages = useCallback(async () => {
    if (!id || !mountedRef.current) return;
    const current = messagesRef.current;
    const latest = current[current.length - 1]?.createdAt;
    const res = await fetchChatMessages(
      latest
        ? { chatId: id, limit: 50, after: latest }
        : { chatId: id, limit: 50 },
      { skipLoader: true }
    );
    if (!mountedRef.current || !res.response) return;
    if (res.messages.length === 0) return;
    setMessages((prev) => dedupeMessages([...prev, ...res.messages]));
  }, [id]);

  const ensureJoined = useCallback(() => {
    if (!id) return;
    joinChat(id);
    readMessages(id);
  }, [id, joinChat, readMessages]);

  useEffect(() => {
    if (!enabled || !id) return;

    const myId = String(getLocalStorage(AppConstant.createdById) ?? "").trim();
    const clearTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const scheduleClear = (userId: string) => {
      if (clearTimers.has(userId)) {
        clearTimeout(clearTimers.get(userId)!);
      }
      clearTimers.set(
        userId,
        setTimeout(() => {
          clearTimers.delete(userId);
          setTypingLabel(null);
        }, 3200)
      );
    };

    const offTypingStart = onTypingStart((ev) => {
      if (!sameChatId(ev.chatId, id)) return;
      if (ev.userId === myId) return;
      setTypingLabel(ev.userName?.trim() || "typing");
      scheduleClear(ev.userId);
    });

    const offTypingStop = onTypingStop((ev) => {
      if (!sameChatId(ev.chatId, id)) return;
      if (clearTimers.has(ev.userId)) {
        clearTimeout(clearTimers.get(ev.userId)!);
        clearTimers.delete(ev.userId);
      }
      setTypingLabel(null);
    });

    return () => {
      offTypingStart();
      offTypingStop();
      clearTimers.forEach((timer) => clearTimeout(timer));
      clearTimers.clear();
    };
  }, [enabled, id]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || !id) {
      setMessages([]);
      setTypingLabel(null);
      setActiveChatId(null);
      return () => {
        mountedRef.current = false;
      };
    }

    setActiveChatId(id);
    void loadInitial();
    ensureJoined();

    const offReceive = subscribeReceive((msg) => {
      const msgChatId = String(msg.chatId ?? "").trim();
      if (msgChatId && !sameChatId(msgChatId, id)) return;
      setTypingLabel(null);
      upsertMessage({ ...msg, chatId: msgChatId || id, sendStatus: "sent" });
      if (msg._id && !isOwnSender(msg.senderId)) {
        emitMessageDelivered(msg._id);
      }
    });

    const offSent = subscribeSent((msg, meta) => {
      const msgChatId = String(msg.chatId ?? "").trim();
      if (msgChatId && !sameChatId(msgChatId, id)) return;
      upsertMessage({
        ...msg,
        chatId: msgChatId || id,
        clientMessageId: meta?.clientMessageId,
        sendStatus: "sent",
        deliveryStatus: msg.deliveryStatus ?? "sent",
      });
    });

    const offError = subscribeError((err) => {
      if (err.chatId && !sameChatId(err.chatId, id)) return;
      if (!err.clientMessageId) return;
      setMessages((prev) =>
        prev.map((m) => {
          const mid = m.clientMessageId || m.metadata?.clientMessageId;
          if (mid === err.clientMessageId) {
            return { ...m, sendStatus: "failed" as const };
          }
          return m;
        })
      );
    });

    const offConnect = subscribeConnect(() => {
      ensureJoined();
      void gapFillMessages();
    });

    const offDelivered = onMessageDelivered((event) => {
      if (event.chatId && !sameChatId(event.chatId, id)) return;
      setMessages((prev) =>
        applyDeliveryReceipt(prev, event.messageId, {
          userId: event.userId,
          deliveredTo: event.deliveredTo,
          deliveryStatus: event.deliveryStatus,
          record: event.record,
        })
      );
    });

    const offRead = onMessagesRead((event) => {
      if (!sameChatId(event.chatId, id)) return;
      setMessages((prev) => applyReadReceipt(prev, event.userId));
    });

    return () => {
      mountedRef.current = false;
      offReceive();
      offSent();
      offError();
      offConnect();
      offDelivered();
      offRead();
      // Stay joined to inbox rooms so the chat list keeps receiving live updates.
      setActiveChatId(null);
    };
  }, [
    enabled,
    id,
    joinChat,
    loadInitial,
    ensureJoined,
    gapFillMessages,
    readMessages,
    setActiveChatId,
    subscribeConnect,
    subscribeError,
    subscribeReceive,
    subscribeSent,
    upsertMessage,
  ]);

  useEffect(() => {
    if (!enabled || !id || !socketConnected) return;
    ensureJoined();
  }, [enabled, id, socketConnected, ensureJoined]);

  const sendTextMessage = useCallback(
    async (
      content: string,
      extra?: {
        fileUrl?: string;
        type?: "text" | "image" | "file";
        fileName?: string;
      }
    ) => {
      const text = String(content ?? "").trim();
      const fileUrl = String(extra?.fileUrl ?? "").trim();
      if (!id || (!text && !fileUrl)) return false;

      const messageType = extra?.type ?? (fileUrl ? "file" : "text");
      const messageContent =
        text || extra?.fileName?.trim() || (messageType === "image" ? "Image" : "File");

      const clientMessageId = newClientMessageId();
      const optimistic: ChatMessageModel = {
        _id: clientMessageId,
        chatId: id,
        type: messageType,
        content: messageContent,
        fileUrl: fileUrl || undefined,
        clientMessageId,
        metadata: { clientMessageId },
        createdAt: new Date().toISOString(),
        sendStatus: "sending",
      };
      upsertMessage(optimistic);

      const payload = {
        chatId: id,
        type: messageType,
        content: messageContent,
        fileUrl: fileUrl || undefined,
        clientMessageId,
      };

      const sentViaSocket = socketConnected && socketSend(payload);
      if (sentViaSocket) return true;

      const res = await sendChatMessageFallback(payload, { skipLoader: true });
      if (res.response && res.message) {
        upsertMessage({ ...res.message, sendStatus: "sent", clientMessageId });
        return true;
      }

      setMessages((prev) =>
        prev.map((m) =>
          (m.clientMessageId || m.metadata?.clientMessageId) === clientMessageId
            ? { ...m, sendStatus: "failed" as const }
            : m
        )
      );
      return false;
    },
    [id, socketConnected, socketSend, upsertMessage]
  );

  const retryMessage = useCallback(
    async (clientMessageId: string) => {
      const msg = messages.find(
        (m) => (m.clientMessageId || m.metadata?.clientMessageId) === clientMessageId
      );
      if (!msg) return false;
      if (!msg.content && !msg.fileUrl) return false;
      setMessages((prev) => prev.filter((m) => m._id !== msg._id));
      return sendTextMessage(msg.content || "", {
        fileUrl: msg.fileUrl,
        type: msg.type === "system" ? "text" : msg.type,
        fileName: msg.content,
      });
    },
    [messages, sendTextMessage]
  );

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    chatClosed,
    setChatClosed,
    loadOlder,
    sendTextMessage,
    retryMessage,
    socketConnected,
    loadError,
    typingLabel,
  };
}
