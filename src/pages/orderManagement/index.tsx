import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { Button, Form } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import CustomHeader from "../../components/CustomHeader";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import {
  OrderModel,
  OrderStatusEnum,
  normalizeOrderListSort,
  getCustomerPaymentStatusLabel,
  getOrderPartnerDisplayName,
  getPartnerPaymentStatusLabel,
} from "../../lib/order/orders";
import type { OrderListSort } from "../../lib/order/orders";
import { textUnderlineCell, formatDate, priceCell } from "../../helper/utility";
import CustomTable from "../../components/CustomTable";
import {
  deleteOrder,
  downloadOrderInvoice,
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
import CustomFormSelect from "../../components/CustomFormSelect";
import { getCount } from "../../services/getCountService";
import type { GetCountExtra } from "../../services/getCountService";
import { useFranchiseHeaderForm } from "../../lib/global/hooks/useFranchiseScopedGetCount";
import { franchiseIdForApiQuery } from "../../lib/franchise/headerFranchisePreference";
import {
  openOrderFromNotification,
} from "../../lib/notifications/notificationNavigation";

const toIsoCalendarDate = (date: Date | null): string | null => {
  if (!date) return null;
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** Calendar `YYYY-MM-DD` from API date/ISO values without UTC day-shift on date-only strings. */
function ymdFromUnknownDate(value: unknown): string | null {
  const t = String(value ?? "").trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return toIsoCalendarDate(d);
}

/**
 * Order list From/To date filter uses the table **Order Date** column.
 * `GET /order/getAll` date params overlap schedule dates, which is why
 * older Order Date rows (e.g. Aug/Sept) still appeared for an Oct range.
 */
function orderMatchesFromToDateFilter(
  order: OrderModel,
  from: string | null,
  to: string | null
): boolean {
  if (!from && !to) return true;
  const orderDate = ymdFromUnknownDate(order.order_date);
  if (!orderDate) return false;
  if (from && orderDate < from) return false;
  if (to && orderDate > to) return false;
  return true;
}

function orderServiceFilterId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    return String(rec._id ?? rec.id ?? rec.service_id ?? "").trim();
  }
  const s = String(value).trim();
  return !s || s === "[object Object]" ? "" : s;
}

function orderServiceFilterLabel(value: unknown, fallback?: unknown): string {
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const fromObj = String(
      rec.name ?? rec.service_name ?? rec.label ?? ""
    ).trim();
    if (fromObj) return fromObj;
  }
  const fromFallback = String(fallback ?? "").trim();
  if (fromFallback && fromFallback !== "[object Object]") return fromFallback;
  return "";
}

/** Unique Service filter options from `GET /order/getAll` rows. */
function serviceFilterOptionsFromOrders(
  orders: OrderModel[]
): { value: string; label: string }[] {
  const unique = new Map<string, { value: string; label: string }>();
  const push = (idRaw: unknown, nameRaw?: unknown) => {
    const value = orderServiceFilterId(idRaw);
    if (!value) return;
    const label = orderServiceFilterLabel(idRaw, nameRaw) || value;
    const existing = unique.get(value);
    if (!existing || (existing.label === existing.value && label !== value)) {
      unique.set(value, { value, label });
    }
  };

  for (const order of orders) {
    const rec = order as unknown as Record<string, unknown>;
    push(
      rec.service_id ?? rec.requested_services,
      rec.service_name ?? rec.requested_services_name
    );
    const items = Array.isArray(rec.service_items) ? rec.service_items : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      const info =
        it.service_info && typeof it.service_info === "object"
          ? (it.service_info as Record<string, unknown>)
          : null;
      push(
        it.service_id ?? info?._id ?? info?.id,
        it.service_name ?? info?.name ?? info?.service_name
      );
    }
    const nested = rec.services ?? rec.order_services;
    if (Array.isArray(nested)) {
      for (const item of nested) {
        if (item && typeof item === "object") {
          const it = item as Record<string, unknown>;
          push(it._id ?? it.service_id ?? it.id, it.name ?? it.service_name);
        } else {
          push(item);
        }
      }
    }
  }

  return Array.from(unique.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
}

