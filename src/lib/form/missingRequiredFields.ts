export type MissingRequiredField = {
  /** Form control name when the error should attach to a field. */
  field?: string;
  label: string;
};

/** User-facing message listing every required field that still needs a value. */
export function formatMissingRequiredFieldsAlert(
  items: ReadonlyArray<{ label: string }>
): string {
  if (!items.length) return "";
  const labels: string[] = [];
  for (const item of items) {
    labels.push(item.label);
  }
  return `Please complete the following required field${
    labels.length > 1 ? "s" : ""
  }: ${labels.join(", ")}`;
}

type SetRequiredFieldErrorFn = (
  field: string,
  error: { type: "required"; message: string }
) => void;

export function applyMissingRequiredFieldErrors(
  items: MissingRequiredField[],
  setError: SetRequiredFieldErrorFn
): void {
  for (const item of items) {
    if (!item.field) continue;
    setError(item.field, {
      type: "required",
      message: `${item.label} is required`,
    });
  }
}
