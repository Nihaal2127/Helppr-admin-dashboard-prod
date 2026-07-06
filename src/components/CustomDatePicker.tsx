import React, { useRef, useState } from "react";
import { Form, Col } from "react-bootstrap";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FieldError, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { FieldLabelText, isValidationRequired } from "./RequiredFieldMark";
import { dateToLocalYmd } from "../helper/dateFormat";
import { isoCalendarDateToPickerDate } from "../lib/quote/quoteHelpers";

interface CustomDatePickerProps {
  label?: string;
  controlId: string;
  /** Optional DOM id for `Form.Group` when the same field is shown twice (avoids duplicate `controlId` in the tree). */
  groupControlId?: string;
  selectedDate: string | null;
  onChange: (date: Date | null) => void;
  placeholderText?: string;
  filterDate?: (date: Date) => boolean;
  register: UseFormRegister<any>;
  validation?: any;
  error?: string | FieldError;
  asCol?: boolean;
  setValue: UseFormSetValue<any>;
  groupClassName?: string;
  /** Second copy of the same field: still calls `setValue(controlId, …)` but skips the hidden `register` input. */
  suppressHiddenRegister?: boolean;
  /** Date of birth: year/month dropdowns, past dates only. */
  birthDatePicker?: boolean;
  /** If false, DOB allows any past date up to today (no 18+ restriction). */
  enforceAdultAge?: boolean;
  /** Show required asterisk when validation does not include `required`. */
  required?: boolean;
  /** Month-only or year-only selection (e.g. dashboard filters). */
  pickerMode?: "date" | "month" | "year";
  /** Month/year dropdowns on the calendar header (easier range navigation). */
  showMonthYearDropdowns?: boolean;
}

const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  label,
  controlId,
  groupControlId,
  selectedDate,
  onChange,
  placeholderText = "Select a date",
  filterDate,
  error,
  asCol = true,
  setValue,
  register,
  validation,
  groupClassName,
  suppressHiddenRegister = false,
  birthDatePicker = false,
  enforceAdultAge = true,
  required = false,
  pickerMode = "date",
  showMonthYearDropdowns = false,
}) => {
  const showRequiredMark = required || isValidationRequired(validation);
  const Wrapper = asCol ? Col : "div";
  const wrapperProps = asCol ? { xs: 12, md: 4 } : {};

  const datePickerRef = useRef<DatePicker | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  /** Latest selectable DOB when `birthDatePicker`: defaults to 18+, can be relaxed for add-user flows. */
  const maxDobWithAgeRule = () => {
    const d = new Date();
    if (enforceAdultAge) {
      d.setFullYear(d.getFullYear() - 18);
    }
    d.setHours(23, 59, 59, 999);
    return d;
  };

  const maxDob = birthDatePicker ? maxDobWithAgeRule() : undefined;
  const minDob = birthDatePicker
    ? new Date(new Date().getFullYear() - 100, 0, 1)
    : undefined;

  const normalizePickerDate = (date: Date | null): Date | null => {
    if (!date) return null;
    if (pickerMode === "month") {
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }
    if (pickerMode === "year") {
      return new Date(date.getFullYear(), 0, 1);
    }
    return date;
  };

  const handleDateChange = (date: Date | null) => {
    const normalized = normalizePickerDate(date);
    const ymd = normalized ? dateToLocalYmd(normalized) : "";
    setValue(controlId, ymd || null, { shouldValidate: true });
    onChange(normalized);
    setIsOpen(false);
  };

  const handleIconClick = () => {
    setIsOpen(true);
  };

  const calendarClassName =
    pickerMode === "month"
      ? "custom-month-year-picker"
      : pickerMode === "year"
        ? "custom-year-picker"
        : undefined;

  return (
    <Wrapper {...wrapperProps}>
      <Form.Group
        controlId={groupControlId ?? controlId}
        className={groupClassName ?? "mb-3 w-100"}
      >
        {label && (
          <Form.Label>
            <FieldLabelText label={label} required={showRequiredMark} />
          </Form.Label>
        )}
        <div className="position-relative w-100">
          <DatePicker
            ref={datePickerRef}
            open={isOpen}
            selected={isoCalendarDateToPickerDate(selectedDate)}
            onChange={handleDateChange}
            onSelect={() => setIsOpen(false)}
            onClickOutside={() => setIsOpen(false)}
            onInputClick={() => setIsOpen(true)}
            dateFormat={
              pickerMode === "month"
                ? "MMMM yyyy"
                : pickerMode === "year"
                  ? "yyyy"
                  : "dd/MM/yyyy"
            }
            showMonthYearPicker={pickerMode === "month"}
            showYearPicker={pickerMode === "year"}
            yearItemNumber={pickerMode === "year" ? 3 : undefined}
            calendarClassName={calendarClassName}
            placeholderText={placeholderText}
            className={`form-control ${
              error ? "is-invalid" : ""
            } full-width-date-picker`}
            filterDate={
              filterDate ??
              (birthDatePicker
                ? (date) => {
                    const d = new Date(date);
                    d.setHours(0, 0, 0, 0);
                    const min = new Date(minDob!);
                    min.setHours(0, 0, 0, 0);
                    const max = maxDobWithAgeRule();
                    return d >= min && d <= max;
                  }
                : (date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return date >= today;
                  })
            }
            showYearDropdown={birthDatePicker || showMonthYearDropdowns}
            showMonthDropdown={birthDatePicker || showMonthYearDropdowns}
            scrollableYearDropdown={birthDatePicker || showMonthYearDropdowns}
            yearDropdownItemNumber={
              birthDatePicker ? 100 : showMonthYearDropdowns ? 15 : undefined
            }
            maxDate={birthDatePicker ? maxDob : undefined}
            minDate={birthDatePicker ? minDob : undefined}
            showPopperArrow={false}
            shouldCloseOnSelect
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
          value={selectedDate || ""}
        />
      ) : null}
    </Wrapper>
  );
};

export default CustomDatePicker;
