import React from "react";
import { Row, Col } from "react-bootstrap";
import CustomFormSwitch from "./CustomFormSwitch";

interface CustomTextFieldSwitchProps {
  label: string;
  controlId: string;
  register: any;
  fieldName: string;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const CustomTextFieldSwitch: React.FC<CustomTextFieldSwitchProps> = ({
  label,
  controlId,
  register,
  fieldName,
  checked,
  onChange,
}) => {
  return (
    <Row className="align-items-center">
      <Col sm={4} className="mt-2">
        <label className="custom-profile-lable">{label}</label>
      </Col>
      <Col>
        <CustomFormSwitch
          label=""
          controlId={controlId}
          register={register}
          fieldName={fieldName}
          checked={checked}
          onChange={onChange}
        />
      </Col>
    </Row>
  );
};

export default CustomTextFieldSwitch;
