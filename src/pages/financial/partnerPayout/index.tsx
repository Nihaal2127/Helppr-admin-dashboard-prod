import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Col, Row } from "react-bootstrap";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UseFormRegister } from "react-hook-form";
import CustomHeader from "../../../components/CustomHeader";
import { FinancialSubPageBackButton } from "../../../components/FinancialSubPageNav";
import CustomUtilityBox from "../../../components/CustomUtilityBox";
import CustomTable from "../../../components/CustomTable";
import CustomActionColumn from "../../../components/CustomActionColumn";
import CustomFormSelect from "../../../components/CustomFormSelect";
import CustomDatePicker from "../../../components/CustomDatePicker";
import { ROUTES } from "../../../routes/Routes";
import { formatDate } from "../../../helper/utility";
import { AppConstant } from "../../../lib/global/AppConstant";
import { useFranchiseHeaderForm } from "../../../lib/global/hooks/useFranchiseScopedGetCount";
import { franchiseIdForApiQuery } from "../../../lib/franchise/headerFranchisePreference";
import { fetchPartnerPayoutList } from "../../../services/partnerPayoutService";
import type { PartnerPayoutListRow } from "../../../services/partnerPayoutService";
import AddPayoutDialog from "./AddPayoutDialog";
import { toIsoCalendarDate } from "../../../lib/quote/quoteHelpers";
import {
  patchPartnerPayoutSearchParams,
  readPartnerPayoutListUrl,
} from "../../../lib/financial/partnerPayoutUrl";
import type { ServerTableSortBy } from "../../../lib/global/serverTableSort";

