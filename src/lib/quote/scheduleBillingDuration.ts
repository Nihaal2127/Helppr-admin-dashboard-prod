/**
 * Schedule duration for partner rate × time billing.
 * Partial hours or days count as a full unit (ceiling); minutes are not billed fractionally.
 */

/** Whole billable hours between two HH:mm times; any partial hour rounds up. */
export function ceilWholeHoursBetweenHHmm(start: string, end: string): number {
  const [sh, sm] = start.split(":").map((x) => parseInt(x, 10));
  const [eh, em] = end.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(sh) || !Number.isFinite(eh)) return 8;
  const t0 = sh * 60 + (sm || 0);
  const t1 = eh * 60 + (em || 0);
  const diffMinutes = t1 - t0;
  if (!Number.isFinite(diffMinutes) || diffMinutes <= 0) return 1;
  return Math.max(1, Math.ceil(diffMinutes / 60));
}

/** Inclusive calendar days between YMD dates (minimum 1). */
export function ceilWholeDaysInclusive(fromYmd: string, toYmd: string): number {
  const a = new Date(fromYmd + "T12:00:00");
  const b = new Date(toYmd + "T12:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

/** Total billable hours = whole hours per day × whole days (both ceiling-rounded). */
export function scheduleTotalWorkHours(
  wholeHoursPerDay: number,
  wholeDays: number
): number {
  const h = Math.max(1, Math.ceil(wholeHoursPerDay));
  const d = Math.max(1, Math.ceil(wholeDays));
  return h * d;
}
