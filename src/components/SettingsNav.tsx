import React from "react";
import { useNavigate } from "react-router-dom";

/**
 * Must match your SETTINGS route
 */
const SETTINGS_PATH = "/settings";

/**
 * Navigate to Settings — use like FinancialSubPageNav
 */
function SettingsNav() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="financial-subpage-back"
      onClick={() => navigate(SETTINGS_PATH)}
      aria-label="Go to Settings"
    >
      <i className="bi bi-chevron-left text-danger"></i>
    </button>
  );
}

export default SettingsNav;

/** same export pattern */
export const SettingsButton = SettingsNav;
