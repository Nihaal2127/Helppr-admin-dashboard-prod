import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Col, Row } from "react-bootstrap";
import { useForm, UseFormRegister } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import CustomHeader from "../../components/CustomHeader";
import CustomTable from "../../components/CustomTable";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import CustomFormSelect from "../../components/CustomFormSelect";
import CustomDatePicker from "../../components/CustomDatePicker";
import {
  fetchNotificationList,
  fetchNotificationUnreadCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  resolveNotificationFranchiseScope,
  toNotificationListFilters,
} from "../../services/notificationService";
import {
  NotificationCategory,
  NotificationFilters,
  NotificationModel,
} from "../../lib/models/NotificationModel";
import { formatDateTime } from "../../helper/utility";
import { useFranchiseHeaderForm } from "../../lib/global/hooks/useFranchiseScopedGetCount";
import { HEADER_FRANCHISE_CHANGED_EVENT } from "../../lib/franchise/headerFranchisePreference";
import { toIsoCalendarDate } from "../../lib/quote/quoteHelpers";
import { activateNotification } from "../../lib/notifications/notificationNavigation";

const categoryOptions: { value: NotificationCategory | "all"; label: string }[] =
  [
    { value: "all", label: "All" },
    { value: "admin", label: "Admin" },
    { value: "order", label: "Order" },
    { value: "quote", label: "Quote" },
    { value: "subscription", label: "Subscription" },
    { value: "wallet", label: "Wallet" },
    { value: "ticket", label: "Ticket" },
    { value: "chat", label: "Chat" },
    { value: "system", label: "System" },
    { value: "reminder", label: "Reminder" },
  ];

const statusOptions = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
] as const;

