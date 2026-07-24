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
const orderFranchiseInflight = new Map<string, Promise<string>>();

const FRANCHISE_UNRESOLVED = "__unresolved__";

const ENRICH_CONCURRENCY = 4;

function refIdLoose(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    return String(row._id ?? row.id ?? "").trim();
  }
  return String(value).trim();
}

function cachedFranchiseId(cache: Map<string, string>, key: string): string {
  const cached = cache.get(key);
  if (cached === undefined || cached === FRANCHISE_UNRESOLVED) return "";
  return cached;
}

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

    const assignee = assigneeUserId(chat);
    if (assignee && cachedFranchiseId(userFranchiseCache, assignee)) continue;

    const orderId = chatLinkedOrderId(chat);
    if (orderId && !orderFranchiseCache.has(orderId)) {
      ids.add(orderId);
    }
  }
  return Array.from(ids);
}

async function resolveUserFranchiseId(userId: string): Promise<string> {
  const uid = String(userId ?? "").trim();
  if (!uid) return "";
  if (userFranchiseCache.has(uid)) {
    return cachedFranchiseId(userFranchiseCache, uid);
  }

  try {
    const res = await fetchUserById(uid);
    const fid = refIdLoose(res.user?.franchise_id);
    userFranchiseCache.set(uid, fid || FRANCHISE_UNRESOLVED);
    return fid;
  } catch {
    userFranchiseCache.set(uid, FRANCHISE_UNRESOLVED);
    return "";
  }
}

async function resolveOrderFranchiseId(orderId: string): Promise<string> {
  const id = String(orderId ?? "").trim();
  if (!id) return "";
  if (orderFranchiseCache.has(id)) {
    return cachedFranchiseId(orderFranchiseCache, id);
  }

  const inflight = orderFranchiseInflight.get(id);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const res = await fetchOrderById(id, { skipLoader: true });
      const order = res.order as Record<string, unknown> | null;
      const fid =
        refIdLoose(order?.franchise_id) || refIdLoose(order?.franchiseId) || "";
      orderFranchiseCache.set(id, fid || FRANCHISE_UNRESOLVED);
      return fid;
    } catch {
      orderFranchiseCache.set(id, FRANCHISE_UNRESOLVED);
      return "";
    } finally {
      orderFranchiseInflight.delete(id);
    }
  })();

  orderFranchiseInflight.set(id, task);
  return task;
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
    const fromAssignee = cachedFranchiseId(userFranchiseCache, assignedTo);
    if (fromAssignee) return fromAssignee;
  }

  const orderId = chatLinkedOrderId(chat);
  if (orderId) {
    const fromOrder = cachedFranchiseId(orderFranchiseCache, orderId);
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

  if (userIdsToResolve.size > 0) {
    await runWithConcurrency(
      Array.from(userIdsToResolve).map(
        (userId) => () => resolveUserFranchiseId(userId)
      ),
      ENRICH_CONCURRENCY
    );
  }

  const orderIdsToResolve = orderIdsNeedingFranchise(chats);
  if (orderIdsToResolve.length > 0) {
    await runWithConcurrency(
      orderIdsToResolve.map((orderId) => () => resolveOrderFranchiseId(orderId)),
      ENRICH_CONCURRENCY
    );
  }

  return chats.map((chat) => {
    const franchiseId = resolveChatFranchiseId(chat);
    if (!franchiseId) return chat;
    return attachFranchiseId(chat, franchiseId);
  });
}
