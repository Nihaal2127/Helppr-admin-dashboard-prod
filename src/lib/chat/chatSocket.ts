import { io, Socket } from "socket.io-client";
import { AppConstant, getChatServiceUrl } from "../global/AppConstant";
import { mapChatMessage, ChatMessageModel } from "../models/ChatModel";

export type ChatSocketSendPayload = {
  chatId: string;
  type?: "text" | "image" | "file";
  content: string;
  fileUrl?: string;
  clientMessageId?: string;
  metadata?: Record<string, unknown>;
};

type MessageHandler = (message: ChatMessageModel, meta?: { clientMessageId?: string }) => void;
type ChatErrorHandler = (error: {
  message?: string;
  code?: string;
  clientMessageId?: string;
  chatId?: string;
}) => void;
type VoidHandler = () => void;
type ChatUpdatedHandler = (payload: unknown) => void;
type TypingHandler = (payload: { chatId: string; userId: string; userName?: string }) => void;
type MessageDeliveredHandler = (payload: {
  messageId: string;
  chatId?: string;
  userId?: string;
  deliveryStatus?: string;
  deliveredTo?: ChatMessageModel["deliveredTo"];
  record?: ChatMessageModel;
}) => void;
type MessagesReadHandler = (payload: { chatId: string; userId?: string }) => void;
type PresenceUpdatedHandler = (payload: {
  userId: string;
  isOnline: boolean;
  lastSeenAt?: string;
}) => void;

let socket: Socket | null = null;
let socketBaseUrl: string | null = null;
let connected = false;
let lastConnectError = "";
let socketConsumers = 0;
let pendingDisconnectTimer: ReturnType<typeof setTimeout> | null = null;

const socketsWithListeners = new WeakSet<Socket>();

const receiveHandlers = new Set<MessageHandler>();
const sentHandlers = new Set<MessageHandler>();
const errorHandlers = new Set<ChatErrorHandler>();
const connectHandlers = new Set<VoidHandler>();
const disconnectHandlers = new Set<VoidHandler>();
const connectErrorHandlers = new Set<(message: string) => void>();
const chatUpdatedHandlers = new Set<ChatUpdatedHandler>();
const typingStartHandlers = new Set<TypingHandler>();
const typingStopHandlers = new Set<TypingHandler>();
const messageDeliveredHandlers = new Set<MessageDeliveredHandler>();
const messagesReadHandlers = new Set<MessagesReadHandler>();
const presenceUpdatedHandlers = new Set<PresenceUpdatedHandler>();

const joinedChats = new Set<string>();

function getToken(): string {
  return String(localStorage.getItem(AppConstant.authToken) ?? "").trim();
}

function emitJoinChat(sock: Socket, chatId: string) {
  sock.emit("join_chat", chatId);
}

function emitLeaveChat(sock: Socket, chatId: string) {
  sock.emit("leave_chat", chatId);
}

function onSocketReady(sock: Socket) {
  connected = true;
  lastConnectError = "";
  connectHandlers.forEach((h) => h());
  joinedChats.forEach((chatId) => {
    emitJoinChat(sock, chatId);
  });
}

