export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "others", label: "Others" },
] as const;

export type GenderValue = (typeof GENDER_OPTIONS)[number]["value"];

export function normalizeGenderValue(raw: unknown): GenderValue | "" {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "male" || s === "female") return s;
  if (s === "others" || s === "other") return "others";
  return "";
}

export function formatGenderLabel(raw: unknown): string {
  const v = normalizeGenderValue(raw);
  if (!v) return "—";
  return GENDER_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function genderForApiPayload(raw: unknown): GenderValue | undefined {
  const v = normalizeGenderValue(raw);
  return v || undefined;
}
