import React from "react";
import { Row, Col } from "react-bootstrap";
import CustomFormSelect from "./CustomFormSelect";
import { FieldLabelText } from "./RequiredFieldMark";

interface CustomTextFieldSelectProps {
  label: string;
  controlId: string;
  options: { value: string; label: string }[];
  register: any;
  validation?: any;
  fieldName: string;
  error?: any;
  requiredMessage?: string;
  defaultValue?: string;
  setValue?: (name: string, value: any) => void;
  onChange?: (value: any) => void;
  labelSize?: number;
  asCol?: boolean;
  placeholder?: string;
  menuPortal?: boolean;
  noRowBottomMargin?: boolean;
  noBottomMargin?: boolean;
  isClearable?: boolean;
  includeEmptyOption?: boolean;
  emptyOptionLabel?: string;
  isDisabled?: boolean;
  onMenuOpen?: () => void;
  /** Show required asterisk without react-hook-form `requiredMessage`. */
  showRequiredMark?: boolean;
}

const CustomTextFieldSelect: React.FC<CustomTextFieldSelectProps> = ({
  label,
  controlId,
  options,
  register,
  validation,
  fieldName,
  error,
  requiredMessage,
  defaultValue = "",
  setValue,
  onChange,
  labelSize = 4,
  placeholder,
  menuPortal = false,
  noRowBottomMargin = false,
  noBottomMargin = false,
  isClearable = true,
  includeEmptyOption,
  emptyOptionLabel,
  isDisabled = false,
  onMenuOpen,
  showRequiredMark = false,
}) => {
  const rowMarginClass = noRowBottomMargin
    ? ""
    : labelSize !== 4
    ? "mb-4"
    : "";

  return (
    <Row
      className={["align-items-start", rowMarginClass]
        .filter(Boolean)
        .join(" ")}
    >
      <Col sm={labelSize} className="d-flex align-items-start">
        <label className="custom-profile-lable">
          <FieldLabelText
            label={label}
            required={showRequiredMark || !!requiredMessage}
          />
        </label>
      </Col>

      <Col>
        <CustomFormSelect
          label=""
          controlId={controlId}
          options={options}
          register={register}
          validation={validation}
          fieldName={fieldName}
          error={error}
          requiredMessage={requiredMessage}
          defaultValue={defaultValue}
          setValue={setValue}
          asCol={false}
          onChange={onChange}
          placeholder={placeholder}
          menuPortal={menuPortal}
          noBottomMargin={noBottomMargin}
          isClearable={isClearable}
          includeEmptyOption={includeEmptyOption}
          emptyOptionLabel={emptyOptionLabel}
          isDisabled={isDisabled}
          onMenuOpen={onMenuOpen}
          showRequiredMark={showRequiredMark}
        />
      </Col>
    </Row>
  );
};

export default CustomTextFieldSelect;