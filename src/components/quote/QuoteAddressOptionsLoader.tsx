import React from "react";
import { Spinner } from "react-bootstrap";

/** Inline loader while franchise catalog / customer addresses are resolving. */
export function QuoteAddressOptionsLoader() {
  return (
    <div
      className="quote-address-options-loader d-flex align-items-center gap-2 py-3"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner animation="border" size="sm" variant="secondary" role="status" />
      <span className="small text-muted mb-0">Loading address options…</span>
    </div>
  );
}

export default QuoteAddressOptionsLoader;
