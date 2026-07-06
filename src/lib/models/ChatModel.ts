export type ChatType = "support" | "dispute" | "order" | "quote";

export type ChatStatus = "open" | "closed" | "pending" | string;

export type ChatUserDisplay = {
  _id: string;
  name: string;
  type?: number | string;
  profile_url?: string;
  role?: string;
  franchise_id?: string;
  franchiseId?: string;
};

export type ChatMessageType = "text" | "image" | "file" | "system";

export type ChatMessageDeliveryStatus = "sent" | "delivered" | "read" | string;

export type ChatMessageReceiptEntry = {
  userId: string;
  deliveredAt?: string;
  readAt?: string;
};

export type ChatContextModel = {
  orderId?: string;
  orderUniqueId?: string;
  quoteId?: string;
  disputeId?: string;
  disputeUniqueId?: string;
};

export type ChatMessageModel = {
  _id: string;
  chatId?: string;
  senderId?: string;
  senderUser?: ChatUserDisplay;
  type: ChatMessageType;
  content?: string;
  fileUrl?: string;
  deliveryStatus?: ChatMessageDeliveryStatus;
  deliveredTo?: ChatMessageReceiptEntry[];
  readBy?: ChatMessageReceiptEntry[];
  metadata?: { clientMessageId?: string; [key: string]: unknown };
  createdAt?: string;
  updatedAt?: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  /** Optimistic UI only */
  clientMessageId?: string;
  sendStatus?: "sending" | "sent" | "failed";
};

export type ChatRecordModel = {
  _id: string;
  type: ChatType;
  status?: ChatStatus;
  isGroup?: boolean;
  unreadCount?: number;
  assignedTo?: string;
  assignedToUser?: ChatUserDisplay;
  participants?: string[];
  participantUsers?: ChatUserDisplay[];
  roles?: { userId: string; role: string }[];
  franchise_id?: string;
  franchiseId?: string;
  order_id?: string;
  orderId?: string;
  quote_id?: string;
  quoteId?: string;
  context?: ChatContextModel;
  lastMessage?: Partial<ChatMessageModel> | string;
  last_message?: Partial<ChatMessageModel> | string;
  createdAt?: string;
  updatedAt?: string;
};

export type DisputeStatus = "open" | "in_review" | "resolved" | "closed" | string;

