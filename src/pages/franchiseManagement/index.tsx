import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "react-bootstrap";
import CustomHeader from "../../components/CustomHeader";
import CustomSummaryBox from "../../components/CustomSummaryBox";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import { capitalizeString, statusCell } from "../../helper/utility";
import CustomTable from "../../components/CustomTable";
import AddEditFranchiseDialog from "./AddEditFranchiseDialog";
import CustomActionColumn from "../../components/CustomActionColumn";
import { PinCodeHoverPortal } from "../../components/PinCodeHoverPortal";
import { openConfirmDialog } from "../../components/CustomConfirmDialog";
import { useForm, UseFormRegister } from "react-hook-form";
import {
  franchiseHeaderFormDefaults,
  franchiseIdForApiQuery,
  HEADER_FRANCHISE_CHANGED_EVENT,
  readHeaderFranchisePreference,
  writeHeaderFranchisePreference,
} from "../../lib/franchise/headerFranchisePreference";
import {
  clearFranchiseDropdownCache,
  deleteFranchise,
  fetchFranchise,
  fetchFranchiseById,
} from "../../services/franchiseService";
import { fetchCategory } from "../../services/categoryService";
import { fetchService } from "../../services/servicesService";
import { getCount } from "../../services/getCountService";
import type { ServerTableSortBy } from "../../lib/global/serverTableSort";
import CustomFormSelect from "../../components/CustomFormSelect";

/**
 * List-fetch generation counter (module scope).
 * Using a ref caused `ReferenceError: fetchGenerationRef is not defined` after partial HMR:
 * the hot bundle could update `fetchData` before the ref declaration landed.
 */
let franchiseManagementFetchGeneration = 0;

