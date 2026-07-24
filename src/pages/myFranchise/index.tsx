import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Form } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import CustomHeader from "../../components/CustomHeader";
import CustomSummaryBox from "../../components/CustomSummaryBox";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import CustomTable from "../../components/CustomTable";
import CustomActionColumn from "../../components/CustomActionColumn";
import { openConfirmDialog } from "../../components/CustomConfirmDialog";
import {
  showErrorAlert,
  showInfoAlert,
  showSuccessAlert,
} from "../../lib/global/alertHelper";
import { statusCell, mapApprovalStatusFromRecord } from "../../helper/utility";
import { useForm } from "react-hook-form";
import type { ServerTableSortBy } from "../../lib/global/serverTableSort";
import type {
  AreaRow,
  CategoryRow,
  EmployeeRow,
  MyFranchiseDataFetchOptions,
  MyFranchiseDataSlice,
  RequestedCategoryRow,
  RequestedServiceRow,
  ServiceRow,
} from "../../services/myFranchiseService";
import {
  fetchMyFranchiseDataSlices,
  myFranchiseDataCacheKey,
  setCategoryActive as apiSetCategoryActive,
  setEmployeeChatEnabled as apiSetEmployeeChatEnabled,
  setServiceActive as apiSetServiceActive,
  voidFranchiseEmployee,
  voidRequestedCategory,
  voidRequestedService,
} from "../../services/myFranchiseService";
import { fetchCategoryById } from "../../services/categoryService";
import { fetchServiceById } from "../../services/servicesService";
import { getCount } from "../../services/getCountService";
import FranchiseEmployeeDialog from "./FranchiseEmployeeDialog";
import RequestedCategoryDialog from "./RequestedCategoryDialog";
import RequestedServiceDialog from "./RequestedServiceDialog";

type BoxId = "box-employees" | "box-areas" | "box-services" | "box-categories";

type ServicesViewMode = "catalog" | "requested";

type CategoriesViewMode = "catalog" | "requested";

type FranchiseBoxConfig = {
  id: BoxId;
  title: string;
  data: Record<string, number>;
  isAddShow: boolean;
  addLabel: string;
  onAdd?: () => void;
};

const requestedStatusCell = ({ row }: { row: { original?: { status?: string } } }) => {
  const status = String(row?.original?.status ?? "pending").toLowerCase();
  if (status === "rejected") {
    return <span style={{ color: "red", fontWeight: 600 }}>Rejected</span>;
  }
  if (status === "approved") {
    return <span style={{ color: "green", fontWeight: 600 }}>Approved</span>;
  }
  return <span style={{ color: "orange", fontWeight: 600 }}>Pending</span>;
};

/** Kept for HMR / cached bundles that still reference the old name. */
const pendingRequestedStatusCell = requestedStatusCell;

function normalizeAreaValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeAreaPinCodesFromRow(original: any): string[] {
  const rawPinCodes =
    original?.pincodes ?? original?.pincode ?? original?.pin_codes ?? [];

  const pinCodes = Array.isArray(rawPinCodes)
    ? rawPinCodes
    : typeof rawPinCodes === "string"
    ? rawPinCodes.split(",")
    : [];

  return pinCodes.map((p: unknown) => String(p).trim()).filter(Boolean);
}

