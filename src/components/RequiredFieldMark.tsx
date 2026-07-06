import React from "react";

/** RHF rule for required fields when only the label asterisk should show (use with `hideValidationFeedback`). */
export const REQUIRED_FIELD_RULE = { required: true as const };

/** True when react-hook-form `validation` includes a `required` rule. */
export function isValidationRequired(validation?: unknown): boolean {
  if (!validation || typeof validation !== "object") return false;
  const rule = (validation as { required?: unknown }).required;
  return rule !== undefined && rule !== false;
}

export const RequiredFieldMark: React.FC = () => (
  <span className="text-danger ms-1" aria-hidden="true">
    *
  </span>
);

type FieldLabelTextProps = {
  label: string;
  required?: boolean;
};

/** Renders label text with an optional required asterisk. */
export const FieldLabelText: React.FC<FieldLabelTextProps> = ({
  label,
  required = false,
}) => (
  <>
    {label}
    {required ? <RequiredFieldMark /> : null}
  </>
);
