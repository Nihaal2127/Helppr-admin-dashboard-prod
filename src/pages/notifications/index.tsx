import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import { useForm } from "react-hook-form";
import CustomHeader from "../../components/CustomHeader";
import CustomTable from "../../components/CustomTable";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import CustomFormSelect from "../../components/CustomFormSelect";
import {
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  seedNotificationData,
} from "../../services/notificationService";
import {
  NotificationFilters,
  NotificationModel,
  NotificationModule,
} from "../../lib/models/NotificationModel";
import { formatDate } from "../../helper/utility";

const moduleOptions: { value: NotificationModule | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "order", label: "Order" },
  { value: "quote", label: "Quote" },
  { value: "payment", label: "Payment" },
  { value: "user", label: "User" },
  { value: "partner", label: "Partner" },
  { value: "ticket", label: "Dispute / Ticket" },
  { value: "chat", label: "Chat" },
];

const statusOptions = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
] as const;

const defaultNotificationFilters: NotificationFilters = {
  keyword: "",
  module: "all",
  status: "all",
};

const NotificationsPage: React.FC = () => {
  const { register, setValue } = useForm<any>();
  const [items, setItems] = useState<NotificationModel[]>([]);
  const [filters, setFilters] = useState<NotificationFilters>(
    defaultNotificationFilters
  );
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);

  const refresh = useCallback(() => {
    setItems(fetchNotifications(filters));
  }, [filters]);

  useEffect(() => {
    seedNotificationData();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unreadCount = useMemo(
    () => items.filter((item) => item.status === "unread").length,
    [items]
  );

  const columns = React.useMemo(
    () => [
      {
        Header: "Title",
        accessor: "title",
      },
      {
        Header: "Message",
        accessor: "message",
      },
      {
        Header: "Module",
        accessor: "module",
        Cell: ({ row }: any) => row.original.module.toUpperCase(),
      },
      {
        Header: "Status",
        accessor: "status",
        Cell: ({ row }: any) => (
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
        Cell: ({ row }: any) => formatDate(row.original.createdAt),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: any) =>
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
                markNotificationAsRead(row.original.id);
                refresh();
              }}
            >
              Mark Read
            </Button>
          ),
      },
    ],
    [refresh]
  );

  const clearFiltersDisabled =
    !filters.keyword?.trim() &&
    filters.module === "all" &&
    filters.status === "all";

  const clearNotificationFilters = () => {
    setFilters(defaultNotificationFilters);
    setValue("notification_type", "all", { shouldValidate: false });
    setValue("notification_status", "all", { shouldValidate: false });
    setUtilitySearchKey((k) => k + 1);
  };

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Notifications"
        register={register}
        setValue={setValue}
      />

      <div className="custom-dashboard-card m-0">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <h3 className="custom-dashboard-title mb-0">
            Notification Center ({unreadCount} unread)
          </h3>
          <Button
            className="btn-danger custom-btn"
            onClick={() => {
              markAllNotificationsAsRead();
              refresh();
            }}
          >
            Mark All as Read
          </Button>
        </div>
      </div>

      <CustomUtilityBox
        key={`notifications-utility-${utilitySearchKey}`}
        searchHint="Search title / message / reference"
        hideMoreIcon
        toolsInlineRow
        controlSlot={
          <>
            <div style={{ minWidth: "11rem" }}>
              <CustomFormSelect
                label="Type"
                controlId="notification_type"
                options={moduleOptions.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
                register={register}
                fieldName="notification_type"
                asCol={false}
                selectWidth="11rem"
                noBottomMargin
                defaultValue={filters.module || "all"}
                setValue={setValue}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    module: e.target.value as NotificationModule | "all",
                  }))
                }
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
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: e.target.value as "all" | "read" | "unread",
                  }))
                }
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
          setFilters((prev) => ({ ...prev, keyword: value }));
        }}
        syncKeyword={filters.keyword}
      />

      <CustomTable
        columns={columns}
        data={items}
        pageSize={items.length || 10}
        currentPage={1}
        totalPages={1}
        onPageChange={() => {}}
        isPagination={false}
      />
    </div>
  );
};

export default NotificationsPage;