/** Same pattern as `locationManagement/index.tsx` pinCodesCell — uses global `.pin-code-hover-*` styles. */
function franchiseAreasPinCodesCell({ row }: { row: any }) {
  const normalized = normalizeAreaPinCodesFromRow(row?.original);

  if (normalized.length === 0) return "-";

  return (
    <div className="pin-code-hover-wrapper">
      <span className="pin-code-hover-trigger">
        {normalized.length === 1 ? (
          normalized[0]
        ) : (
          <>
            {normalized[0]}...
            <span className="pin-code-more-count">
              {" "}
              +{normalized.length - 1}
            </span>
          </>
        )}
      </span>
      {normalized.length > 1 && (
        <div className="pin-code-hover-card">
          {normalized.map((p: string) => (
            <div key={p} className="pin-code-hover-item">
              {p}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Same hover pattern as `serviceManagement` category “Services” column. */
function serviceNamesHoverFromList(names: (string | undefined)[]): React.ReactNode {
  const list = names.map((n) => String(n ?? "").trim()).filter(Boolean);
  if (list.length === 0) return "-";
  const hasMoreServices = list.length > 1;
  const additionalCount = list.length - 1;
  return (
    <div className="pin-code-hover-wrapper">
      <span className="pin-code-hover-trigger">
        {hasMoreServices ? (
          <>
            {`${list[0]}...`}
            <span style={{ color: "red" }}>{`+${additionalCount}`}</span>
          </>
        ) : (
          list[0]
        )}
      </span>
      <div className="pin-code-hover-card">
        {list.map((n, idx) => (
          <div key={`${n}-${idx}`} className="pin-code-hover-item">
            {`• ${n}`}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Service labels for a franchise catalogue category row (from `GET /category/get/:id`). */
function categoryCatalogServiceNames(cat: CategoryRow): string[] {
  if (Array.isArray(cat.service_names) && cat.service_names.length) {
    return cat.service_names
      .map((n) => String(n ?? "").trim())
      .filter(Boolean);
  }
  return [];
}

/** Normalize `POST /api/getCount` `record` values (numbers or numeric strings). */
function countRecordNumber(rec: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(rec, k)) continue;
    const v = rec[k];
    if (v === undefined || v === null || v === "") continue;
    const n = typeof v === "number" ? v : Number(String(v).trim());
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Maps `getCount("my-franchise")` `record` into `CustomSummaryBox` `data` shapes.
 * Accepts extra snake_case / alias keys from the API; falls back to implied inactive when omitted.
 */
function summariesFromMyFranchiseCountRecord(
  record: unknown
): {
  employees: Record<string, number>;
  areas: Record<string, number>;
  services: Record<string, number>;
  categories: Record<string, number>;
} | null {
  if (!record || typeof record !== "object") return null;
  const rec = record as Record<string, unknown>;

  const triplet = (
    totalKeys: string[],
    activeKeys: string[],
    inactiveKeys: string[]
  ) => {
    const total = countRecordNumber(rec, totalKeys);
    const active = countRecordNumber(rec, activeKeys);
    let inactive = countRecordNumber(rec, inactiveKeys);
    const inactiveExplicit = inactiveKeys.some((k) =>
      Object.prototype.hasOwnProperty.call(rec, k)
    );
    if (!inactiveExplicit && (total > 0 || active > 0)) {
      inactive = Math.max(0, total - active);
    }
    return { Total: total, Active: active, Inactive: inactive };
  };

  const requestedService = Math.max(
    countRecordNumber(rec, [
      "requested_service",
      "total_requestedservice",
      "pending_requestedservice",
    ]),
    0
  );
  const requestedCategory = Math.max(
    countRecordNumber(rec, [
      "requested_category",
      "total_requestedcategory",
      "pending_requestedcategory",
    ]),
    0
  );

  return {
    employees: triplet(
      ["total_employee", "total_employees"],
      ["active_employee", "active_employees"],
      ["inactive_employee", "inactive_employees"]
    ),
    areas: triplet(
      ["total_area", "total_areas"],
      ["active_area", "active_areas"],
      ["inactive_area", "inactive_areas"]
    ),
    services: {
      ...triplet(
        ["total_service", "total_services"],
        ["active_service", "active_services"],
        ["inactive_service", "inactive_services"]
      ),
      requested_service: requestedService,
    },
    categories: {
      ...triplet(
        ["total_category", "total_categories"],
        ["active_category", "active_categories"],
        ["inactive_category", "inactive_categories"]
      ),
      requested_category: requestedCategory,
    },
  };
}

/**
 * Normalizes mapping `is_active` for controlled switches (API may send 0/1, strings, etc.).
 */
function coerceCatalogRowActive(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "true" || s === "active" || s === "yes") return true;
  if (s === "false" || s === "inactive" || s === "no") return false;
  return false;
}

function serviceRowMatchesCatalogueId(row: ServiceRow, catalogueId: string) {
  const id = String(catalogueId ?? "").trim();
  if (!id) return false;
  const a = String(row._id ?? "").trim();
  const b = String(row.service_id ?? "").trim();
  if (a === id || b === id) return true;
  const il = id.toLowerCase();
  return a.toLowerCase() === il || b.toLowerCase() === il;
}

const MyFranchise = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const notificationDeepLinkHandledRef = useRef("");
  const { register, setValue } = useForm();
  /** Employees section is selected on first paint so the list loads with the page. */
  const [selectedBox, setSelectedBox] = useState<BoxId>("box-employees");
  const [servicesViewMode, setServicesViewMode] =
    useState<ServicesViewMode>("catalog");
  const [categoriesViewMode, setCategoriesViewMode] =
    useState<CategoriesViewMode>("catalog");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined
  );
  const [searchKeyword, setSearchKeyword] = useState("");
  const [areaSortBy, setAreaSortBy] = useState<ServerTableSortBy>([]);
  /** Server sort on franchise-service catalogue — **service name** column only (`sort_by=name`). */
  const [serviceSortBy, setServiceSortBy] = useState<ServerTableSortBy>([]);
  /** Server sort on franchise-category catalogue — **category name** column only (`sort_by=name`). */
  const [categorySortBy, setCategorySortBy] = useState<ServerTableSortBy>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [requestedServices, setRequestedServices] = useState<
    RequestedServiceRow[]
  >([]);
  const [requestedCategories, setRequestedCategories] = useState<
    RequestedCategoryRow[]
  >([]);

  /** Dashboard totals from `POST /api/getCount` `{ type: "my-franchise" }` (preferred over list-length counts). */
  const [countSummaries, setCountSummaries] = useState<{
    employees: Record<string, number>;
    areas: Record<string, number>;
    services: Record<string, number>;
    categories: Record<string, number>;
  } | null>(null);

  const loadedKeysRef = useRef<Set<string>>(new Set());
  /** Drops stale hydrate results when `reloadFranchiseData` + `useEffect` both refetch after cache clear. */
  const hydrateRequestIdRef = useRef(0);

  const myFranchiseFetchOptions = useMemo((): MyFranchiseDataFetchOptions => {
    const o: MyFranchiseDataFetchOptions = {};
    if (
      selectedBox === "box-categories" &&
      categoriesViewMode === "catalog"
    ) {
      o.franchiseMappingFilter =
        statusFilter === "true"
          ? "active"
          : statusFilter === "false"
          ? "inactive"
          : "all";
      const catQ = searchKeyword.trim();
      if (catQ) o.categoryCatalogSearch = catQ;
      const catPrimary = categorySortBy[0];
      if (catPrimary?.id === "name") {
        o.categoryCatalogSortBy = "name";
        o.categoryCatalogSortOrder = catPrimary.desc ? "desc" : "asc";
      }
    } else if (
      selectedBox === "box-services" &&
      servicesViewMode === "catalog"
    ) {
      o.franchiseMappingFilter =
        statusFilter === "true"
          ? "active"
          : statusFilter === "false"
          ? "inactive"
          : "all";
      const q = searchKeyword.trim();
      if (q) o.serviceCatalogSearch = q;
      const primary = serviceSortBy[0];
      if (primary?.id === "name") {
        o.serviceCatalogSortBy = "name";
        o.serviceCatalogSortOrder = primary.desc ? "desc" : "asc";
      }
    }
    if (
      (selectedBox === "box-categories" &&
        categoriesViewMode === "requested") ||
      (selectedBox === "box-services" && servicesViewMode === "requested")
    ) {
      /** Show every `is_request` row from API (pending, approved, rejected) — same as Service Management. */
      o.requestedApprovalStatus = "all";
    }
    return o;
  }, [
    selectedBox,
    categoriesViewMode,
    servicesViewMode,
    statusFilter,
    searchKeyword,
    serviceSortBy,
    categorySortBy,
  ]);

  const mapEmployeesWithChat = useCallback((rows: EmployeeRow[]) => {
    return rows.map((e) => ({
      ...e,
      chat_enabled: e.is_active ? e.chat_enabled ?? true : false,
    }));
  }, []);

  const refreshMyFranchiseCountSummaries = useCallback(async () => {
    const countRes = await getCount("my-franchise");
    if (countRes.responseCount && countRes.countModel) {
      const mapped = summariesFromMyFranchiseCountRecord(countRes.countModel);
      setCountSummaries(mapped);
    } else {
      setCountSummaries(null);
    }
  }, []);

  const hydrateFranchiseSlices = useCallback(
    async (slices: MyFranchiseDataSlice[]) => {
      const need = slices.filter(
        (s) =>
          !loadedKeysRef.current.has(
            myFranchiseDataCacheKey(s, myFranchiseFetchOptions)
          )
      );
      if (need.length === 0) return;
      const requestId = ++hydrateRequestIdRef.current;
      const data = await fetchMyFranchiseDataSlices(need, myFranchiseFetchOptions);
      if (requestId !== hydrateRequestIdRef.current) return;
      if (data.employees) {
        setEmployees(mapEmployeesWithChat(data.employees as EmployeeRow[]));
      }
      if (data.areas) {
        setAreas(data.areas as unknown as AreaRow[]);
      }
      if (data.services) {
        setServices(data.services as unknown as ServiceRow[]);
      }
      if (data.categories) {
        setCategories(data.categories as unknown as CategoryRow[]);
      }
      if (data.requested_services) {
        setRequestedServices(data.requested_services as RequestedServiceRow[]);
      }
      if (data.requested_categories) {
        setRequestedCategories(
          data.requested_categories as RequestedCategoryRow[]
        );
      }
      need.forEach((s) =>
        loadedKeysRef.current.add(
          myFranchiseDataCacheKey(s, myFranchiseFetchOptions)
        )
      );
    },
    [mapEmployeesWithChat, myFranchiseFetchOptions]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshMyFranchiseCountSummaries();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMyFranchiseCountSummaries]);

  const slicesForCurrentSelection = useMemo((): MyFranchiseDataSlice[] => {
    switch (selectedBox) {
      case "box-employees":
        return ["employees"];
      case "box-areas":
        return ["areas"];
      case "box-services":
        return servicesViewMode === "catalog"
          ? ["services"]
          : ["requested_services"];
      case "box-categories":
        return categoriesViewMode === "catalog"
          ? ["categories"]
          : ["requested_categories"];
      default:
        return [];
    }
  }, [selectedBox, servicesViewMode, categoriesViewMode]);

  const reloadFranchiseData = useCallback(async () => {
    await refreshMyFranchiseCountSummaries();
    for (const s of slicesForCurrentSelection) {
      for (const k of Array.from(loadedKeysRef.current)) {
        if (k === s || k.startsWith(`${s}|`)) {
          loadedKeysRef.current.delete(k);
        }
      }
    }
    await hydrateFranchiseSlices(slicesForCurrentSelection);
  }, [
    hydrateFranchiseSlices,
    refreshMyFranchiseCountSummaries,
    slicesForCurrentSelection,
  ]);

  useEffect(() => {
    const section = String(searchParams.get("section") ?? "")
      .trim()
      .toLowerCase();
    const view = String(searchParams.get("view") ?? "").trim().toLowerCase();
    const openId = String(searchParams.get("openId") ?? "").trim();
    if (!section && !view && !openId) return;

    const linkKey = `${section}|${view}|${openId}`;
    if (notificationDeepLinkHandledRef.current === linkKey) return;
    notificationDeepLinkHandledRef.current = linkKey;

    const isCategorySection =
      section === "categories" || section === "category";
    const isServiceSection = section === "services" || section === "service";

    if (isCategorySection) {
      for (const k of Array.from(loadedKeysRef.current)) {
        if (k.startsWith("requested_categories|")) {
          loadedKeysRef.current.delete(k);
        }
      }
      setSelectedBox("box-categories");
      if (view === "requested") setCategoriesViewMode("requested");
    } else if (isServiceSection) {
      for (const k of Array.from(loadedKeysRef.current)) {
        if (k.startsWith("requested_services|")) {
          loadedKeysRef.current.delete(k);
        }
      }
      setSelectedBox("box-services");
      if (view === "requested") setServicesViewMode("requested");
    }

    const clearParams = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("section");
      next.delete("view");
      next.delete("openId");
      setSearchParams(next, { replace: true });
    };

    if (!openId) {
      clearParams();
      return;
    }

    void (async () => {
      if (isCategorySection) {
        const { response, category } = await fetchCategoryById(openId);
        if (response && category) {
          RequestedCategoryDialog.showView(
            {
              _id: String(category._id ?? openId),
              name: String(category.name ?? ""),
              service_ids: [],
              service_names: [],
              description: String(category.desc ?? "").trim(),
              image_url: category.image_url,
              status: mapApprovalStatusFromRecord(
                category as unknown as Record<string, unknown>
              ),
              rejection_reason: String(category.rejection_reason ?? ""),
            },
            () => {
              void reloadFranchiseData();
            }
          );
        }
      } else if (isServiceSection) {
        const { response, service } = await fetchServiceById(openId);
        if (response && service) {
          RequestedServiceDialog.showView(
            service as unknown as RequestedServiceRow,
            [],
            () => {
              void reloadFranchiseData();
            }
          );
        }
      }
      clearParams();
    })();
  }, [searchParams, setSearchParams, reloadFranchiseData]);

  /** Load table data only for the active section (and catalog vs requested sub-mode). */
  useEffect(() => {
    if (slicesForCurrentSelection.length === 0) return;
    /**
     * `loadedKeysRef` keys include search/sort params. After a search, clearing search
     * can reproduce an earlier key (e.g. empty search) that is still marked loaded, so
     * hydrate would skip — drop all keys for catalog slices that use server search/sort.
     */
    if (selectedBox === "box-services" && servicesViewMode === "catalog") {
      for (const k of Array.from(loadedKeysRef.current)) {
        if (k.startsWith("services|")) loadedKeysRef.current.delete(k);
      }
    }
    if (selectedBox === "box-categories" && categoriesViewMode === "catalog") {
      for (const k of Array.from(loadedKeysRef.current)) {
        if (k.startsWith("categories|")) loadedKeysRef.current.delete(k);
      }
    }
    if (selectedBox === "box-services" && servicesViewMode === "requested") {
      for (const k of Array.from(loadedKeysRef.current)) {
        if (k.startsWith("requested_services|")) loadedKeysRef.current.delete(k);
      }
    }
    if (selectedBox === "box-categories" && categoriesViewMode === "requested") {
      for (const k of Array.from(loadedKeysRef.current)) {
        if (k.startsWith("requested_categories|")) {
          loadedKeysRef.current.delete(k);
        }
      }
    }
    void hydrateFranchiseSlices(slicesForCurrentSelection);
  }, [
    selectedBox,
    servicesViewMode,
    categoriesViewMode,
    slicesForCurrentSelection,
    hydrateFranchiseSlices,
    myFranchiseFetchOptions,
  ]);

  const handleEmployeeVoid = useCallback(
    (id: string) => {
      openConfirmDialog(
        "Are you sure you want to void this employee? ",
        "Void",
        "Cancel",
        async () => {
          const ok = await voidFranchiseEmployee(id);
          if (ok) {
            showSuccessAlert("Employee voided");
            await reloadFranchiseData();
          } else {
            showInfoAlert("Void is display-only — nothing was removed.");
          }
        }
      );
    },
    [reloadFranchiseData]
  );

  const employeesSummary = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((e) => e.is_active).length;
    return { Total: total, Active: active, Inactive: total - active };
  }, [employees]);

  const areasSummary = useMemo(() => {
    const total = areas.length;
    const active = areas.filter((a) => a.is_active).length;
    return { Total: total, Active: active, Inactive: total - active };
  }, [areas]);

  const servicesSummary = useMemo(() => {
    const total = services.length;
    const active = services.filter((s) => s.is_active).length;
    return {
      Total: total,
      Active: active,
      Inactive: total - active,
      requested_service: requestedServices.length,
    };
  }, [services, requestedServices]);

  const categoriesSummary = useMemo(() => {
    const total = categories.length;
    const active = categories.filter((c) => c.is_active).length;
    return {
      Total: total,
      Active: active,
      Inactive: total - active,
      requested_category: requestedCategories.length,
    };
  }, [categories, requestedCategories]);

  const employeesSummaryForBox = useMemo(
    () => countSummaries?.employees ?? employeesSummary,
    [countSummaries, employeesSummary]
  );
  const areasSummaryForBox = useMemo(
    () => countSummaries?.areas ?? areasSummary,
    [countSummaries, areasSummary]
  );
  const servicesSummaryForBox = useMemo(
    () => countSummaries?.services ?? servicesSummary,
    [countSummaries, servicesSummary]
  );
  const categoriesSummaryForBox = useMemo(
    () => countSummaries?.categories ?? categoriesSummary,
    [countSummaries, categoriesSummary]
  );

  const handleBoxSelect = useCallback(
    (divId: string) => {
      const boxId = divId as BoxId;
      setSelectedBox(boxId);
      setServicesViewMode("catalog");
      setCategoriesViewMode("catalog");
      setStatusFilter(undefined);
      setSearchKeyword("");
      setAreaSortBy([]);
      setServiceSortBy([]);
      setCategorySortBy([]);
      setCurrentPage(1);

    },
    []
  );

  const handleFilterChange = useCallback((filter: { status?: string }) => {
    setStatusFilter(filter.status);
    setServicesViewMode("catalog");
    setCategoriesViewMode("catalog");
    setCurrentPage(1);
  }, []);

  const keyword = searchKeyword.trim().toLowerCase();

  const filteredEmployees = useMemo(() => {
    return employees.filter((row) => {
      const matchesStatus =
        statusFilter == null ||
        (statusFilter === "true" && row.is_active) ||
        (statusFilter === "false" && !row.is_active);
      const hay = [
        row.employee_id,
        row.name,
        row.role,
        row.phone,
        row.email,
        row.area_name,
      ]
        .join(" ")
        .toLowerCase();
      const matchesKw = !keyword || hay.includes(keyword);
      return matchesStatus && matchesKw;
    });
  }, [employees, statusFilter, keyword]);

  const filteredAreas = useMemo(() => {
    return areas.filter((row) => {
      const matchesStatus =
        statusFilter == null ||
        (statusFilter === "true" && row.is_active) ||
        (statusFilter === "false" && !row.is_active);
      const pins = normalizeAreaPinCodesFromRow(row);
      const hay = [
        row.area_name,
        (row as any).name,
        row.city_name,
        (row as any).city,
        row.state_name,
        (row as any).state,
        row.pincode,
        ...pins,
      ]
        .join(" ")
        .toLowerCase();
      const matchesKw = !keyword || hay.includes(keyword);
      return matchesStatus && matchesKw;
    });
  }, [areas, statusFilter, keyword]);

  const sortedFilteredAreas = useMemo(() => {
    const primarySort = areaSortBy[0];
    if (!primarySort?.id) return filteredAreas;

    const areaFieldForSort = (row: AreaRow): string => {
      if (primarySort.id === "area_name") {
        return normalizeAreaValue(row.area_name || (row as any).name);
      }
      if (primarySort.id === "city_name") {
        return normalizeAreaValue(row.city_name || (row as any).city);
      }
      if (primarySort.id === "state_name") {
        return normalizeAreaValue(row.state_name || (row as any).state);
      }
      return "";
    };

    const direction = primarySort.desc ? -1 : 1;
    return [...filteredAreas].sort((a, b) => {
      const left = areaFieldForSort(a);
      const right = areaFieldForSort(b);
      if (left < right) return -1 * direction;
      if (left > right) return 1 * direction;
      return 0;
    });
  }, [filteredAreas, areaSortBy]);

  const filteredServices = useMemo(() => {
    return services.filter((row) => {
      const matchesStatus =
        statusFilter == null ||
        (statusFilter === "true" && row.is_active) ||
        (statusFilter === "false" && !row.is_active);
      return matchesStatus;
    });
  }, [services, statusFilter]);

  const filteredRequestedServices = useMemo(() => {
    return requestedServices.filter((row) => {
      const hay = [row.name, row.category_name].join(" ").toLowerCase();
      return !keyword || hay.includes(keyword);
    });
  }, [requestedServices, keyword]);

  const filteredCategories = useMemo(() => {
    return categories.filter((row) => {
      const matchesStatus =
        statusFilter == null ||
        (statusFilter === "true" && row.is_active) ||
        (statusFilter === "false" && !row.is_active);
      return matchesStatus;
    });
  }, [categories, statusFilter]);

  const filteredRequestedCategories = useMemo(() => {
    return requestedCategories.filter((row: RequestedCategoryRow) => {
      const hay = String(row.name ?? "")
        .trim()
        .toLowerCase();
      return !keyword || hay.includes(keyword);
    });
  }, [requestedCategories, keyword]);

  const activeFilteredList = useMemo(() => {
    switch (selectedBox) {
      case "box-employees":
        return filteredEmployees;
      case "box-areas":
        return sortedFilteredAreas;
      case "box-services":
        return servicesViewMode === "requested"
          ? filteredRequestedServices
          : filteredServices;
      case "box-categories":
        return categoriesViewMode === "requested"
          ? filteredRequestedCategories
          : filteredCategories;
      default:
        return [];
    }
  }, [
    selectedBox,
    servicesViewMode,
    categoriesViewMode,
    filteredEmployees,
    sortedFilteredAreas,
    filteredServices,
    filteredRequestedServices,
    filteredCategories,
    filteredRequestedCategories,
  ]);

  const totalPages = useMemo(() => {
    if (!activeFilteredList.length) return 0;
    return Math.ceil(activeFilteredList.length / pageSize);
  }, [activeFilteredList, pageSize]);

  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return activeFilteredList.slice(start, start + pageSize);
  }, [activeFilteredList, currentPage, pageSize]);

  const setEmployeeChatEnabled = useCallback(
    async (emp: EmployeeRow, enabled: boolean) => {
      const prevChat = emp.chat_enabled;
      setEmployees((prev) =>
        prev.map((e) =>
          e._id === emp._id && e.is_active
            ? { ...e, chat_enabled: enabled }
            : e
        )
      );
      const ok = await apiSetEmployeeChatEnabled(emp, enabled);
      if (ok) {
        showSuccessAlert("Chat status updated");
      } else {
        setEmployees((prev) =>
          prev.map((e) =>
            e._id === emp._id ? { ...e, chat_enabled: prevChat } : e
          )
        );
      }
    },
    []
  );

  const setServiceActive = useCallback(
    async (id: string, is_active: boolean) => {
      const sid = String(id ?? "").trim();
      let prev: boolean | undefined;
      setServices((p) => {
        prev = p.find((s) => serviceRowMatchesCatalogueId(s, sid))?.is_active;
        return p.map((s) =>
          serviceRowMatchesCatalogueId(s, sid) ? { ...s, is_active } : s
        );
      });
      const ok = await apiSetServiceActive(sid, is_active);
      if (ok) {
        showSuccessAlert("Service status updated");
        await reloadFranchiseData();
      } else {
        if (prev !== undefined) {
          setServices((p) =>
            p.map((s) =>
              serviceRowMatchesCatalogueId(s, sid)
                ? { ...s, is_active: prev! }
                : s
            )
          );
        }
        showErrorAlert("Could not update service status.");
      }
    },
    [reloadFranchiseData]
  );

  const setCategoryActive = useCallback(
    async (id: string, is_active: boolean) => {
      const prev = categories.find((c) => c._id === id)?.is_active;
      setCategories((p) =>
        p.map((c) => (c._id === id ? { ...c, is_active } : c))
      );
      const ok = await apiSetCategoryActive(id, is_active);
      if (ok) {
        showSuccessAlert("Category status updated");
        await reloadFranchiseData();
      } else {
        if (prev !== undefined) {
          setCategories((p) =>
            p.map((c) => (c._id === id ? { ...c, is_active: prev } : c))
          );
        }
        showErrorAlert("Could not update category status.");
      }
    },
    [categories, reloadFranchiseData]
  );

  const handleRequestedServiceVoid = useCallback(
    (id: string) => {
      openConfirmDialog(
        "Are you sure you want to void this service request?",
        "Void",
        "Cancel",
        async () => {
          const ok = await voidRequestedService(id);
          if (ok) {
            showSuccessAlert("Service request voided");
            await reloadFranchiseData();
          } else {
            showInfoAlert("Void is display-only — nothing was removed.");
          }
        }
      );
    },
    [reloadFranchiseData]
  );

  const handleRequestedCategoryVoid = useCallback(
    (id: string) => {
      openConfirmDialog(
        "Are you sure you want to void this category request?",
        "Void",
        "Cancel",
        async () => {
          const ok = await voidRequestedCategory(id);
          if (ok) {
            showSuccessAlert("Category request voided");
            await reloadFranchiseData();
          } else {
            showInfoAlert("Void is display-only — nothing was removed.");
          }
        }
      );
    },
    [reloadFranchiseData]
  );

  const categorySelectOptions = useMemo(
    () => categories.map((c) => ({ value: c._id, label: c.name })),
    [categories]
  );

  const utilityTitle = useMemo(() => {
    switch (selectedBox) {
      case "box-employees":
        return "Employees";
      case "box-areas":
        return "Areas";
      case "box-services":
        return servicesViewMode === "requested"
          ? "Requested Services"
          : "Services";
      case "box-categories":
        return categoriesViewMode === "requested"
          ? "Requested Categories"
          : "Categories";
      default:
        return "";
    }
  }, [selectedBox, servicesViewMode, categoriesViewMode]);

  const utilitySearchHint = useMemo(() => {
    switch (selectedBox) {
      case "box-employees":
        return "Search employee name";
      case "box-areas":
        return "Search area, city, state, pin code";
      case "box-services":
        return servicesViewMode === "catalog"
          ? "Search service name, category"
          : "Search service name";
      case "box-categories":
        return categoriesViewMode === "catalog"
          ? "Search category name"
          : "Search category name";
      default:
        return "Search";
    }
  }, [selectedBox, servicesViewMode, categoriesViewMode]);

  const employeeColumns = useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        className: "my-franchise-col-sr",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Name", accessor: "name", className: "my-franchise-col-name" },
      {
        Header: "Phone",
        accessor: "phone",
        className: "my-franchise-col-phone",
      },
      {
        Header: "Email",
        accessor: "email",
        className: "my-franchise-col-email",
      },
      {
        Header: "Chat",
        accessor: "chat_enabled",
        className: "my-franchise-col-chat my-franchise-col-active-toggle",
        Cell: ({ row }: { row: any }) => {
          const emp = row.original as EmployeeRow;
          const chatOn = Boolean(emp.is_active && emp.chat_enabled);
          return (
            <Form.Check
              type="switch"
              id={`franchise-chat-${emp._id}`}
              className={`franchise-status-switch${
                chatOn ? " franchise-status-switch--on" : ""
              }`}
              checked={chatOn}
              disabled={!emp.is_active}
              aria-label={
                !emp.is_active
                  ? "Chat unavailable for inactive employees"
                  : chatOn
                  ? "Chat on, switch to turn off"
                  : "Chat off, switch to turn on"
              }
              title={
                emp.is_active
                  ? "Chat on / off"
                  : "Inactive employees cannot use chat"
              }
              onChange={(e) => {
                e.stopPropagation();
                if (!emp.is_active) return;
                void setEmployeeChatEnabled(emp, e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          );
        },
      },
      {
        Header: "Status",
        accessor: "is_active",
        className: "my-franchise-col-status",
        Cell: statusCell("is_active"),
      },
      {
        Header: "Action",
        accessor: "action",
        className: "my-franchise-col-actions",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={(r) => {
              const emp = r.original as EmployeeRow;
              FranchiseEmployeeDialog.showView(emp, () => reloadFranchiseData());
            }}
            onDelete={(r) => {
              const emp = r.original as EmployeeRow;
              handleEmployeeVoid(emp._id);
            }}
          />
        ),
      },
    ],
    [
      currentPage,
      pageSize,
      setEmployeeChatEnabled,
      reloadFranchiseData,
      handleEmployeeVoid,
    ]
  );

  const areaColumns = useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      {
        Header: "Area Name",
        accessor: "area_name",
        sort: true,
        Cell: ({ row }: { row: any }) => {
          const r = row?.original as AreaRow;
          return r?.area_name || (r as any)?.name || "—";
        },
      },
      {
        Header: "City",
        accessor: "city_name",
        sort: true,
        Cell: ({ row }: { row: any }) => {
          const r = row?.original as AreaRow;
          return r?.city_name || (r as any)?.city || "—";
        },
      },
      {
        Header: "State",
        accessor: "state_name",
        sort: true,
        Cell: ({ row }: { row: any }) => {
          const r = row?.original as AreaRow;
          return r?.state_name || (r as any)?.state || "—";
        },
      },
      {
        Header: "Pin code",
        accessor: "pincodes",
        Cell: franchiseAreasPinCodesCell,
      },
      {
        Header: "Status",
        accessor: "is_active",
        className: "my-franchise-col-status",
        Cell: statusCell("is_active"),
      },
    ],
    [currentPage, pageSize]
  );

  const serviceColumns = useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Service Name", accessor: "name", sort: true },
      { Header: "Category Name", accessor: "category_name" },
      {
        Header: "Status",
        accessor: "is_active",
        className: "my-franchise-col-active-toggle",
        Cell: ({ row }: { row: any }) => {
          const svc = row.original as ServiceRow;
          const active = coerceCatalogRowActive(svc.is_active);
          return (
            <Form.Check
              type="switch"
              id={`franchise-service-active-${svc._id}`}
              className={`franchise-status-switch${
                active ? " franchise-status-switch--on" : ""
              }`}
              checked={active}
              aria-label={
                active
                  ? "Active, switch to deactivate"
                  : "Inactive, switch to activate"
              }
              title={
                active
                  ? "Active — turn off to deactivate"
                  : "Inactive — turn on to activate"
              }
              onChange={(e) => {
                e.stopPropagation();
                const toggleId =
                  String(svc._id ?? "").trim() ||
                  String(svc.service_id ?? "").trim();
                void setServiceActive(toggleId, e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          );
        },
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={async (r) => {
              const svc = r.original as ServiceRow;
              const sid =
                String(svc._id ?? "").trim() ||
                String(svc.service_id ?? "").trim();
              if (!sid) {
                showErrorAlert("Unable to open service: missing identifier.");
                return;
              }
              const { response, service } = await fetchServiceById(sid);
              if (response && service) {
                const { default: ServiceDetailsDialog } = await import(
                  "../serviceManagement/AddEditServiceDialog"
                );
                ServiceDetailsDialog.show(
                  false,
                  service,
                  () => {
                    void reloadFranchiseData();
                  },
                  true,
                  undefined,
                  true
                );
              } else {
                showErrorAlert(
                  "Unable to load service details. You may not have access, or the service was removed."
                );
              }
            }}
          />
        ),
      },
    ],
    [currentPage, pageSize, setServiceActive, reloadFranchiseData]
  );

  const requestedServiceColumns = useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Service Name", accessor: "name" },
      { Header: "Category", accessor: "category_name" },
      {
        Header: "Status",
        accessor: "status",
        Cell: pendingRequestedStatusCell,
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={(r) => {
              RequestedServiceDialog.showView(
                r.original as RequestedServiceRow,
                categorySelectOptions,
                () => {
                  void reloadFranchiseData();
                }
              );
            }}
            onDelete={(r) => {
              handleRequestedServiceVoid(
                (r.original as RequestedServiceRow)._id
              );
            }}
          />
        ),
      },
    ],
    [
      currentPage,
      pageSize,
      categorySelectOptions,
      reloadFranchiseData,
      handleRequestedServiceVoid,
    ]
  );

  const requestedCategoryColumns = useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Category Name", accessor: "name" },
      {
        Header: "Status",
        accessor: "status",
        Cell: pendingRequestedStatusCell,
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={(r) => {
              RequestedCategoryDialog.showView(
                r.original as RequestedCategoryRow,
                () => {
                  void reloadFranchiseData();
                }
              );
            }}
            onDelete={(r) => {
              handleRequestedCategoryVoid(
                (r.original as RequestedCategoryRow)._id
              );
            }}
          />
        ),
      },
    ],
    [currentPage, pageSize, reloadFranchiseData, handleRequestedCategoryVoid]
  );

  const categoryColumns = useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Category Name", accessor: "name", sort: true },
      {
        Header: "Services",
        accessor: "service_names_display",
        Cell: ({ row }: { row: any }) => {
          const cat = row.original as CategoryRow;
          return serviceNamesHoverFromList(categoryCatalogServiceNames(cat));
        },
      },
      {
        Header: "Status",
        accessor: "is_active",
        className: "my-franchise-col-active-toggle",
        Cell: ({ row }: { row: any }) => {
          const cat = row.original as CategoryRow;
          const active = coerceCatalogRowActive(cat.is_active);
          return (
            <Form.Check
              type="switch"
              id={`franchise-category-active-${cat._id}`}
              className={`franchise-status-switch${
                active ? " franchise-status-switch--on" : ""
              }`}
              checked={active}
              aria-label={
                active
                  ? "Active, switch to deactivate"
                  : "Inactive, switch to activate"
              }
              title={
                active
                  ? "Active — turn off to deactivate"
                  : "Inactive — turn on to activate"
              }
              onChange={(e) => {
                e.stopPropagation();
                void setCategoryActive(cat._id, e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          );
        },
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={async (r) => {
              const cat = r.original as CategoryRow;
              const cid =
                String(cat._id ?? "").trim() ||
                String(cat.category_id ?? "").trim();
              if (!cid) {
                showErrorAlert("Unable to open category: missing identifier.");
                return;
              }
              const { response, category } = await fetchCategoryById(cid);
              if (response && category) {
                const { default: CategoryDetailsDialog } = await import(
                  "../serviceManagement/AddEditCategoryDialog"
                );
                CategoryDetailsDialog.show(
                  false,
                  category,
                  () => {
                    void reloadFranchiseData();
                  },
                  true,
                  true
                );
              } else {
                showErrorAlert(
                  "Unable to load category details. You may not have access, or the category was removed."
                );
              }
            }}
          />
        ),
      },
    ],
    [currentPage, pageSize, setCategoryActive, reloadFranchiseData]
  );

  const tableColumns = useMemo(() => {
    switch (selectedBox) {
      case "box-employees":
        return employeeColumns;
      case "box-areas":
        return areaColumns;
      case "box-services":
        return servicesViewMode === "requested"
          ? requestedServiceColumns
          : serviceColumns;
      case "box-categories":
        return categoriesViewMode === "requested"
          ? requestedCategoryColumns
          : categoryColumns;
      default:
        return [];
    }
  }, [
    selectedBox,
    servicesViewMode,
    categoriesViewMode,
    employeeColumns,
    areaColumns,
    serviceColumns,
    requestedServiceColumns,
    categoryColumns,
    requestedCategoryColumns,
  ]);

  const boxConfigs = useMemo((): FranchiseBoxConfig[] => {
    return [
      {
        id: "box-employees",
        title: "Employees",
        data: employeesSummaryForBox,
        isAddShow: true,
        addLabel: "Add Employee",
        onAdd: () => {
          FranchiseEmployeeDialog.showAdd(() => reloadFranchiseData());
        },
      },
      {
        id: "box-areas",
        title: "Areas",
        data: areasSummaryForBox,
        isAddShow: false,
        addLabel: "",
      },
      {
        id: "box-categories",
        title: "Categories",
        data: categoriesSummaryForBox,
        isAddShow: true,
        addLabel: "Add Request",
        onAdd: () => {
          RequestedCategoryDialog.showAdd(() => {
            void reloadFranchiseData();
          });
        },
      },
      {
        id: "box-services",
        title: "Services",
        data: servicesSummaryForBox,
        isAddShow: true,
        addLabel: "Add Request",
        onAdd: () => {
          RequestedServiceDialog.showAdd(categorySelectOptions, () => {
            void reloadFranchiseData();
          });
        },
      },
    ];
  }, [
    employeesSummaryForBox,
    areasSummaryForBox,
    servicesSummaryForBox,
    categoriesSummaryForBox,
    categorySelectOptions,
    reloadFranchiseData,
  ]);

  return (
    <div className="main-page-content my-franchise-page">
      <CustomHeader
        title="My Franchise"
        register={register}
        setValue={setValue}
      />

      <div className="box-container my-franchise-box-container">
        {boxConfigs.map((cfg) => (
          <CustomSummaryBox
            key={cfg.id}
            divId={cfg.id}
            title={cfg.title}
            data={cfg.data}
            onSelect={handleBoxSelect}
            isSelected={selectedBox === cfg.id}
            onFilterChange={handleFilterChange}
            isAddShow={cfg.isAddShow}
            addButtonLable={cfg.addLabel}
            onAddClick={cfg.onAdd}
            onItemClick={
              cfg.id === "box-services"
                ? (key) => {
                    if (key === "requested_service") {
                      for (const k of Array.from(loadedKeysRef.current)) {
                        if (k.startsWith("requested_services|")) {
                          loadedKeysRef.current.delete(k);
                        }
                      }
                      setSelectedBox("box-services");
                      setServicesViewMode("requested");
                      setStatusFilter(undefined);
                      setServiceSortBy([]);
                      setSearchKeyword("");
                      setCurrentPage(1);
                    }
                  }
                : cfg.id === "box-categories"
                ? (key) => {
                    if (key === "requested_category") {
                      for (const k of Array.from(loadedKeysRef.current)) {
                        if (k.startsWith("requested_categories|")) {
                          loadedKeysRef.current.delete(k);
                        }
                      }
                      setSelectedBox("box-categories");
                      setCategoriesViewMode("requested");
                      setStatusFilter(undefined);
                      setCategorySortBy([]);
                      setSearchKeyword("");
                      setCurrentPage(1);
                    }
                  }
                : undefined
            }
          />
        ))}
      </div>

      <CustomUtilityBox
        title={utilityTitle}
        searchHint={utilitySearchHint}
        hideUtilityActions
        onSearch={(value) => {
          setSearchKeyword(value);
          setCurrentPage(1);
        }}
        syncKeyword={searchKeyword}
      />

      <div className="my-franchise-table-wrap">
        <CustomTable
          columns={tableColumns}
          data={pagedData}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          horizontalScroll={
            selectedBox !== "box-areas" &&
            !(
              selectedBox === "box-services" &&
              servicesViewMode === "requested"
            ) &&
            !(
              selectedBox === "box-categories" &&
              categoriesViewMode === "requested"
            )
          }
          onPageChange={(page: number) => setCurrentPage(page)}
          onLimitChange={(limit: number) => {
            setPageSize(limit);
            setCurrentPage(1);
          }}
          manualSortBy={
            selectedBox === "box-areas" ||
            (selectedBox === "box-services" && servicesViewMode === "catalog") ||
            (selectedBox === "box-categories" && categoriesViewMode === "catalog")
          }
          sortBy={
            selectedBox === "box-areas"
              ? areaSortBy
              : selectedBox === "box-services" && servicesViewMode === "catalog"
              ? serviceSortBy
              : selectedBox === "box-categories" && categoriesViewMode === "catalog"
              ? categorySortBy
              : []
          }
          onSortChange={(next) => {
            if (selectedBox === "box-areas") {
              setAreaSortBy(next);
              setCurrentPage(1);
              return;
            }
            if (
              selectedBox === "box-services" &&
              servicesViewMode === "catalog"
            ) {
              setServiceSortBy(next);
              setCurrentPage(1);
              return;
            }
            if (
              selectedBox === "box-categories" &&
              categoriesViewMode === "catalog"
            ) {
              setCategorySortBy(next);
              setCurrentPage(1);
            }
          }}
          theadClass="table-light"
        />
      </div>
    </div>
  );
};

export default MyFranchise;
