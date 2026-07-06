import React from "react";
import { Row, Col } from "react-bootstrap";
import { CustomFormInput } from "./CustomFormInput";
import { FieldLabelText, isValidationRequired } from "./RequiredFieldMark";

interface CustomTextFieldProps {
  label: string;
  controlId: string;
  placeholder?: string;
  register: any;
  error?: any;
  validation?: object;
  labelSize?: number;
  inputType?: string;
  asCol?: boolean;
  isEditable?: boolean;
  value?: string | string[] | number;
  onChange?: (value: string) => void;
  as?: string;
  rows?: number;
  maxLength?: number;
  autoComplete?: string;
  /** Indian PIN: numeric keyboard hint and optional stricter defaults when used with `maxLength={6}`. */
  isIndianPincodeField?: boolean;
  /** Show required asterisk without react-hook-form `validation` (e.g. submit validated elsewhere). */
  showRequiredMark?: boolean;
  /** Keep validation but hide inline error text (asterisk-only required UI). */
  hideValidationFeedback?: boolean;
}

const CustomTextField: React.FC<CustomTextFieldProps> = ({
  label,
  controlId,
  placeholder = "Enter value",
  register,
  error,
  validation,
  labelSize = 4,
  inputType = "text",
  asCol = false,
  isEditable = true,
  onChange,
  value,
  as,
  rows,
  maxLength,
  autoComplete,
  isIndianPincodeField,
  showRequiredMark: showRequiredMarkProp,
  hideValidationFeedback,
}) => {
  const resolvedInputType = isIndianPincodeField ? "tel" : inputType;
  const showRequiredMark =
    Boolean(showRequiredMarkProp) || isValidationRequired(validation);
  return (
    <Row className={`align-items-start ${labelSize !== 4 ? "mb-4" : ""}`}>
      <Col sm={labelSize} className="d-flex align-items-start">
        <label className="custom-profile-lable">
          <FieldLabelText label={label} required={showRequiredMark} />
        </label>
      </Col>
      <Col>
        <CustomFormInput
          label=""
          controlId={controlId}
          placeholder={placeholder}
          register={register}
          error={error}
          asCol={asCol}
          validation={validation}
          inputType={resolvedInputType}
          isEditable={isEditable}
          onChange={onChange}
          value={value}
          as={as}
          rows={rows}
          maxLength={maxLength}
          autoComplete={autoComplete}
          hideValidationFeedback={hideValidationFeedback}
        />
      </Col>
    </Row>
  );
};

export default CustomTextField;
