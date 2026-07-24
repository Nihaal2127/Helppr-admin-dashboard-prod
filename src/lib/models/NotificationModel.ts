/** API inbox categories (Postman §30 + common backend extras). */
export type NotificationCategory =
  | "order"
  | "quote"
  | "subscription"
  | "wallet"
  | "ticket"
  | "chat"
  | "system"
  | "reminder"
  | "admin"
  | "user"
  | "partner"
  | "category"
  | "expense";

/** @deprecated Use NotificationCategory */
export type NotificationModule = NotificationCategory;

export type NotificationStatus = "unread" | "read";

export type NotificationEntityType =
  | "quote"
  | "order"
  | "ticket"
  | "chat"
  | "subscription"
  | "wallet"
  | string;

export interface NotificationEntity {
  type: NotificationEntityType;
  id: string;
}

export interface NotificationModel {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  /** @deprecated Use category */
  module: NotificationCategory;
  event: string;
  /** @deprecated Use event */
  eventType: string;
  status: NotificationStatus;
  franchiseId?: string;
  referenceId?: string;
  createdAt: string;
  readAt?: string | null;
  entity?: NotificationEntity;
  metadata?: Record<string, unknown>;
}

export interface NotificationListFilters {
  is_read?: boolean;
  category?: NotificationCategory | "all";
  event?: string;
  from_date?: string;
  to_date?: string;
  franchise_id?: string | null;
}

export interface NotificationFilters {
  keyword?: string;
  category?: NotificationCategory | "all";
  /** @deprecated Use category */
  module?: NotificationCategory | "all";
  status?: NotificationStatus | "all";
  fromDate?: string;
  toDate?: string;
  franchiseId?: string | null;
  event?: string;
}

export interface NotificationListResult {
  records: NotificationModel[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  unreadCount: number;
}
