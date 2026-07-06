import React, { useRef } from "react";
import { Form, Col } from "react-bootstrap";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FieldError, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { FieldLabelText, isValidationRequired } from "./RequiredFieldMark";
import {
  SCHEDULE_TIME_PICKER_INTERVAL_MINUTES,
  scheduleTimeStorageToPickerDate,
} from "../lib/quote/quoteHelpers";

interface CustomTimePickerProps {
  label?: string;
  controlId: string;
  groupControlId?: string;
  selectedTime: string | null;
  onChange: (date: Date | null) => void;
  placeholderText?: string;
  filterTime?: (date: Date) => boolean;
  /** Minutes between selectable times (default 1). */
  timeIntervals?: number;
  minTime?: Date;
  maxTime?: Date;
  register: UseFormRegister<any>;
  validation?: any;
  error?: string | FieldError;
  asCol?: boolean;
  setValue: UseFormSetValue<any>;
  groupClassName?: string;
  suppressHiddenRegister?: boolean;
  /** Show required asterisk when validation does not include `required`. */
  required?: boolean;
}

const CustomTimePicker: React.FC<CustomTimePickerProps> = ({
  label,
  controlId,
  groupControlId,
  selectedTime,
  onChange,
  placeholderText = "Select a time",
  filterTime,
  timeIntervals = SCHEDULE_TIME_PICKER_INTERVAL_MINUTES,
  minTime,
  maxTime,
  error,
  asCol = true,
  setValue,
  register,
  validation,
  groupClassName,
  suppressHiddenRegister = false,
  required = false,
}) => {
  const showRequiredMark = required || isValidationRequired(validation);
  const Wrapper = asCol ? Col : "div";
  const wrapperProps = asCol ? { xs: 12, md: 4 } : {};

  const datePickerRef = useRef<DatePicker | null>(null);

  const handleDateChange = (date: Date | null) => {
    setValue(controlId, date || null, { shouldValidate: true });
    onChange(date);
  };

  const handleIconClick = () => {
    if (datePickerRef.current) {
      datePickerRef.current.setOpen(true);
    }
  };

  return (
    <Wrapper {...wrapperProps}>
      <Form.Group
        controlId={groupControlId ?? controlId}
        className={groupClassName ?? "mb-3 w-100"}
      >
        {label?.trim() ? (
          <Form.Label>
            <FieldLabelText label={label} required={showRequiredMark} />
          </Form.Label>
        ) : null}
        <div className="position-relative w-100">
          <DatePicker
            ref={datePickerRef}
            selected={scheduleTimeStorageToPickerDate(selectedTime)}
            onChange={handleDateChange}
            showTimeSelect
            showTimeSelectOnly
            timeIntervals={timeIntervals}
            {...(minTime ? { minTime } : {})}
            {...(maxTime ? { maxTime } : {})}
            dateFormat="h:mm aa"
            placeholderText={placeholderText}
            className={`form-control ${
              error ? "is-invalid" : ""
            } full-width-date-picker`}
            showPopperArrow={false}
            {...(filterTime && { filterTime })}
          />
          <span
            className="position-absolute top-50 end-0 translate-middle-y me-3"
            style={{ cursor: "pointer" }}
            onClick={handleIconClick}
          >
            <i className="bi bi-calendar"></i>
          </span>
        </div>
        {error && (
          <Form.Control.Feedback type="invalid" className="d-block">
            {typeof error === "string"
              ? error
              : error.message || "This field is required."}
          </Form.Control.Feedback>
        )}
      </Form.Group>
      {!suppressHiddenRegister ? (
        <input
          type="hidden"
          {...register(controlId, validation)}
          value={selectedTime || ""}
        />
      ) : null}
    </Wrapper>
  );
};

export default CustomTimePicker;