function ShowPartnerPayout() {
  const navigate = useNavigate();
  const {
    register: headerRegister,
    setValue: setHeaderValue,
    franchiseId: headerFranchiseId,
  } = useFranchiseHeaderForm();
  const [searchParams, setSearchParams] = useSearchParams();

  const url = useMemo(
    () => readPartnerPayoutListUrl(searchParams),
    [searchParams]
  );

  const patchUrl = useCallback(
    (updates: Record<string, string | number | undefined | null>) => {
      setSearchParams(
        (prev) => patchPartnerPayoutSearchParams(prev, updates),
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [records, setRecords] = useState<PartnerPayoutListRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<ServerTableSortBy>([
    { id: "partner_name", desc: false },
  ]);

  const franchiseIdForApi = useMemo(
    () => franchiseIdForApiQuery(headerFranchiseId),
    [headerFranchiseId]
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { response, records: rows, totalPages: tp } =
        await fetchPartnerPayoutList(
          url.page,
          url.limit,
          {
            search: url.search,
            wallet_status: url.walletStatus,
            from_date: url.fromDate,
            to_date: url.toDate,
            franchise_id: franchiseIdForApi,
          },
          sortBy,
          { skipLoader: true }
        );
      if (response) {
        setRecords(rows);
        setTotalPages(Math.max(1, tp || 1));
      } else {
        setRecords([]);
        setTotalPages(1);
      }
    } finally {
      setLoading(false);
    }
  }, [
    franchiseIdForApi,
    url.page,
    url.limit,
    url.search,
    url.walletStatus,
    url.fromDate,
    url.toDate,
    sortBy,
  ]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    const fid = url.franchiseId;
    if (fid && fid !== headerFranchiseId) {
      setHeaderValue("franchise_id", fid, { shouldValidate: false });
    }
  }, [url.franchiseId, headerFranchiseId, setHeaderValue]);

  useEffect(() => {
    const fid = franchiseIdForApiQuery(headerFranchiseId);
    if (fid !== url.franchiseId) {
      patchUrl({ franchise_id: fid || undefined, page: 1 });
    }
  }, [headerFranchiseId, url.franchiseId, patchUrl]);

  const handleViewPartner = useCallback(
    (row: PartnerPayoutListRow) => {
      const mongoId = row._id?.trim();
      if (!mongoId) return;
      navigate(
        `${ROUTES.PARTNER_PAYOUT_SHOW.path}?id=${encodeURIComponent(mongoId)}`
      );
    },
    [navigate]
  );

  const columns = useMemo(
    () => [
      {
        Header: "SR No",
        id: "sr",
        accessor: "_id",
        disableSortBy: true,
        Cell: ({ row }: { row: { index: number } }) =>
          (url.page - 1) * url.limit + row.index + 1,
      },
      {
        Header: "Partner ID",
        accessor: "partner_id",
        className: "text-start",
        Cell: ({ row }: { row: { original: PartnerPayoutListRow } }) => (
          <span className="font-monospace user-select-all">
            {row.original.partner_id || "—"}
          </span>
        ),
      },
      {
        Header: "Partner Name",
        accessor: "partner_name",
        className: "text-start",
        Cell: ({ row }: { row: { original: PartnerPayoutListRow } }) =>
          row.original.partner_name?.trim() || "—",
      },
      {
        Header: "Total Wallet Amount",
        accessor: "total_wallet_amount",
        className: "text-end",
        Cell: ({ row }: { row: { original: PartnerPayoutListRow } }) => {
          const n = Number(row.original.total_wallet_amount) || 0;
          return `${AppConstant.currencySymbol}${n.toFixed(2)}`;
        },
      },
      {
        Header: "Last Withdraw Amount",
        accessor: "last_withdraw_amount",
        className: "text-end",
        Cell: ({ row }: { row: { original: PartnerPayoutListRow } }) => {
          const n = Number(row.original.last_withdraw_amount) || 0;
          return `${AppConstant.currencySymbol}${n.toFixed(2)}`;
        },
      },
      {
        Header: "Last Withdraw Date",
        accessor: "last_withdraw_date",
        Cell: ({ row }: { row: { original: PartnerPayoutListRow } }) => {
          const raw = row.original.last_withdraw_date;
          if (!raw) return "—";
          const d = formatDate(raw);
          return d !== "-" ? d : raw;
        },
      },
      {
        Header: "Wallet Status",
        accessor: "wallet_status",
        Cell: ({ row }: { row: { original: PartnerPayoutListRow } }) => {
          const s = String(row.original.wallet_status ?? "").toLowerCase();
          if (s === "paid") return "Paid";
          if (s === "pending") return "Pending";
          return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
        },
      },
      {
        Header: "Actions",
        id: "actions",
        accessor: "_id",
        disableSortBy: true,
        Cell: ({ row }: { row: { original: PartnerPayoutListRow } }) => (
          <CustomActionColumn
            row={row}
            onView={(r) => handleViewPartner(r.original)}
          />
        ),
      },
    ],
    [url.page, url.limit, handleViewPartner]
  );

  const filtersActive =
    !!url.search ||
    !!url.fromDate ||
    !!url.toDate ||
    url.walletStatus !== "all";

  const filterControls = (
    <Row className="row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-3 mb-3 align-items-end">
      <Col>
        <CustomFormSelect
          label="Wallet Status"
          controlId="wallet_status_filter"
          register={headerRegister as unknown as UseFormRegister<any>}
          options={[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "paid", label: "Paid" },
          ]}
          fieldName="wallet_status_filter"
          defaultValue={url.walletStatus}
          setValue={
            setHeaderValue as (
              name: string,
              value: any,
              options?: { shouldValidate?: boolean }
            ) => void
          }
          asCol={false}
          noBottomMargin
          onChange={(e) =>
            patchUrl({ wallet_status: e.target.value, page: 1 })
          }
        />
      </Col>
      <Col>
        <CustomDatePicker
          label="From Date"
          controlId="from_date_filter"
          selectedDate={url.fromDate || null}
          onChange={(date) => {
            const value = toIsoCalendarDate(date) ?? "";
            patchUrl({ from_date: value || undefined, page: 1 });
          }}
          register={headerRegister as unknown as UseFormRegister<any>}
          setValue={setHeaderValue as (name: string, value: any) => void}
          asCol={false}
          groupClassName="mb-0 w-100 fw-medium"
          placeholderText="From Date"
          filterDate={() => true}
        />
      </Col>
      <Col>
        <CustomDatePicker
          label="To Date"
          controlId="to_date_filter"
          selectedDate={url.toDate || null}
          onChange={(date) => {
            const value = toIsoCalendarDate(date) ?? "";
            patchUrl({ to_date: value || undefined, page: 1 });
          }}
          register={headerRegister as unknown as UseFormRegister<any>}
          setValue={setHeaderValue as (name: string, value: any) => void}
          asCol={false}
          groupClassName="mb-0 w-100 fw-medium"
          placeholderText="To Date"
          filterDate={() => true}
        />
      </Col>
      <Col xs="auto" className="d-flex align-items-end">
        <Button
          variant="outline-secondary"
          size="sm"
          className="custom-btn-secondary partner-payout-clear-btn px-3"
          type="button"
          disabled={!filtersActive}
          onClick={() => {
            patchUrl({
              search: undefined,
              from_date: undefined,
              to_date: undefined,
              wallet_status: undefined,
              page: 1,
            });
          }}
        >
          Clear
        </Button>
      </Col>
    </Row>
  );

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Financial — Partner Payout"
        titlePrefix={<FinancialSubPageBackButton />}
        register={headerRegister as unknown as UseFormRegister<any>}
        setValue={setHeaderValue as (name: string, value: any) => void}
        rightActions={
          <Button
            type="button"
            className="custom-btn-secondary w-auto btn btn-primary"
            onClick={() =>
              AddPayoutDialog.show(() => void loadList(), franchiseIdForApi)
            }
          >
            Add Payout
          </Button>
        }
      />

      <CustomUtilityBox
        key={`${url.search}-${url.walletStatus}-${url.fromDate}-${url.toDate}`}
        searchOnlyToolbar
        title="Partner Payout"
        searchHint="Search partner name or ID…"
        onSearch={(value) => {
          patchUrl({ search: value.trim() || undefined, page: 1 });
        }}
        syncKeyword={url.search}
      />

      {filterControls}

      <CustomTable
        columns={columns}
        data={records}
        pageSize={url.limit}
        currentPage={url.page}
        totalPages={totalPages}
        onPageChange={(page: number) => patchUrl({ page })}
        onLimitChange={(ps: number) => {
          patchUrl({ limit: ps, page: 1 });
        }}
        isLoading={loading}
        manualSortBy
        sortBy={sortBy}
        onSortChange={(next) => {
          setSortBy(next);
          patchUrl({ page: 1 });
        }}
        theadClass="table-light"
        tableClass="partner-payout-react-table"
        dynamicRowBackground={false}
      />
    </div>
  );
}

export { ShowPartnerPayout };
export default ShowPartnerPayout;