export type DisputeRecordModel = {
  _id: string;
  unique_id?: string;
  dispute_unique_id?: string;
  chat_id?: string;
  chatId?: string;
  order_id?: string;
  orderId?: string;
  order_unique_id?: string;
  orderUniqueId?: string;
  user_id?: string;
  userId?: string;
  customer_name?: string;
  customerName?: string;
  reason?: string;
  description?: string;
  status?: DisputeStatus;
  franchise_id?: string;
  franchiseId?: string;
  employee_id?: string;
  employeeId?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function mapChatUserDisplay(raw: unknown): ChatUserDisplay | undefined {
  const row = toRecord(raw);
  if (!row) return undefined;
  const id = String(row._id ?? row.id ?? "").trim();
  if (!id) return undefined;
  return {
    _id: id,
    name: String(row.name ?? "").trim() || "User",
    type: row.type as number | string | undefined,
    profile_url: String(row.profile_url ?? row.profileUrl ?? "").trim() || undefined,
    role: String(row.role ?? "").trim() || undefined,
    franchise_id:
      String(row.franchise_id ?? row.franchiseId ?? "").trim() || undefined,
    franchiseId:
      String(row.franchiseId ?? row.franchise_id ?? "").trim() || undefined,
  };
}

function resolveMessageFileUrl(
  raw: Record<string, unknown>,
  meta: Record<string, unknown> | null,
  type: ChatMessageType,
  content?: string
): string | undefined {
  const direct = String(
    raw.fileUrl ??
      raw.file_url ??
      raw.mediaUrl ??
      raw.media_url ??
      raw.attachmentUrl ??
      raw.attachment_url ??
      meta?.fileUrl ??
      meta?.file_url ??
      meta?.mediaUrl ??
      meta?.media_url ??
      meta?.storagePath ??
      meta?.storage_path ??
      meta?.path ??
      ""
  ).trim();

  if (direct) return direct;

  const attachment = toRecord(raw.attachment) ?? toRecord(raw.media);
  const nested = String(
    attachment?.url ?? attachment?.fileUrl ?? attachment?.file_url ?? ""
  ).trim();
  if (nested) return nested;

  if ((type === "image" || type === "file") && content) {
    const text = content.trim();
    if (
      /^https?:\/\//i.test(text) ||
      text.includes("/") ||
      /\.(png|jpe?g|gif|webp|bmp|svg|pdf|docx?|xlsx?)(\?.*)?$/i.test(text)
    ) {
      return text;
    }
  }

  if (content) {
    const text = content.trim();
    if (/\.(png|jpe?g|gif|webp|bmp|svg|pdf|docx?|xlsx?)(\?.*)?$/i.test(text)) {
      return text;
    }
  }

  return undefined;
}

function parseMessageReceiptEntries(
  raw: unknown,
  timestampKey: "deliveredAt" | "readAt"
): ChatMessageReceiptEntry[] {
  if (!Array.isArray(raw)) return [];
  const altAtKey = timestampKey === "deliveredAt" ? "delivered_at" : "read_at";
  const entries: ChatMessageReceiptEntry[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const userId = String(row.userId ?? row.user_id ?? "").trim();
    if (!userId) continue;
    const at = String(row[timestampKey] ?? row[altAtKey] ?? row.at ?? "").trim();

    const entry: ChatMessageReceiptEntry = { userId };
    if (timestampKey === "deliveredAt") {
      if (at) entry.deliveredAt = at;
    } else if (at) {
      entry.readAt = at;
    }
    entries.push(entry);
  }

  return entries;
}

export function mapChatMessage(raw: Record<string, unknown>): ChatMessageModel {
  const id = String(raw._id ?? raw.id ?? "").trim();
  const meta = toRecord(raw.metadata);
  const type = (String(raw.type ?? "text").trim() || "text") as ChatMessageType;
  const content = String(raw.content ?? "").trim() || undefined;
  return {
    _id: id,
    chatId: String(raw.chatId ?? raw.chat_id ?? "").trim() || undefined,
    senderId: String(raw.senderId ?? raw.sender_id ?? "").trim() || undefined,
    senderUser: mapChatUserDisplay(raw.senderUser ?? raw.sender_user),
    type,
    content,
    fileUrl: resolveMessageFileUrl(raw, meta, type, content),
    deliveryStatus: String(raw.deliveryStatus ?? raw.delivery_status ?? "").trim() || undefined,
    deliveredTo: parseMessageReceiptEntries(raw.deliveredTo ?? raw.delivered_to, "deliveredAt"),
    readBy: parseMessageReceiptEntries(raw.readBy ?? raw.read_by, "readAt"),
    metadata: meta
      ? {
          ...meta,
          clientMessageId: String(meta.clientMessageId ?? "").trim() || undefined,
        }
      : undefined,
    createdAt: String(raw.createdAt ?? raw.created_at ?? "").trim() || undefined,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? "").trim() || undefined,
    editedAt: (raw.editedAt ?? raw.edited_at ?? null) as string | null,
    deletedAt: (raw.deletedAt ?? raw.deleted_at ?? null) as string | null,
  };
}

