import { fetchOrderById } from "../../lib/order/orders";
import {
  franchiseIdForApiQuery,
  readHeaderFranchisePreference,
  sessionMayUseFranchiseIdApiFilter,
} from "../franchise/headerFranchisePreference";
import { fetchUserById } from "../../services/userService";
import {
  ChatRecordModel,
  chatLinkedFranchiseId,
  chatLinkedOrderId,
} from "../models/ChatModel";

const userFranchiseCache = new Map<string, string>();
const orderFranchiseCache = new Map<string, string>();

const ENRICH_CONCURRENCY = 4;

/** Super admin/staff with a specific franchise selected in the header. */
export function shouldEnrichChatFranchiseIds(): boolean {
  if (!sessionMayUseFranchiseIdApiFilter()) return false;
  return Boolean(franchiseIdForApiQuery(readHeaderFranchisePreference()));
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  if (!tasks.length) return [];
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function assigneeUserId(chat: ChatRecordModel): string {
  return String(chat.assignedTo ?? chat.assignedToUser?._id ?? "").trim();
}

function orderIdsNeedingFranchise(chats: ChatRecordModel[]): string[] {
  const ids = new Set<string>();
  for (const chat of chats) {
    if (chatLinkedFranchiseId(chat)) continue;
    const orderId = chatLinkedOrderId(chat);
    if (orderId && !orderFranchiseCache.has(orderId)) {
      ids.add(orderId);
    }
  }
  return Array.from(ids);
}

async function resolveUserFranchiseId(userId: string): Promise<string> {
  const cached = userFranchiseCache.get(userId);
  if (cached) return cached;

  const res = await fetchUserById(userId);
  const rawFranchise = res.user?.franchise_id;
  const fid = String(
    typeof rawFranchise === "string"
      ? rawFranchise
      : rawFranchise?._id ?? ""
  ).trim();
  if (fid) userFranchiseCache.set(userId, fid);
  return fid;
}

async function resolveOrderFranchiseId(orderId: string): Promise<string> {
  const cached = orderFranchiseCache.get(orderId);
  if (cached) return cached;

  const res = await fetchOrderById(orderId, { skipLoader: true });
  const order = res.order as { franchise_id?: string; franchiseId?: string } | null;
  const fid = String(order?.franchise_id ?? order?.franchiseId ?? "").trim();
  if (fid) orderFranchiseCache.set(orderId, fid);
  return fid;
}

function attachFranchiseId(
  chat: ChatRecordModel,
  franchiseId: string
): ChatRecordModel {
  return { ...chat, franchiseId, franchise_id: franchiseId };
}

function franchiseIdFromCaches(chat: ChatRecordModel): string {
  const assignedTo = assigneeUserId(chat);
  if (assignedTo) {
    const fromAssignee = userFranchiseCache.get(assignedTo);
    if (fromAssignee) return fromAssignee;
  }

  const orderId = chatLinkedOrderId(chat);
  if (orderId) {
    const fromOrder = orderFranchiseCache.get(orderId);
    if (fromOrder) return fromOrder;
  }

  return "";
}

/** Full franchise id for filtering (sync fields + populated caches). */
export function resolveChatFranchiseId(chat: ChatRecordModel): string {
  const direct = chatLinkedFranchiseId(chat);
  if (direct) return direct;
  return franchiseIdFromCaches(chat);
}

/** Re-apply cached franchise ids after socket updates (no network). */
export function enrichChatFranchiseFromCache(
  chat: ChatRecordModel
): ChatRecordModel {
  const existing = resolveChatFranchiseId(chat);
  if (!existing) return chat;
  return attachFranchiseId(chat, existing);
}

/** Resolve missing chat franchise ids via assignee and linked orders (super admin filter only). */
export async function enrichChatInboxFranchiseIds(
  chats: ChatRecordModel[]
): Promise<ChatRecordModel[]> {
  if (!shouldEnrichChatFranchiseIds()) {
    return chats.map(enrichChatFranchiseFromCache);
  }

  const userIdsToResolve = new Set<string>();

  for (const chat of chats) {
    if (chatLinkedFranchiseId(chat)) continue;
    const userId = assigneeUserId(chat);
    if (userId && !userFranchiseCache.has(userId)) {
      userIdsToResolve.add(userId);
    }
  }

  const orderIdsToResolve = orderIdsNeedingFranchise(chats);

  const userTasks = Array.from(userIdsToResolve).map(
    (userId) => () => resolveUserFranchiseId(userId)
  );
  const orderTasks = orderIdsToResolve.map(
    (orderId) => () => resolveOrderFranchiseId(orderId)
  );

  await runWithConcurrency(
    [...userTasks, ...orderTasks],
    ENRICH_CONCURRENCY
  );

  return chats.map((chat) => {
    const franchiseId = resolveChatFranchiseId(chat);
    if (!franchiseId) return chat;
    return attachFranchiseId(chat, franchiseId);
  });
}
