import React from "react";
import { Form } from "react-bootstrap";
import { GENDER_OPTIONS } from "../lib/user/genderOptions";
import { FieldLabelText } from "./RequiredFieldMark";

type GenderValue = (typeof GENDER_OPTIONS)[number]["value"];

type GenderRadioFieldProps = {
  value: GenderValue | "";
  onChange: (next: GenderValue) => void;
  className?: string;
  /** When false, omit the built-in label (use an external row label). */
  showLabel?: boolean;
  /** Show required asterisk on the label. */
  required?: boolean;
};

const GenderRadioField: React.FC<GenderRadioFieldProps> = ({
  value,
  onChange,
  className,
  showLabel = true,
  required = false,
}) => {
  return (
    <Form.Group className={className} style={{ marginTop: showLabel ? "6px" : 0 }}>
      {showLabel ? (
        <Form.Label className="fw-medium mb-1">
          <FieldLabelText label="Gender" required={required} />
        </Form.Label>
      ) : null}
      <div className="d-flex flex-wrap" style={{ gap: "12px" }}>
        {GENDER_OPTIONS.map((opt) => (
          <Form.Check
            key={opt.value}
            type="radio"
            id={`gender_${opt.value}`}
            name="gender"
            label={<span className="custom-radio-text">{opt.label}</span>}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="custom-radio-check"
          />
        ))}
      </div>
    </Form.Group>
  );
};

export default GenderRadioField;
