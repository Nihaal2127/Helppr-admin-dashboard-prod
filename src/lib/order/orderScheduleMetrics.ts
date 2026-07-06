/**
 * Order edit schedule metrics — duplicated from quoteService to avoid
 * orders.ts → quoteService → … → franchiseService circular imports.
 */
import {
  ceilWholeDaysInclusive,
  ceilWholeHoursBetweenHHmm,
  scheduleTotalWorkHours,
} from "../quote/scheduleBillingDuration";

export type OrderServiceScheduleMode = "single" | "range" | "hourly";

export type OrderScheduleMetrics = {
  from_date: string;
  to_date: string;
  work_start_time: string;
  work_end_time: string;
  work_hours_per_day: number;
  days: number;
  total_work_hours: number;
};

function str(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "undefined" || s === "null" || s === "[object Object]" ? "" : s;
}

/** API top-level dates: `YYYY-MM-DD` (accepts ISO datetime strings). */
export function normalizeOrderApiDateYmd(value: unknown): string {
  const t = str(value);
  if (!t) return "";
  if (t.length >= 10 && t[4] === "-") return t.slice(0, 10);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Wall-clock HH:mm from schedule storage / API ISO (`2000-01-01T11:23:00.000Z`). */
function timeStorageToHHmm(storage: string | null | undefined): string {
  const t = str(storage);
  if (!t) return "09:00";
  const isoM = t.match(/T(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?Z?$/i);
  if (isoM) {
    return `${pad2(parseInt(isoM[1], 10))}:${pad2(parseInt(isoM[2], 10))}`;
  }
  const m24 = t.match(/^(\d{1,2}):(\d{2})/);
  if (m24) {
    return `${pad2(parseInt(m24[1], 10))}:${pad2(parseInt(m24[2], 10))}`;
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "09:00";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function deriveOrderScheduleMetrics(input: {
  scheduleMode: OrderServiceScheduleMode;
  requested_date: string;
  requested_date_to: string;
  requested_time: string;
  requested_time_from: string;
  requested_time_to: string;
}): OrderScheduleMetrics | null {
  const from_date = normalizeOrderApiDateYmd(input.requested_date);
  if (!from_date) return null;

  let to_date =
    normalizeOrderApiDateYmd(input.requested_date_to) || from_date;
  if (input.scheduleMode === "range") {
    to_date = normalizeOrderApiDateYmd(input.requested_date_to) || from_date;
  } else {
    to_date = from_date;
  }

  let work_start_time = "09:00";
  let work_end_time = "17:00";
  if (input.scheduleMode === "hourly") {
    work_start_time = timeStorageToHHmm(input.requested_time_from);
    work_end_time = timeStorageToHHmm(input.requested_time_to);
  } else if (input.scheduleMode === "range") {
    const wf = str(input.requested_time_from);
    const wt = str(input.requested_time_to);
    if (wf && wt) {
      work_start_time = timeStorageToHHmm(wf);
      work_end_time = timeStorageToHHmm(wt);
    } else {
      work_start_time = timeStorageToHHmm(input.requested_time);
      const [h, m] = work_start_time.split(":").map((x) => parseInt(x, 10));
      const endH = Math.min(23, (h || 9) + 2);
      work_end_time = `${pad2(endH)}:${pad2(m || 0)}`;
    }
  } else if (input.scheduleMode === "single") {
    const wf = str(input.requested_time_from);
    const wt = str(input.requested_time_to);
    if (wf && wt) {
      work_start_time = timeStorageToHHmm(wf);
      work_end_time = timeStorageToHHmm(wt);
    } else {
      work_start_time = timeStorageToHHmm(input.requested_time);
      const [h, m] = work_start_time.split(":").map((x) => parseInt(x, 10));
      const endH = Math.min(23, (h || 9) + 2);
      work_end_time = `${pad2(endH)}:${pad2(m || 0)}`;
    }
  } else {
    work_start_time = timeStorageToHHmm(input.requested_time_from);
    work_end_time = timeStorageToHHmm(input.requested_time_to);
  }

  const work_hours_per_day = ceilWholeHoursBetweenHHmm(
    work_start_time,
    work_end_time
  );
  const days = ceilWholeDaysInclusive(from_date, to_date);
  const total_work_hours = scheduleTotalWorkHours(work_hours_per_day, days);
  return {
    from_date,
    to_date,
    work_start_time,
    work_end_time,
    work_hours_per_day,
    days,
    total_work_hours,
  };
}