function normalizeLabelList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((a: unknown) => String(a).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function resolveNamedLabels(
  row: Record<string, unknown>,
  namesKey: string,
  idsKey: string,
  altIdsKey: string | undefined,
  idToLabel: Map<string, string>,
  options?: { strictIdLookup?: boolean }
): string[] {
  const strictIdLookup = options?.strictIdLookup === true;
  if (!strictIdLookup) {
    const nameList = normalizeLabelList(row[namesKey]);
    if (nameList.length > 0) return nameList;
  }
  const rawIds =
    altIdsKey !== undefined ? row[idsKey] ?? row[altIdsKey] : row[idsKey];
  const ids = normalizeLabelList(rawIds);
  if (strictIdLookup) {
    return ids
      .map((id) => String(idToLabel.get(id) ?? "").trim())
      .filter(Boolean);
  }
  return ids.map((id) => idToLabel.get(id) ?? id);
}

/** Categories: ellipsis + red +n; hover shows bullet list */
function categoriesTableCell(idToLabel: Map<string, string>) {
  return function CategoriesCell({ row }: { row: any }) {
    const items = resolveNamedLabels(
      row.original ?? {},
      "category_names",
      "categories",
      "categories",
      idToLabel,
      { strictIdLookup: true }
    );
    if (items.length === 0) return <>-</>;
    if (items.length === 1) {
      return (
        <span
          className="d-inline-block text-truncate"
          style={{ maxWidth: 180 }}
          title={items[0]}
        >
          {items[0]}
        </span>
      );
    }
    const more = items.length - 1;
    return (
      <PinCodeHoverPortal items={items} listStyle="ul">
        <span className="pin-code-hover-trigger d-flex align-items-center flex-nowrap gap-1 w-100 min-w-0">
          <span
            className="text-truncate min-w-0"
            style={{ flex: "1 1 0%" }}
            title={items[0]}
          >
            {items[0]}
          </span>

          <span
            className="flex-shrink-0"
            style={{ color: "red", fontWeight: 600 }}
          >
            +{more}
          </span>
        </span>
      </PinCodeHoverPortal>
    );
  };
}

/** Services: ellipsis + red +n; hover shows bullet list */
function servicesTableCell(idToLabel: Map<string, string>) {
  return function ServicesCell({ row }: { row: any }) {
    const items = resolveNamedLabels(
      row.original ?? {},
      "service_names",
      "services",
      "services",
      idToLabel,
      { strictIdLookup: true }
    );
    if (items.length === 0) return <>-</>;
    if (items.length === 1) {
      return (
        <span
          className="d-inline-block text-truncate"
          style={{ maxWidth: 150 }}
          title={items[0]}
        >
          {items[0]}
        </span>
      );
    }
    const more = items.length - 1;
    return (
      <PinCodeHoverPortal items={items} listStyle="ul">
        <span className="pin-code-hover-trigger d-flex align-items-center flex-nowrap gap-1 w-100 min-w-0">
          <span
            className="text-truncate min-w-0"
            style={{ flex: "1 1 0%" }}
            title={items[0]}
          >
            {items[0]}
          </span>

          <span
            className="flex-shrink-0"
            style={{ color: "red", fontWeight: 600 }}
          >
            +{more}
          </span>
        </span>
      </PinCodeHoverPortal>
    );
  };
}

function multiNamesHoverCell(primaryKey: string, fallbackKey?: string) {
  return function MultiNamesHoverCell({ row }: { row: any }) {
    const orig = row?.original ?? {};
    const raw =
      fallbackKey !== undefined
        ? orig[primaryKey] ?? orig[fallbackKey]
        : orig[primaryKey];
    const items = normalizeLabelList(raw);

    if (items.length === 0) return <>-</>;
    if (items.length === 1) return <>{items[0]}</>;

    return (
      <PinCodeHoverPortal items={items} listStyle="div">
        <span className="pin-code-hover-trigger d-flex align-items-center flex-nowrap gap-1 w-100 min-w-0">
          <span className="min-w-0" style={{ flex: "1 1 0%" }} title={items[0]}>
            {items[0]}...
          </span>
          <span className="pin-code-more-count flex-shrink-0">
            +{items.length - 1}
          </span>
        </span>
      </PinCodeHoverPortal>
    );
  };
}

const FranchiseManagement = () => {
  const { register, setValue } = useForm<
    { franchise_id: string } & Record<string, unknown>
  >({
    defaultValues: franchiseHeaderFormDefaults(),
  });
  const { register: utilityFilterRegister, setValue: setUtilityFilterValue } =
    useForm<{ franchise_list_status: string }>({
      defaultValues: { franchise_list_status: "All" },
    });
  /** Header dropdown must drive fetches via state — `watch(franchise_id)` does not reliably update when CustomFormSelect overrides `register` onChange. */
  const [headerFranchiseId, setHeaderFranchiseId] = useState(() =>
    franchiseHeaderFormDefaults().franchise_id
  );

  useEffect(() => {
    const sync = () => {
      const next = readHeaderFranchisePreference();
      setHeaderFranchiseId(next);
      setValue("franchise_id", next, { shouldValidate: false });
    };
    window.addEventListener(
      HEADER_FRANCHISE_CHANGED_EVENT,
      sync as EventListener
    );
    return () =>
      window.removeEventListener(
        HEADER_FRANCHISE_CHANGED_EVENT,
        sync as EventListener
      );
  }, [setValue]);
  const [franchiseData, setFranchiseData] = useState({
    Total: 0,
    Active: 0,
    Inactive: 0,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [franchiseList, setFranchiseList] = useState<any[]>([]);
  const [totalPages, setTotalPages] = useState(0);

  const [filters, setFilters] = useState<{
    search?: string;
    status?: string;
    sort_order?: "asc" | "desc";
  }>({});
  const [sortBy, setSortBy] = useState<ServerTableSortBy>([]);
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);
  const catalogBootstrapStartedRef = useRef(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [categoryById, setCategoryById] = useState<Map<string, string>>(
    () => new Map()
  );
  const [serviceById, setServiceById] = useState<Map<string, string>>(
    () => new Map()
  );

  /** One-time catalog hydrate — deferred + parallel so first paint is not blocked by many getAll pages. */
  useEffect(() => {
    if (catalogBootstrapStartedRef.current) return;
    catalogBootstrapStartedRef.current = true;
    let cancelled = false;
    const runBootstrap = () => {
      void (async () => {
        const catMap = new Map<string, string>();
        const svcMap = new Map<string, string>();
        const limit = 200;
        const loadCategories = async () => {
          let page = 1;
          for (;;) {
            const res = await fetchCategory(page, limit, {}, []);
            if (cancelled) return;
            if (!res.response) break;
            for (const c of res.categories) {
              const id = String(
                (c as { _id?: string; id?: string })._id ??
                  (c as { _id?: string; id?: string }).id ??
                  ""
              ).trim();
              const name = String(
                (c as { name?: string; label?: string }).name ??
                  (c as { name?: string; label?: string }).label ??
                  ""
              ).trim();
              if (id) catMap.set(id, name || id);
            }
            if (!res.totalPages || page >= res.totalPages) break;
            page += 1;
            if (page > 50) break;
          }
        };
        const loadServices = async () => {
          let page = 1;
          for (;;) {
            const res = await fetchService(page, limit, {}, []);
            if (cancelled) return;
            if (!res.response) break;
            for (const s of res.services) {
              const id = String(
                (s as { _id?: string; id?: string })._id ??
                  (s as { _id?: string; id?: string }).id ??
                  ""
              ).trim();
              const name = String(
                (s as { name?: string; label?: string }).name ??
                  (s as { name?: string; label?: string }).label ??
                  ""
              ).trim();
              if (id) svcMap.set(id, name || id);
            }
            if (!res.totalPages || page >= res.totalPages) break;
            page += 1;
            if (page > 50) break;
          }
        };
        await Promise.all([loadCategories(), loadServices()]);
        if (!cancelled && isMountedRef.current) {
          setCategoryById(catMap);
          setServiceById(svcMap);
        }
      })();
    };
    const cancelIdle =
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function"
        ? (() => {
            const id = window.requestIdleCallback(runBootstrap, {
              timeout: 6000,
            });
            return () => window.cancelIdleCallback(id);
          })()
        : (() => {
            const t = window.setTimeout(runBootstrap, 1500);
            return () => window.clearTimeout(t);
          })();
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []);

  /** Summary counts: `POST /getCount` `{ type: "franchise-management", franchise_id? }`. */
  const refreshSummaryCounts = useCallback(async () => {
    const apiFranchiseId = franchiseIdForApiQuery(headerFranchiseId);
    if (apiFranchiseId) {
      const { responseCount, countModel } = await getCount(
        "franchise-management",
        {
          franchise_id: apiFranchiseId,
        }
      );
      if (responseCount && countModel) {
        setFranchiseData({
          Total: countModel.total_franchise ?? 0,
          Active: countModel.active_franchise ?? 0,
          Inactive: countModel.inactive_franchise ?? 0,
        });
      }
      return;
    }
    const searchQ = String(filters.search ?? "").trim();
    const statusF = String(filters.status ?? "").trim();
    const hasScoped =
      searchQ !== "" ||
      (statusF !== "" && statusF !== "All") ||
      sortBy.length > 0;
    if (hasScoped) return;
    const { responseCount, countModel } = await getCount("franchise-management");
    if (responseCount && countModel) {
      setFranchiseData({
        Total: countModel.total_franchise,
        Active: countModel.active_franchise,
        Inactive: countModel.inactive_franchise,
      });
    }
  }, [filters.search, filters.status, sortBy, headerFranchiseId]);

  useEffect(() => {
    void refreshSummaryCounts();
  }, [refreshSummaryCounts]);

  useEffect(() => {
    const v =
      filters.status && filters.status !== "All" ? filters.status : "All";
    setUtilityFilterValue("franchise_list_status", v, {
      shouldValidate: false,
    });
  }, [filters.status, setUtilityFilterValue]);

  const fetchData = useCallback(
    async (
      listPage?: number,
      options?: { forceRefreshAdminContacts?: boolean }
    ) => {
    const page =
      typeof listPage === "number" && listPage >= 1 ? listPage : currentPage;
    const gen = ++franchiseManagementFetchGeneration;
    const apiFranchiseId = franchiseIdForApiQuery(headerFranchiseId);
    const apiFilters = {
      ...filters,
      ...(apiFranchiseId ? { franchise_id: apiFranchiseId } : {}),
    };
    const fetchOptions = options?.forceRefreshAdminContacts
      ? { forceRefreshAdminContacts: true as const }
      : undefined;
    if (apiFranchiseId) {
      let row = await fetchFranchiseById(apiFranchiseId);
      if (!row) {
        const wide = await fetchFranchise(
          1,
          500,
          apiFilters,
          sortBy,
          fetchOptions
        );
        const list = wide.franchises as any[];
        row =
          list.find((r) => String(r?._id ?? "") === apiFranchiseId) ??
          (list.length === 1 ? list[0] : null);
      }
      if (!isMountedRef.current) return;
      if (gen !== franchiseManagementFetchGeneration) return;

      let rows: any[] = row ? [row] : [];
      const kw = String(filters.search ?? "")
        .trim()
        .toLowerCase();
      if (rows.length && kw) {
        const orig = rows[0] ?? {};
        const areaText = [
          ...normalizeLabelList(orig.area_name),
          ...normalizeLabelList(orig.areas),
        ]
          .map((x) => String(x ?? "").toLowerCase())
          .join(" ");
        const blob = [
          orig.name,
          orig.admin_name,
          orig.state_name,
          orig.city_name,
          areaText,
          orig.email,
          orig.phone_number,
        ]
          .map((x) => String(x ?? "").toLowerCase())
          .join(" ");
        if (!blob.includes(kw)) rows = [];
      }
      if (rows.length && filters.status && filters.status !== "All") {
        const want = filters.status.toLowerCase() === "true";
        if (Boolean(rows[0].is_active) !== want) rows = [];
      }

      setFranchiseList(rows);
      setTotalPages(rows.length ? 1 : 0);
    } else {
      const listRes = await fetchFranchise(
        page,
        pageSize,
        apiFilters,
        sortBy,
        fetchOptions
      );

      if (!isMountedRef.current) return;
      if (gen !== franchiseManagementFetchGeneration) return;

      const { response, franchises, totalPages } = listRes;
      if (response) {
        setFranchiseList(franchises as any[]);
        setTotalPages(totalPages);
      } else {
        setFranchiseList([]);
        setTotalPages(0);
      }

      const searchQ = String(apiFilters.search ?? "").trim();
      const statusF = String(apiFilters.status ?? "").trim();
      const hasScopedFilters =
        searchQ !== "" ||
        (statusF !== "" && statusF !== "All") ||
        sortBy.length > 0 ||
        Boolean(apiFranchiseId);

      /** Only Active/Inactive from dropdown: one list getAll is enough; skip 3× limit=1 count fetches. */
      const statusOnlyScoped =
        (statusF !== "" && statusF !== "All") &&
        searchQ === "" &&
        sortBy.length === 0 &&
        !apiFranchiseId;

      /**
       * Search uses the same getAll as counts would (search+name on each leg) → 4× traffic.
       * Keep summary from global getCount while search is active; only the paginated list refetches.
       */
      const skipAncillaryCountFetches =
        statusOnlyScoped || (hasScopedFilters && searchQ !== "");

      if (hasScopedFilters && !skipAncillaryCountFetches) {
        const filtersForCounts = { ...apiFilters };
        delete filtersForCounts.status;
        const [totalRes, activeRes, inactiveRes] = await Promise.all([
          fetchFranchise(1, 1, filtersForCounts, [], fetchOptions),
          fetchFranchise(
            1,
            1,
            { ...filtersForCounts, status: "true" },
            [],
            fetchOptions
          ),
          fetchFranchise(
            1,
            1,
            { ...filtersForCounts, status: "false" },
            [],
            fetchOptions
          ),
        ]);
        if (!isMountedRef.current) return;
        if (gen !== franchiseManagementFetchGeneration) return;
        setFranchiseData({
          Total: Number(totalRes.totalItems ?? totalRes.franchises.length ?? 0),
          Active: Number(
            activeRes.totalItems ?? activeRes.franchises.length ?? 0
          ),
          Inactive: Number(
            inactiveRes.totalItems ?? inactiveRes.franchises.length ?? 0
          ),
        });
      }
    }
  },
    [currentPage, filters, pageSize, sortBy, headerFranchiseId]
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refreshData = useCallback(async () => {
    clearFranchiseDropdownCache();
    await refreshSummaryCounts();
    await fetchData(undefined, { forceRefreshAdminContacts: true });
  }, [fetchData, refreshSummaryCounts]);

  /** After create: page 1 + explicit fetch (avoids stale `currentPage` closure) + getCount. */
  const refreshListAfterCreate = useCallback(async () => {
    clearFranchiseDropdownCache();
    setCurrentPage(1);
    await refreshSummaryCounts();
    await fetchData(1, { forceRefreshAdminContacts: true });
  }, [fetchData, refreshSummaryCounts]);

  const handleFilterChange = (nextFilters: {
    search?: string;
    status?: string;
    sort_order?: "asc" | "desc";
  }) => {
    setCurrentPage(1);
    setFilters((prev) => {
      const merged = { ...prev, ...nextFilters };
      if (
        nextFilters.status === "All" ||
        (Object.prototype.hasOwnProperty.call(nextFilters, "status") &&
          nextFilters.status == null)
      ) {
        delete merged.status;
      }
      return merged;
    });
  };

  const clearFranchiseFiltersDisabled = useMemo(() => {
    const hasSearch = Boolean(String(filters.search ?? "").trim());
    const statusRaw = String(filters.status ?? "").trim();
    const hasUtilityStatus = statusRaw !== "" && statusRaw !== "All";
    const hasSummaryFilters =
      hasUtilityStatus || Boolean(filters.sort_order);
    return (
      !hasSearch &&
      !hasSummaryFilters &&
      sortBy.length === 0 &&
      headerFranchiseId === "all"
    );
  }, [
    filters.search,
    filters.status,
    filters.sort_order,
    sortBy.length,
    headerFranchiseId,
  ]);

  const clearFranchiseFilters = () => {
    setFilters({});
    setSortBy([]);
    setCurrentPage(1);
    setHeaderFranchiseId("all");
    setValue("franchise_id", "all", { shouldValidate: false });
    writeHeaderFranchisePreference("all");
    setUtilityFilterValue("franchise_list_status", "All", {
      shouldValidate: false,
    });
    setUtilitySearchKey((k) => k + 1);
  };

  const franchiseColumns = useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        width: "5%",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Franchise", accessor: "name", sort: true },
      { Header: "Admin", accessor: "admin_name", sort: true },
      { Header: "Email", accessor: "email" },
      { Header: "Phone", accessor: "phone_number" },

      { Header: "State", accessor: "state_name", sort: true },
      { Header: "City", accessor: "city_name", sort: true },
      {
        Header: "Area",
        accessor: "area_name",
        sort: true,

        Cell: multiNamesHoverCell("area_name", "areas"),
      },
      {
        Header: "Categories",
        accessor: "category_names",

        Cell: categoriesTableCell(categoryById),
      },
      {
        Header: "Services",
        accessor: "service_names",

        Cell: servicesTableCell(serviceById),
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
              AddEditFranchiseDialog.show(
                true,
                row.original,
                () => refreshData(),
                true
              );
            }}
            onDelete={async () => {
              openConfirmDialog(
                "Are you sure you want to void this franchise?",
                "Void",
                "Cancel",
                async () => {
                  const id = row?.original?._id;
                  if (!id) return;
                  const ok = await deleteFranchise(String(id));
                  if (ok) refreshData();
                }
              );
            }}
          />
        ),
      },
    ],
    [currentPage, pageSize, refreshData, categoryById, serviceById]
  );

  return (
    <>
      <div className="main-page-content">
        <CustomHeader
          title="Franchise Management"
          register={register}
          setValue={setValue}
          onLocationChange={(value) => {
            setHeaderFranchiseId(value);
            setCurrentPage(1);
          }}
        />

        <div className="box-container">
          <CustomSummaryBox
            divId="box-franchise"
            title={capitalizeString("franchise")}
            data={franchiseData}
            onSelect={() => {
              setCurrentPage(1);
              setFilters({});
              setSortBy([]);
            }}
            isSelected={true}
            onFilterChange={(filter) => {
              handleFilterChange(filter);
            }}
            isAddShow={true}
            addButtonLable="Add Franchise"
            onAddClick={() => {
              AddEditFranchiseDialog.show(false, null, () =>
                refreshListAfterCreate()
              );
            }}
          />
        </div>

        <CustomUtilityBox
          key={`franchise-utility-${utilitySearchKey}`}
          title="Franchises"
          searchHint="Search franchise, admin, state, city, area"
          toolsInlineRow
          hideMoreIcon
          controlSlot={
            <div style={{ minWidth: "200px" }}>
              <CustomFormSelect
                label="Status"
                controlId="franchise_list_status_filter"
                options={[
                  { value: "All", label: "All" },
                  { value: "true", label: "Active" },
                  { value: "false", label: "Inactive" },
                ]}
                register={utilityFilterRegister as unknown as UseFormRegister<any>}
                fieldName="franchise_list_status"
                asCol={false}
                noBottomMargin
                selectWidth="200px"
                defaultValue={
                  filters.status && filters.status !== "All"
                    ? filters.status
                    : "All"
                }
                setValue={setUtilityFilterValue as (name: string, value: any) => void}
                menuPortal
                placeholder="All statuses"
                onChange={(e) => {
                  const v = String(e.target.value ?? "").trim();
                  if (!v || v === "All") {
                    handleFilterChange({ status: "All" });
                  } else {
                    handleFilterChange({ status: v });
                  }
                }}
              />
            </div>
          }
          onSearch={(value) => handleFilterChange({ search: value })}
          syncKeyword={String(filters.search ?? "")}
          afterSearchSlot={
            <Button
              variant="outline-secondary"
              className="custom-btn-secondary partner-payout-clear-btn px-3"
              type="button"
              disabled={clearFranchiseFiltersDisabled}
              onClick={clearFranchiseFilters}
            >
              Clear
            </Button>
          }
        />

        <CustomTable
          columns={franchiseColumns}
          data={franchiseList}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page: number) => setCurrentPage(page)}
          onLimitChange={(pageSize: number) => {
            setPageSize(pageSize);
            setCurrentPage(1);
          }}
          manualSortBy
          sortBy={sortBy}
          onSortChange={(next: { id: string; desc: boolean }[]) => {
            setSortBy(next);
            setCurrentPage(1);
          }}
          theadClass="table-light"
        />
      </div>
    </>
  );
};

export default FranchiseManagement;
