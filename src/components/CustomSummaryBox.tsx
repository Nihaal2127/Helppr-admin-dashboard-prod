import React from "react";
import addIcon from "../assets/icons/add.svg";

type CustomSummaryBoxProps = {
  divId: string;
  title: string;
  data: Record<string, number>;
  onSelect: (divId: string) => void;
  isSelected: boolean;
  onFilterChange: (filters: { status?: string }) => void;
  isAddShow?: boolean;
  addButtonLable?: string;
  onAddClick?: () => void;
  onItemClick?: (key: string) => void;
  /** Merged onto the root `.box` element (e.g. variant styling) */
  className?: string;
};

const CustomSummaryBox: React.FC<CustomSummaryBoxProps> = ({
  divId,
  title,
  data,
  onSelect,
  isSelected,
  onFilterChange,
  isAddShow = false,
  addButtonLable = "Add",
  onAddClick,
  onItemClick,
  className,
}) => {
  return (
    <div
      className={`box ${isSelected ? "selected-box" : ""} ${
        className ?? ""
      }`.trim()}
      id={divId}
      style={{ cursor: "pointer" }}
      onClick={() => onSelect(divId)}
    >
      <div className="box-row">
        <h6>{title}</h6>

        {isAddShow && (
          <div
            className="box-column d-inline box-right-column"
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onAddClick && onAddClick();
            }}
          >
            <img src={addIcon} width="15px" alt="" />
            <span
              style={{
                textDecoration: "underline",
                color: "var(--primary-txt-color)",
              }}
            >
              {addButtonLable}
            </span>
          </div>
        )}
      </div>

      {Object.entries(data).map(([key, value], index) => (
        <div className="box-row" key={key}>
          <div
            className={`box-column box-left-column box-rw-clr${index + 1}`}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();

              if (key === "requested_category" || key === "requested_service") {
                onItemClick && onItemClick(key);
                return;
              }

              onSelect(divId);

              let status: string | undefined;
              if (key === "Total") {
                status = undefined;
              } else if (key === "Active") {
                status = "true";
              } else if (key === "Inactive") {
                status = "false";
              } else if (key === "Blocked") {
                status = "blocked";
              }

              if (status === undefined && onItemClick) {
                onItemClick(key);
                return;
              }

              onFilterChange({ status });
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              (e.currentTarget as HTMLDivElement).click();
            }}
            style={{ cursor: "pointer" }}
          >
            {key === "requested_category"
              ? "Requested Categories"
              : key === "requested_service"
              ? "Requested Services"
              : key}
          </div>
          <div className="box-column box-right-column">{value}</div>
        </div>
      ))}
    </div>
  );
};

export default React.memo(CustomSummaryBox);
