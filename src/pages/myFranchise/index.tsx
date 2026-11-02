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
import { apiRequest } from "../../lib/global/remote/apiHelper";
import { AppConstant } from "../../lib/global/AppConstant";
import { getLocalStorage } from "../../lib/global/localStorageHelper";
import FranchiseEmployeeDialog from "./FranchiseEmployeeDialog";
import RequestedCategoryDialog from "./RequestedCategoryDialog";
import RequestedServiceDialog from "./RequestedServiceDialog";
import RequestedSubCategoryDialog from "./RequestedSubCategoryDialog";

type BoxId =
  | "box-employees"
  | "box-areas"
  | "box-services"
  | "box-categories"
  | "box-subcategories";

type ServicesViewMode = "catalog" | "requested";

type CategoriesViewMode = "catalog" | "requested";

type SubCategoriesViewMode = "catalog" | "requested";

/** Same as super admin Sub Category filter: `/subcategory/getAll?franchise_id=`. */
function sessionFranchiseIdForSubCategoryGetAll(): string {
  return String(getLocalStorage(AppConstant.partnerId) ?? "").trim();
}

function withSubCategoryFranchiseId(params: URLSearchParams): URLSearchParams {
  const fid = sessionFranchiseIdForSubCategoryGetAll();
  if (fid) params.set("franchise_id", fid);
  return params;
}

/** Summary Active → `is_active=true`, Inactive → `is_active=false`. */
function franchiseSubCategoryIsActiveParam(
  statusFilter?: string
): "true" | "false" | undefined {
  const s = String(statusFilter ?? "").trim().toLowerCase();
  if (s === "true" || s === "active" || s === "1") return "true";
  if (s === "false" || s === "inactive" || s === "0") return "false";
  return undefined;
}

/**
 * One list API, same pattern as Categories (`/franchise-category/getAll`):
 * `GET /franchise-subcategory/getAll?page=&limit=&franchise_id=`
 * plus `is_active=true|false` or `is_request=true`.
 */
function myFranchiseSubCategoryListUrl(opts: {
  page: number;
  limit: number;
  keyword?: string;
  statusFilter?: string;
  requested?: boolean;
}): string {
  const params = withSubCategoryFranchiseId(
    new URLSearchParams({
      page: String(opts.page),
      limit: String(opts.limit),
    })
  );
  const keyword = String(opts.keyword ?? "").trim();
  if (keyword) params.set("keyword", keyword);
  if (opts.requested) {
    params.set("is_request", "true");
  } else {
    const isActive = franchiseSubCategoryIsActiveParam(opts.statusFilter);
    if (isActive) params.set("is_active", isActive);
  }
  return `/franchise-subcategory/getAll?${params.toString()}`;
}

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

const MONGO_OBJECT_ID = /^[a-f0-9]{24}$/i;

function isMongoObjectId(value: string): boolean {
  return MONGO_OBJECT_ID.test(String(value ?? "").trim());
}

