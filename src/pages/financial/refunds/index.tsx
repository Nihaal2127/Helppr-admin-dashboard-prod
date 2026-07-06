import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import { useForm, UseFormRegister } from "react-hook-form";
import CustomHeader from "../../../components/CustomHeader";
import { FinancialSubPageBackButton } from "../../../components/FinancialSubPageNav";
import CustomUtilityBox from "../../../components/CustomUtilityBox";
import CustomTable from "../../../components/CustomTable";
import CustomDatePicker from "../../../components/CustomDatePicker";
import { AppConstant } from "../../../lib/global/AppConstant";
import { useFranchiseHeaderForm } from "../../../lib/global/hooks/useFranchiseScopedGetCount";
import { franchiseIdForApiQuery } from "../../../lib/franchise/headerFranchisePreference";
import { showSuccessAlert } from "../../../lib/global/alertHelper";
import { formatDate } from "../../../helper/utility";
import {
  createRefund,
  fetchRefundEligibleOrders,
  fetchRefundList,
} from "../../../services/refundService";
import type {
  RefundEligibleOrder,
  RefundListRow,
} from "../../../services/refundService";
import AddEditRefund, {
  RefundFormPayload,
  RefundRow,
} from "./AddEditRefund";

function money(n: number | null | undefined): string {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return "—";
  return `${AppConstant.currencySymbol}${Number(n).toFixed(2)}`;
}

