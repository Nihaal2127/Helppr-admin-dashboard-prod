import {
  NotificationFilters,
  NotificationModel,
  NotificationModule,
} from "../lib/models/NotificationModel";
import { notificationsMockSeed } from "../mockData/notificationMockData";

let mockNotifications: NotificationModel[] = notificationsMockSeed.map(
  (item, index) => ({
    ...item,
    id: `${Date.now()}-notification-${index}`,
    createdAt: new Date(Date.now() - index * 60_000).toISOString(),
  })
);

const readAll = (): NotificationModel[] => [...mockNotifications];

const saveAll = (items: NotificationModel[]) => {
  mockNotifications = [...items];
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("notifications-updated"));
  }
};

const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const seedNotificationData = () => {
  const existing = readAll();
  if (existing.length > 0) return;

  const now = Date.now();
  const sample: NotificationModel[] = notificationsMockSeed.map(
    (item, index) => ({
      ...item,
      id: generateId(),
      createdAt: new Date(now - index * 60_000).toISOString(),
    })
  );

  saveAll(sample);
};

export const fetchNotifications = (
  filters: NotificationFilters = {}
): NotificationModel[] => {
  const { keyword = "", module = "all", status = "all" } = filters;
  const normalizedKeyword = keyword.trim().toLowerCase();

  return readAll()
    .filter((item) => {
      const matchesKeyword =
        !normalizedKeyword ||
        item.title.toLowerCase().includes(normalizedKeyword) ||
        item.message.toLowerCase().includes(normalizedKeyword) ||
        (item.referenceId || "").toLowerCase().includes(normalizedKeyword);
      const matchesModule = module === "all" || item.module === module;
      const matchesStatus = status === "all" || item.status === status;
      return matchesKeyword && matchesModule && matchesStatus;
    })
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
};

export const addNotification = (
  payload: Omit<NotificationModel, "id" | "createdAt" | "status"> & {
    status?: NotificationModel["status"];
  }
) => {
  const all = readAll();
  const item: NotificationModel = {
    ...payload,
    id: generateId(),
    createdAt: new Date().toISOString(),
    status: payload.status || "unread",
  };
  saveAll([item, ...all]);
  return item;
};

export const markNotificationAsRead = (id: string) => {
  const updated = readAll().map((item) =>
    item.id === id ? { ...item, status: "read" as const } : item
  );
  saveAll(updated);
};

export const markAllNotificationsAsRead = () => {
  const updated = readAll().map((item) => ({
    ...item,
    status: "read" as const,
  }));
  saveAll(updated);
};

export const getUnreadNotificationCount = (): number => {
  return readAll().filter((item) => item.status === "unread").length;
};

export const fetchRecentNotifications = (limit = 8): NotificationModel[] => {
  return readAll()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, limit);
};

const inferModule = (eventType?: string): NotificationModule => {
  const value = (eventType || "").toLowerCase();
  if (value.includes("order")) return "order";
  if (value.includes("quote")) return "quote";
  if (value.includes("payment") || value.includes("payout")) return "payment";
  if (value.includes("partner")) return "partner";
  if (value.includes("ticket") || value.includes("dispute")) return "ticket";
  if (value.includes("chat") || value.includes("message")) return "chat";
  if (value.includes("user")) return "user";
  return "order";
};

export const storeForegroundNotification = (payload: any) => {
  const title = payload?.notification?.title || "Notification";
  const message = payload?.notification?.body || "You received a new update.";
  const eventType =
    payload?.data?.eventType || payload?.data?.type || "general";
  const module = inferModule(eventType);

  addNotification({
    title,
    message,
    module,
    eventType,
    audience: "all",
    referenceId: payload?.data?.referenceId,
  });
};
