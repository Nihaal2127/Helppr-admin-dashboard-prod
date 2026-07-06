import React from "react";
import { Form, Col } from "react-bootstrap";
import { UseFormRegister } from "react-hook-form";

interface CustomFormSwitchProps {
  label: string;
  controlId: string;
  className?: string;
  register: UseFormRegister<any>;
  fieldName: string;
  asCol?: boolean;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const CustomFormSwitch: React.FC<CustomFormSwitchProps> = ({
  label,
  controlId,
  className,
  register,
  asCol = true,
  fieldName,
  checked,
  onChange,
}) => {
  return (
    <>
      <style>{`
        .custom-switch-color .form-check-input:checked {
          background-color: var(--primary-color)!important;
          border-color: var(--primary-color) !important;
        }

        .custom-switch-color .form-check-input:focus {
          box-shadow: 0 0 0 0.1rem rgba(155,12,12, 1) !important;
        }

         .custom-switch-color .form-check-input:not(:checked) {
          background-color:var(--bg-color) !important;
          border-color:var(--primary-color) !important;
        }

      `}</style>

      <Form.Group
        className={`d-flex align-items-center mb-3 ${className}`}
        as={asCol ? Col : "div"}
        {...(asCol ? { xs: 12, md: 4 } : {})}
        controlId={controlId}
      >
        <Form.Check
          type="switch"
          label={label}
          {...register(fieldName)}
          className="mt-3 custom-switch-color"
          checked={checked}
          onChange={onChange}
        />
      </Form.Group>
    </>
  );
};

export default CustomFormSwitch;
