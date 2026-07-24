import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button, Col, Form, Row } from "react-bootstrap";
import type { UseFormRegister } from "react-hook-form";
import CustomHeader from "../../../components/CustomHeader";
import { FinancialSubPageBackButton } from "../../../components/FinancialSubPageNav";
import CustomUtilityBox from "../../../components/CustomUtilityBox";
import CustomFormSelect from "../../../components/CustomFormSelect";
import CustomDatePicker from "../../../components/CustomDatePicker";
import {
  formatDate,
  priceCell,
  textUnderlineCell,
} from "../../../helper/utility";
import { dateToLocalYmd } from "../../../helper/dateFormat";
import { AppConstant } from "../../../lib/global/AppConstant";
import { useFranchiseHeaderForm } from "../../../lib/global/hooks/useFranchiseScopedGetCount";
import { franchiseIdForApiQuery } from "../../../lib/franchise/headerFranchisePreference";
import CustomTable from "../../../components/CustomTable";
import {
  fetchFinancial,
  FinancialListFilters,
} from "../../../services/financialService";
import { getCount } from "../../../services/getCountService";
import { FinancialModel } from "../../../lib/models/FinancialModel";
import { showOrderInfoDialog } from "../../../components/order";
import { showUserDetailsDialog } from "../../../components/user";
import { ROUTES } from "../../../routes/Routes";
import type { ServerTableSortBy } from "../../../lib/global/serverTableSort";
import {
  customerPaymentStatusFilterSelectOptions,
  partnerPaymentStatusFilterSelectOptions,
  customerPaymentStatusLabelFromSlug,
  partnerPaymentStatusLabelFromSlug,
} from "../../../lib/financial/paymentStatus";

const ORDER_STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
] as const;

function resolveOrderMongoId(row: FinancialModel): string {
  return String(row.order_id ?? row._id ?? "").trim();
}

function serviceLineOrderStatusLabel(row: FinancialModel): string {
  const slug = row.order_status?.trim().toLowerCase();
  if (slug === "completed") return "Completed";
  if (slug === "in_progress") return "In progress";
  if (slug === "cancelled") return "Cancelled";
  if (slug === "refunded") return "Refunded";
  if (Number(row.service_status) === 3) return "Completed";
  if (Number(row.service_status) === 2) return "In progress";
  if (Number(row.service_status) === 5) return "Refunded";
  return slug ? slug.replace(/_/g, " ") : "—";
}

function isRefundedOrderRow(row: FinancialModel): boolean {
  const slug = String(row.order_status ?? "").trim().toLowerCase();
  if (slug === "refunded") return true;
  return Number(row.service_status) === 5;
}

function customerPaymentStatusCellLabel(row: FinancialModel): string {
  const label = customerPaymentStatusLabelFromSlug(
    row.customer_payment_status
  );
  if (label) return label;
  const pending = Number(row.customer_pending_amount) || 0;
  const paid = Number(row.customer_paid_amount) || 0;
  if (pending <= 0 && paid > 0) return "Paid";
  if (paid > 0 && pending > 0) return "Partially paid";
  return "Unpaid";
}

function partnerPaymentStatusCellLabel(row: FinancialModel): string {
  const label = partnerPaymentStatusLabelFromSlug(row.partner_payment_status);
  if (label) return label;
  const pending = Number(row.pending_to_partner) || 0;
  const paid = Number(row.paid_to_partner) || 0;
  if (pending <= 0 && paid > 0) return "Paid";
  if (paid > 0 && pending > 0) return "Partially paid";
  return "Unpaid";
}

function buildListFilters(p: {
  search?: string;
  sort?: string;
  orderStatus: string;
  customerPaymentScope: string;
  partnerPaymentScope: string;
  fromDate: string;
  toDate: string;
  franchiseId?: string;
}): FinancialListFilters {
  const fid = franchiseIdForApiQuery(p.franchiseId);
  const out: FinancialListFilters = {
    ...(p.search ? { search: p.search } : {}),
    ...(p.sort ? { sort: p.sort } : {}),
    ...(p.orderStatus ? { order_status: p.orderStatus } : {}),
    ...(p.fromDate ? { from_date: p.fromDate } : {}),
    ...(p.toDate ? { to_date: p.toDate } : {}),
    ...(fid ? { franchise_id: fid } : {}),
  };
  if (p.customerPaymentScope) {
    out.customer_payment_status = p.customerPaymentScope;
  }
  if (p.partnerPaymentScope) {
    out.partner_payment_status = p.partnerPaymentScope;
  }
  return out;
}

