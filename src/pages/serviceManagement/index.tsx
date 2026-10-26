import React, { useState, useEffect, useCallback, useRef } from "react";
import { Form } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import CustomHeader from "../../components/CustomHeader";
import CustomSummaryBox from "../../components/CustomSummaryBox";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import { capitalizeString, formatDate } from "../../helper/utility";
import CustomTable from "../../components/CustomTable";
import AddEditCategoryDialog from "./AddEditCategoryDialog";
import { showAddEditServiceDialog } from "./AddEditServiceDialog";
import {
  showAddEditSubCategoryDialog,
} from "./AddEditSubCategoryDialog";
import type { SubCategoryDetails } from "./AddEditSubCategoryDialog";
import { CategoryModel } from "../../lib/models/CategoryModel";
import { ServiceModel } from "../../lib/models/ServiceModel";
import {
  fetchCategory,
  fetchCategoryById,
  patchCategoryCatalogActiveStatus,
} from "../../services/categoryService";
import {
  fetchService,
  fetchServiceById,
  patchServiceCatalogActiveStatus,
} from "../../services/servicesService";
import CustomActionColumn from "../../components/CustomActionColumn";
import type { ServerTableSortBy } from "../../lib/global/serverTableSort";
import {
  useFranchiseHeaderForm,
  useFranchiseScopedGetCount,
} from "../../lib/global/hooks/useFranchiseScopedGetCount";
import {
  franchiseIdForApiQuery,
  isFranchisePortalSession,
} from "../../lib/franchise/headerFranchisePreference";
import {
  showErrorAlert,
  showSuccessAlert,
} from "../../lib/global/alertHelper";
import { apiRequest } from "../../lib/global/remote/apiHelper";
import {
  documentUploadFailureMessage,
  uploadDocumentImages,
} from "../../services/documentUploadService";
import {
  setCategoryActive as apiSetCategoryActive,
  setServiceActive as apiSetServiceActive,
} from "../../services/myFranchiseService";

const CATEGORY_ROW_ID_KEYS = ["_id", "category_id", "id"] as const;
const SERVICE_ROW_ID_KEYS = ["_id", "service_id", "id"] as const;
const SUBCATEGORY_ROW_ID_KEYS = ["_id", "id"] as const;
const updateSubCategoryPath = (id: string) => `/subcategory/update/${id}`;

function textField(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textField(record.name ?? record.label ?? record.title ?? "");
  }
  return "";
}

function idField(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return idField(record._id ?? record.id ?? "");
  }
  return "";
}

function mediaField(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return mediaField(
      record.url ?? record.path ?? record.image_url ?? record.src ?? ""
    );
  }
  return "";
}

function mapSubCategoryRecord(raw: unknown): SubCategoryRow {
  const row =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const category =
    row.category && typeof row.category === "object"
      ? (row.category as Record<string, unknown>)
      : null;
  const isActive =
    row.is_active !== undefined
      ? coerceCatalogRowActive(row.is_active)
      : row.franchise_active !== undefined
      ? coerceCatalogRowActive(row.franchise_active)
      : true;
  const serviceIdsFromField = Array.isArray(row.service_ids)
    ? row.service_ids.map((item) => idField(item)).filter(Boolean)
    : [];
  const serviceIdsFromServices = Array.isArray(row.services)
    ? row.services.map((item) => idField(item)).filter(Boolean)
    : [];
  const serviceIds =
    serviceIdsFromField.length > 0 ? serviceIdsFromField : serviceIdsFromServices;
  return {
    ...(row as object),
    _id: String(row._id ?? row.id ?? row.subcategory_id ?? "").trim(),
    name: textField(row.name),
    category_name:
      textField(row.category_name) ||
      textField(row.categoryName) ||
      textField(category?.name) ||
      textField(row.category_id),
    category_id: idField(row.category_id) || idField(category?._id),
    is_active: isActive,
    franchise_active:
      row.franchise_active !== undefined
        ? coerceCatalogRowActive(row.franchise_active)
        : isActive,
    desc: textField(row.description ?? row.desc),
    image_url: mediaField(row.image_url ?? row.image),
    service_ids: serviceIds,
  } as SubCategoryRow;
}

function extractSubCategoryPage(
  data: unknown,
  limit: number
): { records: SubCategoryRow[]; totalPages: number; totalItems: number } {
  const root =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const nested =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;
  const source = Array.isArray(root.records) || Array.isArray(root.subcategories)
    ? root
    : nested &&
      (Array.isArray(nested.records) || Array.isArray(nested.subcategories))
    ? nested
    : root;
  const rawRecords = Array.isArray(source.records)
    ? source.records
    : Array.isArray(source.subcategories)
    ? source.subcategories
    : Array.isArray(data)
    ? data
    : [];
  const totalRecords = Number(
    source.totalRecords ??
      source.total ??
      source.totalItems ??
      source.count ??
      rawRecords.length
  );
  const reportedPages = Number(source.totalPages ?? root.totalPages ?? 0);
  const pageSize = limit > 0 ? limit : 10;
  const totalPages =
    Number.isFinite(reportedPages) && reportedPages > 0
      ? reportedPages
      : totalRecords > 0
      ? Math.ceil(totalRecords / pageSize)
      : 0;
  return {
    records: rawRecords.map(mapSubCategoryRecord),
    totalPages,
    totalItems: Number.isFinite(totalRecords) ? totalRecords : rawRecords.length,
  };
}

function humanCatalogName(value: unknown): string {
  const s = textField(value);
  if (!s || /^[a-f0-9]{24}$/i.test(s)) return "";
  return s;
}

