export type ReportOptionType = { value: string; label: string };

export const reportAllOption: ReportOptionType = { value: "all", label: "All" };

export const reportFilterLabelClass = "small fw-semibold mb-1";

/** Match Order reports multiselect chip cap. */
export const reportMultiSelectChipsMaxHeight = "90px" as const;

export const CUSTOMER_USER_TYPE = 4;
export const PARTNER_USER_TYPE = 2;

export function reportToIsoCalendarDate(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}
