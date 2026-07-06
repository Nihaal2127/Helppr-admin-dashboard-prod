import React from "react";
import eyeIcon from "../assets/icons/eye.svg";

const ACTION_ICON_PX = 22;

const tableActionIconStyle: React.CSSProperties = {
  cursor: "pointer",
  width: ACTION_ICON_PX,
  height: ACTION_ICON_PX,
  fontSize: ACTION_ICON_PX,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const CustomActionColumn = ({
  row,
  onEdit,
  onDelete,
  onChat,
  onView,
  onChangePassword,
  onInvoiceDownload,
}: {
  row: any;
  onEdit?: (partner: any) => void;
  onDelete?: (partner: any) => void;
  onChat?: (partner: any) => void;
  onView?: (partner: any) => void;
  /** When set, shows a key control to open the change-password flow (alongside edit when both are passed). */
  onChangePassword?: (partner: any) => void;
  onInvoiceDownload?: (row: any) => void;
}) => {
  return (
    <div className="d-inline-flex align-items-center gap-2">
      {onChat && (
        <i
          className="bi bi-chat-left-dots custom-table-action-chat"
          onClick={() => onChat(row)}
          style={tableActionIconStyle}
          aria-label="Open chat"
          role="button"
        />
      )}
      {onView && (
        <img
          src={eyeIcon}
          alt="view"
          title="View details"
          width={ACTION_ICON_PX}
          height={ACTION_ICON_PX}
          className="custom-table-action-view"
          onClick={() => onView(row)}
          style={{ cursor: "pointer", flexShrink: 0 }}
        />
      )}
      {onInvoiceDownload && (
        <i
          className="bi bi-file-earmark-pdf custom-table-action-edit"
          role="button"
          tabIndex={0}
          title="Download invoice"
          aria-label="Download invoice"
          onClick={() => onInvoiceDownload(row)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onInvoiceDownload(row);
          }}
          style={tableActionIconStyle}
        />
      )}
      {onChangePassword && (
        <i
          className="bi bi-key-fill custom-table-action-edit"
          onClick={() => onChangePassword(row)}
          style={tableActionIconStyle}
          aria-label="Change password"
          role="button"
        />
      )}
      {onEdit && (
        <i
          className="bi bi-pencil-fill custom-table-action-edit"
          onClick={() => onEdit(row)}
          style={tableActionIconStyle}
          aria-label="Edit"
          role="button"
        />
      )}
      {/* {onDelete && (
        <i
          className="bi bi-ban custom-table-action-delete"
          onClick={() => onDelete(row)}
          style={tableActionIconStyle}
          aria-label="Void"
          role="button"
        />
      )} */}
    </div>
  );
};

export default CustomActionColumn;
export { CustomActionColumn };
