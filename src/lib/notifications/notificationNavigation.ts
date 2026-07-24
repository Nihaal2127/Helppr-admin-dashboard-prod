import type { NavigateFunction } from "react-router-dom";
import type { NotificationModel } from "../models/NotificationModel";
import type { QuoteTabKey } from "../types/quoteTypes";
import type { QuoteViewData } from "../quote/quoteHelpers";
import {
  normalizeOrderStatusFromApi,
  ORDER_TAB_KEYS,
} from "../order/orders";
import type { OrderTabKey } from "../order/orders";
import { ROUTES } from "../../routes/Routes";
import { markNotificationAsRead } from "../../services/notificationService";
import { getLocalStorage } from "../global/localStorageHelper";
import { AppConstant, UserRole } from "../global/AppConstant";
import {
  isAuthenticatedPathAllowed,
  parseAllowedMenuKeys,
} from "../routes/roleAccess";

const QUOTE_TAB_KEYS: QuoteTabKey[] = [
  "new",
  "pending",
  "accepted",
  "success",
  "failed",
];

function normalizeQuoteTab(raw: unknown): QuoteTabKey | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (QUOTE_TAB_KEYS.includes(s as QuoteTabKey)) {
    return s as QuoteTabKey;
  }
  return null;
}

function parseEntity(raw: unknown): NotificationModel["entity"] | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? row._id ?? "").trim();
  const type = String(row.type ?? "").trim().toLowerCase();
  if (!id || !type) return undefined;
  return { type, id };
}

function parseMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  return raw as Record<string, unknown>;
}

export function parseNotificationEntityFields(raw: Record<string, unknown>): {
  entity?: NotificationModel["entity"];
  metadata?: Record<string, unknown>;
  referenceId?: string;
} {
  const metadata = parseMetadata(raw.metadata);
  const entity = parseEntity(raw.entity);

  const referenceFromMeta =
    metadata?.quote_sequence_id ??
    metadata?.order_unique_id ??
    metadata?.order_id ??
    metadata?.quote_id ??
    metadata?.partner_id ??
    metadata?.user_id ??
    metadata?.expense_id ??
    metadata?.subscription_id;

  const referenceId = String(
    referenceFromMeta ?? raw.reference_id ?? raw.referenceId ?? ""
  ).trim();

  return {
    entity,
    metadata,
    ...(referenceId ? { referenceId } : {}),
  };
}

export function resolveQuoteTab(notification: NotificationModel): QuoteTabKey {
  const fromMeta = normalizeQuoteTab(
    notification.metadata?.new_status ?? notification.metadata?.status
  );
  if (fromMeta) return fromMeta;

  const event = String(notification.event ?? "").toUpperCase();
  if (event.includes("QUOTE_CREATED")) return "new";
  if (event.includes("ACCEPTED")) return "accepted";
  if (event.includes("FAILED")) return "failed";
  if (event.includes("SUCCESS") || event.includes("CONVERT")) return "success";
  if (event.includes("PENDING")) return "pending";

  return "pending";
}

export function resolveOrderTab(notification: NotificationModel): OrderTabKey {
  const meta = notification.metadata ?? {};
  const rawStatus =
    meta.new_status ?? meta.order_status ?? meta.status ?? meta.service_status;
  const normalized = normalizeOrderStatusFromApi(rawStatus);
  if (ORDER_TAB_KEYS.includes(normalized as OrderTabKey)) {
    return normalized as OrderTabKey;
  }

  const event = String(notification.event ?? "").toUpperCase();
  if (event.includes("ORDER_CREATED")) return 2;
  if (event.includes("COMPLETED")) return 3;
  if (event.includes("CANCELLED") || event.includes("CANCELED")) return 4;
  if (event.includes("REFUNDED")) return 5;

  return 2;
}

type ResolvedTarget = { type: string; id: string };