function formatInrGroupedAmount(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function amountWithPercentLabel(
  amount: number | null | undefined,
  percent: number | null | undefined
): string {
  const sym = AppConstant.currencySymbol;
  const amountNum =
    amount != null && Number.isFinite(Number(amount)) ? Number(amount) : null;
  const pctNum =
    percent != null && Number.isFinite(Number(percent)) ? Number(percent) : null;

  if (amountNum == null && pctNum == null) return "-";
  if (amountNum == null) return `${pctNum}%`;
  const amountStr = `${sym}${formatInrGroupedAmount(amountNum)}`;
  if (pctNum == null) return amountStr;
  return `${amountStr} (${pctNum}%)`;
}

const ORDER_PAYMENTS_STAT_CARD_STYLE: React.CSSProperties = {
  borderColor: "var(--lb-border)",
  cursor: "default",
  maxWidth: "100%",
  boxSizing: "border-box",
};

const OrderPayments = () => {
  const navigate = useNavigate();

  const {
    register: headerRegister,
    setValue: setHeaderValue,
    franchiseId: headerFranchiseId,
  } = useFranchiseHeaderForm();

  const [summary, setSummary] = useState<{
    completedOrders: number;
    inProgressOrders: number;
    totalPartnerPending: number;
    totalUserPending: number;
  }>({
    completedOrders: 0,
    inProgressOrders: 0,
    totalPartnerPending: 0,
    totalUserPending: 0,
  });
  const [financialList, setFinancialList] = useState<FinancialModel[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const fetchRef = useRef(false);

  const [orderStatus, setOrderStatus] = useState("");
  const [customerPaymentScope, setCustomerPaymentScope] = useState("");
  const [partnerPaymentScope, setPartnerPaymentScope] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterEpoch, setFilterEpoch] = useState(0);
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);
  const [appliedSearchKeyword, setAppliedSearchKeyword] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchClearVersion, setSearchClearVersion] = useState(0);
  const [keywordActive, setKeywordActive] = useState(false);
  const [sortBy, setSortBy] = useState<ServerTableSortBy>([]);

  const listParamsRef = useRef<{
    search?: string;
    orderStatus: string;
    customerPaymentScope: string;
    partnerPaymentScope: string;
    fromDate: string;
    toDate: string;
  }>({
    orderStatus: "",
    customerPaymentScope: "",
    partnerPaymentScope: "",
    fromDate: "",
    toDate: "",
  });

  useEffect(() => {
    listParamsRef.current.orderStatus = orderStatus;
    listParamsRef.current.customerPaymentScope = customerPaymentScope;
    listParamsRef.current.partnerPaymentScope = partnerPaymentScope;
    listParamsRef.current.fromDate = fromDate;
    listParamsRef.current.toDate = toDate;
  }, [
    orderStatus,
    customerPaymentScope,
    partnerPaymentScope,
    fromDate,
    toDate,
  ]);

  const dateScopeFilters = useMemo((): FinancialListFilters => {
    const out: FinancialListFilters = {};
    if (fromDate) out.from_date = fromDate;
    if (toDate) out.to_date = toDate;
    const fid = franchiseIdForApiQuery(headerFranchiseId);
    if (fid) out.franchise_id = fid;
    return out;
  }, [fromDate, toDate, headerFranchiseId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fid = franchiseIdForApiQuery(headerFranchiseId);
      const { responseCount, countModel } = await getCount(
        "financial-order-payments",
        {
          ...(fid ? { franchise_id: fid } : {}),
          ...(fromDate ? { from_date: fromDate } : {}),
          ...(toDate ? { to_date: toDate } : {}),
        }
      );
      if (cancelled) return;
      if (!responseCount || !countModel) return;
      setSummary({
        completedOrders: Number(countModel.total_completed_orders) || 0,
        inProgressOrders: Number(countModel.total_in_progress_orders) || 0,
        totalPartnerPending:
          Math.round(
            (Number(countModel.total_partner_pending_amount) || 0) * 100
          ) / 100,
        totalUserPending:
          Math.round(
            (Number(countModel.total_user_pending_amount) || 0) * 100
          ) / 100,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [dateScopeFilters, fromDate, toDate, headerFranchiseId]);

  const runFetch = useCallback(
    async (page: number, size: number) => {
      if (fetchRef.current) return;
      fetchRef.current = true;
      const p = listParamsRef.current;
      const merged = buildListFilters({
        search: p.search,
        orderStatus: p.orderStatus,
        customerPaymentScope: p.customerPaymentScope,
        partnerPaymentScope: p.partnerPaymentScope,
        fromDate: p.fromDate,
        toDate: p.toDate,
        franchiseId: headerFranchiseId,
      });
      const {
        response,
        financials,
        totalPages: tp,
      } = await fetchFinancial(page, size, merged, undefined, sortBy);
      if (response) {
        setFinancialList(financials);
        setTotalPages(tp);
      }
      fetchRef.current = false;
    },
    [sortBy, headerFranchiseId]
  );

  useEffect(() => {
    void runFetch(currentPage, pageSize);
  }, [currentPage, pageSize, filterEpoch, runFetch]);

  const bumpFilters = useCallback(() => {
    setCurrentPage(1);
    setFilterEpoch((e) => e + 1);
  }, []);

  const handleSearch = (value: string) => {
    listParamsRef.current.search = value;
    setAppliedSearchKeyword(value);
    setSearchDraft(value);
    setKeywordActive(!!value.trim());
    setCurrentPage(1);
    setFilterEpoch((e) => e + 1);
  };
  const handleServerSortChange = useCallback(
    (next: { id: string; desc: boolean }[]) => {
      setSortBy(next);
      setCurrentPage(1);
      setFilterEpoch((e) => e + 1);
    },
    []
  );

  const filterControls = (
    <Row className="order-payments-filters-row g-3 mt-1 mb-2 align-items-end flex-nowrap">
      <Col xs="auto" className="order-payments-filter-col">
        <CustomFormSelect
          label="Order Status"
          controlId="Order status"
          register={headerRegister as unknown as UseFormRegister<any>}
          options={[...ORDER_STATUS_OPTIONS]}
          fieldName="order_status_filter"
          defaultValue={orderStatus}
          setValue={
            setHeaderValue as (
              name: string,
              value: any,
              options?: { shouldValidate?: boolean }
            ) => void
          }
          asCol={false}
          noBottomMargin
          onChange={(e) => {
            setOrderStatus(e.target.value);
            listParamsRef.current.orderStatus = e.target.value;
            bumpFilters();
          }}
        />
      </Col>

      <Col xs="auto" className="order-payments-filter-col">
        <CustomFormSelect
          label="Partner Payment Status"
          controlId="Partner payment status"
          register={headerRegister as unknown as UseFormRegister<any>}
          options={partnerPaymentStatusFilterSelectOptions()}
          fieldName="partner_payment_status_filter"
          defaultValue={partnerPaymentScope}
          setValue={
            setHeaderValue as (
              name: string,
              value: any,
              options?: { shouldValidate?: boolean }
            ) => void
          }
          asCol={false}
          noBottomMargin
          menuPortal
          onChange={(e) => {
            setPartnerPaymentScope(e.target.value);
            listParamsRef.current.partnerPaymentScope = e.target.value;
            bumpFilters();
          }}
        />
      </Col>

      <Col xs="auto" className="order-payments-filter-col">
        <CustomFormSelect
          label="Customer Payment Status"
          controlId="Customer payment status"
          register={headerRegister as unknown as UseFormRegister<any>}
          options={customerPaymentStatusFilterSelectOptions()}
          fieldName="customer_payment_status_filter"
          defaultValue={customerPaymentScope}
          setValue={
            setHeaderValue as (
              name: string,
              value: any,
              options?: { shouldValidate?: boolean }
            ) => void
          }
          asCol={false}
          noBottomMargin
          menuPortal
          onChange={(e) => {
            setCustomerPaymentScope(e.target.value);
            listParamsRef.current.customerPaymentScope = e.target.value;
            bumpFilters();
          }}
        />
      </Col>

      <Col xs="auto" className="order-payments-filter-col">
        <Button
          variant="outline-secondary"
          size="sm"
          className="custom-btn-secondary partner-payout-clear-btn px-3"
          type="button"
          disabled={
            !orderStatus &&
            !customerPaymentScope &&
            !partnerPaymentScope &&
            !fromDate &&
            !toDate &&
            !keywordActive &&
            !searchDraft.trim()
          }
          onClick={() => {
            setOrderStatus("");
            setCustomerPaymentScope("");
            setPartnerPaymentScope("");
            setFromDate("");
            setToDate("");
            setKeywordActive(false);
            setAppliedSearchKeyword("");
            setSearchDraft("");
            setSortBy([]);
            listParamsRef.current = {
              search: undefined,
              orderStatus: "",
              customerPaymentScope: "",
              partnerPaymentScope: "",
              fromDate: "",
              toDate: "",
            };
            setSearchClearVersion((v) => v + 1);
            setUtilitySearchKey((k) => k + 1);
            setCurrentPage(1);
            setFilterEpoch((e) => e + 1);
          }}
        >
          Clear
        </Button>
      </Col>
    </Row>
  );

  const financialColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: { index: number } }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      {
        Header: "Order ID",
        accessor: "order_unique_id",
        Cell: textUnderlineCell("order_unique_id", (row) => {
          const oid = resolveOrderMongoId(row);
          if (oid) showOrderInfoDialog(oid, () => {});
        }),
      },
      {
        Header: "User Name",
        accessor: "user_name",
        sort: true,
        Cell: ({ row }: { row: { original: FinancialModel } }) => {
          const label = row.original.user_name?.trim() || "-";
          return (
            <span
              style={{
                textDecoration: "underline",
                textDecorationThickness: "1px",
                cursor: "pointer",
              }}
              onClick={() => {
                const id = row.original.user_id;
                if (id) showUserDetailsDialog(id, () => {});
              }}
            >
              {label}
            </span>
          );
        },
      },
      {
        Header: "Partner Name",
        accessor: "partner_name",
        sort: true,
        Cell: ({ row }: { row: { original: FinancialModel } }) => {
          const label = row.original.partner_name?.trim() || "-";
          return (
            <span
              style={{
                textDecoration: "underline",
                textDecorationThickness: "1px",
                cursor: "pointer",
              }}
              onClick={() => {
                const pid =
                  row.original.partner_mongo_id?.trim() ||
                  row.original.partner_id?.trim();
                if (!pid) return;
                navigate(
                  `${ROUTES.PARTNER_PAYOUT_SHOW.path}?id=${encodeURIComponent(pid)}`
                );
              }}
            >
              {label}
            </span>
          );
        },
      },
      { Header: "Service Name", accessor: "service_name", sort: true },
      {
        Header: "Service Date",
        accessor: "service_date",
        sort: true,
        Cell: ({ row }: { row: { original: FinancialModel } }) =>
          formatDate(
            row.original.service_date ? row.original.service_date : ""
          ),
      },
      {
        Header: "Total Amount",
        accessor: "total_price",
        sort: true,
        Cell: ({ row }: { row: { original: FinancialModel } }) => {
          const v = row.original.total_price ?? row.original.total_amount;
          return (
            <span>
              {v !== undefined && v !== null
                ? `${AppConstant.currencySymbol}${v}`
                : "-"}
            </span>
          );
        },
      },
     
      {
        Header: "Commission",
        accessor: "commission_amount",
        sort: true,
        Cell: ({ row }: { row: { original: FinancialModel } }) => {
          const o = row.original;
          return (
            <span>
              {amountWithPercentLabel(
                o.commission_amount,
                o.commission_percentage ?? o.commission_percent
              )}
            </span>
          );
        },
      },
      {
        Header: "Tax",
        accessor: "tax_amount",
        sort: true,
        Cell: ({ row }: { row: { original: FinancialModel } }) => {
          const o = row.original;
          return (
            <span>
              {amountWithPercentLabel(
                o.tax_amount ?? o.tax,
                o.tax_percentage ?? o.tax_percent
              )}
            </span>
          );
        },
      },
      {
        Header: "Customer Paid Amount",
        accessor: "customer_paid_amount",
        Cell: ({ row }: { row: { original: FinancialModel } }) => {
          const o = row.original;
          const v =
            o.customer_paid_amount ?? (o.is_paid ? o.total_price : undefined);
          return (
            <span>
              {v !== undefined && v !== null
                ? `${AppConstant.currencySymbol}${v}`
                : "-"}
            </span>
          );
        },
      },
      {
        Header: "Customer Pending Amount",
        accessor: "customer_pending_amount",
        Cell: ({ row }: { row: { original: FinancialModel } }) => {
          const o = row.original;
          const v =
            o.customer_pending_amount ??
            (!o.is_paid ? o.total_price : undefined);
          return (
            <span>
              {v !== undefined && v !== null
                ? `${AppConstant.currencySymbol}${v}`
                : "-"}
            </span>
          );
        },
      },
      {
        Header: "Total Partner Amount",
        accessor: "total_service_amount",
        Cell: ({ row }: { row: { original: FinancialModel } }) => {
          const v =
            row.original.total_service_amount ?? row.original.service_price;
          return (
            <span>
              {v !== undefined && v !== null
                ? `${AppConstant.currencySymbol}${v}`
                : "-"}
            </span>
          );
        },
      },
      {
        Header: "Paid to Partner",
        accessor: "paid_to_partner",
        Cell: priceCell("paid_to_partner"),
      },
      {
        Header: "Pending to Partner",
        accessor: "pending_to_partner",
        Cell: priceCell("pending_to_partner"),
      },
      {
        Header: "Customer Payment Status",
        accessor: "customer_payment_status",
        Cell: ({ row }: { row: { original: FinancialModel } }) =>
          customerPaymentStatusCellLabel(row.original),
      },
      {
        Header: "Partner Payment Status",
        accessor: "partner_payment_status",
        Cell: ({ row }: { row: { original: FinancialModel } }) =>
          partnerPaymentStatusCellLabel(row.original),
      },
      {
        Header: "Order status",
        accessor: "order_status",
        Cell: ({ row }: { row: { original: FinancialModel } }) =>
          serviceLineOrderStatusLabel(row.original),
      },
    ],
    [currentPage, pageSize, navigate]
  );

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Financial — Order Payments"
        titlePrefix={<FinancialSubPageBackButton />}
        register={headerRegister as unknown as UseFormRegister<any>}
        setValue={setHeaderValue as (name: string, value: any) => void}
      />

      <div className="row g-2 order-payments-summary-row">
        <div className="col-md-3">
          <div
            className="order-payments-stat-card"
            style={ORDER_PAYMENTS_STAT_CARD_STYLE}
          >
            <div className="order-payments-stat-card__label box-rw-clr2">
              Total completed orders
            </div>
            <span className="order-payments-stat-card__value">
              {summary.completedOrders}
            </span>
          </div>
        </div>

        <div className="col-md-3">
          <div
            className="order-payments-stat-card"
            style={ORDER_PAYMENTS_STAT_CARD_STYLE}
          >
            <div className="order-payments-stat-card__label box-rw-clr3">
              Total in progress orders
            </div>
            <span className="order-payments-stat-card__value">
              {summary.inProgressOrders}
            </span>
          </div>
        </div>

        <div className="col-md-3">
          <div
            className="order-payments-stat-card"
            style={{
              ...ORDER_PAYMENTS_STAT_CARD_STYLE,
              pointerEvents: "none",
            }}
            role="status"
            aria-label={`Total partner pending amount ${
              AppConstant.currencySymbol
            }${formatInrGroupedAmount(summary.totalPartnerPending)}`}
          >
            <div className="order-payments-stat-card__label box-rw-clr4">
              Total partner pending amount
            </div>
            <span className="order-payments-stat-card__value d-inline-flex align-items-baseline gap-1">
              <span aria-hidden="true">{AppConstant.currencySymbol}</span>
              <span>{formatInrGroupedAmount(summary.totalPartnerPending)}</span>
            </span>
          </div>
        </div>

        <div className="col-md-3">
          <div
            className="order-payments-stat-card"
            style={{
              ...ORDER_PAYMENTS_STAT_CARD_STYLE,
              pointerEvents: "none",
            }}
            role="status"
            aria-label={`Total user pending amount ${
              AppConstant.currencySymbol
            }${formatInrGroupedAmount(summary.totalUserPending)}`}
          >
            <div className="order-payments-stat-card__label box-rw-clr1">
              Total user pending amount
            </div>
            <span className="order-payments-stat-card__value d-inline-flex align-items-baseline gap-1">
              <span aria-hidden="true">{AppConstant.currencySymbol}</span>
              <span>{formatInrGroupedAmount(summary.totalUserPending)}</span>
            </span>
          </div>
        </div>
      </div>

      <CustomUtilityBox
        key={utilitySearchKey}
        searchOnlyToolbar
        title="Order Payments"
        searchHint="Order ID, user name, partner name, service name…"
        controlSlot={
          <>
            <div style={{ minWidth: "220px" }}>
              <Form.Label className="mb-1 fw-medium">From Date</Form.Label>
              <CustomDatePicker
                label=""
                controlId="from_date_filter"
                selectedDate={fromDate || null}
                onChange={(e) => {
                  const value = e ? dateToLocalYmd(e) : "";
                  setFromDate(value);
                  listParamsRef.current.fromDate = value;
                  bumpFilters();
                }}
                register={headerRegister as unknown as UseFormRegister<any>}
                setValue={
                  setHeaderValue as (
                    name: string,
                    value: any,
                    options?: { shouldValidate?: boolean }
                  ) => void
                }
                asCol={false}
                groupClassName="mb-0 w-100"
                placeholderText="From Date"
                filterDate={() => true}
              />
            </div>
            <div style={{ minWidth: "220px" }}>
              <Form.Label className="mb-1 fw-medium">To Date</Form.Label>
              <CustomDatePicker
                label=""
                controlId="to_date_filter"
                selectedDate={toDate || null}
                onChange={(e) => {
                  const value = e ? dateToLocalYmd(e) : "";
                  setToDate(value);
                  listParamsRef.current.toDate = value;
                  bumpFilters();
                }}
                register={headerRegister as unknown as UseFormRegister<any>}
                setValue={
                  setHeaderValue as (
                    name: string,
                    value: any,
                    options?: { shouldValidate?: boolean }
                  ) => void
                }
                asCol={false}
                groupClassName="mb-0 w-100"
                placeholderText="To Date"
                filterDate={() => true}
              />
            </div>
          </>
        }
        toolsInlineRow
        onSearch={(value) => handleSearch(value)}
        onSearchInputChange={setSearchDraft}
        syncKeyword={appliedSearchKeyword}
        searchClearVersion={searchClearVersion}
      />

      {filterControls}

      <CustomTable
        columns={financialColumns}
        data={financialList}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page: number) => setCurrentPage(page)}
        onLimitChange={(ps: number) => {
          setPageSize(ps);
          setCurrentPage(1);
        }}
        manualSortBy
        sortBy={sortBy}
        onSortChange={handleServerSortChange}
        theadClass="table-light"
        tableClass="order-payments-react-table"
        dynamicRowBackground={false}
        getRowClassName={(row) =>
          isRefundedOrderRow(row.original)
            ? "order-payments-table__row--refunded"
            : undefined
        }
      />
    </div>
  );
};

export default OrderPayments;
