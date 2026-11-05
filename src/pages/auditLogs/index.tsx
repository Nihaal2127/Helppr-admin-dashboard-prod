import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { useForm, UseFormRegister } from "react-hook-form";
import CustomDatePicker from "../../components/CustomDatePicker";
import CustomHeader from "../../components/CustomHeader";
import CustomTable from "../../components/CustomTable";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import { formatDate } from "../../helper/utility";
import { apiRequest } from "../../lib/global/remote/apiHelper";
import { toIsoCalendarDate } from "../../lib/quote/quoteHelpers";

type AuditLogRow = {
  id: string;
  sNo: number;
  createdDate: string;
  module: string;
  action: string;
  reference: string;
  description: string;
  role: string;
  performedBy: string;
  franchise: string;
  status: string;
};

function displayText(value: unknown): string {
  const text = value == null ? "" : String(value).trim();
  return text || "—";
}

function rawText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

/** Role from `performed_by_role` on `GET /audit-log/getAll`. */
function rawAuditRole(raw: Record<string, unknown>): unknown {
  const performedByRole = raw.performed_by_role;
  if (performedByRole && typeof performedByRole === "object" && !Array.isArray(performedByRole)) {
    const row = performedByRole as Record<string, unknown>;
    const nested = row.name ?? row.label ?? row.role ?? row.role_name;
    if (rawText(nested)) return nested;
  }
  if (rawText(performedByRole)) return performedByRole;

  const direct = [
    raw.role,
    raw.performed_by_role_name,
    raw.user_role,
    raw.role_name,
    raw.actor_role,
    raw.performed_by_type,
    raw.user_type,
  ].find((value) => rawText(value));
  if (direct != null) return direct;

  const actor = raw.performed_by;
  if (actor && typeof actor === "object" && !Array.isArray(actor)) {
    const row = actor as Record<string, unknown>;
    return (
      row.role ??
      row.role_name ??
      row.user_role ??
      row.type ??
      row.user_type
    );
  }
  return undefined;
}

/** Dashboard role codes and user-type numbers as readable labels. */
function formatAuditRole(value: unknown): string {
  const text = rawText(value);
  if (!text) return "—";
  const key = text.toLowerCase().replace(/[\s-]+/g, "_");
  const labels: Record<string, string> = {
    "5": "Super Admin",
    admin: "Super Admin",
    super_admin: "Super Admin",
    superadmin: "Super Admin",
    "1": "Franchise Admin",
    franchise_admin: "Franchise Admin",
    "3": "Employee",
    employee: "Employee",
    franchise_employee: "Employee",
    "6": "Staff",
    staff: "Staff",
    "2": "Partner",
    partner: "Partner",
    "4": "Customer",
    customer: "Customer",
    user: "Customer",
  };
  return labels[key] ?? text;
}

function isSuperAdminRole(value: unknown): boolean {
  return formatAuditRole(value) === "Super Admin";
}

/** Franchise name, except a super admin action shows Super Admin instead of a hyphen or franchise name. */
function formatAuditFranchise(
  franchiseName: unknown,
  role: unknown
): string {
  if (isSuperAdminRole(role)) return "Super Admin";
  return displayText(franchiseName);
}