export function mapChatRecord(raw: Record<string, unknown>): ChatRecordModel {
  const id = String(raw._id ?? raw.id ?? "").trim();
  const contextRow = toRecord(raw.context);
  const contextOrderId = String(
    contextRow?.orderId ?? contextRow?.order_id ?? ""
  ).trim();
  const contextQuoteId = String(
    contextRow?.quoteId ?? contextRow?.quote_id ?? ""
  ).trim();
  const contextDisputeId = String(
    contextRow?.disputeId ?? contextRow?.dispute_id ?? ""
  ).trim();
  const contextOrderUniqueId = String(
    contextRow?.orderUniqueId ?? contextRow?.order_unique_id ?? ""
  ).trim();
  const contextDisputeUniqueId = String(
    contextRow?.disputeUniqueId ??
      contextRow?.dispute_unique_id ??
      contextRow?.unique_id ??
      ""
  ).trim();
  const rootOrderId = String(raw.orderId ?? raw.order_id ?? "").trim();
  const rootQuoteId = String(raw.quoteId ?? raw.quote_id ?? "").trim();
  const orderId = contextOrderId || rootOrderId;
  const quoteId = contextQuoteId || rootQuoteId;

  const participantUsers = Array.isArray(raw.participantUsers)
    ? raw.participantUsers
        .map((u) => mapChatUserDisplay(u))
        .filter((u): u is ChatUserDisplay => Boolean(u))
    : Array.isArray(raw.participant_users)
    ? raw.participant_users
        .map((u) => mapChatUserDisplay(u))
        .filter((u): u is ChatUserDisplay => Boolean(u))
    : undefined;

  return {
    _id: id,
    type: String(raw.type ?? "support").trim() as ChatType,
    status: String(raw.status ?? "").trim() || undefined,
    isGroup: Boolean(raw.isGroup ?? raw.is_group),
    unreadCount: Number(raw.unreadCount ?? raw.unread_count ?? 0) || 0,
    assignedTo: String(raw.assignedTo ?? raw.assigned_to ?? "").trim() || undefined,
    assignedToUser: mapChatUserDisplay(raw.assignedToUser ?? raw.assigned_to_user),
    participants: Array.isArray(raw.participants)
      ? raw.participants.map((p) => String(p))
      : undefined,
    participantUsers,
    roles: Array.isArray(raw.roles)
      ? raw.roles
          .map((entry) => {
            const row = toRecord(entry);
            if (!row) return null;
            const userId = String(row.userId ?? row.user_id ?? "").trim();
            const role = String(row.role ?? "").trim();
            if (!userId) return null;
            return { userId, role };
          })
          .filter((entry): entry is { userId: string; role: string } =>
            Boolean(entry)
          )
      : undefined,
    franchise_id: String(raw.franchise_id ?? "").trim() || undefined,
    franchiseId: String(raw.franchiseId ?? raw.franchise_id ?? "").trim() || undefined,
    order_id: orderId || undefined,
    orderId: orderId || undefined,
    quote_id: quoteId || undefined,
    quoteId: quoteId || undefined,
    context:
      contextOrderId ||
      contextQuoteId ||
      contextDisputeId ||
      contextOrderUniqueId ||
      contextDisputeUniqueId
        ? {
            orderId: contextOrderId || undefined,
            orderUniqueId: contextOrderUniqueId || undefined,
            quoteId: contextQuoteId || undefined,
            disputeId: contextDisputeId || undefined,
            disputeUniqueId: contextDisputeUniqueId || undefined,
          }
        : undefined,
    lastMessage: (raw.lastMessage ?? raw.last_message) as ChatRecordModel["lastMessage"],
    createdAt: String(raw.createdAt ?? raw.created_at ?? "").trim() || undefined,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? "").trim() || undefined,
  };
}

