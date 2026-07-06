/** Parse API / order schedule values into local wall-clock `HH:mm`. */
export function parseWallClockTime(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";

  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) {
    const h = Math.min(23, Math.max(0, parseInt(m24[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m24[2], 10)));
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = Math.min(59, Math.max(0, parseInt(m12[2], 10)));
    const ap = m12[3].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    h = Math.min(23, Math.max(0, h));
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`;
    }
  }

  return "";
}

function addMinutesToHm(hm: string, minutes: number): string {
  const [h, m] = hm.split(":").map((v) => parseInt(v, 10));
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

/** Local datetime strings for FullCalendar time-grid (`YYYY-MM-DDTHH:mm:ss`). */
export function buildAppointmentEventDateTimes(
  serviceDateRaw: string,
  startTimeRaw: unknown,
  endTimeRaw: unknown
): { start: string; end: string; startTime: string; endTime: string } {
  const date = String(serviceDateRaw ?? "").trim().split("T")[0];
  const startTime = parseWallClockTime(startTimeRaw) || "09:00";
  let endTime = parseWallClockTime(endTimeRaw) || addMinutesToHm(startTime, 60);

  if (endTime <= startTime) {
    endTime = addMinutesToHm(startTime, 60);
  }

  return {
    start: `${date}T${startTime}:00`,
    end: `${date}T${endTime}:00`,
    startTime,
    endTime,
  };
}
