import React from "react";
import { useNavigate } from "react-router-dom";

/**
 * Must match `ROUTES.FINANCIALS.path` in `routes/Routes.tsx`.
 * Do not import `Routes` here — it lazy-loads financial pages and creates a circular dependency.
 */
const FINANCIALS_HUB_PATH = "/financial";

/**
 * Back to Financials hub — use as `titlePrefix` on CustomHeader (beside the title).
 */
function FinancialSubPageNav() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="financial-subpage-back"
      onClick={() => navigate(FINANCIALS_HUB_PATH)}
      aria-label="Back to Financials"
    >
      <i className="bi bi-chevron-left text-danger"></i>
    </button>
  );
}

export default FinancialSubPageNav;

/** Same component — use when JSX uses this name (avoids jsx-no-undef with mixed imports). */
export const FinancialSubPageBackButton = FinancialSubPageNav;
