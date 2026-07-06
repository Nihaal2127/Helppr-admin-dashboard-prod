import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Col, Row, OverlayTrigger, Tooltip } from "react-bootstrap";
import { useForm, UseFormRegister } from "react-hook-form";
import CustomHeader from "../../../components/CustomHeader";
import CustomSummaryBox from "../../../components/CustomSummaryBox";
import CustomUtilityBox from "../../../components/CustomUtilityBox";
import { capitalizeString, statusCell } from "../../../helper/utility";
import CustomTable from "../../../components/CustomTable";
import CustomFormSelect from "../../../components/CustomFormSelect";
import CustomDatePicker from "../../../components/CustomDatePicker";
import { dateToLocalYmd } from "../../../helper/dateFormat";
import AddEditSubscriptionPlanDialog, {
  SubscriptionPlanModel,
} from "./AddEditSubscriptionPlanDialog";
import AddEditPartnerSubscriptionDialog from "./AddEditPartnerSubscriptionDialog";
import type { PartnerSubscriptionModel } from "../../../lib/types/partnerManagementTypes";
import CustomActionColumn from "../../../components/CustomActionColumn";
import { openConfirmDialog } from "../../../components/CustomConfirmDialog";
import {
  fetchPartnerSubscriptions,
  fetchSubscriptionPlans,
  voidPartnerSubscription,
  voidSubscriptionPlan,
} from "../../../services/partnerManagementService";
import { getCount } from "../../../services/getCountService";
import { fetchAreaDropDown } from "../../../services/areaService";
import type { ServerTableSortBy } from "../../../lib/global/serverTableSort";
import { AppConstant, UserRole } from "../../../lib/global/AppConstant";
import { getLocalStorage } from "../../../lib/global/localStorageHelper";
import {
  franchiseHeaderFormDefaults,
  franchiseIdForApiQuery,
} from "../../../lib/franchise/headerFranchisePreference";
import { fetchUserById } from "../../../services/userService";

/** Days from today until `endDateStr` (date-only); negative if already past. */
const getRemainingCalendarDays = (endDateStr: string): number | null => {
  if (!endDateStr?.trim()) return null;
  const end = new Date(endDateStr);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86400000);
};