export function mapDisputeRecord(raw: Record<string, unknown>): DisputeRecordModel {
  const id = String(raw._id ?? raw.id ?? "").trim();
  return {
    _id: id,
    unique_id:
      String(raw.unique_id ?? raw.dispute_unique_id ?? raw.disputeUniqueId ?? "")
        .trim() || undefined,
    dispute_unique_id:
      String(raw.dispute_unique_id ?? raw.unique_id ?? raw.disputeUniqueId ?? "")
        .trim() || undefined,
    chat_id: String(raw.chat_id ?? raw.chatId ?? "").trim() || undefined,
    chatId: String(raw.chatId ?? raw.chat_id ?? "").trim() || undefined,
    order_id: String(raw.order_id ?? raw.orderId ?? "").trim() || undefined,
    orderId: String(raw.orderId ?? raw.order_id ?? "").trim() || undefined,
    order_unique_id:
      String(
        raw.order_unique_id ?? raw.orderUniqueId ?? raw.order_uniqueId ?? ""
      ).trim() || undefined,
    orderUniqueId:
      String(
        raw.orderUniqueId ?? raw.order_unique_id ?? raw.order_uniqueId ?? ""
      ).trim() || undefined,
    user_id: String(raw.user_id ?? raw.userId ?? "").trim() || undefined,
    userId: String(raw.userId ?? raw.user_id ?? "").trim() || undefined,
    customer_name: String(raw.customer_name ?? raw.customerName ?? "").trim() || undefined,
    customerName: String(raw.customerName ?? raw.customer_name ?? "").trim() || undefined,
    reason: String(raw.reason ?? "").trim() || undefined,
    description: String(raw.description ?? "").trim() || undefined,
    status: String(raw.status ?? "").trim() || undefined,
    franchise_id: String(raw.franchise_id ?? raw.franchiseId ?? "").trim() || undefined,
    franchiseId: String(raw.franchiseId ?? raw.franchise_id ?? "").trim() || undefined,
    employee_id: String(raw.employee_id ?? raw.employeeId ?? "").trim() || undefined,
    employeeId: String(raw.employeeId ?? raw.employee_id ?? "").trim() || undefined,
    created_at: String(raw.created_at ?? raw.createdAt ?? "").trim() || undefined,
    createdAt: String(raw.createdAt ?? raw.created_at ?? "").trim() || undefined,
    updated_at: String(raw.updated_at ?? raw.updatedAt ?? "").trim() || undefined,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? "").trim() || undefined,
  };
}

export function chatLastMessagePreview(chat: ChatRecordModel): string {
  const lm = chat.lastMessage ?? chat.last_message;
  if (!lm) return "";
  const raw = typeof lm === "string" ? lm : String(lm.content ?? "").trim();
  return raw.replace(/\s+/g, " ").trim();
}

/** ISO timestamp for inbox list time (last message, else chat updatedAt). */
export function chatLastMessageAtIso(chat: ChatRecordModel): string | undefined {
  const lm = chat.lastMessage ?? chat.last_message;
  if (lm && typeof lm === "object") {
    const created = String(lm.createdAt ?? lm.updatedAt ?? "").trim();
    if (created) return created;
  }
  const updated = String(chat.updatedAt ?? "").trim();
  return updated || undefined;
}

export function chatParticipantUserIds(chat: ChatRecordModel): string[] {
  const ids = new Set<string>();
  for (const user of chat.participantUsers ?? []) {
    const id = String(user._id ?? "").trim();
    if (id) ids.add(id);
  }
  for (const participant of chat.participants ?? []) {
    const id = String(participant ?? "").trim();
    if (id) ids.add(id);
  }
  const assignedTo = String(chat.assignedTo ?? chat.assignedToUser?._id ?? "").trim();
  if (assignedTo) ids.add(assignedTo);
  return Array.from(ids);
}

/** Customer display name from participant list (type 4) or first non-employee. */
export function chatCustomerDisplayName(chat: ChatRecordModel): string {
  const users = chat.participantUsers ?? [];
  const customer =
    users.find((u) => Number(u.type) === 4) ||
    users.find((u) => u.role === "customer") ||
    users[0];
  return customer?.name || "Customer";
}

export function chatHasAssignedEmployee(chat: ChatRecordModel): boolean {
  return Boolean(chatAssignedFranchiseEmployee(chat));
}

/** Assigned handler only when they are a franchise employee (type 3), not franchise admin. */
export function chatAssignedFranchiseEmployee(
  chat: ChatRecordModel
): ChatUserDisplay | undefined {
  const assigneeId = String(
    chat.assignedTo ?? chat.assignedToUser?._id ?? ""
  ).trim();
  if (!assigneeId) return undefined;

  const assignee =
    chat.assignedToUser?._id === assigneeId
      ? chat.assignedToUser
      : chat.participantUsers?.find((user) => user._id === assigneeId);

  if (!assignee) return undefined;

  const type = Number(assignee.type);
  const role = String(assignee.role ?? "").toLowerCase();
  if (type === FRANCHISE_EMPLOYEE_USER_TYPE || role === "employee") {
    return assignee;
  }

  return undefined;
}