function attachSocketListeners(sock: Socket) {
  sock.on("connect", () => {
    onSocketReady(sock);
  });

  sock.on("disconnect", () => {
    connected = false;
    disconnectHandlers.forEach((h) => h());
  });

  sock.on("connect_error", (err: Error) => {
    connected = false;
    lastConnectError = String(err?.message ?? "Socket connection failed");
    connectErrorHandlers.forEach((h) => h(lastConnectError));
  });

  sock.on("connection_status", (payload: unknown) => {
    const data = asRecord(payload);
    const status = String(data?.status ?? "").toLowerCase();
    if (status === "connected" || !status) {
      onSocketReady(sock);
    }
  });

  sock.on("receive_message", (payload: unknown) => {
    const data = asRecord(payload);
    const row = normalizeMessagePayload(data?.record ?? payload);
    if (!row) return;
    const chatId = resolveEventChatId(data, row);
    const enriched = { ...row, chatId };
    receiveHandlers.forEach((h) =>
      h(enriched, { clientMessageId: enriched.metadata?.clientMessageId })
    );
  });

  sock.on("message_sent", (payload: unknown) => {
    const data = asRecord(payload);
    const row = normalizeMessagePayload(data?.record ?? payload);
    if (!row) return;
    const clientMessageId = String(
      data?.clientMessageId ?? row.metadata?.clientMessageId ?? ""
    ).trim();
    const chatId = resolveEventChatId(data, row);
    sentHandlers.forEach((h) =>
      h({ ...row, chatId }, { clientMessageId: clientMessageId || undefined })
    );
  });

  sock.on("chat_error", (payload: unknown) => {
    const data = asRecord(payload);
    errorHandlers.forEach((h) =>
      h({
        message: String(data?.message ?? ""),
        code: String(data?.code ?? ""),
        clientMessageId: String(data?.clientMessageId ?? "").trim() || undefined,
        chatId: String(data?.chatId ?? "").trim() || undefined,
      })
    );
  });

  sock.on("chat_updated", (payload: unknown) => {
    chatUpdatedHandlers.forEach((h) => h(payload));
  });

  sock.on("chat_assigned", (payload: unknown) => {
    chatUpdatedHandlers.forEach((h) => h(payload));
  });

  sock.on("message_delivered", (payload: unknown) => {
    const data = asRecord(payload);
    if (!data) return;
    const messageId = String(
      data.messageId ?? data.message_id ?? data._id ?? data.id ?? ""
    ).trim();
    if (!messageId) return;
    const record = normalizeMessagePayload(data.record ?? data.message ?? null) ?? undefined;
    const userId = String(
      data.userId ??
        data.user_id ??
        data.deliveredBy ??
        data.delivered_by ??
        ""
    ).trim() || undefined;
    const event = {
      messageId,
      chatId: String(data.chatId ?? data.chat_id ?? record?.chatId ?? "").trim() || undefined,
      userId,
      deliveryStatus: String(data.deliveryStatus ?? data.delivery_status ?? "").trim() || undefined,
      deliveredTo: record?.deliveredTo,
      record,
    };
    messageDeliveredHandlers.forEach((h) => h(event));
  });

  sock.on("messages_read", (payload: unknown) => {
    const data = asRecord(payload);
    const chatId = String(data?.chatId ?? data?.chat_id ?? "").trim();
    if (!chatId) return;
    const event = {
      chatId,
      userId: String(data?.userId ?? data?.user_id ?? "").trim() || undefined,
    };
    messagesReadHandlers.forEach((h) => h(event));
    chatUpdatedHandlers.forEach((h) => h({ type: "messages_read", ...event }));
  });

  sock.on("typing_start", (payload: unknown) => {
    const event = parseTypingPayload(payload);
    if (event) typingStartHandlers.forEach((h) => h(event));
  });

  sock.on("typing_stop", (payload: unknown) => {
    const event = parseTypingPayload(payload);
    if (event) typingStopHandlers.forEach((h) => h(event));
  });

  sock.on("presence_updated", (payload: unknown) => {
    const event = parsePresencePayload(payload);
    if (event) presenceUpdatedHandlers.forEach((h) => h(event));
  });
}

function parseTypingPayload(
  payload: unknown
): { chatId: string; userId: string; userName?: string } | null {
  const data = asRecord(payload);
  if (!data) return null;
  const chatId = String(data.chatId ?? data.chat_id ?? "").trim();
  const userId = String(data.userId ?? data.user_id ?? "").trim();
  if (!chatId || !userId) return null;
  const userName = String(data.userName ?? data.user_name ?? data.name ?? "").trim();
  return { chatId, userId, userName: userName || undefined };
}