function serviceRowSubCategoryName(row: Record<string, unknown>): string {
  return (
    humanCatalogName(row.subcategory_name) ||
    humanCatalogName(row.sub_category_name) ||
    humanCatalogName(row.subcategoryName) ||
    humanCatalogName(row.subCategory) ||
    humanCatalogName(row.subcategory) ||
    humanCatalogName(row.sub_category) ||
    humanCatalogName(row.subcategory_id) ||
    humanCatalogName(row.sub_category_id)
  );
}

type SubCategoryLookup = {
  nameById: Map<string, string>;
  namesByCategoryId: Map<string, string[]>;
};

async function fetchSubCategoryLookup(): Promise<SubCategoryLookup> {
  const nameById = new Map<string, string>();
  const namesByCategoryId = new Map<string, string[]>();
  const addPayload = (data: unknown) => {
    const page = extractSubCategoryPage(data, 200);
    for (const row of page.records) {
      const id = String(row._id ?? "").trim();
      const name = String(row.name ?? "").trim();
      if (id && name) nameById.set(id, name);
      const categoryId = String(row.category_id ?? "").trim();
      if (categoryId && name) {
        const list = namesByCategoryId.get(categoryId) ?? [];
        if (!list.includes(name)) list.push(name);
        namesByCategoryId.set(categoryId, list);
      }
    }
  };

  const dropRes = await apiRequest(
    "/subcategory/getDropDown",
    "GET",
    undefined,
    true,
    true
  );
  if (dropRes.success) addPayload(dropRes.data);

  const listRes = await apiRequest(
    "/subcategory/getAll?page=1&limit=200",
    "GET",
    undefined,
    true,
    true
  );
  if (listRes.success) addPayload(listRes.data);

  return { nameById, namesByCategoryId };
}

function withServiceSubCategoryName(
  service: ServiceModel,
  lookup: SubCategoryLookup
): ServiceModel {
  const row = service as unknown as Record<string, unknown>;
  const existing = serviceRowSubCategoryName(row);
  if (existing) {
    return { ...service, subcategory_name: existing } as ServiceModel;
  }
  const subId =
    idField(row.subcategory_id) || idField(row.sub_category_id);
  const fromId = subId ? lookup.nameById.get(subId) ?? "" : "";
  if (fromId) {
    return { ...service, subcategory_name: fromId } as ServiceModel;
  }
  const categoryId = idField(row.category_id);
  const fromCategory = categoryId
    ? lookup.namesByCategoryId.get(categoryId) ?? []
    : [];
  if (fromCategory.length === 1) {
    return { ...service, subcategory_name: fromCategory[0] } as ServiceModel;
  }
  return service;
}

function extractRequestedCategoryPage(
  data: unknown,
  limit: number
): { records: CategoryModel[]; totalPages: number } {
  const root =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const nested =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;
  const source =
    Array.isArray(root.records) || Array.isArray(root.categories)
      ? root
      : nested &&
        (Array.isArray(nested.records) || Array.isArray(nested.categories))
      ? nested
      : root;
  const rawRecords = Array.isArray(source.records)
    ? source.records
    : Array.isArray(source.categories)
    ? source.categories
    : Array.isArray(root.data)
    ? (root.data as unknown[])
    : [];
  const totalRecords = Number(
    source.totalRecords ??
      source.total ??
      source.totalItems ??
      source.count ??
      rawRecords.length
  );
  const reportedPages = Number(source.totalPages ?? root.totalPages ?? 0);
  const pageSize = limit > 0 ? limit : 10;
  const totalPages =
    Number.isFinite(reportedPages) && reportedPages > 0
      ? reportedPages
      : totalRecords > 0
      ? Math.ceil(totalRecords / pageSize)
      : 0;
  return {
    records: rawRecords.filter(
      (row): row is CategoryModel => Boolean(row) && typeof row === "object"
    ) as CategoryModel[],
    totalPages,
  };
}

