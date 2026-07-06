import { AppConstant, UserRole } from "../global/AppConstant";
import { getLocalStorage } from "../global/localStorageHelper";
import { ChatRecordModel } from "../models/ChatModel";

export type ChatPermissionKind = "general" | "group" | "dispute";

function sessionUserId(): string {
  return String(getLocalStorage(AppConstant.createdById) ?? "").trim();
}

function sessionUserRole(): string {
  return String(getLocalStorage(AppConstant.userRole) ?? "").trim();
}

/** Super admin or staff — inbox/thread access is view-only on web. */
export function isViewOnlyStaffSession(role = sessionUserRole()): boolean {
  return role === UserRole.ADMIN || role === UserRole.STAFF;
}

export function isFranchiseAdminSession(role = sessionUserRole()): boolean {
  return role === UserRole.FRANCHISE_ADMIN;
}

export function isFranchiseEmployeeSession(role = sessionUserRole()): boolean {
  return role === UserRole.EMPLOYEE;
}

export function isAssignedChatHandler(
  chat: ChatRecordModel,
  userId = sessionUserId()
): boolean {
  const assignedTo = String(
    chat.assignedTo ?? chat.assignedToUser?._id ?? ""
  ).trim();
  return Boolean(userId && assignedTo && userId === assignedTo);
}

/**
 * Who may open the transfer modal (web):
 * - Franchise admin — can hand off to self or another employee in franchise
 * - Assigned employee — can reassign while they are the handler
 * - Super admin / staff — view only (no transfer)
 */
export function canStaffTransferChat(
  chat: ChatRecordModel | null,
  _chatKind?: ChatPermissionKind
): boolean {
  if (!chat) return false;
  const userId = sessionUserId();
  if (!userId) return false;
  if (isViewOnlyStaffSession()) return false;
  if (isFranchiseAdminSession()) return true;
  return isAssignedChatHandler(chat, userId);
}

/**
 * Who may send messages from the web dashboard:
 * - Super admin / staff — view only (all chat types)
 * - Franchise admin / employee — only while assigned as handler (`assignedTo`)
 */
export function canStaffSendChatMessages(
  chat: ChatRecordModel | null,
  _chatKind: ChatPermissionKind,
  externallyDisabled = false
): boolean {
  if (externallyDisabled) return false;
  const userId = sessionUserId();
  if (!userId) return false;
  if (isViewOnlyStaffSession()) return false;
  if (!chat) return false;
  return isAssignedChatHandler(chat, userId);
}

/**
 * Who may close a chat via PATCH status (franchise admin or assigned employee).
 */
function canStaffManageChatStatus(chat: ChatRecordModel | null): boolean {
  if (!chat) return false;
  const userId = sessionUserId();
  if (!userId) return false;
  if (isViewOnlyStaffSession()) return false;
  if (isFranchiseAdminSession()) return true;
  if (isFranchiseEmployeeSession()) return isAssignedChatHandler(chat, userId);
  return false;
}

export function canStaffCloseChat(chat: ChatRecordModel | null): boolean {
  if (!canStaffManageChatStatus(chat)) return false;
  return String(chat?.status ?? "").trim().toLowerCase() !== "closed";
}

/** Who may reopen a closed chat (same roles as close). */
export function canStaffReopenChat(chat: ChatRecordModel | null): boolean {
  if (!canStaffManageChatStatus(chat)) return false;
  return String(chat?.status ?? "").trim().toLowerCase() === "closed";
}