function parsePresencePayload(
  payload: unknown
): { userId: string; isOnline: boolean; lastSeenAt?: string } | null {
  const data = asRecord(payload);
  if (!data) return null;
  const userId = String(data.userId ?? data.user_id ?? "").trim();
  if (!userId) return null;
  const isOnline = Boolean(
    data.isOnline ?? data.is_online ?? data.online ?? data.status === "online"
  );
  const lastSeenAt =
    String(data.lastSeenAt ?? data.last_seen_at ?? "").trim() || undefined;
  return { userId, isOnline, lastSeenAt };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveEventChatId(
  envelope: Record<string, unknown> | null,
  message: ChatMessageModel
): string | undefined {
  const fromMessage = String(message.chatId ?? "").trim();
  if (fromMessage) return fromMessage;
  if (!envelope) return undefined;

  const nestedRecord = asRecord(envelope.record);
  const nestedChat = asRecord(envelope.chat) ?? asRecord(nestedRecord?.chat);

  return (
    String(envelope.chatId ?? envelope.chat_id ?? "").trim() ||
    String(nestedRecord?.chatId ?? nestedRecord?.chat_id ?? "").trim() ||
    String(nestedChat?._id ?? nestedChat?.id ?? "").trim() ||
    undefined
  );
}

function normalizeMessagePayload(payload: unknown): ChatMessageModel | null {
  const outer = asRecord(payload);
  if (!outer) return null;
  const row =
    asRecord(outer.record) ??
    asRecord(outer.message) ??
    (Array.isArray(outer.records) ? asRecord(outer.records[0]) : null) ??
    outer;
  const mapped = mapChatMessage(row);
  if (!mapped._id && !mapped.content && !mapped.fileUrl) return null;
  if (!mapped.chatId) {
    const parentChatId = String(
      outer.chatId ?? outer.chat_id ?? outer.chatID ?? ""
    ).trim();
    if (parentChatId) mapped.chatId = parentChatId;
  }
  return mapped;
}

export function connectChatSocket(): Socket | null {
  const token = getToken();
  if (!token) return null;

  const chatServiceUrl = getChatServiceUrl();

  if (socket && socketBaseUrl && socketBaseUrl !== chatServiceUrl) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    socketBaseUrl = null;
  }

  if (socket?.connected) return socket;

  if (socket) {
    socket.auth = { token };
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  socketBaseUrl = chatServiceUrl;
  socket = io(chatServiceUrl, {
    auth: { token },
    transports: ["polling", "websocket"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  if (!socketsWithListeners.has(socket)) {
    attachSocketListeners(socket);
    socketsWithListeners.add(socket);
  }

  return socket;
}

/** Keep socket alive across React Strict Mode remounts in development. */
export function acquireChatSocket(): Socket | null {
  if (pendingDisconnectTimer) {
    clearTimeout(pendingDisconnectTimer);
    pendingDisconnectTimer = null;
  }
  socketConsumers += 1;
  return connectChatSocket();
}

export function releaseChatSocket() {
  socketConsumers = Math.max(0, socketConsumers - 1);
  if (socketConsumers > 0) return;

  pendingDisconnectTimer = setTimeout(() => {
    pendingDisconnectTimer = null;
    if (socketConsumers === 0) {
      disconnectChatSocket();
    }
  }, 500);
}

export function disconnectChatSocket() {
  if (pendingDisconnectTimer) {
    clearTimeout(pendingDisconnectTimer);
    pendingDisconnectTimer = null;
  }
  socketConsumers = 0;
  joinedChats.clear();
  connected = false;
  if (socket) {
    socket.disconnect();
    socket = null;
    socketBaseUrl = null;
  }
}

export function isChatSocketConnected(): boolean {
  return Boolean(socket?.connected ?? connected);
}

export function joinChatRoom(chatId: string) {
  const id = String(chatId ?? "").trim();
  if (!id) return;
  joinedChats.add(id);
  if (socket?.connected) {
    emitJoinChat(socket, id);
  }
}

export function leaveChatRoom(chatId: string) {
  const id = String(chatId ?? "").trim();
  if (!id) return;
  joinedChats.delete(id);
  if (socket?.connected) {
    emitLeaveChat(socket, id);
  }
}

export function emitSendMessage(payload: ChatSocketSendPayload) {
  if (!socket?.connected) return false;
  socket.emit("send_message", {
    chatId: payload.chatId,
    type: payload.type ?? "text",
    content: payload.content,
    ...(payload.fileUrl ? { fileUrl: payload.fileUrl } : {}),
    ...(payload.clientMessageId ? { clientMessageId: payload.clientMessageId } : {}),
    ...(payload.metadata ? { metadata: payload.metadata } : {}),
  });
  return true;
}

export function emitReadMessages(chatId: string) {
  const id = String(chatId ?? "").trim();
  if (!id || !socket?.connected) return;
  socket.emit("read_messages", { chatId: id });
}

export function emitMessageDelivered(messageId: string) {
  const id = String(messageId ?? "").trim();
  if (!id || !socket?.connected) return;
  socket.emit("message_delivered", { messageId: id });
}

export function emitTransferChat(chatId: string, newAssignedTo: string) {
  const id = String(chatId ?? "").trim();
  const assignee = String(newAssignedTo ?? "").trim();
  if (!id || !assignee || !socket?.connected) return false;
  socket.emit("transfer_chat", { chatId: id, newAssignedTo: assignee });
  return true;
}

export function emitTypingStart(chatId: string) {
  const id = String(chatId ?? "").trim();
  if (!id || !socket?.connected) return;
  socket.emit("typing_start", { chatId: id });
}

export function emitTypingStop(chatId: string) {
  const id = String(chatId ?? "").trim();
  if (!id || !socket?.connected) return;
  socket.emit("typing_stop", { chatId: id });
}

export function onChatReceiveMessage(handler: MessageHandler): () => void {
  receiveHandlers.add(handler);
  return () => receiveHandlers.delete(handler);
}

export function onChatMessageSent(handler: MessageHandler): () => void {
  sentHandlers.add(handler);
  return () => sentHandlers.delete(handler);
}

export function onChatError(handler: ChatErrorHandler): () => void {
  errorHandlers.add(handler);
  return () => errorHandlers.delete(handler);
}

export function onChatConnect(handler: VoidHandler): () => void {
  connectHandlers.add(handler);
  return () => connectHandlers.delete(handler);
}

export function onChatDisconnect(handler: VoidHandler): () => void {
  disconnectHandlers.add(handler);
  return () => disconnectHandlers.delete(handler);
}

export function onChatConnectError(handler: (message: string) => void): () => void {
  connectErrorHandlers.add(handler);
  return () => connectErrorHandlers.delete(handler);
}

export function getLastChatSocketError(): string {
  return lastConnectError;
}

export function onChatUpdated(handler: ChatUpdatedHandler): () => void {
  chatUpdatedHandlers.add(handler);
  return () => chatUpdatedHandlers.delete(handler);
}

export function onTypingStart(handler: TypingHandler): () => void {
  typingStartHandlers.add(handler);
  return () => typingStartHandlers.delete(handler);
}

export function onTypingStop(handler: TypingHandler): () => void {
  typingStopHandlers.add(handler);
  return () => typingStopHandlers.delete(handler);
}

export function onMessageDelivered(handler: MessageDeliveredHandler): () => void {
  messageDeliveredHandlers.add(handler);
  return () => messageDeliveredHandlers.delete(handler);
}

export function onMessagesRead(handler: MessagesReadHandler): () => void {
  messagesReadHandlers.add(handler);
  return () => messagesReadHandlers.delete(handler);
}

export function onPresenceUpdated(handler: PresenceUpdatedHandler): () => void {
  presenceUpdatedHandlers.add(handler);
  return () => presenceUpdatedHandlers.delete(handler);
}