/** Time only from `created_at`, e.g. `6:30 PM`. */
function formatAuditTime(isoString: string): string {
  const raw = String(isoString ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${period}`;
}

function mapAuditLogRow(raw: Record<string, unknown>, index: number): AuditLogRow {
  const sNo = Number(raw.s_no);
  const role = rawAuditRole(raw);
  return {
    id: String(raw._id ?? index),
    sNo: Number.isFinite(sNo) && sNo > 0 ? sNo : index + 1,
    createdDate: String(raw.created_at ?? ""),
    module: displayText(raw.module),
    action: displayText(raw.action),
    reference: displayText(raw.reference),
    description: displayText(raw.description),
    role: formatAuditRole(role),
    performedBy: displayText(raw.performed_by_name),
    franchise: formatAuditFranchise(raw.franchise_name, role),
    status: displayText(raw.status),
  };
}

function parseAuditLogList(payload: Record<string, unknown> | undefined): {
  records: AuditLogRow[];
  totalPages: number;
} {
  const root = payload ?? {};
  const inner =
    root.data != null && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;
  const recordsRaw = (inner?.records ?? root.records ?? []) as unknown[];
  const records = Array.isArray(recordsRaw)
    ? recordsRaw
        .filter(
          (row): row is Record<string, unknown> =>
            row != null && typeof row === "object" && !Array.isArray(row)
        )
        .map(mapAuditLogRow)
    : [];
  const totalPagesVal = Number(inner?.totalPages ?? root.totalPages ?? 0);
  return {
    records,
    totalPages: Number.isFinite(totalPagesVal) ? totalPagesVal : 0,
  };
}

const AUDIT_LOGS_PAGE_STYLES = `
  .audit-logs-page .custom-page-header {
    margin-bottom: 1rem !important;
  }

  .audit-logs-page .custom-utilty-box {
    justify-content: flex-end !important;
    align-items: flex-end !important;
    margin-top: 0 !important;
    margin-bottom: 28px !important;
    width: 100%;
  }

  .audit-logs-page .custom-utilty-box-title {
    display: none !important;
  }

  .audit-logs-page .custom-table-wrapper {
    margin-top: 12px !important;
  }

  .audit-logs-page .audit-logs-tools {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: wrap;
    align-items: flex-end !important;
    justify-content: flex-end !important;
    gap: 12px;
    width: 100%;
    margin-left: auto !important;
    flex: 1 1 auto !important;
  }

  .audit-logs-page .audit-logs-tools .custom-utility-control-slot {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: wrap;
    align-items: flex-end !important;
    justify-content: flex-end !important;
    gap: 12px;
    margin-right: 0 !important;
    flex: 0 0 auto !important;
  }

  .audit-logs-page .audit-logs-date-field {
    width: 168px;
    min-width: 150px;
    max-width: 180px;
    flex: 0 0 168px;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
  }

  .audit-logs-page .audit-logs-date-field .form-label,
  .audit-logs-page .audit-logs-tools > .d-flex.flex-column > label {
    margin-bottom: 4px;
    font-size: 14px;
    font-weight: 600;
    color: #1a1a1a;
    white-space: nowrap;
  }

  .audit-logs-page .audit-logs-tools > .d-flex.flex-column {
    flex: 0 0 420px !important;
    width: 420px !important;
    max-width: 100% !important;
    min-width: 240px;
    margin-bottom: 0 !important;
    align-items: flex-start !important;
  }

  .audit-logs-page .audit-logs-tools .custom-search-container {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
  }

  .audit-logs-page .audit-logs-tools .custom-form-input {
    width: 100% !important;
    height: 42px !important;
    border-radius: 8px !important;
  }

  .audit-logs-page .audit-logs-date-field .form-control,
  .audit-logs-page .audit-logs-date-field input {
    height: 42px !important;
    border-radius: 8px !important;
  }

  .audit-logs-page .audit-logs-tools > .d-flex.align-items-end {
    flex: 0 0 auto !important;
    margin-left: 0 !important;
    align-self: flex-end !important;
  }

  .audit-logs-page .audit-logs-clear-btn {
    background-color: #fff !important;
    border: 1px solid var(--primary-color) !important;
    color: var(--primary-txt-color) !important;
    border-radius: 999px !important;
    width: auto !important;
    min-width: 72px;
    height: 42px !important;
    padding: 0 22px !important;
    font-size: 14px !important;
    font-family: Inter, sans-serif !important;
    font-weight: 500 !important;
    line-height: 1 !important;
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }

  .audit-logs-page .audit-logs-clear-btn:disabled {
    opacity: 0.55;
  }

  @media (max-width: 991.98px) {
    .audit-logs-page .audit-logs-tools {
      justify-content: flex-end !important;
    }

    .audit-logs-page .audit-logs-tools > .d-flex.flex-column {
      flex: 0 1 320px !important;
      width: min(420px, 100%) !important;
    }

    .audit-logs-page .audit-logs-date-field {
      flex: 0 1 150px;
      width: auto;
      max-width: 100%;
    }
  }
`;

const AuditLogsPage = () => {
  const { register, setValue } = useForm();
  const [keyword, setKeyword] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchClearVersion, setSearchClearVersion] = useState(0);
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadAuditLogs = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(pageSize));
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      const search = keyword.trim();
      if (search) params.set("search", search);

      const res = await apiRequest(
        `/audit-log/getAll?${params.toString()}`,
        "GET",
        undefined,
        false,
        true,
        false,
        false,
        signal
      );

      if (signal?.aborted) return;

      if (!res.success) {
        if ((res as { aborted?: boolean }).aborted) return;
        setLogs([]);
        setTotalPages(0);
        return;
      }

      const parsed = parseAuditLogList(
        res.data as Record<string, unknown> | undefined
      );
      setLogs(parsed.records);
      setTotalPages(parsed.totalPages);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [currentPage, pageSize, keyword, fromDate, toDate]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAuditLogs(controller.signal);
    return () => controller.abort();
  }, [loadAuditLogs]);

  const columns = useMemo(
    () => [
      {
        Header: "S.No",
        id: "serial_no",
        Cell: ({ row }: { row: { original: AuditLogRow; index: number } }) =>
          row.original.sNo || (currentPage - 1) * pageSize + row.index + 1,
      },
      {
        Header: "Franchise",
        accessor: "franchise",
      },
      {
        Header: "Module",
        accessor: "module",
      },
      {
        Header: "Action",
        accessor: "action",
      },
      // {
      //   Header: "Reference",
      //   accessor: "reference",
      // },
      {
        Header: "Description",
        accessor: "description",
      },
      {
        Header: "Role",
        accessor: "role",
      },
      {
        Header: "Performed By",
        accessor: "performedBy",
      },
      {
        Header: "Create Date",
        accessor: "createdDate",
        Cell: ({ row }: { row: { original: AuditLogRow } }) =>
          formatDate(row.original.createdDate),
      },
      {
        Header: "Time",
        id: "createdTime",
        Cell: ({ row }: { row: { original: AuditLogRow } }) =>
          formatAuditTime(row.original.createdDate),
      },
      // {
      //   Header: "Status",
      //   accessor: "status",
      // },
    ],
    [currentPage, pageSize]
  );

  const clearFiltersDisabled =
    !keyword.trim() && !searchDraft.trim() && !fromDate && !toDate;

  const clearFilters = () => {
    setKeyword("");
    setSearchDraft("");
    setFromDate("");
    setToDate("");
    setSearchClearVersion((v) => v + 1);
    setUtilitySearchKey((k) => k + 1);
    setValue("audit_from_date", "", { shouldValidate: false });
    setValue("audit_to_date", "", { shouldValidate: false });
    setCurrentPage(1);
  };

  return (
    <div className="main-page-content audit-logs-page">
      <style>{AUDIT_LOGS_PAGE_STYLES}</style>
      <CustomHeader
        title="Audit Logs"
        hideFranchiseDropdown
        hideNotifications
      />

      <CustomUtilityBox
        key={`audit-logs-utility-${utilitySearchKey}`}
        searchHint="Search module, reference, action, user"
        hideMoreIcon
        toolsInlineRow
        toolsInlineClassName="audit-logs-tools"
        hideUtilityActions
        controlSlot={
          <>
            <div className="audit-logs-date-field">
              <Form.Label className="mb-1 fw-medium">From Date</Form.Label>
              <CustomDatePicker
                label=""
                controlId="audit_from_date"
                selectedDate={fromDate || null}
                onChange={(date) => {
                  setFromDate(toIsoCalendarDate(date) ?? "");
                  setCurrentPage(1);
                }}
                register={register as unknown as UseFormRegister<any>}
                setValue={setValue}
                asCol={false}
                groupClassName="mb-0 w-100"
                placeholderText="From Date"
                filterDate={() => true}
              />
            </div>
            <div className="audit-logs-date-field">
              <Form.Label className="mb-1 fw-medium">To Date</Form.Label>
              <CustomDatePicker
                label=""
                controlId="audit_to_date"
                selectedDate={toDate || null}
                onChange={(date) => {
                  setToDate(toIsoCalendarDate(date) ?? "");
                  setCurrentPage(1);
                }}
                register={register as unknown as UseFormRegister<any>}
                setValue={setValue}
                asCol={false}
                groupClassName="mb-0 w-100"
                placeholderText="To Date"
                filterDate={() => true}
              />
            </div>
          </>
        }
        afterSearchSlot={
          <Button
            variant="outline-secondary"
            size="sm"
            className="audit-logs-clear-btn"
            type="button"
            disabled={clearFiltersDisabled}
            onClick={clearFilters}
          >
            Clear
          </Button>
        }
        onSearch={(value) => {
          setKeyword(value);
          setSearchDraft(value);
          setCurrentPage(1);
        }}
        onSearchInputChange={setSearchDraft}
        syncKeyword={keyword}
        searchClearVersion={searchClearVersion}
      />

      <CustomTable
        columns={columns}
        data={logs}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={logs.length === 0 ? 0 : totalPages}
        onPageChange={(page: number) => setCurrentPage(page)}
        onLimitChange={(updatedPageSize: number) => {
          setPageSize(updatedPageSize);
          setCurrentPage(1);
        }}
        theadClass="table-light"
        isPagination={logs.length > 0}
        isLoading={loading}
      />
    </div>
  );
};

export default AuditLogsPage;
