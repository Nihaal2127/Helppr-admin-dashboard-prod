import React from "react";
import { Row, Col } from "react-bootstrap";
import { CustomFormIndiaMobile } from "./CustomFormIndiaMobile";
import { FieldLabelText, isValidationRequired } from "./RequiredFieldMark";

interface CustomTextFieldIndiaMobileProps {
  label: string;
  controlId: string;
  placeholder?: string;
  register: any;
  error?: any;
  validation?: object;
  labelSize?: number;
  asCol?: boolean;
  isEditable?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
}

/** Same horizontal layout as CustomTextField; fixed +91 + national mobile digits. */
const CustomTextFieldIndiaMobile: React.FC<CustomTextFieldIndiaMobileProps> = ({
  label,
  controlId,
  placeholder = "Mobile number",
  register,
  error,
  validation,
  labelSize = 4,
  asCol = false,
  isEditable = true,
  value,
  onChange,
  autoComplete,
}) => {
  const showRequiredMark = isValidationRequired(validation);
  return (
    <Row className="align-items-start">
      <Col sm={labelSize} className="d-flex align-items-start">
        <label className="custom-profile-lable">
          <FieldLabelText label={label} required={showRequiredMark} />
        </label>
      </Col>
      <Col>
        <CustomFormIndiaMobile
          label=""
          controlId={controlId}
          placeholder={placeholder}
          register={register}
          error={error}
          validation={validation}
          asCol={asCol}
          isEditable={isEditable}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
        />
      </Col>
    </Row>
  );
};

export default CustomTextFieldIndiaMobile;
