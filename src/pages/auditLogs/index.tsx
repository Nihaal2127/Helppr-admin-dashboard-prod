import React, { useEffect, useMemo, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { useForm, UseFormRegister } from "react-hook-form";
import CustomDatePicker from "../../components/CustomDatePicker";
import CustomHeader from "../../components/CustomHeader";
import CustomTable from "../../components/CustomTable";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import { formatDate } from "../../helper/utility";
import { toIsoCalendarDate } from "../../lib/quote/quoteHelpers";

type AuditLogRow = {
  id: string;
  createdDate: string;
  module: string;
  action: string;
  reference: string;
  description: string;
  performedBy: string;
  franchise: string;
  status: string;
};

const AUDIT_LOGS: AuditLogRow[] = [];

const AUDIT_LOGS_PAGE_STYLES = `
  .audit-logs-page .custom-page-header {
    margin-bottom: 1rem !important;
  }

  .audit-logs-page .custom-utilty-box {
    justify-content: flex-end !important;
    align-items: flex-end !important;
    margin-top: 0 !important;
    margin-bottom: 16px !important;
    width: 100%;
  }

  .audit-logs-page .custom-utilty-box-title {
    display: none !important;
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

  .audit-logs-page .custom-table-wrapper,
  .audit-logs-page .custom-table-wrapper--scroll {
    border-radius: 12px;
    border: 1px solid #740909;
    background: #fff;
    overflow-x: scroll !important;
    overflow-y: auto !important;
    scrollbar-gutter: stable;
    scrollbar-width: auto;
    scrollbar-color: #740909 #c45a5a;
  }

  .audit-logs-page .custom-table-wrapper::-webkit-scrollbar,
  .audit-logs-page .custom-table-wrapper--scroll::-webkit-scrollbar {
    height: 12px;
    width: 12px;
    display: block;
  }

  .audit-logs-page .custom-table-wrapper::-webkit-scrollbar-track,
  .audit-logs-page .custom-table-wrapper--scroll::-webkit-scrollbar-track {
    background: #c45a5a;
    border-bottom-left-radius: 11px;
    border-bottom-right-radius: 11px;
  }

  .audit-logs-page .custom-table-wrapper::-webkit-scrollbar-thumb,
  .audit-logs-page .custom-table-wrapper--scroll::-webkit-scrollbar-thumb {
    background: #740909;
    border-radius: 10px;
    min-width: 48px;
  }

  .audit-logs-page .custom-table-wrapper::-webkit-scrollbar-thumb:hover,
  .audit-logs-page .custom-table-wrapper--scroll::-webkit-scrollbar-thumb:hover {
    background: #5c0707;
  }

  .audit-logs-page .custom-table-wrapper::-webkit-scrollbar-corner,
  .audit-logs-page .custom-table-wrapper--scroll::-webkit-scrollbar-corner {
    background: #740909;
  }

  .audit-logs-page #pagination_container {
    box-shadow: none;
  }

  .audit-logs-page .audit-logs-table {
    margin-bottom: 0 !important;
    border: none !important;
    border-collapse: separate !important;
    border-spacing: 0 !important;
    background: #fff;
  }

  .audit-logs-page .audit-logs-table thead th {
    background-color: #740909 !important;
    color: #f7f7f7 !important;
    border: none !important;
    border-right: 1px solid rgba(255, 255, 255, 0.28) !important;
    font-weight: 600 !important;
    font-size: 13px !important;
    padding: 12px 10px !important;
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .audit-logs-page .audit-logs-table thead th:last-child {
    border-right: none !important;
  }

  .audit-logs-page .audit-logs-table thead th:first-child {
    border-top-left-radius: 11px;
  }

  .audit-logs-page .audit-logs-table thead th:last-child {
    border-top-right-radius: 11px;
  }

  .audit-logs-page .audit-logs-table tbody td {
    background-color: #ffffff !important;
    border: none !important;
    border-right: 1px solid #f0f0f0 !important;
    color: #1a1a1a !important;
    font-size: 13px !important;
    padding: 14px 10px !important;
  }

  .audit-logs-page .audit-logs-table tbody td:last-child {
    border-right: none !important;
  }

  .audit-logs-page .audit-logs-table tbody tr:hover td {
    background-color: #ffffff !important;
  }

  .audit-logs-page .audit-logs-table tbody td.text-center {
    font-weight: 600;
    color: #1a1a1a !important;
    padding: 28px 10px !important;
    border-right: none !important;
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

  const filteredLogs = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return AUDIT_LOGS.filter((row) => {
      if (fromDate && row.createdDate < fromDate) return false;
      if (toDate && row.createdDate > toDate) return false;
      if (!query) return true;
      const haystack = [
        row.module,
        row.action,
        row.reference,
        row.description,
        row.performedBy,
        row.franchise,
        row.status,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [keyword, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, fromDate, toDate, pageSize]);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const columns = useMemo(
    () => [
      {
        Header: "S.No",
        id: "serial_no",
        width: 72,
        Cell: ({ row }: { row: { index: number } }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      {
        Header: "Create Date",
        accessor: "createdDate",
        width: 130,
        Cell: ({ row }: { row: { original: AuditLogRow } }) =>
          formatDate(row.original.createdDate),
      },
      {
        Header: "Module",
        accessor: "module",
        width: 170,
      },
      {
        Header: "Action",
        accessor: "action",
        width: 150,
      },
      {
        Header: "Reference",
        accessor: "reference",
        width: 140,
      },
      {
        Header: "Description",
        accessor: "description",
        width: 280,
      },
      {
        Header: "Performed By",
        accessor: "performedBy",
        width: 150,
      },
      {
        Header: "Franchise",
        accessor: "franchise",
        width: 160,
      },
      {
        Header: "Status",
        accessor: "status",
        width: 120,
      },
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
        }}
        onSearchInputChange={setSearchDraft}
        syncKeyword={keyword}
        searchClearVersion={searchClearVersion}
      />

      <CustomTable
        columns={columns}
        data={pageRows}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={filteredLogs.length === 0 ? 0 : totalPages}
        onPageChange={(page: number) => setCurrentPage(page)}
        onLimitChange={(updatedPageSize: number) => {
          setPageSize(updatedPageSize);
          setCurrentPage(1);
        }}
        theadClass="audit-logs-thead"
        tableClass="audit-logs-table"
        isPagination={filteredLogs.length > 0}
        horizontalScroll
        layoutFixed
        dynamicRowBackground={false}
        tableMinWidthPx={1400}
      />
    </div>
  );
};

export default AuditLogsPage;