const defaultNotificationFilters: NotificationFilters = {
  keyword: "",
  category: "all",
  status: "all",
  fromDate: "",
  toDate: "",
};

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    register: headerRegister,
    setValue: setHeaderValue,
    franchiseId: headerFranchiseId,
  } = useFranchiseHeaderForm();
  const { register, setValue } = useForm<any>();
  const [items, setItems] = useState<NotificationModel[]>([]);
  const [filters, setFilters] = useState<NotificationFilters>(
    defaultNotificationFilters
  );
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchClearVersion, setSearchClearVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);

  const listFilters = useMemo(
    () =>
      toNotificationListFilters({
        ...filters,
        franchiseId: resolveNotificationFranchiseScope(headerFranchiseId),
      }),
    [filters, headerFranchiseId]
  );

  const unreadCountFilters = useMemo(
    () => ({
      franchise_id: resolveNotificationFranchiseScope(headerFranchiseId),
      ...(filters.fromDate?.trim()
        ? { from_date: filters.fromDate.trim() }
        : {}),
      ...(filters.toDate?.trim() ? { to_date: filters.toDate.trim() } : {}),
      ...(filters.category && filters.category !== "all"
        ? { category: filters.category }
        : {}),
    }),
    [headerFranchiseId, filters.fromDate, filters.toDate, filters.category]
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [{ response, result }, unreadTotal] = await Promise.all([
        fetchNotificationList(currentPage, pageSize, listFilters, {
          skipLoader: true,
        }),
        fetchNotificationUnreadCount(unreadCountFilters, { skipLoader: true }),
      ]);
      if (!response) {
        setItems([]);
        setTotalPages(1);
        setUnreadCount(0);
        return;
      }

      const keyword = String(filters.keyword ?? "").trim().toLowerCase();
      let rows = result.records;
      if (keyword) {
        rows = rows.filter(
          (item) =>
            item.title.toLowerCase().includes(keyword) ||
            item.message.toLowerCase().includes(keyword) ||
            (item.referenceId || "").toLowerCase().includes(keyword) ||
            item.event.toLowerCase().includes(keyword)
        );
      }

      setItems(rows);
      setTotalPages(Math.max(1, result.totalPages));
      setUnreadCount(unreadTotal);
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    pageSize,
    listFilters,
    unreadCountFilters,
    filters.keyword,
   ]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    const onUpdated = () => {
      void loadList();
    };
    window.addEventListener("notifications-updated", onUpdated);
    window.addEventListener(
      HEADER_FRANCHISE_CHANGED_EVENT,
      onUpdated as EventListener
    );
    return () => {
      window.removeEventListener("notifications-updated", onUpdated);
      window.removeEventListener(
        HEADER_FRANCHISE_CHANGED_EVENT,
        onUpdated as EventListener
      );
    };
  }, [loadList]);

  const handleNotificationActivate = useCallback(
    (item: NotificationModel) => {
      void (async () => {
        await activateNotification(item, navigate);
        await loadList();
      })();
    },
    [loadList, navigate]
  );

  const notificationLinkStyle: React.CSSProperties = {
    cursor: "pointer",
    textDecoration: "underline",
    textDecorationThickness: "1px",
    textUnderlineOffset: "2px",
  };

  const columns = React.useMemo(
    () => [
      {
        Header: "Title",
        accessor: "title",
        Cell: ({ row }: { row: { original: NotificationModel } }) => (
          <span
            style={notificationLinkStyle}
            onClick={() => handleNotificationActivate(row.original)}
          >
            {row.original.title}
          </span>
        ),
      },
      {
        Header: "Message",
        accessor: "message",
        Cell: ({ row }: { row: { original: NotificationModel } }) => (
          <span
            style={notificationLinkStyle}
            onClick={() => handleNotificationActivate(row.original)}
          >
            {row.original.message}
          </span>
        ),
      },
    
       {
        Header: "Category",
        accessor: "category",
        Cell: ({ row }: { row: { original: NotificationModel } }) =>
          String(row.original.category || "—").toUpperCase(),
      },
      {
        Header: "Status",
        accessor: "status",
        Cell: ({ row }: { row: { original: NotificationModel } }) => (
          <span
            className={
              row.original.status === "unread"
                ? "custom-pending"
                : "custom-active"
            }
          >
            {row.original.status === "read" ? "Read" : "Unread"}
          </span>
        ),
      },
      {
        Header: "Created At",
        accessor: "createdAt",
        Cell: ({ row }: { row: { original: NotificationModel } }) =>
          formatDateTime(row.original.createdAt),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: { original: NotificationModel } }) =>
          row.original.status === "read" ? (
            <Button
              size="sm"
              style={{
                backgroundColor: "var(--btn-success)",
                borderColor: "var(--btn-success)",
                color: "#fff",
                cursor: "default",
              }}
              disabled
            >
              Read
            </Button>
          ) : (
            <Button
              size="sm"
              className="btn-danger"
              onClick={() => {
                void (async () => {
                  await markNotificationAsRead(row.original.id);
                  await loadList();
                })();
              }}
            >
              Mark Read
            </Button>
          ),
      },
    ],
    [handleNotificationActivate]
  );

  const clearFiltersDisabled =
    !filters.keyword?.trim() &&
    !searchDraft.trim() &&
    filters.category === "all" &&
    filters.status === "all" &&
    !filters.fromDate?.trim() &&
    !filters.toDate?.trim();

  const clearNotificationFilters = () => {
    setFilters(defaultNotificationFilters);
    setSearchDraft("");
    setSearchClearVersion((v) => v + 1);
    setCurrentPage(1);
    setValue("notification_category", "all", { shouldValidate: false });
    setValue("notification_status", "all", { shouldValidate: false });
    setValue("notification_from_date", "", { shouldValidate: false });
    setValue("notification_to_date", "", { shouldValidate: false });
    setUtilitySearchKey((k) => k + 1);
  };

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Notifications"
        register={headerRegister}
        setValue={setHeaderValue}
      />

      <div className="custom-dashboard-card m-0">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <h3 className="custom-dashboard-title mb-0">
            Notification Center ({unreadCount} unread)
          </h3>
          <Button
            className="btn-danger custom-btn"
            onClick={() => {
              void (async () => {
                const cat = filters.category;
                await markAllNotificationsAsRead(cat);
                await loadList();
              })();
            }}
          >
            Mark All as Read
          </Button>
        </div>
      </div>

      <CustomUtilityBox
        key={`notifications-utility-${utilitySearchKey}`}
        searchHint="Search title / message / reference / event"
        hideMoreIcon
        toolsInlineRow
        controlSlot={
          <>
            <div style={{ minWidth: "11rem" }}>
              <CustomFormSelect
                label="Category"
                controlId="notification_category"
                options={categoryOptions.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
                register={register}
                fieldName="notification_category"
                asCol={false}
                selectWidth="11rem"
                noBottomMargin
                defaultValue={filters.category || "all"}
                setValue={setValue}
                onChange={(e) => {
                  setCurrentPage(1);
                  setFilters((prev) => ({
                    ...prev,
                    category: e.target.value as NotificationCategory | "all",
                  }));
                }}
              />
            </div>
            <div style={{ minWidth: "11rem" }}>
              <CustomFormSelect
                label="Status"
                controlId="notification_status"
                options={statusOptions.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
                register={register}
                fieldName="notification_status"
                asCol={false}
                selectWidth="11rem"
                noBottomMargin
                defaultValue={filters.status || "all"}
                setValue={setValue}
                onChange={(e) => {
                  setCurrentPage(1);
                  setFilters((prev) => ({
                    ...prev,
                    status: e.target.value as "all" | "read" | "unread",
                  }));
                }}
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
            onClick={clearNotificationFilters}
          >
            Clear
          </Button>
        }
        hideUtilityActions
        onSearch={(value) => {
          setCurrentPage(1);
          setSearchDraft(value);
          setFilters((prev) => ({ ...prev, keyword: value }));
        }}
        onSearchInputChange={setSearchDraft}
        syncKeyword={filters.keyword ?? ""}
        searchClearVersion={searchClearVersion}
      />

      <Row className="g-3 mb-3 align-items-end">
        <Col xs={12} sm={6} md={4} lg={3}>
          <CustomDatePicker
            label="From Date"
            controlId="notification_from_date"
            selectedDate={filters.fromDate || null}
            onChange={(date) => {
              const value = toIsoCalendarDate(date) ?? "";
              setCurrentPage(1);
              setFilters((prev) => ({ ...prev, fromDate: value }));
            }}
            register={register as unknown as UseFormRegister<any>}
            setValue={setValue}
            asCol={false}
            groupClassName="mb-0 w-100 fw-medium"
            placeholderText="From Date"
            filterDate={() => true}
          />
        </Col>
        <Col xs={12} sm={6} md={4} lg={3}>
          <CustomDatePicker
            label="To Date"
            controlId="notification_to_date"
            selectedDate={filters.toDate || null}
            onChange={(date) => {
              const value = toIsoCalendarDate(date) ?? "";
              setCurrentPage(1);
              setFilters((prev) => ({ ...prev, toDate: value }));
            }}
            register={register as unknown as UseFormRegister<any>}
            setValue={setValue}
            asCol={false}
            groupClassName="mb-0 w-100 fw-medium"
            placeholderText="To Date"
            filterDate={() => true}
          />
        </Col>
      </Row>

      <CustomTable
        columns={columns}
        data={items}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page: number) => setCurrentPage(page)}
        onLimitChange={(updatedPageSize: number) => {
          setPageSize(updatedPageSize);
          setCurrentPage(1);
        }}
        isLoading={loading}
        theadClass="table-light"
      />
    </div>
  );
};

export default NotificationsPage;