function metaId(
  meta: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const v = String(meta[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function notificationIntentText(notification: NotificationModel): string {
  return [
    notification.event,
    notification.title,
    notification.message,
    notification.category,
    notification.entity?.type,
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
}

function isPartnerVerificationIntent(notification: NotificationModel): boolean {
  const blob = notificationIntentText(notification);
  const event = String(notification.event ?? "").toUpperCase();
  return (
    event.includes("VERIFICATION") ||
    event.includes("DOCUMENT") ||
    (event.includes("PARTNER") && event.includes("VERIF")) ||
    blob.includes("awaiting verification") ||
    blob.includes("partner verification") ||
    blob.includes("waiting for verification") ||
    blob.includes("verification request") ||
    blob.includes("document verification")
  );
}

function isCategoryRequestIntent(notification: NotificationModel): boolean {
  const blob = notificationIntentText(notification);
  const event = String(notification.event ?? "").toUpperCase();
  return (
    event.includes("CATEGORY") ||
    blob.includes("category request") ||
    blob.includes("catalog request") ||
    blob.includes("new category") ||
    String(notification.entity?.type ?? "").toLowerCase() === "category" ||
    String(notification.category ?? "").toLowerCase() === "category"
  );
}

function isServiceRequestIntent(notification: NotificationModel): boolean {
  const blob = notificationIntentText(notification);
  const event = String(notification.event ?? "").toUpperCase();
  return (
    event.includes("SERVICE_REQUEST") ||
    (event.includes("SERVICE") && event.includes("REQUEST")) ||
    blob.includes("service request") ||
    blob.includes("new service") ||
    String(notification.entity?.type ?? "").toLowerCase() === "service"
  );
}

function getSessionRouteContext() {
  const role = getLocalStorage(AppConstant.userRole);
  const allowedMenuKeys = parseAllowedMenuKeys(
    getLocalStorage(AppConstant.userAccessibleMenuKeys)
  );
  return { role, allowedMenuKeys };
}

/** Franchise portal users use My Franchise; super/staff use Service Management when allowed. */
function resolveCatalogRequestPath(
  kind: "category" | "service",
  id?: string
): string {
  const { role, allowedMenuKeys } = getSessionRouteContext();
  const serviceMgmtPath = ROUTES.SERVICE_MANAGEMENT.path;
  const myFranchisePath = ROUTES.MY_FRANCHISE.path;
  const params = new URLSearchParams();
  if (id && id !== "list") params.set("openId", id);

  const canServiceMgmt = isAuthenticatedPathAllowed(
    serviceMgmtPath,
    role,
    allowedMenuKeys
  );
  const canMyFranchise = isAuthenticatedPathAllowed(
    myFranchisePath,
    role,
    allowedMenuKeys
  );

  if (canServiceMgmt) {
    params.set("requested", kind);
    const qs = params.toString();
    return qs ? `${serviceMgmtPath}?${qs}` : serviceMgmtPath;
  }

  if (canMyFranchise) {
    params.set("section", kind === "category" ? "categories" : "services");
    params.set("view", "requested");
    const qs = params.toString();
    return qs ? `${myFranchisePath}?${qs}` : myFranchisePath;
  }

  if (role === UserRole.FRANCHISE_ADMIN || role === UserRole.EMPLOYEE) {
    params.set("section", kind === "category" ? "categories" : "services");
    params.set("view", "requested");
    const qs = params.toString();
    return qs ? `${myFranchisePath}?${qs}` : myFranchisePath;
  }

  params.set("requested", kind);
  const qs = params.toString();
  return qs ? `${serviceMgmtPath}?${qs}` : serviceMgmtPath;
}

function resolvePersonId(notification: NotificationModel): string {
  const meta = notification.metadata ?? {};
  return (
    metaId(
      meta,
      "partner_id",
      "partner_mongo_id",
      "user_id",
      "customer_id",
      "verification_user_id"
    ) || String(notification.entity?.id ?? "").trim()
  );
}

/**
 * Resolve navigation target from event/title/metadata first.
 * Important: backend often sets `entity.type = "user"` for partners too —
 * never trust entity.type alone for verification / partner vs customer.
 */
export function resolveNotificationEntityId(
  notification: NotificationModel
): ResolvedTarget | null {
  const entity = notification.entity;
  const entityType = String(entity?.type ?? "").trim().toLowerCase();
  const entityId = String(entity?.id ?? "").trim();
  const meta = notification.metadata ?? {};
  const event = String(notification.event ?? "").toUpperCase();
  const category = String(notification.category ?? "").toLowerCase();
  const personId = resolvePersonId(notification);

  const quoteId = metaId(meta, "quote_id") || (entityType === "quote" ? entityId : "");
  const looksLikeQuote =
    Boolean(quoteId) ||
    category === "quote" ||
    (event.includes("QUOTE") && !event.includes("CHAT") && !event.includes("CATEGORY"));
  if (looksLikeQuote && quoteId) {
    return { type: "quote", id: quoteId };
  }

  const orderId =
    metaId(meta, "order_mongo_id", "order_id") ||
    (entityType === "order" ? entityId : "");
  const looksLikeOrder =
    Boolean(orderId) ||
    category === "order" ||
    (event.includes("ORDER") && !event.includes("PAYOUT"));
  if (looksLikeOrder && orderId) {
    return { type: "order", id: orderId };
  }

  // Partner verification: entity is usually `{ type: "user", id }` — override to verification modal
  if (isPartnerVerificationIntent(notification) && personId) {
    return { type: "partner_verification", id: personId };
  }
  if (isPartnerVerificationIntent(notification)) {
    return { type: "partner_verification", id: "list" };
  }

  if (isCategoryRequestIntent(notification)) {
    const categoryId =
      metaId(meta, "category_id", "request_id") ||
      (entityType === "category" ? entityId : "") ||
      "list";
    return { type: "category_request", id: categoryId };
  }

  if (isServiceRequestIntent(notification)) {
    const serviceId =
      metaId(meta, "service_id", "request_id") ||
      (entityType === "service" ? entityId : "") ||
      "list";
    return { type: "service_request", id: serviceId };
  }

  const subscriptionId = metaId(
    meta,
    "subscription_id",
    "partner_subscription_id"
  );
  if (
    subscriptionId ||
    category === "subscription" ||
    event.includes("SUBSCRIPTION") ||
    entityType === "subscription"
  ) {
    if (subscriptionId) return { type: "subscription", id: subscriptionId };
    if (personId) return { type: "subscription", id: personId };
    return { type: "subscription", id: "list" };
  }

  const expenseId = metaId(meta, "expense_id") || (entityType === "expense" ? entityId : "");
  if (expenseId || category === "expense" || event.includes("EXPENSE") || entityType === "expense") {
    return { type: "expense", id: expenseId || "list" };
  }

  if (
    category === "wallet" ||
    event.includes("PAYOUT") ||
    event.includes("WALLET") ||
    event.includes("WITHDRAW") ||
    entityType === "wallet" ||
    entityType === "payout"
  ) {
    return {
      type: "wallet",
      id: personId || metaId(meta, "partner_id", "partner_mongo_id") || "list",
    };
  }

  // Explicit partner entity / partner lifecycle (not verification — already handled)
  if (
    entityType === "partner" ||
    (personId &&
      (event.includes("PARTNER") ||
        category.includes("partner") ||
        String(notification.title ?? "").toLowerCase().includes("partner")))
  ) {
    // Avoid treating customer-user events as partner when text clearly says customer/user only
    const blob = notificationIntentText(notification);
    if (
      !blob.includes("customer") ||
      blob.includes("partner") ||
      entityType === "partner"
    ) {
      if (personId) return { type: "partner", id: personId };
    }
  }

  const chatId =
    metaId(meta, "chat_id", "chatId") || (entityType === "chat" ? entityId : "");
  if (
    chatId ||
    category === "chat" ||
    category === "ticket" ||
    event.includes("CHAT") ||
    entityType === "chat"
  ) {
    return { type: "chat", id: chatId || "list" };
  }

  const ticketId =
    metaId(meta, "ticket_id", "dispute_id") ||
    (entityType === "ticket" || entityType === "dispute" ? entityId : "");
  if (
    ticketId ||
    category === "ticket" ||
    event.includes("TICKET") ||
    event.includes("DISPUTE") ||
    entityType === "ticket" ||
    entityType === "dispute"
  ) {
    return { type: "ticket", id: ticketId || "list" };
  }

  const franchiseId =
    metaId(meta, "franchise_id") || (entityType === "franchise" ? entityId : "");
  if (franchiseId && (event.includes("FRANCHISE") || entityType === "franchise")) {
    return { type: "franchise", id: franchiseId };
  }

  // Customer / generic user only after verification & partner intents
  if (
    (entityType === "user" || entityType === "customer") &&
    personId &&
    !isPartnerVerificationIntent(notification)
  ) {
    const blob = notificationIntentText(notification);
    if (blob.includes("partner") && !blob.includes("customer")) {
      return { type: "partner", id: personId };
    }
    return { type: "user", id: personId };
  }

  if (personId && (category.includes("user") || event.includes("CUSTOMER"))) {
    return { type: "user", id: personId };
  }

  // Last resort: use entity as-is when we still have an id
  if (entityId && entityType) {
    return { type: entityType, id: entityId };
  }

  return null;
}

function resolveChatViewPath(notification: NotificationModel, chatId: string): string {
  const event = String(notification.event ?? "").toUpperCase();
  const meta = notification.metadata ?? {};
  const chatType = String(
    meta.chat_type ?? meta.chatType ?? meta.kind ?? ""
  )
    .trim()
    .toLowerCase();

  if (
    chatType.includes("dispute") ||
    event.includes("DISPUTE") ||
    notification.category === "ticket"
  ) {
    const base = ROUTES.TICKET_MANAGEMENT_DISPUTE_CHAT_VIEW.path;
    return chatId && chatId !== "list" ? `${base}?chatId=${encodeURIComponent(chatId)}` : ROUTES.TICKET_MANAGEMENT_DISPUTE_CHAT.path;
  }
  if (chatType.includes("group") || event.includes("GROUP_CHAT")) {
    const base = ROUTES.TICKET_MANAGEMENT_GROUP_CHAT_VIEW.path;
    return chatId && chatId !== "list" ? `${base}?chatId=${encodeURIComponent(chatId)}` : ROUTES.TICKET_MANAGEMENT_GROUP_CHAT.path;
  }
  if (chatType.includes("quote") || event.includes("QUOTE_CHAT")) {
    const base = ROUTES.TICKET_MANAGEMENT_QUOTE_CHAT_VIEW.path;
    return chatId && chatId !== "list" ? `${base}?chatId=${encodeURIComponent(chatId)}` : ROUTES.TICKET_MANAGEMENT_QUOTE_CHAT.path;
  }

  const base = ROUTES.TICKET_MANAGEMENT_NORMAL_CHAT_VIEW.path;
  return chatId && chatId !== "list"
    ? `${base}?chatId=${encodeURIComponent(chatId)}`
    : ROUTES.TICKET_MANAGEMENT_NORMAL_CHAT.path;
}

export function buildNotificationTargetPath(
  notification: NotificationModel
): string | null {
  const target = resolveNotificationEntityId(notification);
  if (!target) {
    // Category-only fallbacks when no id is available
    const category = String(notification.category ?? "").toLowerCase();
    const event = String(notification.event ?? "").toUpperCase();
    if (category === "quote" || event.includes("QUOTE")) {
      return ROUTES.QUOTE_MANAGEMENT.path;
    }
    if (category === "order" || event.includes("ORDER")) {
      return ROUTES.ORDER_MANAGEMENT.path;
    }
    if (category === "subscription" || event.includes("SUBSCRIPTION")) {
      return `${ROUTES.PartnerManagement.path}?section=subscription`;
    }
    if (category === "wallet" || event.includes("PAYOUT") || event.includes("WALLET")) {
      return ROUTES.PARTNER_PAYOUT.path;
    }
    if (category === "ticket" || category === "chat") {
      return ROUTES.TICKET_MANAGEMENT.path;
    }
    if (event.includes("EXPENSE")) {
      return ROUTES.EXPENSES_MANAGEMENT.path;
    }
    if (event.includes("VERIFICATION") || event.includes("DOCUMENT")) {
      return `${ROUTES.USER_MANAGEMENT.path}?tab=verification`;
    }
    if (
      event.includes("CATEGORY") ||
      category === "category" ||
      isCategoryRequestIntent(notification)
    ) {
      return resolveCatalogRequestPath("category");
    }
    if (
      event.includes("SERVICE_REQUEST") ||
      category === "service" ||
      isServiceRequestIntent(notification)
    ) {
      return resolveCatalogRequestPath("service");
    }
    return null;
  }

  const type = target.type.replace(/-/g, "_");
  const id = target.id;

  if (type === "quote") {
    const tab = resolveQuoteTab(notification);
    const params = new URLSearchParams({ tab, openId: id });
    return `${ROUTES.QUOTE_MANAGEMENT.path}?${params.toString()}`;
  }

  if (type === "order") {
    const tab = resolveOrderTab(notification);
    const params = new URLSearchParams({
      tab: String(tab),
      openId: id,
    });
    return `${ROUTES.ORDER_MANAGEMENT.path}?${params.toString()}`;
  }

  if (
    type === "partner_verification" ||
    type === "verification" ||
    type === "partner_document" ||
    type === "document_verification"
  ) {
    const params = new URLSearchParams({ tab: "verification" });
    if (id && id !== "list") params.set("openId", id);
    return `${ROUTES.USER_MANAGEMENT.path}?${params.toString()}`;
  }

  if (type === "partner" || type === "partner_user") {
    const params = new URLSearchParams({ tab: "partner" });
    if (id && id !== "list") params.set("openId", id);
    return `${ROUTES.USER_MANAGEMENT.path}?${params.toString()}`;
  }

  if (type === "user" || type === "customer") {
    const params = new URLSearchParams({ tab: "user" });
    if (id && id !== "list") params.set("openId", id);
    return `${ROUTES.USER_MANAGEMENT.path}?${params.toString()}`;
  }

  if (type === "category_request" || type === "category") {
    return resolveCatalogRequestPath("category", id);
  }

  if (type === "service_request" || type === "service") {
    return resolveCatalogRequestPath("service", id);
  }

  if (type === "subscription" || type === "partner_subscription") {
    return `${ROUTES.PartnerManagement.path}?section=subscription`;
  }

  if (type === "portfolio" || type === "partner_portfolio") {
    return `${ROUTES.PartnerManagement.path}?section=portfolio`;
  }

  if (type === "partner_post" || type === "post") {
    return `${ROUTES.PartnerManagement.path}?section=post`;
  }

  if (type === "expense") {
    return ROUTES.EXPENSES_MANAGEMENT.path;
  }

  if (type === "wallet" || type === "payout" || type === "partner_payout") {
    if (id && id !== "list") {
      return `${ROUTES.PARTNER_PAYOUT_SHOW.path}?id=${encodeURIComponent(id)}`;
    }
    return ROUTES.PARTNER_PAYOUT.path;
  }

  if (type === "chat") {
    return resolveChatViewPath(notification, id);
  }

  if (type === "ticket" || type === "dispute") {
    if (id && id !== "list") {
      return `${ROUTES.TICKET_MANAGEMENT_DISPUTE_CHAT_VIEW.path}?chatId=${encodeURIComponent(id)}`;
    }
    return ROUTES.TICKET_MANAGEMENT_DISPUTE_CHAT.path;
  }

  if (type === "franchise") {
    return ROUTES.FRANCHISE_MANAGEMENT.path;
  }

  if (type === "calendar" || type === "appointment") {
    return ROUTES.CALENDAR_PAGE.path;
  }

  return null;
}

export function quoteViewDataStub(
  mongoId: string,
  status = ""
): QuoteViewData {
  return {
    _id: mongoId,
    quote_id: mongoId,
    status,
    requested_services: "",
    requested_partner: "",
    user_name: "",
    requested_date: "",
    requested_time: "",
    door_no: "",
    street: "",
    city: "",
  };
}

export function openQuoteFromNotification(
  quoteMongoId: string,
  tab: QuoteTabKey,
  onRefresh?: () => void
): void {
  void import("../../pages/quoteManagement/QuoteInfoDialog").then(
    ({ default: QuoteInfoDialog }) => {
      QuoteInfoDialog.show(quoteViewDataStub(quoteMongoId, tab), onRefresh);
    }
  );
}

export function openOrderFromNotification(
  orderMongoId: string,
  onRefresh?: () => void
): void {
  void import("../../components/order/showOrderInfoDialog").then(
    ({ showOrderInfoDialog }) => {
      showOrderInfoDialog(orderMongoId, onRefresh ?? (() => undefined));
    }
  );
}

export async function activateNotification(
  notification: NotificationModel,
  navigate: NavigateFunction
): Promise<void> {
  if (notification.status === "unread") {
    await markNotificationAsRead(notification.id);
  }

  const path = buildNotificationTargetPath(notification);
  if (path) {
    navigate(path);
  }
}