const planDescriptionCell = (row: {
  original: SubscriptionPlanModel;
  index: number;
}) => {
  const raw = row.original.plan_description;
  const text = raw != null && String(raw).trim() !== "" ? String(raw) : "";
  if (!text) {
    return <span className="text-muted">—</span>;
  }
  const tipId = `plan-desc-${String(row.original._id ?? row.index)}`;
  return (
    <OverlayTrigger
      placement="top"
      delay={{ show: 100, hide: 80 }}
      overlay={
        <Tooltip id={tipId} className="subscription-plan-desc-tooltip">
          <div
            style={{
              maxWidth: 380,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {text}
          </div>
        </Tooltip>
      }
    >
      <div className="subscription-plans-desc-cell-inner">
        <span className="d-block text-truncate">{text}</span>
      </div>
    </OverlayTrigger>
  );
};

const remainingDaysCell = (endDateStr: string) => {
  const days = getRemainingCalendarDays(endDateStr);
  if (days === null) return <span className="text-muted">—</span>;
  if (days < 0) return <span className="text-muted">Expired</span>;
  if (days < 7) {
    return (
      <span className="text-danger fw-semibold">
        {days} day{days === 1 ? "" : "s"}
      </span>
    );
  }
  return (
    <span className="text-secondary">
      {days} day{days === 1 ? "" : "s"}
    </span>
  );
};

type SubscriptionPlansProps = {
  onBack?: () => void;
};

/** Partner subscription list — static tier filter only (Postman plan catalogue is separate from this filter). */
const PARTNER_PLAN_TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "basic", label: "Basic" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platinum", label: "Platinum" },
];

const SubscriptionPlans = ({ onBack }: SubscriptionPlansProps) => {
  const { register, setValue, watch } = useForm<any>({
    defaultValues: franchiseHeaderFormDefaults(),
  });
  const headerFranchiseId = watch("franchise_id") as string | undefined;
  const currentUserRole = getLocalStorage(AppConstant.userRole);
  const isFranchiseAdminSession = currentUserRole === UserRole.FRANCHISE_ADMIN;
  const [selectedBox, setSelectedBox] = useState<
    "plans" | "partner_subscription_list"
  >("plans");
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);

  const [planData, setPlanData] = useState({
    Total: 0,
    Active: 0,
    Inactive: 0,
  });
  const [partnerSubscriptionData, setPartnerSubscriptionData] = useState({
    Total: 0,
    Active: 0,
    Inactive: 0,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [planRows, setPlanRows] = useState<SubscriptionPlanModel[]>([]);
  const [planTotalPages, setPlanTotalPages] = useState(0);
  const [partnerSubRows, setPartnerSubRows] = useState<
    PartnerSubscriptionModel[]
  >([]);
  const [partnerSubTotalPages, setPartnerSubTotalPages] = useState(0);
  const [planSortBy, setPlanSortBy] = useState<ServerTableSortBy>([]);
  const [partnerSubSortBy, setPartnerSubSortBy] = useState<ServerTableSortBy>(
    []
  );
  const [locationAreaOptions, setLocationAreaOptions] = useState<
    { value: string; label: string }[]
  >([{ value: "all", label: "All" }]);
  const [sessionCityId, setSessionCityId] = useState("");

  const [planFilters, setPlanFilters] = useState<{
    name?: string;
    status?: string;
    sort?: string;
  }>({});
  const [partnerFilters, setPartnerFilters] = useState<{
    name?: string;
    status?: string;
    sort?: string;
    planType?: string;
    location?: string;
    fromDate?: string;
    toDate?: string;
  }>({});

  const fetchRef = useRef(false);
  const activeBox = selectedBox;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchAreaDropDown();
      if (cancelled) return;
      setLocationAreaOptions([
        { value: "all", label: "All" },
        ...rows,
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isFranchiseAdminSession) return;
    (async () => {
      const currentUserId = String(
        getLocalStorage(AppConstant.createdById) ?? ""
      ).trim();
      if (!currentUserId) return;
      const res = await fetchUserById(currentUserId);
      if (cancelled || !res.response || !res.user) return;
      const cid = String((res.user as any).city_id ?? "").trim();
      if (cid) setSessionCityId(cid);
    })();
    return () => {
      cancelled = true;
    };
  }, [isFranchiseAdminSession]);

  /** Reset page when switching between Plans and Partner Subscription List (each uses server pagination). */
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBox]);

  /** Summary boxes: `POST /getCount` `{ type: "partner-management", franchise_id? }`. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fid = franchiseIdForApiQuery(headerFranchiseId);
      const scope = fid ? { franchise_id: fid } : undefined;
      const { responseCount, countModel } = await getCount(
        "partner-management",
        scope
      );
      if (cancelled || !responseCount || !countModel) return;
      setPlanData({
        Total: Number(countModel.total_plans ?? 0),
        Active: Number(countModel.active_plans ?? 0),
        Inactive: Number(countModel.inactive_plans ?? 0),
      });
      setPartnerSubscriptionData({
        Total: Number(countModel.total_partner_subscriptions ?? 0),
        Active: Number(countModel.active_partner_subscriptions ?? 0),
        Inactive: Number(countModel.inactive_partner_subscriptions ?? 0),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [headerFranchiseId]);

  const fetchData = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      if (activeBox === "plans") {
        const planRes = await fetchSubscriptionPlans(
          currentPage,
          pageSize,
          planFilters,
          planSortBy
        );
        if (planRes.response) {
          setPlanRows(planRes.records);
          setPlanTotalPages(planRes.totalPages);
        } else {
          setPlanRows([]);
          setPlanTotalPages(0);
        }
        return;
      }

      const partnerRes = await fetchPartnerSubscriptions(
        currentPage,
        pageSize,
        {
          ...partnerFilters,
          cityId: isFranchiseAdminSession ? sessionCityId : undefined,
        },
        partnerSubSortBy
      );
      if (partnerRes.response) {
        setPartnerSubRows(partnerRes.records);
        setPartnerSubTotalPages(partnerRes.totalPages);
      } else {
        setPartnerSubRows([]);
        setPartnerSubTotalPages(0);
      }
    } finally {
      fetchRef.current = false;
    }
  }, [
    currentPage,
    pageSize,
    planFilters,
    partnerFilters,
    planSortBy,
    partnerSubSortBy,
    activeBox,
    isFranchiseAdminSession,
    sessionCityId,
  ]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refreshData = useCallback(() => {
    void fetchData();
  }, [fetchData]);

  const handlePlanFilterChange = (filters: {
    name?: string;
    status?: string;
    sort?: string;
  }) => {
    setCurrentPage(1);
    setPlanFilters(filters);
  };
  const handlePlanSortChange = useCallback(
    (next: { id: string; desc: boolean }[]) => {
      setPlanSortBy(next);
      setCurrentPage(1);
    },
    []
  );

  const handlePartnerSubscriptionFilterChange = (filters: {
    name?: string;
    status?: string;
    sort?: string;
    planType?: string;
    location?: string;
    fromDate?: string;
    toDate?: string;
  }) => {
    setCurrentPage(1);
    const next = { ...filters };
    /** Summary card sends boolean-like status; filter dropdown uses active / inactive. */
    if (next.status === "true") next.status = "active";
    if (next.status === "false") next.status = "inactive";
    setPartnerFilters((prev) => ({ ...prev, ...next }));
  };
  const handlePartnerSubSortChange = useCallback(
    (next: { id: string; desc: boolean }[]) => {
      setPartnerSubSortBy(next);
      setCurrentPage(1);
    },
    []
  );

  const partnerFilterControls = (
    <Row className="order-payments-filters-row g-3 mt-1 mb-3 align-items-end flex-wrap">
      <Col xs={12} sm={6} md="auto" className="order-payments-filter-col">
        <CustomFormSelect
          label="Plan Type"
          controlId="partner_sub_plan_type_filter"
          options={PARTNER_PLAN_TYPE_FILTER_OPTIONS}
          register={register}
          fieldName="partner_sub_plan_type_filter"
          asCol={false}
          noBottomMargin
          defaultValue={partnerFilters.planType || "all"}
          setValue={setValue}
          placeholder="All plan types"
          menuPortal
          onChange={(e) =>
            handlePartnerSubscriptionFilterChange({ planType: e.target.value })
          }
        />
      </Col>
   
      <Col xs={12} sm={6} md="auto" className="order-payments-filter-col">
        <CustomFormSelect
          label="Status"
          controlId="partner_sub_status_filter"
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
          register={register}
          fieldName="partner_sub_status_filter"
          asCol={false}
          noBottomMargin
          defaultValue={partnerFilters.status || "all"}
          setValue={setValue}
          placeholder="All statuses"
          menuPortal
          onChange={(e) =>
            handlePartnerSubscriptionFilterChange({ status: e.target.value })
          }
        />
      </Col>
      <Col
        xs={12}
        sm={6}
        md="auto"
        className="order-payments-filter-col"
        style={{ minWidth: 200 }}
      >
        <CustomDatePicker
          label="From Date"
          controlId="partner_sub_start_date_filter"
          selectedDate={partnerFilters.fromDate || null}
          onChange={(date) => {
            const value = date ? dateToLocalYmd(date) : "";
            handlePartnerSubscriptionFilterChange({ fromDate: value });
          }}
          register={register as unknown as UseFormRegister<any>}
          setValue={setValue as (name: string, value: any) => void}
          asCol={false}
          groupClassName="mb-0 w-100 fw-medium"
          placeholderText="From Date"
          filterDate={() => true}
        />
      </Col>
      <Col
        xs={12}
        sm={6}
        md="auto"
        className="order-payments-filter-col"
        style={{ minWidth: 200 }}
      >
        <CustomDatePicker
          label="To Date"
          controlId="partner_sub_end_date_filter"
          selectedDate={partnerFilters.toDate || null}
          onChange={(date) => {
            const value = date ? dateToLocalYmd(date) : "";
            handlePartnerSubscriptionFilterChange({ toDate: value });
          }}
          register={register as unknown as UseFormRegister<any>}
          setValue={setValue as (name: string, value: any) => void}
          asCol={false}
          groupClassName="mb-0 w-100 fw-medium"
          placeholderText="To Date"
          filterDate={() => true}
        />
      </Col>
      <Col
        xs={12}
        sm={6}
        md="auto"
        className="order-payments-filter-col d-flex align-items-end ms-md-auto"
      >
        <Button
          variant="outline-secondary"
          size="sm"
          className="custom-btn-secondary px-3"
          type="button"
          disabled={
            (partnerFilters.planType ?? "all") === "all" &&
            (partnerFilters.status ?? "all") === "all" &&
            (isFranchiseAdminSession ||
              (partnerFilters.location ?? "all") === "all") &&
            !partnerFilters.fromDate &&
            !partnerFilters.toDate &&
            !partnerFilters.name?.trim()
          }
          onClick={() => {
            setPartnerFilters({});
            setPartnerSubSortBy([]);
            setUtilitySearchKey((k) => k + 1);
            setCurrentPage(1);
            setValue("partner_sub_plan_type_filter", "all", {
              shouldValidate: false,
            });
            setValue("partner_sub_status_filter", "all", {
              shouldValidate: false,
            });
            if (!isFranchiseAdminSession) {
              setValue("partner_sub_location_filter", "all", {
                shouldValidate: false,
              });
            }
            setValue("partner_sub_start_date_filter", null, {
              shouldValidate: false,
            });
            setValue("partner_sub_end_date_filter", null, {
              shouldValidate: false,
            });
          }}
        >
          Clear
        </Button>
      </Col>
    </Row>
  );

  const planColumns = useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      {
        Header: "Plan Name",
        accessor: "plan_name",
        sort: true,
        Cell: ({ row }: { row: any }) =>
          capitalizeString(row.original.plan_name),
      },
      {
        Header: "Priority",
        accessor: "priority",
        Cell: ({ row }: { row: any }) => row.original.priority ?? "-",
      },
      {
        Header: "Plan Description",
        accessor: "plan_description",
        className: "subscription-plans-desc-cell",
        width: 260,
        Cell: ({
          row,
        }: {
          row: { original: SubscriptionPlanModel; index: number };
        }) => planDescriptionCell(row),
      },
      { Header: "Price", accessor: "price" },
      { Header: "Duration", accessor: "duration" },
      {
        Header: "Duration Type",
        accessor: "duration_type",
        Cell: ({ row }: { row: any }) =>
          capitalizeString(row.original.duration_type),
      },
      {
        Header: "Status",
        accessor: "is_active",
        Cell: statusCell("is_active"),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={() => {
              AddEditSubscriptionPlanDialog.show(false, row.original, () =>
                refreshData()
              );
            }}
            onDelete={async () => {
              openConfirmDialog(
                "Are you sure you want to void this plan?",
                "Void",
                "Cancel",
                async () => {
                  await voidSubscriptionPlan(String(row.original._id));
                  refreshData();
                }
              );
            }}
          />
        ),
      },
    ],
    [currentPage, pageSize, refreshData]
  );

  const partnerSubscriptionColumns = useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Partner Name", accessor: "partner_name", sort: true },
     
      {
        Header: "Subscription Plan",
        accessor: "subscription_plan",
        sort: true,
        Cell: ({ row }: { row: any }) =>
          capitalizeString(row.original.subscription_plan),
      },
      {
        Header: "Subscription Start Date",
        accessor: "subscription_start_date",
        sort: true,
      },
      {
        Header: "Subscription End Date",
        accessor: "subscription_end_date",
        sort: true,
      },
      {
        Header: "Remaining Days",
        accessor: "remaining_days",
        Cell: ({ row }: { row: any }) => {
          const r = row.original as PartnerSubscriptionModel;
          if (r.remaining_days_demo != null) {
            return (
              <span className="text-danger fw-semibold">
                {r.remaining_days_demo} day
                {r.remaining_days_demo === 1 ? "" : "s"}
              </span>
            );
          }
          return remainingDaysCell(String(r.subscription_end_date ?? ""));
        },
      },
      {
        Header: "Subscription Status",
        accessor: "is_active",
        Cell: statusCell("is_active"),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={() => {
              AddEditPartnerSubscriptionDialog.show(false, row.original, () =>
                refreshData()
              );
            }}
            onDelete={async () => {
              openConfirmDialog(
                "Are you sure you want to void this partner subscription?",
                "Void",
                "Cancel",
                async () => {
                  await voidPartnerSubscription(String(row.original._id));
                  refreshData();
                }
              );
            }}
          />
        ),
      },
    ],
    [currentPage, pageSize, refreshData]
  );

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Subscription Plans"
        register={register}
        setValue={setValue}
        hideFranchiseDropdown={activeBox !== "partner_subscription_list"}
        titlePrefix={
          <button
            type="button"
            className="financial-subpage-back"
            onClick={() => onBack?.()}
            aria-label="Go to Partner Management"
          >
            <i className="bi bi-chevron-left text-danger"></i>
          </button>
        }
      />

      <div className="box-container d-flex gap-3 flex-wrap">
        <CustomSummaryBox
          divId="box-subscription-plan"
          title={capitalizeString("plans")}
          data={planData}
          onSelect={() => {
            setSelectedBox("plans");
            handlePlanFilterChange({});
            setPlanSortBy([]);
          }}
          isSelected={activeBox === "plans"}
          onFilterChange={(filter) => {
            setSelectedBox("plans");
            handlePlanFilterChange(filter);
            setPlanSortBy([]);
          }}
          // isAddShow
          // addButtonLable="Add"
          // onAddClick={() => {
          //   AddEditSubscriptionPlanDialog.show(true, null, () => refreshData());
          // }}
          isAddShow={false}
        />

        <CustomSummaryBox
          divId="box-partner-subscription-list"
          title={capitalizeString("partner subscription list")}
          data={partnerSubscriptionData}
          onSelect={() => {
            setSelectedBox("partner_subscription_list");
            handlePartnerSubscriptionFilterChange({});
            setPartnerSubSortBy([]);
          }}
          isSelected={activeBox === "partner_subscription_list"}
          onFilterChange={(filter) => {
            setSelectedBox("partner_subscription_list");
            handlePartnerSubscriptionFilterChange(filter);
            setPartnerSubSortBy([]);
          }}
          isAddShow={false}
        />
      </div>

      <CustomUtilityBox
        key={
          activeBox === "partner_subscription_list"
            ? utilitySearchKey
            : undefined
        }
        searchOnlyToolbar={activeBox === "partner_subscription_list"}
        toolsInlineRow={activeBox === "partner_subscription_list"}
        title={
          activeBox === "plans"
            ? "Subscription Plans"
            : "Partner Subscription List"
        }
        searchHint={
          activeBox === "plans" ? "Search Plan Name" : "Search Partner Name"
        }
       
        onSearch={(value: string) => {
          if (activeBox === "plans") {
            handlePlanFilterChange({ name: value });
          } else {
            handlePartnerSubscriptionFilterChange({ name: value });
          }
        }}
        syncKeyword={
          activeBox === "plans"
            ? planFilters.name ?? ""
            : partnerFilters.name ?? ""
        }
      />
      {activeBox === "partner_subscription_list" && partnerFilterControls}

      {activeBox === "plans" ? (
        <CustomTable
          columns={planColumns}
          data={planRows}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={planTotalPages}
          onPageChange={(page: number) => setCurrentPage(page)}
          onLimitChange={(limit: number) => {
            setCurrentPage(1);
            setPageSize(limit);
          }}
          manualSortBy
          sortBy={planSortBy}
          onSortChange={handlePlanSortChange}
          theadClass="table-light"
        />
      ) : (
        <CustomTable
          columns={partnerSubscriptionColumns}
          data={partnerSubRows}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={partnerSubTotalPages}
          onPageChange={(page: number) => setCurrentPage(page)}
          onLimitChange={(limit: number) => {
            setCurrentPage(1);
            setPageSize(limit);
          }}
          manualSortBy
          sortBy={partnerSubSortBy}
          onSortChange={handlePartnerSubSortChange}
          theadClass="table-light"
        />
      )}
    </div>
  );
};

export default SubscriptionPlans;
