import type { ReactNode } from "react";
import { Row, Col } from "react-bootstrap";
import { VerificationStatusEnum } from "../lib/global/VerificationStatusEnum";
import { RoleEnum } from "../lib/global/RoleEnum";
import { ResolveStatusEnum } from "../lib/global/ResolveStatusEnum";
import { AppConstant } from "../lib/global/AppConstant";
import { formatDate, formatDateTime } from "./dateFormat";
import {
  normalizePartnerVerification,
  PARTNER_VERIFICATION,
  partnerVerificationLabel,
} from "../lib/partner/partnerVerification";

export { getNavigate, setNavigate } from "./navigation";
export { formatDate, formatDateTime };

/** Order status labels for `DetailsOrderStatusRow` (kept here to avoid utility ↔ orderTypes cycle). */
const ORDER_STATUS_LABELS = new Map<number, { label: string }>([
  [1, { label: "Pending" }],
  [2, { label: "In Progress" }],
  [3, { label: "Completed" }],
  [4, { label: "Cancelled" }],
  [5, { label: "Refunded" }],
]);

export const capitalizeString = (str: string) =>
  str.replace(/\b\w/g, (char) => char.toUpperCase());

export function showLog(_message?: any, ..._optionalParams: any[]): void {}

/** API fields that are either an id string or a populated `{ _id, … }` document. */
export function apiDocumentId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    return s && s !== "[object Object]" ? s : "";
  }
  if (typeof value === "object") {
    const o = value as { _id?: unknown; id?: unknown };
    const id = String(o._id ?? o.id ?? "").trim();
    if (id) return id;
  }
  return "";
}

export const getStatusOptions = () => [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];

const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png"];
const SUPPORTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];
const SUPPORTED_IMAGE_MAX_SIZE_BYTES = 512 * 1024;

export const getSupportedImageExtensions = (): string[] => [
  ...SUPPORTED_IMAGE_EXTENSIONS,
];
export const getSupportedImageMaxSizeBytes = (): number =>
  SUPPORTED_IMAGE_MAX_SIZE_BYTES;

export const isSupportedImageFile = (file: File): boolean => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const hasSupportedExtension = SUPPORTED_IMAGE_EXTENSIONS.includes(extension);
  const hasSupportedMimeType = SUPPORTED_IMAGE_MIME_TYPES.includes(
    (file.type || "").toLowerCase()
  );
  const isWithinSupportedSize = file.size <= SUPPORTED_IMAGE_MAX_SIZE_BYTES;
  return hasSupportedExtension && hasSupportedMimeType && isWithinSupportedSize;
};

export const textUnderlineCell =
  (field: string, onClick: (row: any) => void) =>
  ({ row }: { row: any }) =>
    (
      <span
        style={{
          textDecoration: "underline",
          textDecorationThickness: "1px",
          cursor: "pointer",
        }}
        onClick={() => onClick(row.original)}
      >
        {row.original[field]}
      </span>
    );

export const statusCell = (field: string) => {
  return ({ row }: { row: { original: Record<string, any> } }): JSX.Element => {
    const value = row.original?.[field];

    return (
      <span className={`custom-${value ? "active" : "inactive"}`}>
        {value ? "Active" : "Inactive"}
      </span>
    );
  };
};

export const paymentStatusCell = (field: string) => {
  return ({ row }: { row: { original: Record<string, any> } }): JSX.Element => {
    const value = row.original?.[field];

    return (
      <span className={`custom-${value ? "active" : "inactive"}`}>
        {value ? "Paid" : "Unpaid"}
      </span>
    );
  };
};

export const verificationStatusCell = (field: string | number) => {
  return ({
    row,
  }: {
    row?: { original: Record<string, any> };
  }): JSX.Element => {
    const value = row?.original?.[field] ?? field;

    const status = VerificationStatusEnum.get(value);
    const label = status ? status.label : "Unknown";

    let className = "";
    let color = "";

    if (value === 1) {
      className = "custom-active";
    } else if (value === 2) {
      className = "custom-inactive";
    } else if (value === 3) {
      className = "custom-active";
      color = "var(--btn-pending)";
    }
    return (
      <span className={className} style={{ color }}>
        {label}
      </span>
    );
  };
};