const toIsoCalendarDate = (date: Date | null): string | null => {
  if (!date) return null;
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

function listRowToTableRow(row: RefundListRow): RefundRow {
  return {
    _id: row._id,
    order_id: row.order_mongo_id || row.order_id,
    order_unique_id: row.order_unique_id,
    user_name: row.user_name,
    total_amount: row.total_amount,
    user_paid: row.user_paid,
    refund_amount: row.refund_amount,
    from_admin_commission: row.from_admin_commission,
    from_partner_wallet: row.from_partner_wallet,
    created_at: row.date,
  };
}

function eligibleToOption(o: RefundEligibleOrder) {
  return {
    _id: o._id,
    order_unique_id: o.order_unique_id,
    user_name: o.user_name,
    total_amount: o.total_amount,
    user_paid: o.user_paid,
    refundable_amount: o.refundable_amount,
    admin_payable_amount: o.admin_payable_amount,
    partner_payable_amount: o.partner_payable_amount,
  };
}

const RefundsPage = () => {
  const {
    register: headerRegister,
    setValue: setHeaderValue,
    franchiseId: headerFranchiseId,
  } = useFranchiseHeaderForm();

  const { register: quoteFilterRegister, setValue: setQuoteFilterValue } =
    useForm<{
      from_date: string;
      to_date: string;
    }>({
      defaultValues: { from_date: "", to_date: "" },
    });

  const franchiseIdForApi = useMemo(
    () => franchiseIdForApiQuery(headerFranchiseId),
    [headerFranchiseId]
  );

  const [loading, setLoading] = useState(true);
  const [refundRows, setRefundRows] = useState<RefundRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [refundOrderOptions, setRefundOrderOptions] = useState<
    ReturnType<typeof eligibleToOption>[]
  >([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadRefundList = useCallback(async () => {
    setLoading(true);
    try {
      const keyword = searchValue.trim();
      const { response, records, totalPages: tp } = await fetchRefundList(
        currentPage,
        pageSize,
        {
          ...(keyword && { order_id: keyword, user_name: keyword }),
          from_date: fromDate ?? undefined,
          to_date: toDate ?? undefined,
          franchise_id: franchiseIdForApi,
        },
        [{ id: "refund_date", desc: true }],
        { skipLoader: true }
      );
      if (response) {
        setRefundRows(records.map(listRowToTableRow));
        setTotalPages(Math.max(1, tp || 1));
      } else {
        setRefundRows([]);
        setTotalPages(1);
      }
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    pageSize,
    searchValue,
    fromDate,
    toDate,
    franchiseIdForApi,
  ]);

  const loadEligibleOrders = useCallback(async () => {
    setEligibleLoading(true);
    try {
      const { response, orders } = await fetchRefundEligibleOrders({
        franchise_id: franchiseIdForApi,
        limit: 250,
      });
      if (response) {
        setRefundOrderOptions(orders.map(eligibleToOption));
      } else {
        setRefundOrderOptions([]);
      }
    } finally {
      setEligibleLoading(false);
    }
  }, [franchiseIdForApi]);

  useEffect(() => {
    void loadRefundList();
  }, [loadRefundList]);

  useEffect(() => {
    if (!showRefundModal) return;
    void loadEligibleOrders();
  }, [showRefundModal, loadEligibleOrders]);

  const handleOpenRefundModal = () => {
    setShowRefundModal(true);
  };

  const handleRefundSave = async (payload: RefundFormPayload) => {
    setSubmittingRefund(true);
    try {
      const ok = await createRefund({
        order_id: payload.order_id,
        refund_amount: payload.refund_amount,
        from_admin_commission: payload.from_admin_commission,
        from_partner_wallet: payload.from_partner_wallet,
        date: payload.created_at,
        notes: payload.notes,
      });
      if (!ok) return;

      setShowRefundModal(false);
      showSuccessAlert("Refund recorded successfully.");
      setCurrentPage(1);
      await loadRefundList();
    } finally {
      setSubmittingRefund(false);
    }
  };

  const refundColumns = useMemo(
    () => [
      {
        Header: "S.No",
        accessor: "serial_no",
        Cell: ({ row }: { row: { index: number } }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      {
        Header: "Order ID",
        accessor: "order_unique_id",
      },
      { Header: "User Name", accessor: "user_name" },
      {
        Header: "Total Amount",
        accessor: "total_amount",
        Cell: ({ row }: { row: { original: RefundRow } }) =>
          money(row.original.total_amount),
      },
      {
        Header: "User Paid",
        accessor: "user_paid",
        Cell: ({ row }: { row: { original: RefundRow } }) =>
          money(row.original.user_paid),
      },
      {
        Header: "Refund Amount",
        accessor: "refund_amount",
        Cell: ({ row }: { row: { original: RefundRow } }) =>
          money(row.original.refund_amount),
      },
      {
        Header: "From Admin Commission",
        accessor: "from_admin_commission",
        Cell: ({ row }: { row: { original: RefundRow } }) =>
          money(row.original.from_admin_commission),
      },
      {
        Header: "From Partner Wallet",
        accessor: "from_partner_wallet",
        Cell: ({ row }: { row: { original: RefundRow } }) =>
          money(row.original.from_partner_wallet),
      },
      {
        Header: "Date",
        accessor: "created_at",
        Cell: ({ row }: { row: { original: RefundRow } }) =>
          formatDate(row.original.created_at || ""),
      },
    ],
    [currentPage, pageSize]
  );

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Financial — Refunds"
        titlePrefix={<FinancialSubPageBackButton />}
        register={headerRegister as unknown as UseFormRegister<any>}
        setValue={setHeaderValue as (name: string, value: any) => void}
        rightActions={
          <Button
            type="button"
            className="custom-btn-secondary w-auto btn btn-primary"
            onClick={handleOpenRefundModal}
          >
            Add Refund
          </Button>
        }
      />

      <CustomUtilityBox
        key={utilitySearchKey}
        title="Refunds"
        searchHint="Search Order ID, User Name..."
        toolsInlineRow
        hideMoreIcon
        controlSlot={
          <>
            <div style={{ minWidth: "220px" }}>
              <CustomDatePicker
                label="From Date"
                controlId="from_date"
                selectedDate={fromDate}
                onChange={(date) => {
                  const next = toIsoCalendarDate(date);
                  setFromDate(next);
                  setCurrentPage(1);
                }}
                register={
                  quoteFilterRegister as unknown as UseFormRegister<any>
                }
                setValue={
                  setQuoteFilterValue as (name: string, value: any) => void
                }
                asCol={false}
                groupClassName="mb-0 w-100 fw-medium"
                placeholderText="From Date"
                filterDate={() => true}
              />
            </div>

            <div style={{ minWidth: "220px" }}>
              <CustomDatePicker
                label="To Date"
                controlId="to_date"
                selectedDate={toDate}
                onChange={(date) => {
                  const next = toIsoCalendarDate(date);
                  setToDate(next);
                  setCurrentPage(1);
                }}
                register={
                  quoteFilterRegister as unknown as UseFormRegister<any>
                }
                setValue={
                  setQuoteFilterValue as (name: string, value: any) => void
                }
                asCol={false}
                groupClassName="mb-0 w-100 fw-medium"
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
            disabled={!fromDate && !toDate && !searchValue.trim()}
            onClick={() => {
              setFromDate(null);
              setToDate(null);
              setSearchValue("");
              setQuoteFilterValue("from_date", "");
              setQuoteFilterValue("to_date", "");
              setUtilitySearchKey((k) => k + 1);
              setCurrentPage(1);
            }}
          >
            Clear
          </Button>
        }
        hideUtilityActions
        onSearch={(value) => {
          setSearchValue(value);
          setCurrentPage(1);
        }}
        syncKeyword={searchValue}
      />

      {loading ? (
        <div className="bg-white border rounded p-4 text-center">
          Loading...
        </div>
      ) : (
        <CustomTable
          columns={refundColumns}
          data={refundRows}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page: number) => setCurrentPage(page)}
          onLimitChange={(updatedPageSize: number) => {
            setPageSize(updatedPageSize);
            setCurrentPage(1);
          }}
          theadClass="table-light"
        />
      )}

      <AddEditRefund
        show={showRefundModal}
        onHide={() => setShowRefundModal(false)}
        orderOptions={refundOrderOptions}
        ordersLoading={eligibleLoading}
        refundData={null}
        onSave={handleRefundSave}
        isSubmitting={submittingRefund}
      />
    </div>
  );
};

export default RefundsPage;
