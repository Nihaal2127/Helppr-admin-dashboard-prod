import React from "react";
import customCloseIcon from "../assets/icons/close_button_red.svg";
interface CustomCloseButtonProps {
  onClose: () => void;
  size?: number;
  /** When true, sits in flex header flow (no absolute positioning). */
  inline?: boolean;
}

const CustomCloseButton: React.FC<CustomCloseButtonProps> = ({
  onClose,
  size = 24,
  inline = false,
}) => {
  return (
    <img
      src={customCloseIcon}
      alt="Close"
      width={size}
      height={size}
      onClick={onClose}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        ...(inline
          ? { flexShrink: 0 }
          : {
              position: "absolute",
              top: "15px",
              right: "15px",
            }),
      }}
    />
  );
};

export default CustomCloseButton;
