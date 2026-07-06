import React from "react";

export type QuoteDetailFieldRowProps = {
  label: string;
  value: React.ReactNode;
};

function displayValue(value: React.ReactNode): React.ReactNode {
  if (value === undefined || value === null || value === "") return "-";
  return value;
}

export default function QuoteDetailFieldRow({
  label,
  value,
}: QuoteDetailFieldRowProps) {
  const isEmail = label.toLowerCase().includes("email");
  return (
    <div
      className={`info-detail-inline-row custom-personal-row mb-2${
        isEmail ? " info-detail-inline-row--long-text" : ""
      }`}
    >
      <span className="info-detail-inline-label custom-personal-row-title">
        {label}
      </span>
      <span className="info-detail-inline-value custom-personal-row-value text-break">
        {displayValue(value)}
      </span>
    </div>
  );
}
