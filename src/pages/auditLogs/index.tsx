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
    <div className="main-page-content">
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
        toolsInlineClassName="custom-utilty-tools-inline--orders-wide-search"
        hideUtilityActions
        controlSlot={
          <>
            <div style={{ minWidth: "160px", maxWidth: "180px", flex: "0 0 160px" }}>
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
            <div style={{ minWidth: "160px", maxWidth: "180px", flex: "0 0 160px" }}>
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
            className="custom-btn-secondary partner-payout-clear-btn px-3"
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
        theadClass="table-light"
      />
    </div>
  );
};

export default AuditLogsPage;
