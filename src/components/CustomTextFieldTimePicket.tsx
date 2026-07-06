import React from "react";
import { Row, Col } from "react-bootstrap";
import { UseFormSetValue } from "react-hook-form";
import CustomTimePicker from "./CustomTimePicker";
import { FieldLabelText, isValidationRequired } from "./RequiredFieldMark";

interface CustomTextFieldTimePicketProps {
  labelSize?: number;
  label: string;
  controlId: string;
  groupControlId?: string;
  selectedTime: string | null;
  onChange: (date: Date | null) => void;
  placeholderText?: string;
  filterTime?: (date: Date) => boolean;
  /** Minutes between times in the picker (default 1). */
  timeIntervals?: number;
  minTime?: Date;
  maxTime?: Date;
  register: any;
  validation?: any;
  error?: any;
  asCol?: boolean;
  setValue: UseFormSetValue<any>;
  suppressHiddenRegister?: boolean;
  /** Show required asterisk when validation does not include `required`. */
  required?: boolean;
}

const CustomTextFieldTimePicket: React.FC<CustomTextFieldTimePicketProps> = ({
  labelSize = 4,
  label,
  controlId,
  groupControlId,
  selectedTime,
  onChange,
  placeholderText = "Select a time",
  filterTime,
  timeIntervals,
  minTime,
  maxTime,
  error,
  asCol = false,
  setValue,
  register,
  validation,
  suppressHiddenRegister,
  required = false,
}) => {
  const showRequiredMark = required || isValidationRequired(validation);
  return (
    <Row className={`align-items-start ${labelSize !== 4 ? "mb-4" : ""}`}>
      <Col sm={labelSize} className="d-flex align-items-start">
        <label className="custom-profile-lable">
          <FieldLabelText label={label} required={showRequiredMark} />
        </label>
      </Col>
      <Col>
        <CustomTimePicker
          label=""
          controlId={controlId}
          groupControlId={groupControlId}
          selectedTime={selectedTime}
          onChange={onChange}
          placeholderText={placeholderText}
          error={error}
          register={register}
          validation={validation}
          setValue={setValue}
          asCol={asCol}
          filterTime={filterTime}
          timeIntervals={timeIntervals}
          minTime={minTime}
          maxTime={maxTime}
          suppressHiddenRegister={suppressHiddenRegister}
          required={showRequiredMark}
        />
      </Col>
    </Row>
  );
};

export default CustomTextFieldTimePicket;