function unwrapSubCategoryGet(data: unknown): Record<string, unknown> | null {
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

type SubCategoryRow = SubCategoryDetails & {
  franchise_active?: boolean;
};

const CATALOG_MODERATION_KEYS = [
  "approval_status",
  "is_request",
  "is_rejected",
  "requested_by",
  "rejection_reason",
] as const;

/** Prefer GET-by-id fields; keep list-row moderation fields if the API omits them. */
function mergeModerationDetail<T extends object>(
  row: Record<string, unknown>,
  api: T
): T {
  const out: Record<string, unknown> = {
    ...(row as object),
    ...(api as object),
  };
  for (const key of CATALOG_MODERATION_KEYS) {
    if (
      (out[key] === undefined || out[key] === null) &&
      row[key] !== undefined
    ) {
      out[key] = row[key];
    }
  }
  if (!String(out.desc ?? "").trim() && row.description) {
    out.desc = row.description;
  }
  return out as T;
}

function mergeServiceDetailForDialog(
  row: Record<string, unknown>,
  api: ServiceModel
): ServiceModel {
  return mergeModerationDetail(row, api);
}

function mergeCategoryDetailForDialog<T extends object>(
  row: Record<string, unknown>,
  api: T
): T {
  return mergeModerationDetail(row, api);
}

function recordIdFromRow(
  row: { original?: Record<string, unknown> },
  keys: readonly string[]
): string {
  const o = row?.original;
  if (!o || typeof o !== "object") return "";
  for (const k of keys) {
    const v = o[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function coerceCatalogRowActive(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "true" || s === "active" || s === "yes") return true;
  if (s === "false" || s === "inactive" || s === "no") return false;
  return false;
}

function catalogActiveValue(
  row: Record<string, unknown>,
  field: string
): boolean {
  return coerceCatalogRowActive(row[field]);
}

const requestStatusCell = () => ({ row }: { row: any }) => {
  const o = row?.original;
  const raw = String(o?.approval_status ?? "")
    .trim()
    .toLowerCase();
  if (
    raw === "rejected" ||
    raw === "reject" ||
    o?.is_rejected === true
  ) {
    return <span style={{ color: "red", fontWeight: 600 }}>Rejected</span>;
  }
  if (
    raw === "approved" ||
    raw === "approve" ||
    o?.is_rejected === false
  ) {
    return <span style={{ color: "green", fontWeight: 600 }}>Approved</span>;
  }
  if (raw === "pending") {
    return <span style={{ color: "orange", fontWeight: 600 }}>Pending</span>;
  }
  if (
    o?.is_request &&
    (o?.is_rejected === null || o?.is_rejected === undefined)
  ) {
    return <span style={{ color: "orange", fontWeight: 600 }}>Pending</span>;
  }
  return <span style={{ color: "orange", fontWeight: 600 }}>Pending</span>;
};


const ServiceManagement = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const notificationDeepLinkHandledRef = useRef("");
  const { register, setValue, franchiseId: headerFranchiseId } =
    useFranchiseHeaderForm();
  const { countModel, refresh: refreshSummaryCounts } =
    useFranchiseScopedGetCount({
      type: "service-management",
      franchiseId: headerFranchiseId,
    });
  /** Super admin/staff header franchise → scoped catalog URL; franchise portal uses token-scoped global getAll. */
  const catalogFranchiseId = franchiseIdForApiQuery(headerFranchiseId);
  const franchiseCatalogScope = Boolean(catalogFranchiseId);
  const catalogListStatusField = franchiseCatalogScope
    ? "franchise_active"
    : "is_active";
  const [selectedBox, setSelectedBox] = useState<string>("box-category");
  const [categoryData, setCategoryData] = useState<Record<string, number>>({});
  const [subCategoryData, setSubCategoryData] = useState<Record<string, number>>(
    {
      Total: 0,
      Active: 0,
      Inactive: 0,
      requested_subcategory: 0,
    }
  );
  const [serviceData, setServiceData] = useState<Record<string, number>>({});
  const [categoryList, setCategoryList] = useState<CategoryModel[]>([]);
  const [subCategoryList, setSubCategoryList] = useState<SubCategoryRow[]>([]);
  const [serviceList, setServiceList] = useState<ServiceModel[]>([]);

  /* ADDED: requested table states */
  const [showRequestedCategory, setShowRequestedCategory] = useState(false);
  const [showRequestedService, setShowRequestedService] = useState(false);
  const [showRequestedSubCategory, setShowRequestedSubCategory] = useState(false);
  const [requestedCategoryList, setRequestedCategoryList] = useState<
    CategoryModel[]
  >([]);
  const [requestedServiceList, setRequestedServiceList] = useState<
    ServiceModel[]
  >([]);
  const [activeFilters, setActiveFilters] = useState<{
    keyword?: string;
    status?: string;
    sort?: string;
  }>({});

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const fetchGenerationRef = useRef(0);
  const [sortBy, setSortBy] = useState<ServerTableSortBy>([]);

  useEffect(() => {
    if (!countModel) return;
    setCategoryData({
      Total: countModel.total_category ?? 0,
      Active: countModel.active_category ?? 0,
      Inactive: countModel.inactive_category ?? 0,
      requested_category:
        countModel.requested_category ?? countModel.total_requestedcategory ?? 0,
    });
    setServiceData({
      Total: countModel.total_service ?? 0,
      Active: countModel.active_service ?? 0,
      Inactive: countModel.inactive_service ?? 0,
      requested_service:
        countModel.requested_service ?? countModel.total_requestedservice ?? 0,
    });
    const countRecord = countModel as unknown as Record<string, unknown>;
    setSubCategoryData((prev) => ({
      Total:
        "total_subcategory" in countRecord
          ? Number(countRecord.total_subcategory ?? 0)
          : prev.Total,
      Active:
        "active_subcategory" in countRecord
          ? Number(countRecord.active_subcategory ?? 0)
          : prev.Active,
      Inactive:
        "inactive_subcategory" in countRecord
          ? Number(countRecord.inactive_subcategory ?? 0)
          : prev.Inactive,
      requested_subcategory:
        Number(countRecord.requested_subcategory ?? 0) > 0
          ? Number(countRecord.requested_subcategory)
          : Number(countRecord.total_requestedsubcategory ?? 0) > 0
          ? Number(countRecord.total_requestedsubcategory)
          : prev.requested_subcategory,
    }));
  }, [countModel]);

  const fetchData = useCallback(
    async (
      selected: string,
      filters: {
        keyword?: string;
        status?: string;
        sort?: string;
      }
    ) => {
      const generation = ++fetchGenerationRef.current;
      setIsTableLoading(true);

      try {
        if (selected === "box-category") {
          if (showRequestedCategory) {
            const params = new URLSearchParams({
              page: String(currentPage),
              limit: String(pageSize),
              is_request: "true",
            });
            const keyword = String(filters.keyword ?? "").trim();
            if (keyword) {
              params.set("search", keyword);
              params.set("keyword", keyword);
            }
            const response = await apiRequest(
              `/category/getAll?${params.toString()}`,
              "GET"
            );
            if (generation !== fetchGenerationRef.current) return;
            if (!response.success) return;
            const page = extractRequestedCategoryPage(response.data, pageSize);
            setRequestedCategoryList(page.records);
            setTotalPages(page.totalPages);
          } else {
            const { response, categories, totalPages, resolvedPage } =
              await fetchCategory(
                currentPage,
                pageSize,
                filters,
                sortBy,
                catalogFranchiseId || undefined
              );
            if (response) {
              if (generation !== fetchGenerationRef.current) return;
              if (typeof resolvedPage === "number") {
                setCurrentPage(resolvedPage);
              }
              setCategoryList(categories || []);
              setTotalPages(totalPages || 0);
            }
          }
        } else if (selected === "box-service") {
          const { response, services, totalPages, resolvedPage } =
            await fetchService(
            currentPage,
            pageSize,
            {
              ...filters,
              ...(showRequestedService ? { is_request: "true" } : {}),
            },
            sortBy,
            catalogFranchiseId || undefined
          );
          if (response) {
            if (generation !== fetchGenerationRef.current) return;
            if (typeof resolvedPage === "number") {
              setCurrentPage(resolvedPage);
            }
            const lookup = await fetchSubCategoryLookup();
            if (generation !== fetchGenerationRef.current) return;
            const withNames = (services || []).map((item) =>
              withServiceSubCategoryName(item, lookup)
            );
            if (showRequestedService) {
              setRequestedServiceList(withNames);
            } else {
              setServiceList(withNames);
            }
            setTotalPages(totalPages || 0);
          }
        } else if (selected === "box-subcategory") {
          if (showRequestedSubCategory) {
            const params = new URLSearchParams({
              page: String(currentPage),
              limit: String(pageSize),
              is_request: "true",
            });
            const keyword = String(filters.keyword ?? "").trim();
            if (keyword) {
              params.set("search", keyword);
              params.set("keyword", keyword);
            }
            const response = await apiRequest(
              `/subcategory/getAll?${params.toString()}`,
              "GET"
            );
            if (generation !== fetchGenerationRef.current) return;
            if (!response.success) return;
            const page = extractSubCategoryPage(response.data, pageSize);
            setSubCategoryList(page.records);
            setTotalPages(page.totalPages);
            setSubCategoryData((prev) => ({
              ...prev,
              requested_subcategory: page.totalItems,
            }));
          } else {
            const params = new URLSearchParams({
              page: String(currentPage),
              limit: String(pageSize),
            });
            const keyword = String(filters.keyword ?? "").trim();
            if (keyword) {
              params.set("keyword", keyword);
            }
            if (filters.status === "true") {
              params.set("is_active", "true");
              params.set("status", "active");
            } else if (filters.status === "false") {
              params.set("is_active", "false");
              params.set("status", "inactive");
            }
            const response = await apiRequest(
              `/subcategory/getAll?${params.toString()}`,
              "GET"
            );
            if (generation !== fetchGenerationRef.current) return;
            if (!response.success) return;
            const page = extractSubCategoryPage(response.data, pageSize);
            setSubCategoryList(page.records);
            setTotalPages(page.totalPages);
            setSubCategoryData((prev) => {
              if (filters.status === "true") {
                return { ...prev, Active: page.totalItems };
              }
              if (filters.status === "false") {
                return { ...prev, Inactive: page.totalItems };
              }
              return { ...prev, Total: page.totalItems };
            });
          }
        }
      } finally {
        if (generation === fetchGenerationRef.current) {
          setIsTableLoading(false);
        }
      }
    },
    [
      currentPage,
      pageSize,
      showRequestedCategory,
      showRequestedService,
      showRequestedSubCategory,
      sortBy,
      catalogFranchiseId,
    ]
  );

  const filteredSubCategoryList = React.useMemo(() => {
    let rows = [...subCategoryList];
    const keyword = String(activeFilters.keyword ?? "")
      .trim()
      .toLowerCase();
    if (keyword) {
      rows = rows.filter((r) =>
        String(r.name ?? "")
          .toLowerCase()
          .includes(keyword)
      );
    }
    const primary = sortBy[0];
    if (primary?.id === "name") {
      rows.sort((a, b) => {
        const cmp = String(a.name ?? "").localeCompare(String(b.name ?? ""));
        return primary.desc ? -cmp : cmp;
      });
    }
    return rows;
  }, [
    subCategoryList,
    activeFilters.keyword,
    sortBy,
  ]);

  const refreshData = useCallback(
    async (selected: string) => {
      await fetchData(selected, activeFilters);
    },
    [fetchData, activeFilters]
  );

  
const fetchSubCategoryCounts = useCallback(async () => {
  try {
    const fetchCount = async (opts?: {
      status?: "true" | "false";
      isRequest?: boolean;
    }) => {
      const params = new URLSearchParams({
        page: "1",
        limit: "1",
      });

      if (opts?.isRequest) {
        params.set("is_request", "true");
      } else if (opts?.status) {
        params.set("is_active", opts.status);
        params.set(
          "status",
          opts.status === "true" ? "active" : "inactive"
        );
      }

      const response = await apiRequest(
        `/subcategory/getAll?${params.toString()}`,
        "GET"
      );

      if (!response.success) {
        throw new Error("Failed to fetch subcategory counts");
      }

      return extractSubCategoryPage(response.data, 1).totalItems;
    };

    const [total, active, inactive, requested] = await Promise.all([
      fetchCount(),
      fetchCount({ status: "true" }),
      fetchCount({ status: "false" }),
      fetchCount({ isRequest: true }),
    ]);

    setSubCategoryData((prev) => ({
      ...prev,
      Total: total,
      Active: active,
      Inactive: inactive,
      requested_subcategory: requested,
    }));
  } catch (error) {
    console.error("Failed to load subcategory counts:", error);
  }
}, []);

useEffect(() => {
  void fetchSubCategoryCounts();
}, [fetchSubCategoryCounts]);


  const refreshTableAfterMutation = useCallback(
    async (box: string) => {
      await refreshSummaryCounts();
      await refreshData(box);
    },
    [refreshSummaryCounts, refreshData]
  );

  const useFranchiseMappingToggle =
    franchiseCatalogScope || isFranchisePortalSession();

  const setCatalogServiceActive = useCallback(
    async (row: ServiceModel, is_active: boolean) => {
      const sid = recordIdFromRow(
        { original: row as unknown as Record<string, unknown> },
        SERVICE_ROW_ID_KEYS
      );
      if (!sid) {
        showErrorAlert("Unable to update service: missing identifier.");
        return;
      }
      const prev = catalogActiveValue(
        row as unknown as Record<string, unknown>,
        catalogListStatusField
      );
      setServiceList((list) =>
        list.map((s) => {
          const id = recordIdFromRow(
            { original: s as unknown as Record<string, unknown> },
            SERVICE_ROW_ID_KEYS
          );
          return id === sid ? ({ ...s, [catalogListStatusField]: is_active } as ServiceModel) : s;
        })
      );
      const ok = useFranchiseMappingToggle
        ? await apiSetServiceActive(
            sid,
            is_active,
            catalogFranchiseId || undefined
          )
        : await patchServiceCatalogActiveStatus(sid, is_active);
      if (ok) {
        showSuccessAlert("Service status updated");
        await refreshTableAfterMutation("box-service");
      } else {
        setServiceList((list) =>
          list.map((s) => {
            const id = recordIdFromRow(
              { original: s as unknown as Record<string, unknown> },
              SERVICE_ROW_ID_KEYS
            );
            return id === sid
              ? ({ ...s, [catalogListStatusField]: prev } as ServiceModel)
              : s;
          })
        );
        showErrorAlert("Could not update service status.");
      }
    },
    [
      catalogFranchiseId,
      catalogListStatusField,
      refreshTableAfterMutation,
      useFranchiseMappingToggle,
    ]
  );

 
const setSubCategoryActive = useCallback(
  async (row: SubCategoryRow, is_active: boolean) => {
    const sid = recordIdFromRow(
      { original: row as unknown as Record<string, unknown> },
      SUBCATEGORY_ROW_ID_KEYS
    );

    if (!sid) {
      showErrorAlert(
        "Unable to update sub category: missing identifier."
      );
      return;
    }

    // Prepare the PUT request body.
    const rawRow = row as unknown as Record<string, unknown>;

    const rawServices = Array.isArray(row.service_ids)
      ? row.service_ids
      : Array.isArray(rawRow.services)
      ? (rawRow.services as unknown[])
      : [];

    const payload = {
      name: row.name,
      desc: row.desc ?? "",
      category_id: idField(row.category_id),
      service_ids: rawServices.map((service) => idField(service)).filter(Boolean),
      is_active,
      ...(row.image_url ? { image_url: row.image_url } : {}),
    };

    try {
      const response = await apiRequest(
        updateSubCategoryPath(sid),
        "PUT",
        payload
      );

      if (!response.success) {
        showErrorAlert(
          "Could not update sub category status."
        );
        return;
      }

      // Read the status confirmed by the backend.
      const responseData =
        response.data &&
        typeof response.data === "object"
          ? (response.data as Record<string, unknown>)
          : {};

      const record =
        responseData.record &&
        typeof responseData.record === "object"
          ? (responseData.record as Record<string, unknown>)
          : responseData;

      const confirmedStatus =
        record.is_active !== undefined
          ? coerceCatalogRowActive(record.is_active)
          : is_active;

      // Update the table after a successful API response.
      setSubCategoryList((list) =>
        list.map((item) => {
          const id = recordIdFromRow(
            { original: item as unknown as Record<string, unknown> },
            SUBCATEGORY_ROW_ID_KEYS
          );

          if (id !== sid) return item;

          return {
            ...item,
            is_active: confirmedStatus,
            franchise_active: confirmedStatus,
          };
        })
      );

      showSuccessAlert(
        "Sub category status updated successfully."
      );

      await refreshTableAfterMutation("box-subcategory");
    } catch (error) {
      showErrorAlert(
        "An error occurred while updating sub category status."
      );
    }
  },
  [refreshTableAfterMutation]
);

  const openSubCategoryDialog = useCallback(
    (row: SubCategoryRow | null, isViewMode: boolean) => {
      showAddEditSubCategoryDialog(row, isViewMode, {
        onSaved: async (saved) => {
          const subcategoryId = String(row?._id ?? "").trim();
          if (saved.requestModerationHandled) {
            await refreshData("box-subcategory");
            return true;
          }
          if (subcategoryId) {
            let image_url = "";
            if (saved.image) {
              const imageUpload = await uploadDocumentImages({
                uploadType: "2",
                files: [saved.image],
                isEditMode: true,
                existingStoragePaths: row?.image_url ? [row.image_url] : [],
              });
              if (!imageUpload.ok) {
                showErrorAlert(
                  documentUploadFailureMessage(imageUpload.usedReplace)
                );
                return false;
              }
              image_url = imageUpload.paths[0] ?? "";
            }
            const payload = {
              name: saved.name,
              desc: saved.description,
              is_active: row?.is_active !== false,
              service_ids: saved.service_ids,
              franchise_id: String(
                (row as { franchise_id?: string } | null)?.franchise_id ?? ""
              ),
              category_id: saved.category_id,
              ...(image_url ? { image_url } : {}),
            };
            const response = await apiRequest(
              updateSubCategoryPath(subcategoryId),
              "PUT",
              payload
            );
            if (!response.success) return false;
            await refreshData("box-subcategory");
            return true;
          }

          // Create already done in AddEditSubCategoryDialog via POST /subcategory/create
          await refreshData("box-subcategory");
          return true;
        },
      });
    },
    [refreshData]
  );

  const openSubCategoryView = useCallback(
    async (row: SubCategoryRow) => {
      const sid = recordIdFromRow(
        { original: row as unknown as Record<string, unknown> },
        SUBCATEGORY_ROW_ID_KEYS
      );
      if (!sid) {
        showErrorAlert("Unable to open sub category: missing identifier.");
        return;
      }
      const response = await apiRequest(`/subcategory/get/${sid}`, "GET");
      const record = response.success
        ? unwrapSubCategoryGet(response.data)
        : null;
      openSubCategoryDialog(
        record ? mapSubCategoryRecord(record) : row,
        true
      );
    },
    [openSubCategoryDialog]
  );

  const setCatalogCategoryActive = useCallback(
    async (row: CategoryModel, is_active: boolean) => {
      const cid = recordIdFromRow(
        { original: row as unknown as Record<string, unknown> },
        CATEGORY_ROW_ID_KEYS
      );
      if (!cid) {
        showErrorAlert("Unable to update category: missing identifier.");
        return;
      }
      const prev = catalogActiveValue(
        row as unknown as Record<string, unknown>,
        catalogListStatusField
      );
      setCategoryList((list) =>
        list.map((c) =>
          recordIdFromRow(
            { original: c as unknown as Record<string, unknown> },
            CATEGORY_ROW_ID_KEYS
          ) === cid
            ? ({ ...c, [catalogListStatusField]: is_active } as CategoryModel)
            : c
        )
      );
      const ok = useFranchiseMappingToggle
        ? await apiSetCategoryActive(
            cid,
            is_active,
            catalogFranchiseId || undefined
          )
        : await patchCategoryCatalogActiveStatus(cid, is_active);
      if (ok) {
        showSuccessAlert("Category status updated");
        await refreshTableAfterMutation("box-category");
      } else {
        setCategoryList((list) =>
          list.map((c) =>
            recordIdFromRow(
              { original: c as unknown as Record<string, unknown> },
              CATEGORY_ROW_ID_KEYS
            ) === cid
              ? ({ ...c, [catalogListStatusField]: prev } as CategoryModel)
              : c
          )
        );
        showErrorAlert("Could not update category status.");
      }
    },
    [
      catalogFranchiseId,
      catalogListStatusField,
      refreshTableAfterMutation,
      useFranchiseMappingToggle,
    ]
  );

  useEffect(() => {
    void refreshData(selectedBox);
  }, [
    selectedBox,
    pageSize,
    currentPage,
    showRequestedCategory,
    showRequestedService,
    showRequestedSubCategory,
    refreshData,
    catalogFranchiseId,
  ]);

  const handleFilterChange = async (
    filters: {
      keyword?: string;
      status?: string;
      sort?: string;
    },
    targetBox?: string
  ) => {
    setCurrentPage(1);
    setTotalPages(0);
    setSortBy([]);
    setActiveFilters(filters);
    if (targetBox && targetBox !== selectedBox) {
      setSelectedBox(targetBox);
    }
  };

  /* ADDED: open requested category table */
  const openRequestedCategory = useCallback(() => {
    setSelectedBox("box-category");
    setShowRequestedCategory(true);
    setShowRequestedSubCategory(false);
    setShowRequestedService(false);
    setActiveFilters({});
    setCurrentPage(1);
    setSortBy([]);
  }, []);
  const openRequestedSubCategory = useCallback(() => {
    setSelectedBox("box-subcategory");
    setShowRequestedSubCategory(true);
    setShowRequestedCategory(false);
    setShowRequestedService(false);
    setActiveFilters({});
    setCurrentPage(1);
    setSortBy([]);
  }, []);

  /* ADDED: open requested service table */
  const openRequestedService = useCallback(() => {
    setSelectedBox("box-service");
    setShowRequestedService(true);
    setShowRequestedCategory(false);
    setShowRequestedSubCategory(false);
    setActiveFilters({});
    setCurrentPage(1);
    setSortBy([]);
  }, []);

  useEffect(() => {
    const requested = String(searchParams.get("requested") ?? "")
      .trim()
      .toLowerCase();
    const openId = String(searchParams.get("openId") ?? "").trim();
    if (!requested && !openId) return;

    const linkKey = `${requested}|${openId}`;
    if (notificationDeepLinkHandledRef.current === linkKey) return;
    notificationDeepLinkHandledRef.current = linkKey;

    const isCategory =
      requested === "category" || requested === "categories";
    const isService = requested === "service" || requested === "services";

    if (isCategory) {
      openRequestedCategory();
    } else if (isService) {
      openRequestedService();
    }

    const clearParams = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("requested");
      next.delete("openId");
      setSearchParams(next, { replace: true });
    };

    if (!openId) {
      clearParams();
      return;
    }

    void (async () => {
      if (isCategory) {
        const { response, category } = await fetchCategoryById(openId);
        if (response && category) {
          AddEditCategoryDialog.show(
            true,
            category,
            openRequestedCategory,
            true
          );
        }
      } else if (isService) {
        const { response, service } = await fetchServiceById(
          openId,
          catalogFranchiseId
        );
        if (response && service) {
          showAddEditServiceDialog(
            true,
            service,
            openRequestedService,
            true
          );
        }
      }
      clearParams();
    })();
  }, [
    searchParams,
    setSearchParams,
    openRequestedCategory,
    openRequestedService,
    catalogFranchiseId,
  ]);

  const categoryColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },

      { Header: "Category Name", accessor: "name", sort: true },
      {
        Header: franchiseCatalogScope ? "Franchise status" : "Status",
        accessor: catalogListStatusField,
        className: "my-franchise-col-active-toggle",
        Cell: ({ row }: { row: any }) => {
          const cat = row.original as CategoryModel;
          const active = catalogActiveValue(
            cat as unknown as Record<string, unknown>,
            catalogListStatusField
          );
          const cid = recordIdFromRow(row, CATEGORY_ROW_ID_KEYS);
          return (
            <Form.Check
              type="switch"
              id={`svc-mgmt-category-active-${cid}`}
              className={`franchise-status-switch${
                active ? " franchise-status-switch--on" : ""
              }`}
              checked={active}
              aria-label={
                active
                  ? "Active, switch to deactivate"
                  : "Inactive, switch to activate"
              }
              onChange={(e) => {
                e.stopPropagation();
                void setCatalogCategoryActive(cat, e.target.checked);
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
            onView={async () => {
              const cid = recordIdFromRow(row, CATEGORY_ROW_ID_KEYS);
              if (!cid) {
                showErrorAlert("Unable to open category: missing identifier.");
                return;
              }
              const { response, category } = await fetchCategoryById(cid);
              AddEditCategoryDialog.show(
                true,
                response && category ? category : row.original,
                () => void refreshTableAfterMutation("box-category"),
                true,
                true
              );
            }}
          />
        ),
      },
    ],
    [
      currentPage,
      pageSize,
      refreshTableAfterMutation,
      franchiseCatalogScope,
      catalogListStatusField,
      setCatalogCategoryActive,
    ]
  );

  const subCategoryColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Sub Category Name", accessor: "name", sort: true },
      { Header: "Category", accessor: "category_name" },
      {
        Header: franchiseCatalogScope ? "Franchise status" : "Status",
        accessor: catalogListStatusField,
        className: "my-franchise-col-active-toggle",
        Cell: ({ row }: { row: any }) => {
          const sub = row.original as SubCategoryRow;
          const active = catalogActiveValue(
            sub as unknown as Record<string, unknown>,
            catalogListStatusField
          );
          const sid = recordIdFromRow(row, SUBCATEGORY_ROW_ID_KEYS);
          return (
            <Form.Check
              type="switch"
              id={`svc-mgmt-subcategory-active-${sid}`}
              className={`franchise-status-switch${
                active ? " franchise-status-switch--on" : ""
              }`}
              checked={active}
              aria-label={
                active
                  ? "Active, switch to deactivate"
                  : "Inactive, switch to activate"
              }
              onChange={(e) => {
                e.stopPropagation();
                void setSubCategoryActive(sub, e.target.checked);
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
            onView={() => {
              void openSubCategoryView(row.original as SubCategoryRow);
            }}
          />
        ),
      },
    ],
    [
      currentPage,
      pageSize,
      franchiseCatalogScope,
      catalogListStatusField,
      setSubCategoryActive,
      openSubCategoryView,
    ]
  );

  const serviceColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },

      { Header: "Service Name", accessor: "name", sort: true },
      {
        Header: "Sub Category",
        accessor: "subcategory_name",
        Cell: ({ row }: { row: any }) => {
          const o = (row?.original ?? {}) as Record<string, unknown>;
          return serviceRowSubCategoryName(o) || "-";
        },
      },
      { Header: "Category", accessor: "category_name" },
      {
        Header: franchiseCatalogScope ? "Franchise status" : "Status",
        accessor: catalogListStatusField,
        className: "my-franchise-col-active-toggle",
        Cell: ({ row }: { row: any }) => {
          const svc = row.original as ServiceModel;
          const active = catalogActiveValue(
            svc as unknown as Record<string, unknown>,
            catalogListStatusField
          );
          const sid = recordIdFromRow(row, SERVICE_ROW_ID_KEYS);
          return (
            <Form.Check
              type="switch"
              id={`svc-mgmt-service-active-${sid}`}
              className={`franchise-status-switch${
                active ? " franchise-status-switch--on" : ""
              }`}
              checked={active}
              aria-label={
                active
                  ? "Active, switch to deactivate"
                  : "Inactive, switch to activate"
              }
              onChange={(e) => {
                e.stopPropagation();
                void setCatalogServiceActive(svc, e.target.checked);
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
            onView={async () => {
              const sid = recordIdFromRow(row, SERVICE_ROW_ID_KEYS);
              if (!sid) {
                showErrorAlert("Unable to open service: missing identifier.");
                return;
              }
              const { response, service } = await fetchServiceById(
                sid,
                catalogFranchiseId
              );
              const record =
                response && service
                  ? mergeServiceDetailForDialog(row.original, service)
                  : (row.original as ServiceModel);
              showAddEditServiceDialog(
                true,
                record,
                () => void refreshTableAfterMutation("box-service"),
                true,
                undefined,
                true
              );
            }}
          />
        ),
      },
    ],
    [
      currentPage,
      pageSize,
      refreshTableAfterMutation,
      franchiseCatalogScope,
      catalogListStatusField,
      setCatalogServiceActive,
      catalogFranchiseId,
    ]
  );

  /* ADDED: requested category columns */
  const requestedCategoryColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },

      { Header: "Category Name", accessor: "name" },
      {
        Header: "Date",
        accessor: "createdAt",
        Cell: ({ row }: { row: any }) =>
          formatDate(row.original.createdAt || row.original.created_at),
      },
      {
        Header: "Status",
        accessor: "status",
        Cell: requestStatusCell(),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={async () => {
              const cid = recordIdFromRow(row, CATEGORY_ROW_ID_KEYS);
              if (!cid) {
                showErrorAlert("Unable to open category: missing identifier.");
                return;
              }
              const { response, category } = await fetchCategoryById(cid);
              const record =
                response && category
                  ? mergeCategoryDetailForDialog(row.original, category)
                  : row.original;
              AddEditCategoryDialog.show(
                true,
                record,
                openRequestedCategory,
                true
              );
            }}
          />
        ),
      },
    ],
    [openRequestedCategory, currentPage, pageSize]
  );

  const requestedSubCategoryColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Sub Category Name", accessor: "name" },
      { Header: "Category", accessor: "category_name" },
      {
        Header: "Date",
        accessor: "createdAt",
        Cell: ({ row }: { row: any }) =>
          formatDate(row.original.createdAt || row.original.created_at),
      },
      {
        Header: "Status",
        accessor: "status",
        Cell: requestStatusCell(),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={() => {
              void openSubCategoryView(row.original as SubCategoryRow);
            }}
          />
        ),
      },
    ],
    [currentPage, pageSize, openSubCategoryView]
  );

  /* ADDED: requested service columns */
  const requestedServiceColumns = React.useMemo(
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
        Header: "Date",
        accessor: "createdAt",
        Cell: ({ row }: { row: any }) =>
          formatDate(row.original.createdAt || row.original.created_at),
      },
      {
        Header: "Status",
        accessor: "status",
        Cell: requestStatusCell(),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={async () => {
              const sid = recordIdFromRow(row, SERVICE_ROW_ID_KEYS);
              if (!sid) {
                showErrorAlert("Unable to open service: missing identifier.");
                return;
              }
              const { response, service } = await fetchServiceById(
                sid,
                catalogFranchiseId
              );
              const record =
                response && service
                  ? mergeServiceDetailForDialog(row.original, service)
                  : (row.original as ServiceModel);
              showAddEditServiceDialog(
                true,
                record,
                openRequestedService,
                true
              );
            }}
          />
        ),
      },
    ],
    [openRequestedService, currentPage, pageSize, catalogFranchiseId]
  );

  return (
    <>
      <div className="main-page-content">
        <CustomHeader
          title="Service Management"
          register={register}
          setValue={setValue}
        />

        <div className="box-container">
          {["box-category", "box-subcategory", "box-service"].map((id) => (
            <CustomSummaryBox
              key={id}
              divId={id}
              title={capitalizeString(id.replace("box-", "").replace("-", " "))}
              data={
                id === "box-category"
                  ? categoryData
                  : id === "box-subcategory"
                  ? subCategoryData
                  : serviceData
              }
              onSelect={(divId) => {
                setSelectedBox(divId);
                setShowRequestedCategory(false);
                setShowRequestedSubCategory(false);
                setShowRequestedService(false);
                handleFilterChange({}, divId);
              }}
              isSelected={selectedBox === id}
              onFilterChange={(filter) => {
                if (id === "box-subcategory") {
                  setShowRequestedSubCategory(false);
                }
                handleFilterChange(filter);
              }}
              onItemClick={(key) => {
                if (id === "box-category" && key === "requested_category") {
                  openRequestedCategory();
                }
                if (id === "box-subcategory" && key === "Total") {
                  setShowRequestedSubCategory(false);
                  handleFilterChange({}, "box-subcategory");
                }
                if (id === "box-subcategory" && key === "requested_subcategory") {
                  openRequestedSubCategory();
                }
                if (id === "box-service" && key === "requested_service") {
                  openRequestedService();
                }
              }}
              isAddShow={true}
              addButtonLable={capitalizeString(
                id.replace("box-", "Add ").replace("-", " ")
              )}
              onAddClick={() => {
                if (id === "box-category") {
                  AddEditCategoryDialog.show(false, null, () =>
                    void refreshTableAfterMutation(selectedBox)
                  );
                  return;
                }
                if (id === "box-subcategory") {
                  openSubCategoryDialog(null, false);
                  return;
                }
                showAddEditServiceDialog(false, null, () =>
                  void refreshTableAfterMutation(selectedBox)
                );
              }}
            />
          ))}
        </div>

        <CustomUtilityBox
          title={
            showRequestedSubCategory
              ? "Requested Subcategories"
              : showRequestedCategory
              ? "Requested Categories"
              : showRequestedService
              ? "Requested Services"
              : selectedBox === "box-category"
              ? "Categories"
              : selectedBox === "box-subcategory"
              ? "Sub Categories"
              : "Services"
          }
          searchHint={
            showRequestedSubCategory
              ? "Search Sub Category name"
              : showRequestedCategory
              ? "Search Category name"
              : showRequestedService
              ? "Search Service name"
              : selectedBox === "box-category"
              ? "Search Category name"
              : selectedBox === "box-subcategory"
              ? "Search Sub Category name"
              : "Search Service name, Category"
          }
          onSearch={(value) => {
            handleFilterChange({ keyword: value });
          }}
          syncKeyword={activeFilters.keyword ?? ""}
        />

        <CustomTable
          columns={
                    showRequestedSubCategory
          ? requestedSubCategoryColumns
          : showRequestedCategory
          ? requestedCategoryColumns
          : showRequestedService
          ? requestedServiceColumns
          : selectedBox === "box-category"
          ? categoryColumns
          : selectedBox === "box-subcategory"
          ? subCategoryColumns
          : serviceColumns
           
          }
          data={
            showRequestedCategory
              ? requestedCategoryList
              : showRequestedService
              ? requestedServiceList
              : selectedBox === "box-category"
              ? categoryList
              : selectedBox === "box-subcategory"
              ? filteredSubCategoryList
              : serviceList
          }
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
          onSortChange={(next) => {
            setSortBy(next);
            setCurrentPage(1);
          }}
          isLoading={isTableLoading}
          theadClass="table-light"
        />
      </div>
    </>
  );
};

export default ServiceManagement;
