import { DisputeRecordModel } from "../models/ChatModel";
import { TicketModel } from "../models/TicketModel";

export type DisputeStatusUi = "open" | "pending" | "closed";

export type DisputeApiStatus = "open" | "in_review" | "resolved" | "closed" | string;

/** Legacy ticket composite status (support tickets). */
export function ticketToDisputeStatusUi(t: TicketModel | null): DisputeStatusUi {
  if (!t || Number(t.status) !== 1) return "closed";
  if (Number(t.resolve_status) === 1) return "pending";
  return "open";
}

export function disputeApiStatusLabel(status?: DisputeApiStatus): string {
  const s = String(status ?? "").toLowerCase();
  switch (s) {
    case "open":
      return "Open";
    case "in_review":
      return "In Review";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
    default:
      return status ? String(status) : "-";
  }
}

export function disputeApiStatusToUi(status?: DisputeApiStatus): DisputeStatusUi {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") return "open";
  if (s === "in_review") return "pending";
  return "closed";
}

export function disputeStatusUiToApiStatus(ui: DisputeStatusUi): DisputeApiStatus {
  if (ui === "open") return "open";
  if (ui === "pending") return "in_review";
  return "closed";
}

export function disputeRecordToStatusUi(d: DisputeRecordModel | null): DisputeStatusUi {
  return disputeApiStatusToUi(d?.status);
}

export function isDisputeChatClosed(status?: DisputeApiStatus): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "closed" || s === "resolved";
}

export function disputeStatusUiLabel(ui: DisputeStatusUi): string {
  switch (ui) {
    case "open":
      return "Open";
    case "pending":
      return "Pending";
    case "closed":
      return "Closed";
    default:
      return "-";
  }
}

/** Legacy ticket API fields. */
export function disputeStatusUiToApi(
  ui: DisputeStatusUi,
  ticket: TicketModel | null
): { status: number; resolve_status: number } {
  if (ui === "closed") {
    return {
      status: 2,
      resolve_status: Number(ticket?.resolve_status ?? 1),
    };
  }
  if (ui === "pending") {
    return { status: 1, resolve_status: 1 };
  }
  return { status: 1, resolve_status: 2 };
}

export function contactTypeLabel(v: number | null | undefined): string {
  switch (Number(v)) {
    case 1:
      return "Mail";
    case 2:
      return "Call";
    case 3:
      return "Chat";
    default:
      return "-";
  }
}
