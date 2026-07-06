import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { Button, Form } from "react-bootstrap";
import CustomHeader from "../../components/CustomHeader";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import { OrderModel, OrderStatusEnum } from "../../lib/order/orders";
import { textUnderlineCell, formatDate, priceCell } from "../../helper/utility";
import CustomTable from "../../components/CustomTable";
import {
  deleteOrder,
  fetchOrder,
  mapOrderTabCountsFromRecord,
  ORDER_TAB_KEYS,
} from "../../services/orderService";
import type { OrderTabKey } from "../../services/orderService";
import { showOrderInfoDialog } from "../../components/order";
import { showUserDetailsDialog } from "../../components/user";
import { openConfirmDialog } from "../../components/CustomConfirmDialog";
import OrderRowActions from "./OrderRowActions";
import { useForm, UseFormRegister } from "react-hook-form";
import CustomSummaryBox from "../../components/CustomSummaryBox";
import CustomDatePicker from "../../components/CustomDatePicker";
import {
  getCustomerPaymentStatusLabel,
  getOrderPartnerDisplayName,
  getPartnerPaymentStatusLabel,
} from "../../lib/order/orders";
import { getCount } from "../../services/getCountService";
import type { GetCountExtra } from "../../services/getCountService";
import { useFranchiseHeaderForm } from "../../lib/global/hooks/useFranchiseScopedGetCount";
import { franchiseIdForApiQuery } from "../../lib/franchise/headerFranchisePreference";

