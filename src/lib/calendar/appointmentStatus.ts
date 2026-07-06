/** API slugs from `GET /api/appointment/getAll` (`status` query + record field). */
export type AppointmentStatusApi =
  | "scheduled"
  | "in-progress"
  | "completed"
  | "cancelled";

export type AppointmentStatusLabel =
  | "Scheduled"
  | "In progress"
  | "Completed"
  | "Canceled";

export const APPOINTMENT_STATUS_FILTER_OPTIONS: {
  value: "All" | AppointmentStatusLabel;
  label: string;
}[] = [
  { value: "All", label: "All" },
  { value: "Scheduled", label: "Scheduled" },
  { value: "In progress", label: "In progress" },
  { value: "Completed", label: "Completed" },
  { value: "Canceled", label: "Canceled" },
];

export const APPOINTMENT_STATUS_FORM_OPTIONS: {
  value: AppointmentStatusLabel;
  label: string;
}[] = [
  { value: "Scheduled", label: "Scheduled" },
  { value: "In progress", label: "In progress" },
  { value: "Completed", label: "Completed" },
  { value: "Canceled", label: "Canceled" },
];

function normalizeStatusToken(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

export function appointmentStatusToLabel(
  status: string | null | undefined
): AppointmentStatusLabel {
  const s = normalizeStatusToken(status ?? "");
  if (s === "scheduled") return "Scheduled";
  if (s === "in-progress") return "In progress";
  if (s === "completed") return "Completed";
  if (s === "cancelled" || s === "canceled") return "Canceled";
  return "Scheduled";
}

export function appointmentStatusLabelToApi(
  label: "All" | AppointmentStatusLabel
): AppointmentStatusApi | undefined {
  if (label === "All") return undefined;
  if (label === "Scheduled") return "scheduled";
  if (label === "In progress") return "in-progress";
  if (label === "Completed") return "completed";
  return "cancelled";
}

export function appointmentStatusToCssClass(
  status: string | null | undefined
): string {
  const s = normalizeStatusToken(status ?? "scheduled");
  if (s === "in-progress") return "calendar-event--in-progress";
  if (s === "completed") return "calendar-event--completed";
  if (s === "cancelled" || s === "canceled") return "calendar-event--cancelled";
  return "calendar-event--scheduled";
}