/** Tight label + value (fixed label width) - use inside md={6} pairs e.g. service address. */
export function InfoDetailInlineRow({
  label,
  value,
  className = "",
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  const display =
    value === undefined || value === null || value === "" ? "-" : value;
  return (
    <div className={`info-detail-inline-row ${className}`.trim()}>
      <span className="info-detail-inline-label custom-personal-row-title">
        {label}
      </span>
      <span className="info-detail-inline-value custom-personal-row-value text-break">
        {display}
      </span>
    </div>
  );
}

/** Label + value row — uses `InfoDetailInlineRow`; `compact` for Partner Information columns. */
export const DetailsRow = ({
  title,
  value,
  compact,
}: {
  title: string;
  value: any;
  /** Narrow column stack (Partner Information left/right lists). */
  compact?: boolean;
}) => {
  if (compact) {
    const displayValue =
      value === undefined || value === "" || value === null ? "-" : value;
    return (
      <div className="custom-personal-row custom-personal-row--compact d-flex align-items-start gap-2 py-1">
        <div className="custom-personal-row-title flex-shrink-0">
          {title}
        </div>
        <div
          className="custom-personal-row-value flex-grow-1"
          style={{ minWidth: 0 }}
        >
          {displayValue}
        </div>
      </div>
    );
  }
  return <InfoDetailInlineRow label={title} value={value} />;
};

/** Two-column personal block: name/DOB, gender/email, phone/registered, optional last service. */
export function PersonalAccountDetailsGrid({
  nameLabel,
  name,
  dateOfBirth,
  genderLabel,
  email,
  phone,
  registeredDate,
  lastServiceDate,
  showPartnerFields,
  experience,
  stateName,
  cityName,
  areaName,
  pincode,
  isActive,
  address,
  franchiseName,
  accountStatusMode = "active",
  partnerVerificationStatus,
}: {
  nameLabel: string;
  name?: string | null;
  dateOfBirth?: string | null;
  genderLabel?: string;
  email?: string | null;
  phone?: string | null;
  registeredDate?: string | null;
  lastServiceDate?: string | null;
  /** When true, renders experience/location/status/address rows (Partner Information). */
  showPartnerFields?: boolean;
  experience?: string | number | null;
  stateName?: string | null;
  cityName?: string | null;
  areaName?: string | null;
  pincode?: string | null;
  isActive?: boolean;
  address?: string | null;
  franchiseName?: string | null;
  franchiseEmail?: string | null;
  /** Partner verification dialog: Status shows pending / rejected / approved. */
  accountStatusMode?: "active" | "verification";
  partnerVerificationStatus?: boolean | string | null;
}) {
  const dobRaw = String(dateOfBirth ?? "").trim();
  const dobDisplay = dobRaw ? formatDate(dobRaw) : "—";
  const regRaw = String(registeredDate ?? "").trim();
  const regDisplay = regRaw ? formatDate(regRaw) : "—";
  const lastRaw = String(lastServiceDate ?? "").trim();
  const showLastService =
    Boolean(lastRaw) && !Number.isNaN(new Date(lastRaw).getTime());

  if (showPartnerFields) {
    const experienceDisplay =
      experience !== null &&
      experience !== undefined &&
      String(experience).trim() !== ""
        ? String(experience)
        : "—";
    const addressDisplay = String(address ?? "").trim() || "—";
    const statusValue =
      accountStatusMode === "verification" ? (
        (() => {
          const norm = normalizePartnerVerification(
            partnerVerificationStatus ?? isActive
          );
          const label = partnerVerificationLabel(
            partnerVerificationStatus ?? isActive
          );
          if (norm === PARTNER_VERIFICATION.REJECTED) {
            return <span className="custom-inactive">{label}</span>;
          }
          if (norm === PARTNER_VERIFICATION.PENDING) {
            return (
              <span style={{ color: "var(--btn-pending)", fontWeight: 600 }}>
                {label}
              </span>
            );
          }
          return <span className="custom-active">{label}</span>;
        })()
      ) : (
        <span className={isActive ? "custom-active" : "custom-inactive"}>
          {isActive ? "Active" : "Inactive"}
        </span>
      );

    return (
      <div className="w-100 partner-personal-details-grid">
        <Row className="g-3 mx-0 align-items-start">
          <Col xs={12} md={6} className="partner-personal-col">
            <DetailsRow compact title={nameLabel} value={name ?? "—"} />
            <DetailsRow compact title="Gender" value={genderLabel ?? "—"} />
            <DetailsRow compact title="Phone Number" value={phone ?? "—"} />
            <DetailsRow compact title="Experience" value={experienceDisplay} />
            <DetailsRow compact title="City" value={cityName ?? "—"} />
            <DetailsRow compact title="Area" value={areaName ?? "—"} />
            <DetailsRow compact title="Address" value={addressDisplay} />
            <DetailsRow compact title="Status" value={statusValue} />
          </Col>
          <Col xs={12} md={6} className="partner-personal-col">
            <DetailsRow compact title="Date of Birth" value={dobDisplay} />
            <DetailsRow compact title="Email" value={email ?? "—"} />
            <DetailsRow compact title="Registered Date" value={regDisplay} />
            <DetailsRow compact title="State" value={stateName ?? "—"} />
            <DetailsRow compact title="Postal Code" value={pincode ?? "—"} />
            <DetailsRow
              compact
              title="Franchise Name"
              value={franchiseName ?? "—"}
            />
           
          </Col>
        </Row>
      </div>
    );
  }

  return (
    <div className="w-100">
      <Row className="g-0">
        <Col xs={12} md={6}>
          <DetailsRow title={nameLabel} value={name ?? "—"} />
        </Col>
        <Col xs={12} md={6}>
          <DetailsRow title="Date of Birth" value={dobDisplay} />
        </Col>
      </Row>
      <Row className="g-0">
        <Col xs={12} md={6}>
          <DetailsRow title="Gender" value={genderLabel ?? "—"} />
        </Col>
        <Col xs={12} md={6}>
          <DetailsRow title="Email" value={email ?? "—"} />
        </Col>
      </Row>
      <Row className="g-0">
        <Col xs={12} md={6}>
          <DetailsRow title="Phone Number" value={phone ?? "—"} />
        </Col>
        <Col xs={12} md={6}>
          <DetailsRow title="Registered Date" value={regDisplay} />
        </Col>
      </Row>
      {showLastService ? (
        <Row className="g-0">
          <Col xs={12} md={6}>
            <DetailsRow
              title="Last Service Date"
              value={formatDate(lastRaw)}
            />
          </Col>
        </Row>
      ) : null}
    </div>
  );
}

/** Full-width label + value (long address / schedule); same 4/8 split as `DetailsRow`. */
export function WideLabelValueBlock({
  label,
  children,
  whiteSpace = "normal",
}: {
  label: string;
  children: ReactNode;
  whiteSpace?: "pre-line" | "normal";
  /** @deprecated Ignored — layout uses Bootstrap cols like quote view. */
  gap?: string;
}) {
  const content =
    children === null || children === undefined || children === ""
      ? "-"
      : children;
  return (
    <Row className="mb-2 g-1 align-items-start custom-personal-row w-100">
      <Col xs={12} sm={4} className="custom-personal-row-title pe-sm-2">
        {label}
      </Col>
      <Col xs={12} sm={8} className="text-break" style={{ minWidth: 0 }}>
        <div
          className="custom-personal-row-value text-wrap"
          style={{
            width: "auto",
            maxWidth: "100%",
            whiteSpace,
            wordBreak: "break-word",
          }}
        >
          {content}
        </div>
      </Col>
    </Row>
  );
}

export const FullDetailsRow = ({
  title,
  value,
}: {
  title: string;
  value: any;
}) => {
  const displayValue =
    value === undefined || value === "" || value === null ? "-" : value;

  return (
    <Row className="row custom-personal-row">
      <label className="col custom-personal-row-title">{title}</label>
      <label className="col custom-personal-row-value text-wrap">
        {displayValue}
      </label>
    </Row>
  );
};

export const DashboardCard = ({
  title,
  count,
  color,
}: {
  title: string;
  count: any;
  color: string;
}) => {
  return (
    <div className="custom-dashboard-border">
      <label className="custom-dashboard-sub-title" style={{ color }}>
        {title}
      </label>
      <label className="custom-dashboard-title-count">{count}</label>
    </div>
  );
};

export const DetailsPaymentStatusRow = ({
  title,
  value,
}: {
  title: string;
  value: any;
}) => {
  return (
    <Row className="row custom-personal-row">
      <label className="col custom-personal-row-title">{title}</label>
      <label
        className={`col custom-${value === "Paid" ? "active" : "inactive"}`}
      >
        {value ? value : "-"}
      </label>
    </Row>
  );
};

export const DetailsOrderStatusRow = ({
  title,
  value,
}: {
  title: string;
  value: number | undefined | null;
}) => {
  const status = ORDER_STATUS_LABELS.get(value ?? -1)?.label || "-";

  let color = "";

  if (value === 1) {
    color = "var(--btn-pending)";
  } else if (value === 2) {
    color = "var(--primary-color)";
  } else if (value === 3) {
    color = "var(--btn-success)";
  } else if (value === 4) {
    color = "var(--btn-danger)";
  }

  return (
    <div className="info-detail-inline-row custom-personal-row">
      <span className="info-detail-inline-label custom-personal-row-title">
        {title}
      </span>
      <span
        className="info-detail-inline-value custom-personal-row-value text-break"
        style={{ color, whiteSpace: "normal" }}
      >
        {status}
      </span>
    </div>
  );
};

export const DetailsResolveStatusRow = ({
  title,
  value,
}: {
  title: string;
  value: number | undefined | null;
}) => {
  const status = ResolveStatusEnum.get(value ?? -1)?.label || "-";

  let color = "";

  if (value === 1) {
    color = "var(--btn-pending)";
  } else if (value === 2) {
    color = "var(--btn-success)";
  } else if (value === 3) {
    color = "var(--btn-danger)";
  }

  return (
    <Row className="row custom-personal-row">
      <label className="col custom-personal-row-title">{title}</label>
      <label className={`col custom-personal-row-value`} style={{ color }}>
        {status}
      </label>
    </Row>
  );
};

// export function convertToUTC(timeStr: string): string {
//     const today: string = new Date().toISOString().split('T')[0];
//     const localDateTime: Date = new Date(`${today} ${timeStr}`);
//     return localDateTime.toISOString();
// }

export const priceCell = (field: string) => {
  return ({ row }: { row: { original: Record<string, any> } }): JSX.Element => {
    const value = row.original?.[field];

    return (
      <span>
        {value !== undefined && value !== null
          ? `${AppConstant.currencySymbol}${value}`
          : "-"}
      </span>
    );
  };
};

export const formatUtcToLocalTime = (utcString: string): string => {
  try {
    const date = new Date(utcString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
};

export const DetailsRowLink = ({
  title,
  value,
  onClick,
}: {
  title: string;
  value: number | null | undefined;
  onClick: () => void;
}) => {
  return (
    <Row className="row custom-personal-row">
      <label className="col custom-personal-row-title">{title}</label>
      <label className="col custom-personal-row-value">
        <button
          type="button"
          className="btn btn-link p-0 align-baseline text-decoration-underline"
          onClick={onClick}
        >
          {value === undefined || value === null ? "0" : value}
        </button>
      </label>
    </Row>
  );
};

export const DetailsRowStatus = ({
  title,
  isActive,
}: {
  title: string;
  isActive: boolean;
}) => {
  return (
    <Row className="row custom-personal-row">
      <label className="col custom-personal-row-title">{title}</label>
      <div className="col custom-personal-row-value custom-radio-button">
        {getStatusOptions().map(({ label, value }) => (
          <label key={value} className="custom-radio">
            <input
              type="radio"
              name={`status-${title}`}
              value={value}
              checked={isActive === (value.toString() === "true")}
              readOnly
            />
            <span className="checkmark"></span> {label}
          </label>
        ))}
      </div>
    </Row>
  );
};

export const DetailsRowLinkDocument = ({
  title,
  isEditable,
  onAddClick,
  onViewClick,
  onDeleteClick,
  hideAdd,
  uploadedFileName,
}: {
  title: string;
  isEditable: boolean;
  onAddClick: () => void;
  onViewClick: () => void;
  onDeleteClick?: () => void;
  /** When false and not editable, hide the Add action (e.g. static verification preview rows). */
  hideAdd?: boolean;
  /** When set (e.g. add-partner flow), show image uploaded plus filename instead of Add; click opens replace upload. */
  uploadedFileName?: string | null;
}) => {
  const trimmedUploaded = String(uploadedFileName ?? "").trim();

  return (
    <Row className="row custom-personal-row">
      <Col className="custom-document-title">{title}</Col>
      <Col xs={6}>
        {isEditable ? (
          <>
            <label
              onClick={(e) => {
                e.preventDefault();
                onViewClick();
              }}
              className="custom-document-view mb-0"
            >
              View
            </label>
            <span className="text-muted mx-1">|</span>
            <label
              onClick={(e) => {
                e.preventDefault();
                onAddClick();
              }}
              className="custom-document-delete mb-0"
              title="Replace document"
            >
              Update
            </label>
          </>
        ) : hideAdd ? (
          <span className="text-muted small">—</span>
        ) : trimmedUploaded ? (
          <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
            <label
              onClick={(e) => {
                e.preventDefault();
                onViewClick();
              }}
              className="custom-document-view mb-0 d-inline-flex align-items-center gap-1"
              title="View document"
            >
              <i className="bi bi-eye" aria-hidden />
            </label>
            <span className="text-muted">|</span>
            <label
              onClick={(e) => {
                e.preventDefault();
                onAddClick();
              }}
              className="custom-document-delete mb-0"
              title="Replace document"
            >
              ReUpload
            </label>
            {onDeleteClick ? (
              <>
                <span className="text-muted">|</span>
                <label
                  onClick={(e) => {
                    e.preventDefault();
                    onDeleteClick();
                  }}
                  className="custom-document-delete mb-0"
                  title="Remove document"
                >
                  Delete
                </label>
              </>
            ) : null}
          </div>
        ) : (
          <label
            onClick={(e) => {
              e.preventDefault();
              onAddClick();
            }}
            className="custom-document-add"
          >
            Add
          </label>
        )}
      </Col>
    </Row>
  );
};

export const getRoleLabel = (roleId: number): string => {
  return RoleEnum.get(roleId)?.label ?? "Unknown Role";
};


// --- Catalog request moderation (category/service approval rows) ---

export type RequestApprovalStatus = "pending" | "approved" | "rejected";

const CATALOG_MODERATION_KEYS = [
  "approval_status",
  "is_request",
  "is_rejected",
  "requested_by",
  "rejection_reason",
] as const;

/** Row is a partner/admin service or category request (not plain catalog). */
export function isCatalogRequestRow(
  record: Record<string, unknown> | null | undefined
): boolean {
  if (!record) return false;
  if (record.is_request === true) return true;
  if (record.requested_by != null && record.requested_by !== "") return true;
  const ap = String(record.approval_status ?? "")
    .trim()
    .toLowerCase();
  return (
    ap === "pending" ||
    ap === "approved" ||
    ap === "approve" ||
    ap === "rejected" ||
    ap === "reject"
  );
}

export function mapApprovalStatusFromRecord(
  record: Record<string, unknown> | null | undefined
): RequestApprovalStatus {
  if (!record) return "approved";
  const raw = String(record.approval_status ?? "")
    .trim()
    .toLowerCase();
  if (raw === "pending") return "pending";
  if (raw === "approved" || raw === "approve") return "approved";
  if (raw === "rejected" || raw === "reject") return "rejected";
  if (record.is_rejected === true) return "rejected";
  if (record.is_request === true) return "pending";
  if (record.is_rejected === false) return "approved";
  return record.is_active === false ? "rejected" : "approved";
}

export function requestApprovalStatusLabel(
  status: RequestApprovalStatus
): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function requestApprovalStatusColor(
  status: RequestApprovalStatus
): string {
  if (status === "approved") return "#198754";
  if (status === "rejected") return "#dc3545";
  return "#fd7e14";
}

export function formatRequestedBy(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "object") {
    const o = value as { name?: string; id?: string };
    return String(o.name ?? o.id ?? "-");
  }
  return String(value);
}

function mergeModerationDetail(
  row: Record<string, unknown>,
  api: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row, ...api };
  for (const key of CATALOG_MODERATION_KEYS) {
    if (
      (out[key] === undefined || out[key] === null) &&
      row[key] !== undefined
    ) {
      out[key] = row[key];
    }
  }
  if (!String(out.desc ?? "").trim() && row.description) {
    out.desc = row.description;
  }
  return out;
}

export function mergeServiceDetailForDialog<T extends object>(
  row: Record<string, unknown>,
  api: T
): T {
  return mergeModerationDetail(row, api as Record<string, unknown>) as T;
}

export function mergeCategoryDetailForDialog<T extends object>(
  row: Record<string, unknown>,
  api: T
): T {
  return mergeModerationDetail(row, api as Record<string, unknown>) as T;
}
