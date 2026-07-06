import React, { useState, useRef } from "react";
import { Col, Form, InputGroup } from "react-bootstrap";
import { Eye, EyeOff } from "react-feather";
import classNames from "classnames";
import { FieldLabelText, isValidationRequired } from "./RequiredFieldMark";

interface CustomFormInputProps {
  label: string;
  controlId: string;
  placeholder: string;
  register: any;
  validation?: any;
  error?: any;
  asCol?: boolean;
  value?: string | string[] | number;
  onChange?: (value: string) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  inputType?: string;
  isEditable?: boolean;
  maxLength?: number;
  as?: string;
  rows?: number;
  /** Merged into Form.Control inline style (e.g. border overrides for read-only fields). */
  inputStyle?: React.CSSProperties;
  /** Extra classes on Form.Control (e.g. focus/border overrides that need CSS). */
  inputClassName?: string;
  /** Browser autofill hint. */
  autoComplete?: string;
  /** Keep validation but do not render inline error text under the control. */
  hideValidationFeedback?: boolean;
  /** Show required asterisk without react-hook-form `validation` (e.g. submit validated elsewhere). */
  showRequiredMark?: boolean;
}

export const CustomFormInput: React.FC<CustomFormInputProps> = ({
  label,
  controlId,
  placeholder,
  register,
  validation,
  error,
  asCol = true,
  onChange,
  onBlur,
  value,
  inputType = "text",
  isEditable = true,
  maxLength,
  as,
  rows,
  inputStyle,
  inputClassName,
  autoComplete,
  hideValidationFeedback = false,
  showRequiredMark: showRequiredMarkProp,
}) => {
  const isControlled = value !== undefined;
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const fieldRegistration = register(controlId, validation);
  const { onChange: rhfOnChange, ...fieldReg } = fieldRegistration;
  const showRequiredMark =
    Boolean(showRequiredMarkProp) || isValidationRequired(validation);

  const handleFieldChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    rhfOnChange(e);
    onChangeRef.current?.(e.target.value);
  };

  return inputType === "password" ? (
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
      <InputGroup className="mb-0">
        <Form.Control
          className="custom-form-input"
          type={showPassword ? "text" : "password"}
          placeholder={placeholder}
          {...fieldReg}
          isInvalid={!!error}
          {...(isControlled ? { value: String(value ?? "") } : {})}
          onChange={handleFieldChange}
          readOnly={!isEditable}
          autoComplete={autoComplete}
          maxLength={maxLength}
          style={{
            boxShadow: "none",
            // borderRadius: "8px",
            borderRadius: "8px 0 0 8px",
            borderColor: "var(--primary-color)",
            fontSize: "14px",
            fontWeight: "normal",
            width: "80%",
            height: as !== "textarea" ? "35px" : "auto",
            lineHeight: "18px",
            backgroundColor: "var(--bg-color)",
            fontFamily: "'Inter'",
            color: "var(--content-txt-color)",
            marginBottom: "10px",
          }}
        />
        <div
          className={classNames("input-group-text", "input-group-password", {
            "show-password": showPassword,
          })}
          data-password={showPassword ? "true" : "false"}
          style={{
            width: "40px",
            height: as !== "textarea" ? "35px" : "auto",
            borderColor: "var(--primary-color)",
            borderRadius: "0 8px 8px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <span
            className="password-eye"
            onClick={() => {
              setShowPassword(!showPassword);
            }}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </span>
        </div>

        {error && !hideValidationFeedback ? (
          <Form.Control.Feedback type="invalid">
            {error.message}
          </Form.Control.Feedback>
        ) : null}
      </InputGroup>
    </Form.Group>
  ) : (
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
      <Form.Control
        className={classNames("custom-form-input", inputClassName)}
        type={inputType}
        placeholder={placeholder}
        {...fieldReg}
        isInvalid={!!error}
        {...(isControlled ? { value: String(value ?? "") } : {})}
        onChange={handleFieldChange}
        onBlur={onBlur}
        readOnly={!isEditable}
        autoComplete={autoComplete}
        maxLength={maxLength}
        as={as}
        rows={as === "textarea" ? rows : undefined}
        style={{
          boxShadow: "none",
          borderRadius: "8px",
          borderColor: "var(--primary-color)",
          fontSize: "14px",
          fontWeight: "normal",
          width: "100%",
          height: as !== "textarea" ? "35px" : "auto",
          lineHeight: "18px",
          backgroundColor: "var(--bg-color)",
          fontFamily: "'Inter'",
          color: "var(--content-txt-color)",
          marginBottom: "10px",
          ...inputStyle,
        }}
      />
      {error && !hideValidationFeedback ? (
        <Form.Control.Feedback type="invalid">
          {error.message}
        </Form.Control.Feedback>
      ) : null}
    </Form.Group>
  );
};