const toIsoCalendarDate = (date: Date | null): string | null => {
  if (!date) return null;
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const OrderManagement = () => {
  const { register, setValue, franchiseId: headerFranchiseId } =
    useFranchiseHeaderForm();
  const { register: dateFilterRegister, setValue: setDateFilterValue } =
    useForm<{
      from_date: string;
      to_date: string;
    }>({
      defaultValues: { from_date: "", to_date: "" },
    });

  const [selectedStatus, setSelectedStatus] = useState<OrderTabKey>(2);
  const [orderList, setOrderList] = useState<OrderModel[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);
  const [orderCountsByTab, setOrderCountsByTab] = useState<
    Partial<Record<OrderTabKey, number>>
  >({});
  const fetchRef = useRef(false);

  const listFilters = useMemo(() => {
    const fid = franchiseIdForApiQuery(headerFranchiseId);
    return {
      from_date: fromDate,
      to_date: toDate,
      ...(fid ? { franchise_id: fid } : {}),
    };
  }, [fromDate, toDate, headerFranchiseId]);

  const fetchData = useCallback(
    async (filters: { keyword?: string; status?: string; sort?: string }) => {
      if (fetchRef.current) return;
      fetchRef.current = true;
      const {
        response,
        orders,
        totalPages: tp,
      } = await fetchOrder(currentPage, pageSize, {
        ...filters,
        ...listFilters,
      });
      if (response) {
        setOrderList(orders);
        setTotalPages(tp);
      }
      fetchRef.current = false;
    },
    [currentPage, pageSize, listFilters]
  );

  const refreshData = useCallback(async () => {
    await fetchData({ status: selectedStatus.toString() });
  }, [fetchData, selectedStatus]);

  /** Tab badges: `POST /getCount` `{ type: "order-management", franchise_id? }`; falls back to list totals if unmapped. */
  const reloadTabCounts = useCallback(async () => {
    const fid = franchiseIdForApiQuery(headerFranchiseId);
    const scope: GetCountExtra | undefined = (() => {
      const extra: GetCountExtra = {};
      if (fid) extra.franchise_id = fid;
      if (fromDate) extra.from_date = fromDate;
      if (toDate) extra.to_date = toDate;
      return Object.keys(extra).length > 0 ? extra : undefined;
    })();
    const { responseCount, countModel } = await getCount(
      "order-management",
      scope
    );
    const rec =
      countModel != null
        ? (countModel as unknown as Record<string, unknown>)
        : null;
    let mapped =
      responseCount && rec ? mapOrderTabCountsFromRecord(rec) : null;
    if (!mapped && responseCount && countModel) {
      const m = countModel;
      const direct: Partial<Record<OrderTabKey, number>> = {};
      if (m.order_in_progress != null) direct[2] = Number(m.order_in_progress);
      if (m.order_completed != null) direct[3] = Number(m.order_completed);
      if (m.order_cancelled != null) direct[4] = Number(m.order_cancelled);
      if (m.order_refunded != null) direct[5] = Number(m.order_refunded);
      if (Object.keys(direct).length > 0) {
        for (const k of ORDER_TAB_KEYS) {
          if (direct[k] === undefined) direct[k] = 0;
        }
        mapped = direct;
      }
    }
    if (mapped) {
      setOrderCountsByTab(mapped);
      return;
    }
    if (!responseCount) {
      setOrderCountsByTab({});
      return;
    }
    const results = await Promise.all(
      ORDER_TAB_KEYS.map((key) =>
        fetchOrder(1, 1, {
          status: String(key),
          ...listFilters,
        })
      )
    );
    const next: Partial<Record<OrderTabKey, number>> = {};
    ORDER_TAB_KEYS.forEach((key, i) => {
      const res = results[i];
      next[key] = res.response ? res.totalCount : 0;
    });
    setOrderCountsByTab(next);
  }, [headerFranchiseId, fromDate, toDate, listFilters]);

  const bumpListsAndTabCounts = useCallback(async () => {
    await Promise.all([reloadTabCounts(), refreshData()]);
  }, [reloadTabCounts, refreshData]);

  useEffect(() => {
    void Promise.all([reloadTabCounts(), refreshData()]);
  }, [reloadTabCounts, refreshData, currentPage, selectedStatus]);

  const handleFilterChange = async (filters: {
    keyword?: string;
    status?: string;
    sort?: string;
  }) => {
    setCurrentPage(1);
    setTotalPages(0);
    if (Object.keys(filters).length === 0) {
      fetchRef.current = false;
    } else {
      await fetchData({
        ...filters,
        status: filters.status ?? selectedStatus.toString(),
        ...listFilters,
      });
    }
  };

  const handleStatusCardSelect = (statusKey: OrderTabKey) => {
    setSelectedStatus(statusKey);
    setCurrentPage(1);
  };

  const orderShow = useCallback(
    (id: string) => {
      showOrderInfoDialog(id, () => {
        void bumpListsAndTabCounts();
      });
    },
    [bumpListsAndTabCounts]
  );

  const userShow = useCallback(
    (userId: string) => {
      showUserDetailsDialog(userId, () => {
        void bumpListsAndTabCounts();
      });
    },
    [bumpListsAndTabCounts]
  );

  const handleOrderInvoiceDownload = useCallback((orderId: string) => {
    void import("../../components/order/OrderInvoice").then(({ downloadOrderInvoice }) =>
      downloadOrderInvoice(orderId)
    );
  }, []);

  const handleOrderVoid = useCallback(
    (orderId: string) => {
      openConfirmDialog(
        "Are you sure you want to void this order?",
        "Void",
        "Cancel",
        async () => {
          const response = await deleteOrder(orderId);
          if (response) {
            void bumpListsAndTabCounts();
          }
        }
      );
    },
    [bumpListsAndTabCounts]
  );

  const orderColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      {
        Header: "Order ID",
        accessor: "unique_id",
        Cell: textUnderlineCell("unique_id", (row) => orderShow(row._id)),
      },
      {
        Header: "User Name",
        accessor: "user_name",
        Cell: ({ row }: { row: any }) => {
          const o = row.original as OrderModel;
          const label = o.user_name || o.user_info?.name || "-";
          return (
            <span
              style={{
                textDecoration: "underline",
                textDecorationThickness: "1px",
                cursor: "pointer",
              }}
              onClick={() => userShow(o.user_id)}
            >
              {label}
            </span>
          );
        },
      },
      {
        Header: "Partner Name",
        accessor: "partner_display",
        Cell: ({ row }: { row: any }) =>
          getOrderPartnerDisplayName(row.original as OrderModel),
      },
      {
        Header: "Order Date",
        accessor: "order_date",
        Cell: ({ row }: { row: any }) =>
          formatDate(row.original.order_date ? row.original.order_date : ""),
      },
      {
        Header: "Total Price",
        accessor: "total_price",
        Cell: priceCell("total_price"),
      },
       ...(selectedStatus === 5
        ? [
            {
              Header: "Refund amount",
              accessor: "customer_refunded_amount",
              Cell: priceCell("customer_refunded_amount"),
            },
          ]
        : []),
      {
        Header: "Partner Payment Status",
        accessor: "partner_payment_status_col",
        Cell: ({ row }: { row: any }) =>
          getPartnerPaymentStatusLabel(row.original as OrderModel),
      },
      {
        Header: "User Payment Status",
        accessor: "user_payment_status_col",
        Cell: ({ row }: { row: any }) =>
          getCustomerPaymentStatusLabel(row.original as OrderModel),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <OrderRowActions
            onView={() => orderShow(row.original._id)}
            onInvoice={() => handleOrderInvoiceDownload(row.original._id)}
            onVoid={() => handleOrderVoid(row.original._id)}
          />
        ),
      },
    ],
    [
      currentPage,
      pageSize,
      selectedStatus,
      handleOrderVoid,
      handleOrderInvoiceDownload,
      orderShow,
      userShow,
    ]
  );

  return (
    <>
      <div className="main-page-content">
        <CustomHeader
          title="Order Management"
          rightActions={
            <button
              type="button"
              className="custom-btn-secondary custom-header-action-btn"
              onClick={() => {
                void import("./CreateUpdateOrderDialog").then((mod) =>
                  mod.default.show(false, null, () => {
                    void bumpListsAndTabCounts();
                  })
                );
              }}
            >
              Create Order
            </button>
          }
          register={register}
          setValue={setValue}
        />

        <div className="d-flex mt-4 gap-2">
          {ORDER_TAB_KEYS.map((key) => {
            const meta = OrderStatusEnum.get(key);
            if (!meta) return null;
            return (
              <CustomSummaryBox
                key={key}
                divId={`order-tab-${key}`}
                title={meta.label}
                data={{ Total: orderCountsByTab[key] ?? 0 }}
                onSelect={() => handleStatusCardSelect(key)}
                isSelected={selectedStatus === key}
                onFilterChange={() => {}}
                isAddShow={false}
              />
            );
          })}
        </div>

        <CustomUtilityBox
          key={utilitySearchKey}
          title="Orders"
          searchHint={"Search Order ID, User Name, Partner Name"}
          toolsInlineRow
          toolsInlineClassName="custom-utilty-tools-inline--orders-wide-search"
          hideMoreIcon
          hideUtilityActions
          controlSlot={
            <>
              <div style={{ minWidth: "220px" }}>
                <Form.Label className="mb-1 fw-medium">From Date</Form.Label>
                <CustomDatePicker
                  label=""
                  controlId="order_from_date"
                  selectedDate={fromDate}
                  onChange={(date) => {
                    const next = toIsoCalendarDate(date);
                    setFromDate(next);
                    setCurrentPage(1);
                  }}
                  register={
                    dateFilterRegister as unknown as UseFormRegister<any>
                  }
                  setValue={
                    setDateFilterValue as (name: string, value: any) => void
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
                  controlId="order_to_date"
                  selectedDate={toDate}
                  onChange={(date) => {
                    const next = toIsoCalendarDate(date);
                    setToDate(next);
                    setCurrentPage(1);
                  }}
                  register={
                    dateFilterRegister as unknown as UseFormRegister<any>
                  }
                  setValue={
                    setDateFilterValue as (name: string, value: any) => void
                  }
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
              disabled={!fromDate && !toDate}
              onClick={() => {
                setFromDate(null);
                setToDate(null);
                setDateFilterValue("from_date", "");
                setDateFilterValue("to_date", "");
                setUtilitySearchKey((k) => k + 1);
                setCurrentPage(1);
              }}
            >
              Clear
            </Button>
          }
          onSearch={(value) => handleFilterChange({ keyword: value })}
        />

        <CustomTable
          columns={orderColumns}
          data={orderList}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page: number) => setCurrentPage(page)}
          onLimitChange={(ps: number) => {
            setPageSize(ps);
            setCurrentPage(1);
          }}
          theadClass="table-light"
        />
      </div>
    </>
  );
};

export default OrderManagement;
