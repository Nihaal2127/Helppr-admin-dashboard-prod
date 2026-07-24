/** Date formatting helpers (kept separate from `utility.tsx` to avoid circular imports with `orders.ts`). */

/** `YYYY-MM-DD` from a local calendar `Date` (never use `toISOString()` — UTC shifts the day in IST). */
export function dateToLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's calendar date in the user's local timezone as `YYYY-MM-DD`. */
export function todayLocalYmd(): string {
  return dateToLocalYmd(new Date());
}

/**
 * Normalize API / form date strings to `YYYY-MM-DD` without UTC day shift.
 * Already-ISO calendar dates pass through; other parseable values use local fields.
 */
export function normalizeCalendarYmd(
  value?: string | null
): string | undefined {
  const s = String(value ?? "").trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return dateToLocalYmd(d);
}

function parseDisplayDate(isoString: string): Date {
  const s = String(isoString ?? "").trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) {
    return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  }
  return new Date(s);
}

export const formatDate = (isoString: string): string => {
  const date = parseDisplayDate(isoString);
  if (isNaN(date.getTime())) {
    return "-";
  }

  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "short" });
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
};

/** Local date + time, e.g. `8-jul-2026, 6:30PM`. */
export const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    return "—";
  }

  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "short" }).toLowerCase();
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${day}-${month}-${year}, ${hours}:${minutes}${period}`;
};