function mergeServiceFilterOptions(
  prev: { value: string; label: string }[],
  next: { value: string; label: string }[]
): { value: string; label: string }[] {
  const map = new Map(prev.map((row) => [row.value, row]));
  for (const row of next) {
    if (!row.value) continue;
    const existing = map.get(row.value);
    if (
      !existing ||
      (existing.label === existing.value && row.label && row.label !== row.value)
    ) {
      map.set(row.value, row);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
}

const OrderManagement = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const notificationDeepLinkHandledRef = useRef<string | null>(null);

  const { register, setValue, franchiseId: headerFranchiseId } =
    useFranchiseHeaderForm();
  const { register: dateFilterRegister, setValue: setDateFilterValue } =
    useForm<{
      from_date: string;
      to_date: string;
      service_id: string;
    }>({
      defaultValues: { from_date: "", to_date: "", service_id: "" },
    });

  const [selectedStatus, setSelectedStatus] = useState<OrderTabKey>(2);
  const [orderList, setOrderList] = useState<OrderModel[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [serviceOptions, setServiceOptions] = useState< { label: string; value: string }[]>([]);
  const [isServiceLoading, setIsServiceLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchClearVersion, setSearchClearVersion] = useState(0);
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);
  const [orderCountsByTab, setOrderCountsByTab] = useState<
    Partial<Record<OrderTabKey, number>>
  >({});
  const [sortBy, setSortBy] = useState<OrderListSort>([]);
  const fetchRef = useRef(false);

  const listFilters = useMemo(() => {
    const fid = franchiseIdForApiQuery(headerFranchiseId);
    const keyword = searchKeyword.trim();
    return {
      from_date: fromDate,
      to_date: toDate,
      ...(keyword ? { keyword } : {}),
      ...(fid ? { franchise_id: fid } : {}),
    };
  }, [fromDate, toDate, headerFranchiseId, searchKeyword]);

  const fetchData = useCallback(
    async (filters: { keyword?: string; status?: string; sort?: string }) => {
      if (fetchRef.current) return;
      fetchRef.current = true;
      const filterFromDate = String(listFilters.from_date ?? "").trim() || null;
      const filterToDate = String(listFilters.to_date ?? "").trim() || null;
      const dateFilterActive = Boolean(filterFromDate || filterToDate);
      const apiListFilters = {
        ...(listFilters.keyword ? { keyword: listFilters.keyword } : {}),
        ...(listFilters.franchise_id
          ? { franchise_id: listFilters.franchise_id }
          : {}),
      };
      const {
        response,
        orders,
        totalPages: tp,
      } = await fetchOrder(
        dateFilterActive ? 1 : currentPage,
        dateFilterActive ? Math.max(pageSize, 1000) : pageSize,
        {
          ...filters,
          ...apiListFilters,
        },
        sortBy
      );
      if (response) {
        if (!dateFilterActive) {
          setOrderList(orders);
          setTotalPages(tp);
        } else {
          const filtered = orders.filter((order) =>
            orderMatchesFromToDateFilter(order, filterFromDate, filterToDate)
          );
          const pages =
            filtered.length === 0 ? 0 : Math.ceil(filtered.length / pageSize);
          const pageIndex = Math.min(
            Math.max(currentPage, 1),
            Math.max(pages, 1)
          );
          const start = (pageIndex - 1) * pageSize;
          setOrderList(filtered.slice(start, start + pageSize));
          setTotalPages(pages);
        }
        setServiceOptions((prev) =>
          mergeServiceFilterOptions(prev, serviceFilterOptionsFromOrders(orders))
        );
      }
      fetchRef.current = false;
    },
    [currentPage, pageSize, listFilters, sortBy]
  );

  const fetchOrdersByService = useCallback(
    async (serviceId: string) => {
      if (!serviceId) return;
      const filterFromDate = String(listFilters.from_date ?? "").trim() || null;
      const filterToDate = String(listFilters.to_date ?? "").trim() || null;
      const dateFilterActive = Boolean(filterFromDate || filterToDate);
      const apiListFilters = {
        ...(listFilters.keyword ? { keyword: listFilters.keyword } : {}),
        ...(listFilters.franchise_id
          ? { franchise_id: listFilters.franchise_id }
          : {}),
      };

      const { response, orders, totalPages: tp } = await fetchOrder(
        1,
        dateFilterActive ? Math.max(pageSize, 1000) : pageSize,
        {
          status: String(selectedStatus),
          service_id: serviceId,
          ...apiListFilters,
        },
        sortBy
      );

      if (response) {
        if (!dateFilterActive) {
          setOrderList(orders);
          setTotalPages(tp);
        } else {
          const filtered = orders.filter((order) =>
            orderMatchesFromToDateFilter(order, filterFromDate, filterToDate)
          );
          const pages =
            filtered.length === 0 ? 0 : Math.ceil(filtered.length / pageSize);
          setOrderList(filtered.slice(0, pageSize));
          setTotalPages(pages);
        }
        setCurrentPage(1);
        setServiceOptions((prev) =>
          mergeServiceFilterOptions(prev, serviceFilterOptionsFromOrders(orders))
        );
      }
    },
    [pageSize, selectedStatus, listFilters, sortBy]
  );

  const refreshData = useCallback(async () => {
    await fetchData({ status: selectedStatus.toString() });
  }, [fetchData, selectedStatus]);

  useEffect(() => {
    const openId = String(searchParams.get("openId") ?? "").trim();
    const tabRaw = String(searchParams.get("tab") ?? "").trim();
    if (!openId) return;

    const linkKey = `${tabRaw}|${openId}`;
    if (notificationDeepLinkHandledRef.current === linkKey) return;
    notificationDeepLinkHandledRef.current = linkKey;

    const tabNum = Number(tabRaw);
    if (ORDER_TAB_KEYS.includes(tabNum as OrderTabKey)) {
      setSelectedStatus(tabNum as OrderTabKey);
      setCurrentPage(1);
    }

    openOrderFromNotification(openId, () => {
      void refreshData();
    });

    const next = new URLSearchParams(searchParams);
    next.delete("openId");
    next.delete("tab");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, refreshData]);

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

  useEffect(() => {
    let cancelled = false;
    const loadServiceFilterOptions = async () => {
      setIsServiceLoading(true);
      try {
        const fid = franchiseIdForApiQuery(headerFranchiseId);
        const { response, orders } = await fetchOrder(1, 100, {
          status: String(selectedStatus),
          ...(fid ? { franchise_id: fid } : {}),
        });
        if (cancelled) return;
        const next = response
          ? serviceFilterOptionsFromOrders(orders)
          : [];
        setServiceOptions((prev) => mergeServiceFilterOptions(prev, next));
      } finally {
        if (!cancelled) setIsServiceLoading(false);
      }
    };
    void loadServiceFilterOptions();
    return () => {
      cancelled = true;
    };
  }, [headerFranchiseId, selectedStatus]);

  const clearOrderFilters = useCallback(() => {
    setFromDate(null);
    setToDate(null);
    setSearchKeyword("");
    setSearchDraft("");
    setDateFilterValue("from_date", "");
    setDateFilterValue("to_date", "");
    setSearchClearVersion((v) => v + 1);
    setUtilitySearchKey((k) => k + 1);
    setSortBy([]);
    setCurrentPage(1);
  }, [setDateFilterValue]);

  const hasActiveOrderFilters = Boolean(
    fromDate || toDate || searchKeyword.trim() || searchDraft.trim()
  );

  const handleStatusCardSelect = (statusKey: OrderTabKey) => {
    setSelectedStatus(statusKey);
    setSortBy([]);
    setCurrentPage(1);
  };

  const handleServerSortChange = useCallback(
    (next: { id: string; desc: boolean }[]) => {
      setSortBy(normalizeOrderListSort(next as OrderListSort));
      setCurrentPage(1);
    },
    []
  );

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

  const partnerShow = useCallback(
    (partnerId: string) => {
      const id = String(partnerId ?? "").trim();
      if (!id) return;
      void import("../../components/partner/PartnerDetailsDialog").then(
        ({ default: PartnerDetailsDialog }) => {
          PartnerDetailsDialog.show(id, () => {
            void bumpListsAndTabCounts();
          });
        }
      );
    },
    [bumpListsAndTabCounts]
  );

  const handleOrderInvoiceDownload = useCallback((orderId: string) => {
    void downloadOrderInvoice(orderId);
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
        sort: true,
        Cell: textUnderlineCell("unique_id", (row) => orderShow(row._id)),
      },
      {
        Header: "User Name",
        accessor: "user_name",
        sort: true,
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
        sort: true,
        Cell: ({ row }: { row: any }) => {
          const o = row.original as OrderModel;
          const label = getOrderPartnerDisplayName(o);
          const partnerId = String(
            (typeof o.partner_id === "string" ? o.partner_id : "") ||
              o.partner_info?._id ||
              ""
          ).trim();
          if (!partnerId || label === "-") return label;
          return (
            <span
              style={{
                textDecoration: "underline",
                textDecorationThickness: "1px",
                cursor: "pointer",
              }}
              onClick={() => partnerShow(partnerId)}
            >
              {label}
            </span>
          );
        },
      },
      {
        Header: "Order Date",
        accessor: "order_date",
        sort: true,
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
      partnerShow,
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

        <style>{`
          .custom-utilty-tools-inline.custom-utilty-tools-inline--orders-wide-search.order-mgmt-search-compact > .d-flex.flex-column {
            max-width: 22rem;
            flex: 0 1 20rem;
          }
        `}</style>
        <CustomUtilityBox
          key={utilitySearchKey}
          title="Orders"
          searchHint={"Search Order ID, User Name, Partner Name"}
          toolsInlineRow
          toolsInlineClassName="custom-utilty-tools-inline--orders-wide-search order-mgmt-search-compact"
          hideMoreIcon
          hideUtilityActions
          controlSlot={
            <>
              <div style={{ minWidth: "160px", maxWidth: "180px", flex: "0 0 160px" }}>
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
              <div style={{ minWidth: "160px", maxWidth: "180px", flex: "0 0 160px" }}>
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
              <div style={{ minWidth: "180px", maxWidth: "220px", flex: "0 1 200px" }}>
                <CustomFormSelect
                  label="Service"
                  controlId="order_service_filter"
                  options={[
                    { value: "", label: "All Services" },
                    ...serviceOptions,
                  ]}
                  register={
                    dateFilterRegister as unknown as UseFormRegister<any>
                  }
                  fieldName="service_id"
                  defaultValue={selectedServiceId}
                  setValue={
                    setDateFilterValue as (name: string, value: any) => void
                  }
                  onChange={(e) => {
                    const serviceId = e.target.value;
                    setSelectedServiceId(serviceId);
                    setCurrentPage(1);
                    if (serviceId) {
                      fetchOrdersByService(serviceId);
                    } else {
                      void refreshData();
                    }
                  }}
                  asCol={false}
                  noBottomMargin
                  menuPortal
                  clearResetsTo=""
                  placeholder="All Services"
                />
              </div>
            </>
          }
          afterSearchSlot={
            <Button
              variant="outline-secondary"
              size="sm"
              className="custom-btn-secondary partner-payout-clear-btn order-management-clear-btn px-3"
              type="button"
              disabled={!hasActiveOrderFilters}
              onClick={clearOrderFilters}
            >
              Clear
            </Button>
          }
          onSearch={(value) => {
            setSearchKeyword(value);
            setSearchDraft(value);
            setCurrentPage(1);
          }}
          onSearchInputChange={setSearchDraft}
          syncKeyword={searchKeyword}
          searchClearVersion={searchClearVersion}
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
          manualSortBy
          sortBy={sortBy}
          onSortChange={handleServerSortChange}
          theadClass="table-light"
        />
      </div>
    </>
  );
};

export default OrderManagement;
