export type NotificationModule =
  | "order"
  | "quote"
  | "payment"
  | "user"
  | "partner"
  | "ticket"
  | "chat";

export type NotificationStatus = "unread" | "read";

export interface NotificationModel {
  id: string;
  title: string;
  message: string;
  module: NotificationModule;
  eventType: string;
  status: NotificationStatus;
  audience: "user" | "partner" | "admin" | "all";
  referenceId?: string;
  createdAt: string;
}

export interface NotificationFilters {
  keyword?: string;
  module?: NotificationModule | "all";
  status?: NotificationStatus | "all";
}