export function chatEmployeeDisplayName(chat: ChatRecordModel): string {
  const employee = chatAssignedFranchiseEmployee(chat);
  if (!employee) return "";
  return employee.name || chat.assignedToUser?.name || "Employee";
}

/** Apply assignee immediately after transfer (before GET /chat/:id catches up). */
export function chatWithAssignee(
  chat: ChatRecordModel,
  assigneeId: string,
  assigneeLabel?: string
): ChatRecordModel {
  const id = String(assigneeId ?? "").trim();
  if (!id) return chat;

  const fromParticipants = chat.participantUsers?.find((user) => user._id === id);
  const assignedToUser: ChatUserDisplay =
    fromParticipants ??
    (chat.assignedToUser?._id === id
      ? chat.assignedToUser
      : {
          _id: id,
          name: assigneeLabel ?? chat.assignedToUser?.name ?? "Handler",
        });

  return { ...chat, assignedTo: id, assignedToUser };
}

/** Mongo order id from inbox `context.orderId` or legacy root fields. */
export function chatLinkedOrderId(chat: ChatRecordModel): string {
  return String(
    chat.context?.orderId ?? chat.orderId ?? chat.order_id ?? ""
  ).trim();
}

/** Business order id from inbox `context.orderUniqueId` (e.g. O1042). */
export function chatLinkedOrderUniqueId(chat: ChatRecordModel): string {
  return String(chat.context?.orderUniqueId ?? "").trim();
}

/** Business dispute id from chat context (e.g. D1002). */
export function chatLinkedDisputeUniqueId(chat: ChatRecordModel): string {
  return String(chat.context?.disputeUniqueId ?? "").trim();
}

export function chatLinkedDisputeId(chat: ChatRecordModel): string {
  return String(chat.context?.disputeId ?? "").trim();
}

export function chatLinkedQuoteId(chat: ChatRecordModel): string {
  return String(
    chat.context?.quoteId ?? chat.quoteId ?? chat.quote_id ?? ""
  ).trim();
}

const FRANCHISE_ADMIN_USER_TYPE = 1;
const FRANCHISE_EMPLOYEE_USER_TYPE = 3;

function franchiseIdFromParticipant(user: ChatUserDisplay): string {
  return String(user.franchiseId ?? user.franchise_id ?? "").trim();
}

function isFranchiseStaffParticipant(user: ChatUserDisplay): boolean {
  const type = Number(user.type);
  const role = String(user.role ?? "").toLowerCase();
  return (
    type === FRANCHISE_ADMIN_USER_TYPE ||
    type === FRANCHISE_EMPLOYEE_USER_TYPE ||
    role === "admin" ||
    role === "franchise_admin" ||
    role === "employee"
  );
}

/** Franchise id for inbox filtering — direct field, assignee, or staff participants. */
export function chatLinkedFranchiseId(chat: ChatRecordModel): string {
  const direct = String(chat.franchiseId ?? chat.franchise_id ?? "").trim();
  if (direct) return direct;

  const assigneeFranchise = String(
    chat.assignedToUser?.franchiseId ?? chat.assignedToUser?.franchise_id ?? ""
  ).trim();
  if (assigneeFranchise) return assigneeFranchise;

  for (const user of chat.participantUsers ?? []) {
    if (!isFranchiseStaffParticipant(user)) continue;
    const franchiseId = franchiseIdFromParticipant(user);
    if (franchiseId) return franchiseId;
  }

  const adminRoleIds = new Set(
    (chat.roles ?? [])
      .filter((entry) => String(entry.role ?? "").toLowerCase() === "admin")
      .map((entry) => String(entry.userId ?? "").trim())
      .filter(Boolean)
  );

  if (adminRoleIds.size > 0) {
    for (const user of chat.participantUsers ?? []) {
      if (!adminRoleIds.has(user._id)) continue;
      const franchiseId = franchiseIdFromParticipant(user);
      if (franchiseId) return franchiseId;
    }
  }

  return "";
}