function labelListFromUnknown(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
    ? raw.split(",")
    : [];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const item of items) {
    let label = "";
    if (item != null && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      label = String(
        rec.name ??
          rec.label ??
          rec.service_name ??
          rec.subcategory_name ??
          rec.sub_category_name ??
          ""
      ).trim();
    } else {
      label = String(item ?? "").trim();
    }
    const key = label.toLowerCase();
    if (!label || label === "-" || isMongoObjectId(label) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

/** First bucket that yields human-readable names (`related_services` before id arrays). */
function firstNonEmptyLabelList(...buckets: unknown[]): string[] {
  for (const bucket of buckets) {
    const labels = labelListFromUnknown(bucket);
    if (labels.length) return labels;
  }
  return [];
}

function catalogSubCategoryLabels(row: object): string[] {
  const rec = row as Record<string, unknown>;
  const buckets = [
    rec.subcategory_names,
    rec.sub_category_names,
    rec.subcategories,
    rec.sub_categories,
    rec.subcategory_name,
    rec.sub_category_name,
    rec.subCategoryName,
  ];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const bucket of buckets) {
    for (const label of labelListFromUnknown(bucket)) {
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(label);
    }
  }
  return labels;
}

/** Services tab only: `GET /franchise-service/getAll` `subcategory_id.name`. */
function serviceTabSubCategoryLabels(row: object): string[] {
  const fromCatalog = catalogSubCategoryLabels(row);
  if (fromCatalog.length) return fromCatalog;
  const rec = row as Record<string, unknown>;
  const raw = rec.subcategory_id ?? rec.sub_category_id;
  let label = "";
  if (raw != null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    label = String(obj.name ?? obj.label ?? obj.subcategory_name ?? "").trim();
  } else {
    label = String(raw ?? "").trim();
  }
  if (!label || label === "-") return [];
  return [label];
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
  subcategories: Record<string, number>;
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
  const requestedSubcategory = Math.max(
    countRecordNumber(rec, [
      "requested_subcategory",
      "total_requestedsubcategory",
      "pending_requestedsubcategory",
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
    subcategories: {
      ...triplet(
        ["total_subcategory", "total_subcategories"],
        ["active_subcategory", "active_subcategories"],
        ["inactive_subcategory", "inactive_subcategories"]
      ),
      requested_subcategory: requestedSubcategory,
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

type SubCategoryRow = {
  _id: string;
  name: string;
  category_name: string;
  category_id?: string;
  is_active: boolean;
  franchise_active?: boolean;
  desc?: string;
  description?: string;
  image_url?: string;
  services?: unknown;
  related_services?: unknown;
  service_names?: unknown;
  is_request?: boolean;
  approval_status?: string;
  requested_by?: unknown;
  rejection_reason?: unknown;
  created_at?: string;
  [key: string]: unknown;
};

function textFromUnknown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textFromUnknown(record.name ?? record.label ?? record.title ?? "");
  }
  return "";
}

/** API display names only — skip raw Mongo ObjectIds. */
function displayNameFromUnknown(value: unknown): string {
  const text = textFromUnknown(value);
  if (!text || isMongoObjectId(text)) return "";
  return text;
}

function idFromUnknown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return idFromUnknown(record._id ?? record.id ?? "");
  }
  return "";
}

function mapFranchiseSubCategoryRecord(raw: unknown): SubCategoryRow {
  const row =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const category =
    row.category && typeof row.category === "object"
      ? (row.category as Record<string, unknown>)
      : row.related_category && typeof row.related_category === "object"
      ? (row.related_category as Record<string, unknown>)
      : row.category_id && typeof row.category_id === "object"
      ? (row.category_id as Record<string, unknown>)
      : null;
  const isActive =
    row.franchise_active !== undefined
      ? coerceCatalogRowActive(row.franchise_active)
      : row.is_active !== undefined
      ? coerceCatalogRowActive(row.is_active)
      : true;
  const relatedServices = row.related_services;
  return {
    ...(row as object),
    _id: String(row._id ?? row.id ?? row.subcategory_id ?? "").trim(),
    name: displayNameFromUnknown(row.name) || textFromUnknown(row.name),
    category_name:
      displayNameFromUnknown(row.category_name) ||
      displayNameFromUnknown(row.categoryName) ||
      displayNameFromUnknown(category?.name) ||
      displayNameFromUnknown(row.related_category) ||
      displayNameFromUnknown(
        row.category_id && typeof row.category_id === "object"
          ? row.category_id
          : ""
      ),
    category_id: idFromUnknown(row.category_id) || idFromUnknown(category?._id),
    is_active: isActive,
    franchise_active:
      row.franchise_active !== undefined
        ? coerceCatalogRowActive(row.franchise_active)
        : isActive,
    desc: textFromUnknown(row.description ?? row.desc),
    description: textFromUnknown(row.description ?? row.desc),
    image_url: textFromUnknown(row.image_url ?? row.image),
    related_services: relatedServices,
    services: row.services,
    service_names: firstNonEmptyLabelList(
      relatedServices,
      row.service_names,
      row.services
    ),
    is_request: Boolean(row.is_request),
    approval_status: textFromUnknown(row.approval_status),
    requested_by: row.requested_by,
    rejection_reason: row.rejection_reason,
    created_at: textFromUnknown(row.created_at ?? row.createdAt),
  };
}

function unwrapSubCategoryGetRecord(
  data: unknown
): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;
  const candidate =
    root.record ??
    root.subcategory ??
    nested?.record ??
    nested?.subcategory ??
    (root._id || root.id ? root : undefined) ??
    (nested && (nested._id || nested.id) ? nested : undefined);
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstFiniteNumber(...values: unknown[]): number {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function hasSubCategoryList(rec: Record<string, unknown> | null): boolean {
  if (!rec) return false;
  return (
    Array.isArray(rec.records) ||
    Array.isArray(rec.subcategories) ||
    Array.isArray(rec.all_subcategories) ||
    Array.isArray(rec.requested_subcategories)
  );
}

function subCategoryRecordsFromSource(source: Record<string, unknown>, data: unknown): unknown[] {
  if (Array.isArray(source.records)) return source.records;
  if (Array.isArray(source.subcategories)) return source.subcategories;
  if (Array.isArray(source.all_subcategories)) return source.all_subcategories;
  if (Array.isArray(source.requested_subcategories)) {
    return source.requested_subcategories;
  }
  if (Array.isArray(data)) return data;
  return [];
}

function extractFranchiseSubCategoryPage(
  data: unknown,
  limit: number
): {
  records: SubCategoryRow[];
  totalPages: number;
  totalItems: number;
  backendTotalItems?: number;
} {
  const root = objectRecord(data) ?? {};
  const nested = objectRecord(root.data);
  const source = hasSubCategoryList(root)
    ? root
    : hasSubCategoryList(nested)
    ? nested!
    : root;
  const rawRecords = subCategoryRecordsFromSource(source, data);
  const pageMeta =
    objectRecord(source.pagination) ??
    objectRecord(root.pagination) ??
    objectRecord(nested?.pagination) ??
    {};
  const backendTotal = firstFiniteNumber(
    source.totalItems,
    source.total_items,
    source.totalRecords,
    source.total_records,
    source.total,
    source.count,
    pageMeta.totalItems,
    pageMeta.total_items,
    pageMeta.totalRecords,
    pageMeta.total,
    root.totalItems,
    root.total_items,
    nested?.totalItems,
    nested?.total_items
  );
  const totalItems = Number.isFinite(backendTotal)
    ? backendTotal
    : rawRecords.length;
  const reportedPages = firstFiniteNumber(
    source.totalPages,
    source.total_pages,
    pageMeta.totalPages,
    pageMeta.total_pages,
    root.totalPages,
    nested?.totalPages
  );
  const pageSize = limit > 0 ? limit : 10;
  return {
    records: rawRecords.map(mapFranchiseSubCategoryRecord),
    totalPages:
      Number.isFinite(reportedPages) && reportedPages > 0
        ? reportedPages
        : totalItems > 0
        ? Math.ceil(totalItems / pageSize)
        : 0,
    totalItems,
    backendTotalItems: Number.isFinite(backendTotal) ? backendTotal : undefined,
  };
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
  const [subcategoriesViewMode, setSubcategoriesViewMode] =
    useState<SubCategoriesViewMode>("catalog");
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
  const [subcategories, setSubcategories] = useState<SubCategoryRow[]>([]);
  const [subcategoryTotalPages, setSubcategoryTotalPages] = useState(0);
  const [subcategoryListTotal, setSubcategoryListTotal] = useState(0);
  const [subcategoryActiveTotal, setSubcategoryActiveTotal] = useState<
    number | null
  >(null);
  const [subcategoryInactiveTotal, setSubcategoryInactiveTotal] = useState<
    number | null
  >(null);
  const [requestedSubcategoryTotal, setRequestedSubcategoryTotal] = useState<
    number | null
  >(null);
  const subcategoryFetchGenRef = useRef(0);
  /** True when Sub Categories Active/Inactive/Total was clicked in the same event as box select. */
  const subcatFilterClickRef = useRef(false);

  /** Dashboard totals from `POST /api/getCount` `{ type: "my-franchise" }` (preferred over list-length counts). */
  const [countSummaries, setCountSummaries] = useState<{
    employees: Record<string, number>;
    areas: Record<string, number>;
    services: Record<string, number>;
    categories: Record<string, number>;
    subcategories: Record<string, number>;
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

  const refreshRequestedSubcategoryCount = useCallback(async () => {
    const response = await apiRequest(
      myFranchiseSubCategoryListUrl({
        page: 1,
        limit: 1,
        requested: true,
      }),
      "GET",
      undefined,
      false,
      true
    );
    if (!response.success) return;
    const page = extractFranchiseSubCategoryPage(response.data, 1);
    if (page.backendTotalItems != null) {
      setRequestedSubcategoryTotal(page.backendTotalItems);
    }
  }, []);

  /** Total / Active / Inactive cards use `totalItems` from `franchise-subcategory/getAll`. */
  const refreshSubcategoryActiveInactiveCounts = useCallback(async () => {
    const fetchStatusTotal = async (statusFilter?: "true" | "false") => {
      const response = await apiRequest(
        myFranchiseSubCategoryListUrl({
          page: 1,
          limit: 1,
          statusFilter,
        }),
        "GET",
        undefined,
        false,
        true
      );
      if (!response.success) return null;
      const page = extractFranchiseSubCategoryPage(response.data, 1);
      return page.backendTotalItems ?? page.totalItems;
    };
    const [total, active, inactive] = await Promise.all([
      fetchStatusTotal(),
      fetchStatusTotal("true"),
      fetchStatusTotal("false"),
    ]);
    if (total != null) setSubcategoryListTotal(total);
    if (active != null) setSubcategoryActiveTotal(active);
    if (inactive != null) setSubcategoryInactiveTotal(inactive);
  }, []);

  const refreshMyFranchiseCountSummaries = useCallback(async () => {
    const countRes = await getCount("my-franchise");
    if (countRes.responseCount && countRes.countModel) {
      const mapped = summariesFromMyFranchiseCountRecord(countRes.countModel);
      setCountSummaries(mapped);
    } else {
      setCountSummaries(null);
    }
    await Promise.all([
      refreshRequestedSubcategoryCount(),
      refreshSubcategoryActiveInactiveCounts(),
    ]);
  }, [
    refreshRequestedSubcategoryCount,
    refreshSubcategoryActiveInactiveCounts,
  ]);

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
    if (selectedBox === "box-subcategories") {
      const response = await apiRequest(
        myFranchiseSubCategoryListUrl({
          page: currentPage,
          limit: pageSize,
          keyword: searchKeyword,
          statusFilter,
          requested: subcategoriesViewMode === "requested",
        }),
        "GET"
      );
      if (response.success) {
        const page = extractFranchiseSubCategoryPage(response.data, pageSize);
        setSubcategories(page.records);
        setSubcategoryTotalPages(page.totalPages);
        if (subcategoriesViewMode === "requested") {
          if (!String(searchKeyword ?? "").trim() && page.backendTotalItems != null) {
            setRequestedSubcategoryTotal(page.backendTotalItems);
          }
        } else if (!String(searchKeyword ?? "").trim()) {
          const count = page.backendTotalItems ?? page.totalItems;
          const isActive = franchiseSubCategoryIsActiveParam(statusFilter);
          if (isActive === "true") {
            setSubcategoryActiveTotal(count);
          } else if (isActive === "false") {
            setSubcategoryInactiveTotal(count);
          } else {
            setSubcategoryListTotal(count);
          }
        }
      }
    }
  }, [
    hydrateFranchiseSlices,
    refreshMyFranchiseCountSummaries,
    slicesForCurrentSelection,
    selectedBox,
    currentPage,
    pageSize,
    searchKeyword,
    statusFilter,
    subcategoriesViewMode,
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

  /** Franchise admin Sub Categories tab — `GET /franchise-subcategory/getAll`. */
  useEffect(() => {
    if (selectedBox !== "box-subcategories") return;
    const generation = ++subcategoryFetchGenRef.current;
    void (async () => {
      const response = await apiRequest(
        myFranchiseSubCategoryListUrl({
          page: currentPage,
          limit: pageSize,
          keyword: searchKeyword,
          statusFilter,
          requested: subcategoriesViewMode === "requested",
        }),
        "GET"
      );
      if (generation !== subcategoryFetchGenRef.current) return;
      if (!response.success) {
        setSubcategories([]);
        setSubcategoryTotalPages(0);
        return;
      }
      const page = extractFranchiseSubCategoryPage(response.data, pageSize);
      setSubcategories(page.records);
      setSubcategoryTotalPages(page.totalPages);
      if (subcategoriesViewMode === "requested") {
        if (!String(searchKeyword ?? "").trim() && page.backendTotalItems != null) {
          setRequestedSubcategoryTotal(page.backendTotalItems);
        }
      } else if (!String(searchKeyword ?? "").trim()) {
        const count = page.backendTotalItems ?? page.totalItems;
        const isActive = franchiseSubCategoryIsActiveParam(statusFilter);
        if (isActive === "true") {
          setSubcategoryActiveTotal(count);
        } else if (isActive === "false") {
          setSubcategoryInactiveTotal(count);
        } else {
          setSubcategoryListTotal(count);
        }
      }
    })();
  }, [
    selectedBox,
    currentPage,
    pageSize,
    searchKeyword,
    statusFilter,
    subcategoriesViewMode,
  ]);

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
  const subcategoriesSummaryForBox = useMemo(() => {
    const base = countSummaries?.subcategories;
    const listTotal = Number(subcategoryListTotal ?? 0);
    const totalFromCount = Number(base?.Total ?? 0);
    const active = Number(subcategoryActiveTotal ?? base?.Active ?? 0);
    const inactive = Number(subcategoryInactiveTotal ?? base?.Inactive ?? 0);
    const total =
      listTotal > 0
        ? listTotal
        : active + inactive > 0
        ? active + inactive
        : totalFromCount;
    return {
      Total: total,
      Active: active,
      Inactive: inactive,
      requested_subcategory: Number(requestedSubcategoryTotal ?? 0),
    };
  }, [
    countSummaries,
    requestedSubcategoryTotal,
    subcategoryListTotal,
    subcategoryActiveTotal,
    subcategoryInactiveTotal,
  ]);

  const handleBoxSelect = useCallback(
    (divId: string) => {
      const boxId = divId as BoxId;
      setSelectedBox(boxId);
      setServicesViewMode("catalog");
      setCategoriesViewMode("catalog");
      setSubcategoriesViewMode("catalog");
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
    setSubcategoriesViewMode("catalog");
    setCurrentPage(1);
  }, []);

  const selectSubCategoryCatalog = useCallback(() => {
    setSelectedBox("box-subcategories");
    setServicesViewMode("catalog");
    setCategoriesViewMode("catalog");
    setSubcategoriesViewMode("catalog");
    setSearchKeyword("");
    setAreaSortBy([]);
    setServiceSortBy([]);
    setCategorySortBy([]);
    setCurrentPage(1);
  }, []);

  /** Sub Categories card title — Total list (no `is_active`) unless Active/Inactive runs in this click. */
  const handleSubCategoryBoxSelect = useCallback(() => {
    subcatFilterClickRef.current = false;
    selectSubCategoryCatalog();
    queueMicrotask(() => {
      if (!subcatFilterClickRef.current) {
        setStatusFilter(undefined);
      }
    });
  }, [selectSubCategoryCatalog]);

  /** Sub Categories Active → `is_active=true`, Inactive → `is_active=false`. */
  const handleSubCategoryFilterChange = useCallback(
    (filter: { status?: string }) => {
      subcatFilterClickRef.current = true;
      selectSubCategoryCatalog();
      setStatusFilter(filter.status);
    },
    [selectSubCategoryCatalog]
  );

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
      case "box-subcategories":
        return subcategories;
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
    subcategories,
  ]);

  const totalPages = useMemo(() => {
    if (selectedBox === "box-subcategories") return subcategoryTotalPages;
    if (!activeFilteredList.length) return 0;
    return Math.ceil(activeFilteredList.length / pageSize);
  }, [selectedBox, subcategoryTotalPages, activeFilteredList, pageSize]);

  const pagedData = useMemo(() => {
    if (selectedBox === "box-subcategories") return subcategories;
    const start = (currentPage - 1) * pageSize;
    return activeFilteredList.slice(start, start + pageSize);
  }, [
    selectedBox,
    subcategories,
    activeFilteredList,
    currentPage,
    pageSize,
  ]);

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

  const setSubCategoryActive = useCallback(
    async (id: string, is_active: boolean) => {
      const sid = String(id ?? "").trim();
      if (!sid) {
        showErrorAlert("Unable to update sub category: missing identifier.");
        return;
      }
      const prev = subcategories.find((s) => s._id === sid)?.is_active;
      setSubcategories((p) =>
        p.map((s) =>
          s._id === sid
            ? { ...s, is_active, franchise_active: is_active }
            : s
        )
      );
      const row = subcategories.find((s) => s._id === sid);
      const franchiseId = sessionFranchiseIdForSubCategoryGetAll();
      const response = await apiRequest(
        `/franchise-subcategory/update/${sid}`,
        "PUT",
        {
          is_active,
          ...(franchiseId ? { franchise_id: franchiseId } : {}),
          ...(row?.category_id
            ? { category_id: String(row.category_id).trim() }
            : {}),
        }
      );
      if (response.success) {
        showSuccessAlert("Sub category status updated");
        await reloadFranchiseData();
      } else {
        if (prev !== undefined) {
          setSubcategories((p) =>
            p.map((s) =>
              s._id === sid
                ? { ...s, is_active: prev, franchise_active: prev }
                : s
            )
          );
        }
        showErrorAlert("Could not update sub category status.");
      }
    },
    [subcategories, reloadFranchiseData]
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
      case "box-subcategories":
        return subcategoriesViewMode === "requested"
          ? "Requested Subcategories"
          : "Sub Categories";
      default:
        return "";
    }
  }, [selectedBox, servicesViewMode, categoriesViewMode, subcategoriesViewMode]);

  const utilitySearchHint = useMemo(() => {
    switch (selectedBox) {
      case "box-employees":
        return "Search employee name";
      case "box-areas":
        return "Search area, city, state, pin code";
      case "box-services":
        return servicesViewMode === "catalog"
          ? "Search service name, category, sub category"
          : "Search service name";
      case "box-categories":
        return categoriesViewMode === "catalog"
          ? "Search category name"
          : "Search category name";
      case "box-subcategories":
        return "Search sub category name";
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
        Header: "Sub Category",
        accessor: "subcategory_name",
        Cell: ({ row }: { row: any }) =>
          serviceNamesHoverFromList(
            serviceTabSubCategoryLabels(row.original ?? {})
          ),
      },
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
                const { showAddEditServiceDialog } = await import(
                  "../serviceManagement/AddEditServiceDialog"
                );
                showAddEditServiceDialog(
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
        Header: "Sub Category",
        accessor: "subcategory_name",
        Cell: ({ row }: { row: any }) =>
          serviceNamesHoverFromList(
            catalogSubCategoryLabels(row.original ?? {})
          ),
      },
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
      case "box-subcategories": {
        const openSubCategoryView = async (r: { original?: SubCategoryRow }) => {
          const item = (r.original ?? {}) as SubCategoryRow;
          const sid = String(item._id ?? "").trim();
          if (!sid) {
            showErrorAlert(
              "Unable to open sub category: missing identifier."
            );
            return;
          }
          const response = await apiRequest(`/subcategory/get/${sid}`, "GET");
          const record = response.success
            ? unwrapSubCategoryGetRecord(response.data)
            : null;
          if (!record) {
            showErrorAlert(
              "Unable to load sub category details. You may not have access, or the sub category was removed."
            );
            return;
          }
          const detail = mapFranchiseSubCategoryRecord(record);
          RequestedSubCategoryDialog.showView(
            {
              _id: sid,
              name: String(detail.name ?? ""),
              description: String(detail.description ?? detail.desc ?? ""),
              imageUrl: String(detail.image_url ?? ""),
              isRequest: Boolean(detail.is_request),
              isActive: detail.is_active !== false,
              category_id: String(detail.category_id ?? ""),
              requestedBy: detail.requested_by,
              approvalRecord: detail as unknown as Record<string, unknown>,
            },
            () => {
              void reloadFranchiseData();
            }
          );
        };
        if (subcategoriesViewMode === "requested") {
          return [
            {
              Header: "SR No",
              accessor: "serial_no",
              Cell: ({ row }: { row: any }) =>
                (currentPage - 1) * pageSize + row.index + 1,
            },
            { Header: "Sub Category Name", accessor: "name" },
            { Header: "Category", accessor: "category_name" },
            {
              Header: "Status",
              accessor: "status",
              Cell: ({ row }: { row: any }) => {
                const approval = mapApprovalStatusFromRecord(
                  (row.original ?? {}) as Record<string, unknown>
                );
                return pendingRequestedStatusCell({
                  row: { original: { status: approval } },
                });
              },
            },
            {
              Header: "Action",
              accessor: "action",
              Cell: ({ row }: { row: any }) => (
                <CustomActionColumn
                  row={row}
                  onView={(r) => {
                    void openSubCategoryView(r);
                  }}
                />
              ),
            },
          ];
        }
        return [
          {
            Header: "SR No",
            accessor: "serial_no",
            Cell: ({ row }: { row: any }) =>
              (currentPage - 1) * pageSize + row.index + 1,
          },
          { Header: "Sub Category Name", accessor: "name" },
          { Header: "Category", accessor: "category_name" },
          {
            Header: "Services",
            accessor: "service_names",
            Cell: ({ row }: { row: any }) => {
              const rec = (row.original ?? {}) as Record<string, unknown>;
              return serviceNamesHoverFromList(
                firstNonEmptyLabelList(
                  rec.related_services,
                  rec.service_names,
                  rec.services
                )
              );
            },
          },
          {
            Header: "Status",
            accessor: "is_active",
            className: "my-franchise-col-active-toggle",
            Cell: ({ row }: { row: any }) => {
              const sub = row.original as SubCategoryRow;
              const active = coerceCatalogRowActive(sub?.is_active);
              return (
                <Form.Check
                  type="switch"
                  id={`franchise-subcategory-active-${sub._id}`}
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
                    void setSubCategoryActive(sub._id, e.target.checked);
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
                onView={(r) => {
                  void openSubCategoryView(r);
                }}
              />
            ),
          },
        ];
      }
      default:
        return [];
    }
  }, [
    selectedBox,
    servicesViewMode,
    categoriesViewMode,
    subcategoriesViewMode,
    employeeColumns,
    areaColumns,
    serviceColumns,
    requestedServiceColumns,
    categoryColumns,
    requestedCategoryColumns,
    currentPage,
    pageSize,
    setSubCategoryActive,
    reloadFranchiseData,
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
        id: "box-subcategories",
        title: "Sub Categories",
        data: subcategoriesSummaryForBox,
        isAddShow: true,
        addLabel: "Add Request",
        onAdd: () => {
          void (async () => {
            let options = categorySelectOptions;
            if (options.length === 0) {
              const data = await fetchMyFranchiseDataSlices(
                ["categories"],
                myFranchiseFetchOptions
              );
              const rows = (data.categories ?? []) as CategoryRow[];
              if (rows.length > 0) {
                setCategories(rows);
                loadedKeysRef.current.add(
                  myFranchiseDataCacheKey("categories", myFranchiseFetchOptions)
                );
                options = rows.map((c) => ({
                  value: c._id,
                  label: c.name,
                }));
              }
            }
            RequestedSubCategoryDialog.showAdd(options, () => {
              void reloadFranchiseData();
            });
          })();
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
    subcategoriesSummaryForBox,
    categorySelectOptions,
    myFranchiseFetchOptions,
    reloadFranchiseData,
  ]);

  return (
    <div className="main-page-content my-franchise-page">
      <style>{`
        .main-page-content.my-franchise-page .my-franchise-cards-row {
          display: flex;
          flex-wrap: nowrap;
          overflow-x: auto;
          overflow-y: hidden;
          align-items: stretch;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .main-page-content.my-franchise-page .my-franchise-cards-row::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
        .main-page-content.my-franchise-page .my-franchise-cards-row > .box {
          flex: 1 0 300px;
          width: auto;
          min-width: 300px;
          max-width: none;
        }
        .main-page-content.my-franchise-page .my-franchise-cards-row > .box > .box-row:first-child {
          flex-wrap: nowrap;
          align-items: center;
          gap: 8px;
        }
        .main-page-content.my-franchise-page .my-franchise-cards-row > .box > .box-row:first-child h6 {
          white-space: nowrap;
          margin-bottom: 0;
        }
        .main-page-content.my-franchise-page .my-franchise-cards-row > .box > .box-row:first-child .box-right-column {
          white-space: nowrap;
          flex-shrink: 0;
        }
      `}</style>
      <CustomHeader
        title="My Franchise"
        register={register}
        setValue={setValue}
      />

      <div className="box-container my-franchise-box-container my-franchise-cards-row">
        {boxConfigs.map((cfg) => (
          <CustomSummaryBox
            key={cfg.id}
            divId={cfg.id}
            title={cfg.title}
            data={cfg.data}
            onSelect={
              cfg.id === "box-subcategories"
                ? handleSubCategoryBoxSelect
                : handleBoxSelect
            }
            isSelected={selectedBox === cfg.id}
            onFilterChange={
              cfg.id === "box-subcategories"
                ? handleSubCategoryFilterChange
                : handleFilterChange
            }
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
                : cfg.id === "box-subcategories"
                ? (key) => {
                    if (key === "requested_subcategory") {
                      subcatFilterClickRef.current = true;
                      setSelectedBox("box-subcategories");
                      setSubcategoriesViewMode("requested");
                      setStatusFilter(undefined);
                      setSearchKeyword("");
                      setCurrentPage(1);
                      setSubcategories([]);
                      setSubcategoryTotalPages(0);
                      return;
                    }
                    if (key === "Total") {
                      subcatFilterClickRef.current = true;
                      selectSubCategoryCatalog();
                      setStatusFilter(undefined);
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
