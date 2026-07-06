import React, { useRef } from "react";
import { Col, Form, InputGroup } from "react-bootstrap";
import classNames from "classnames";
import { sanitizeIndiaNationalPhoneInput } from "../lib/user/userFormValidation";
import { FieldLabelText, isValidationRequired } from "./RequiredFieldMark";

export interface CustomFormIndiaMobileProps {
  label: string;
  controlId: string;
  register: any;
  validation?: any;
  error?: any;
  asCol?: boolean;
  isEditable?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
}

/**
 * Mobile input with fixed +91 prefix; value is Indian national digits only (max 10).
 * Pair with `fullPhoneFromIndiaNational` when sending to APIs that expect E.164.
 */
export const CustomFormIndiaMobile: React.FC<CustomFormIndiaMobileProps> = ({
  label,
  controlId,
  register,
  validation,
  error,
  asCol = true,
  isEditable = true,
  placeholder = "Mobile number",
  value,
  onChange,
  autoComplete = "tel-national",
}) => {
  const isControlled = value !== undefined;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const fieldRegistration = register(controlId, validation);
  const { onChange: rhfOnChange, ...fieldReg } = fieldRegistration;
  const showRequiredMark = isValidationRequired(validation);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const national = sanitizeIndiaNationalPhoneInput(e.target.value);
    const synthetic = {
      ...e,
      target: { ...e.target, value: national },
      currentTarget: { ...e.currentTarget, value: national },
    };
    rhfOnChange(synthetic);
    onChangeRef.current?.(national);
  };

  return (
    <Form.Group
      as={asCol ? Col : "div"}
      {...(asCol ? { xs: 12, md: 4 } : {})}
      controlId={controlId}
    >
      {label?.trim() && (
        <Form.Label className="fw-medium mb-1">
          <FieldLabelText label={label} required={showRequiredMark} />
        </Form.Label>
      )}
      <InputGroup
        className={classNames(
          "mb-0",
          "franchise-employee-phone-input-group",
          error && "is-invalid"
        )}
      >
        <InputGroup.Text
          className="franchise-employee-phone-prefix user-select-none"
          aria-hidden
        >
          +91
        </InputGroup.Text>
        <Form.Control
          {...fieldReg}
          id={controlId}
          className={classNames(
            "custom-form-input",
            "franchise-employee-phone-input"
          )}
          type="tel"
          inputMode="numeric"
          autoComplete={autoComplete}
          placeholder={placeholder}
          maxLength={10}
          disabled={!isEditable}
          isInvalid={!!error}
          {...(isControlled ? { value: String(value ?? "") } : {})}
          onChange={handleChange}
          readOnly={!isEditable}
        />
      </InputGroup>
      {error && (
        <Form.Control.Feedback type="invalid" style={{ display: "block" }}>
          {error.message}
        </Form.Control.Feedback>
      )}
    </Form.Group>
  );
};
