import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal, Button, Form, InputGroup } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { FieldLabelText } from "../../components/RequiredFieldMark";
import { UserModel } from "../../lib/models/UserModel";
import type { PartnerServiceApiRow } from "../../lib/partner/partnerCategoryServiceView";
import {
  flattenPartnerBlocksForSave,
  emptyPartnerCatalogBlock,
  emptyPartnerServiceRow,
  newPartnerCatalogRowId,
  PartnerCatalogStatusToggle,
  PartnerSingleSelect,
  partnerCatalogControlStyle,
  partnerCatalogOutlineAddBtn,
} from "../../components/partnerCatalogBlockUi";
import type {
  PartnerCategoryBlock,
  PartnerCatalogServiceLite,
  PartnerServiceRow,
  PartnerSelectOption,
} from "../../components/partnerCatalogBlockUi";
import { fetchCategory } from "../../services/categoryService";
import {
  fetchService,
  normalizeServiceCategoryRef,
} from "../../services/servicesService";
import { createOrUpdateUser } from "../../services/userService";
import { getLocalStorage } from "../../lib/global/localStorageHelper";
import { apiRequest } from "../../lib/global/remote/apiHelper";
import { AppConstant, UserRole } from "../../lib/global/AppConstant";
import { showErrorAlert } from "../../lib/global/alertHelper";
import {
  franchiseIdForApiQuery,
  isFranchisePortalSession,
  readHeaderFranchisePreference,
  sessionFranchiseIdForScopedApis,
} from "../../lib/franchise/headerFranchisePreference";
import { partnerCatalogPriceLabel } from "../../lib/partner/partnerCatalogPayment";

const PARTNER_ROLE = 2;

type ServiceLite = PartnerCatalogServiceLite & {
  category_name?: string;
  subcategory_id?: string;
};

type PartnerSubCategoryRow = {
  id: string;
  subcategoryId: string;
  is_active: boolean;
  serviceRows: PartnerServiceRow[];
};

type PartnerCategoryBlockExt = PartnerCategoryBlock & {
  subCategoryRows: PartnerSubCategoryRow[];
};

function normalizePartnerServiceRow(r: PartnerServiceRow): PartnerServiceRow {
  return {
    ...r,
    id: String(r?.id ?? "").trim() || newPartnerCatalogRowId(),
    serviceId: String(r?.serviceId ?? ""),
    description: String(r?.description ?? ""),
    price: String(r?.price ?? ""),
    is_active: r?.is_active !== false,
  };
}

function emptyPartnerSubCategoryRow(): PartnerSubCategoryRow {
  return {
    id: newPartnerCatalogRowId(),
    subcategoryId: "",
    is_active: true,
    serviceRows: [emptyPartnerServiceRow()],
  };
}

function syncBlockServiceRowsFromSubs(
  block: PartnerCategoryBlockExt
): PartnerCategoryBlockExt {
  const subCategoryRows = (block.subCategoryRows ?? []).map((sub) => {
    const serviceRows = (
      Array.isArray(sub.serviceRows) && sub.serviceRows.length > 0
        ? sub.serviceRows
        : [emptyPartnerServiceRow()]
    ).map(normalizePartnerServiceRow);
    return {
      id: String(sub?.id ?? "").trim() || newPartnerCatalogRowId(),
      subcategoryId: String(sub?.subcategoryId ?? ""),
      is_active: sub?.is_active !== false,
      serviceRows,
    };
  });
  return {
    ...block,
    subCategoryRows:
      subCategoryRows.length > 0
        ? subCategoryRows
        : [emptyPartnerSubCategoryRow()],
    serviceRows: (
      subCategoryRows.length > 0
        ? subCategoryRows
        : [emptyPartnerSubCategoryRow()]
    ).flatMap((s) => s.serviceRows),
  };
}

function emptyPartnerCatalogBlockExt(
  initialCategoryId: string
): PartnerCategoryBlockExt {
  return syncBlockServiceRowsFromSubs({
    ...emptyPartnerCatalogBlock(initialCategoryId),
    subCategoryRows: [emptyPartnerSubCategoryRow()],
  });
}

function ensurePartnerCatalogBlocks(
  blocks: PartnerCategoryBlock[] | null | undefined
): PartnerCategoryBlockExt[] {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return [emptyPartnerCatalogBlockExt("")];
  }
  return blocks.map((b) => {
    const ext = b as PartnerCategoryBlockExt;
    const rawSubs = Array.isArray(ext?.subCategoryRows)
      ? ext.subCategoryRows
      : [];
    const topServices = (
      Array.isArray(b?.serviceRows) && b.serviceRows.length > 0
        ? b.serviceRows
        : []
    ).map(normalizePartnerServiceRow);
    const hasNestedServices = rawSubs.some(
      (s) => Array.isArray(s?.serviceRows) && s.serviceRows.length > 0
    );
    const subCategoryRows = (
      rawSubs.length > 0 ? rawSubs : [emptyPartnerSubCategoryRow()]
    ).map((r, index) => {
      const nested = Array.isArray(r?.serviceRows) ? r.serviceRows : [];
      const serviceRows =
        nested.length > 0
          ? nested.map(normalizePartnerServiceRow)
          : !hasNestedServices && index === 0 && topServices.length > 0
            ? topServices
            : [emptyPartnerServiceRow()];
      return {
        id: String(r?.id ?? "").trim() || newPartnerCatalogRowId(),
        subcategoryId: String(r?.subcategoryId ?? ""),
        is_active: r?.is_active !== false,
        serviceRows,
      };
    });
    return syncBlockServiceRowsFromSubs({
      id: String(b?.id ?? "").trim() || newPartnerCatalogRowId(),
      categoryId: String(b?.categoryId ?? ""),
      is_active: b?.is_active !== false,
      subCategoryRows,
      serviceRows: [],
    });
  });
}

function extractSubCategoryOptionsFromGetAll(
  data: unknown
): PartnerSelectOption[] {
  const buckets: unknown[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) buckets.push(...value);
  };
  const walk = (node: unknown, depth = 0) => {
    if (depth > 4 || node == null) return;
    if (Array.isArray(node)) {
      push(node);
      return;
    }
    if (typeof node !== "object") return;
    const root = node as Record<string, unknown>;
    push(root.records);
    push(root.subcategories);
    push(root.sub_categories);
    push(root.list);
    push(root.items);
    push(root.data);
    if (root.data && typeof root.data === "object") walk(root.data, depth + 1);
  };
  walk(data);
  const seen = new Set<string>();
  const options: PartnerSelectOption[] = [];
  for (const item of buckets) {
    const row =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    const value = String(
      row._id ??
        row.id ??
        row.subcategory_id ??
        row.sub_category_id ??
        row.value ??
        ""
    ).trim();
    if (!value || seen.has(value)) continue;
    const label =
      String(row.name ?? row.label ?? row.subcategory_name ?? "").trim() ||
      value;
    seen.add(value);
    options.push({ value, label });
  }
  return options;
}

function extractServicesFromGetAll(data: unknown): PartnerCatalogServiceLite[] {
  const buckets: unknown[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) buckets.push(...value);
  };
  const walk = (node: unknown, depth = 0) => {
    if (depth > 4 || node == null) return;
    if (Array.isArray(node)) {
      push(node);
      return;
    }
    if (typeof node !== "object") return;
    const root = node as Record<string, unknown>;
    push(root.records);
    push(root.services);
    push(root.list);
    push(root.items);
    push(root.data);
    if (root.data && typeof root.data === "object") walk(root.data, depth + 1);
  };
  walk(data);
  const seen = new Set<string>();
  const out: PartnerCatalogServiceLite[] = [];
  for (const item of buckets) {
    const row =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    const value = String(
      row._id ?? row.id ?? row.service_id ?? row.value ?? ""
    ).trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const priceRaw = row.price ?? row.minimum_deposit;
    const priceNum =
      priceRaw !== undefined && priceRaw !== null ? Number(priceRaw) : NaN;
    out.push({
      _id: value,
      name: String(row.name ?? row.label ?? "").trim() || value,
      category_id: normalizeServiceCategoryRef(row.category_id),
      price: Number.isFinite(priceNum) ? priceNum : undefined,
      payment_type: String(
        row.payment_type ?? row.min_deposit_type ?? ""
      ).trim(),
    });
  }
  return out;
}

/** Grow description textarea up to 5 lines, then scroll. */
const PARTNER_DESC_MAX_LINES = 5;

function adjustPartnerDescHeight(el: HTMLElement) {
  el.style.height = "auto";
  const style = window.getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || 21;
  const paddingY =
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.paddingBottom) || 0);
  const borderY =
    (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.borderBottomWidth) || 0);
  const maxHeight =
    lineHeight * PARTNER_DESC_MAX_LINES + paddingY + borderY;
  const contentHeight = el.scrollHeight;
  el.style.height = `${Math.min(contentHeight, maxHeight)}px`;
  el.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
}

function resolvePartnerCatalogFranchiseApiId(user: UserModel): string {
  const fromUser = String(
    (user as { franchise_id?: string }).franchise_id ?? ""
  ).trim();
  if (fromUser) return franchiseIdForApiQuery(fromUser);
  if (isFranchisePortalSession()) {
    return franchiseIdForApiQuery(sessionFranchiseIdForScopedApis());
  }
  const header = readHeaderFranchisePreference();
  if (header && header.toLowerCase() !== "all") {
    return franchiseIdForApiQuery(header);
  }
  return "";
}

function resolveActiveFlag(value: unknown, defaultActive = true): boolean {
  if (value === undefined || value === null) return defaultActive;
  return value === true || String(value).toLowerCase() === "true";
}

function mapFranchiseCatalogService(
  raw: Record<string, unknown>,
  categoryId: string
): PartnerCatalogServiceLite | null {
  const _id = String(raw._id ?? raw.service_id ?? "").trim();
  if (!_id) return null;
  const priceRaw = raw.price ?? raw.minimum_deposit;
  const priceNum =
    priceRaw !== undefined && priceRaw !== null ? Number(priceRaw) : NaN;
  return {
    _id,
    name: String(raw.name ?? raw.service_name ?? "").trim(),
    category_id: categoryId,
    price: Number.isFinite(priceNum) ? priceNum : undefined,
    payment_type: raw.payment_type ? String(raw.payment_type) : undefined,
  };
}

function servicesFromCategoryRelated(
  category: Record<string, unknown>
): PartnerCatalogServiceLite[] {
  const cid = String(category._id ?? category.category_id ?? "").trim();
  if (!cid) return [];
  const related = category.related_services;
  if (!Array.isArray(related)) return [];
  const out: PartnerCatalogServiceLite[] = [];
  for (const item of related) {
    if (!item || typeof item !== "object") continue;
    const mapped = mapFranchiseCatalogService(
      item as Record<string, unknown>,
      cid
    );
    if (mapped) out.push(mapped);
  }
  return out;
}

const partnerCatalogOutlineRemoveBtn: React.CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  border: "1px solid var(--navi-color)",
  backgroundColor: "transparent",
  color: "var(--navi-color)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  boxShadow: "none",
  padding: 0,
  transition: "background-color 0.15s ease, filter 0.15s ease",
};

function categoryActiveFromUser(
  user: UserModel,
  categoryId: string,
  initialCategoryIds: string[]
): boolean {
  const idx = initialCategoryIds.findIndex(
    (id) => String(id) === String(categoryId)
  );
  const flags = (user as { category_is_active?: boolean[] }).category_is_active;
  if (idx >= 0 && Array.isArray(flags) && flags[idx] !== undefined) {
    return flags[idx] !== false;
  }
  return true;
}

function serviceActiveFromUser(user: UserModel, flatIndex: number): boolean {
  const flags = (user as { service_is_active?: boolean[] }).service_is_active;
  if (Array.isArray(flags) && flags[flatIndex] !== undefined) {
    return flags[flatIndex] !== false;
  }
  return true;
}

/** Only rows/blocks with saved catalog data are read-only; empty starter blocks stay editable. */
function captureInitialCatalogIds(
  blocks: PartnerCategoryBlock[],
  blockIdsRef: React.MutableRefObject<Set<string>>,
  rowIdsRef: React.MutableRefObject<Set<string>>,
  subRowIdsRef?: React.MutableRefObject<Set<string>>
) {
  const blockIds = new Set<string>();
  const rowIds = new Set<string>();
  const subRowIds = new Set<string>();
  for (const raw of blocks) {
    const b = raw as PartnerCategoryBlockExt;
    const cid = String(b.categoryId ?? "").trim();
    const subs = Array.isArray(b.subCategoryRows) ? b.subCategoryRows : [];
    if (cid) blockIds.add(b.id);
    if (subs.length > 0) {
      for (const sub of subs) {
        const subId = String(sub.subcategoryId ?? "").trim();
        const rowsWithService = (sub.serviceRows ?? []).filter((r) =>
          String(r.serviceId ?? "").trim()
        );
        if (subId) {
          blockIds.add(b.id);
          subRowIds.add(sub.id);
        }
        if (rowsWithService.length > 0) blockIds.add(b.id);
        for (const r of rowsWithService) {
          rowIds.add(r.id);
        }
      }
    } else {
      const rowsWithService = (b.serviceRows ?? []).filter((r) =>
        String(r.serviceId ?? "").trim()
      );
      if (rowsWithService.length > 0) blockIds.add(b.id);
      for (const r of rowsWithService) {
        rowIds.add(r.id);
      }
    }
  }
  blockIdsRef.current = blockIds;
  rowIdsRef.current = rowIds;
  if (subRowIdsRef) subRowIdsRef.current = subRowIds;
}

export type EditPartnerCategoriesServicesDialogProps = {
  user: UserModel;
  initialCategoryIds: string[];
  initialServiceIds: string[];
  onClose: () => void;
  onSaved: (categoryIds: string[], serviceIds: string[]) => void;
};

/** Group flat `service_ids` into blocks: consecutive services with the same category+subcategory share one block. */
function buildBlocksFromInitial(
  serviceIds: string[],
  allServices: ServiceLite[],
  user: UserModel,
  initialCategoryIds: string[]
): PartnerCategoryBlockExt[] {
  if (serviceIds.length === 0) {
    return [emptyPartnerCatalogBlockExt(initialCategoryIds[0] ?? "")];
  }

  const blocks: PartnerCategoryBlockExt[] = [];
  let flatIndex = 0;

  for (const sid of serviceIds) {
    const svc = allServices.find((s) => String(s._id) === String(sid));
    const cid = svc ? String(svc.category_id) : initialCategoryIds[0] ?? "";
    const subId = String(
      (svc as ServiceLite | undefined)?.subcategory_id ?? ""
    ).trim();
    const row: PartnerServiceRow = {
      id: newPartnerCatalogRowId(),
      serviceId: String(sid),
      description: String(user.service_descriptions?.[flatIndex] ?? ""),
      price:
        user.service_prices?.[flatIndex] !== undefined &&
        user.service_prices?.[flatIndex] !== null
          ? String(user.service_prices[flatIndex])
          : "",
      is_active: serviceActiveFromUser(user, flatIndex),
    };
    flatIndex++;

    const last = blocks[blocks.length - 1];
    const lastSub = last?.subCategoryRows?.[last.subCategoryRows.length - 1];
    if (
      last &&
      String(last.categoryId) === String(cid) &&
      cid &&
      lastSub &&
      String(lastSub.subcategoryId) === String(subId)
    ) {
      lastSub.serviceRows.push(row);
      last.serviceRows = last.subCategoryRows.flatMap((s) => s.serviceRows);
    } else if (last && String(last.categoryId) === String(cid) && cid) {
      last.subCategoryRows.push({
        id: newPartnerCatalogRowId(),
        subcategoryId: subId,
        is_active: true,
        serviceRows: [row],
      });
      last.serviceRows = last.subCategoryRows.flatMap((s) => s.serviceRows);
    } else {
      blocks.push(
        syncBlockServiceRowsFromSubs({
          id: newPartnerCatalogRowId(),
          categoryId: cid,
          is_active: categoryActiveFromUser(user, cid, initialCategoryIds),
          subCategoryRows: [
            {
              id: newPartnerCatalogRowId(),
              subcategoryId: subId,
              is_active: true,
              serviceRows: [row],
            },
          ],
          serviceRows: [],
        })
      );
    }
  }

  return blocks.length > 0
    ? blocks
    : [emptyPartnerCatalogBlockExt(initialCategoryIds[0] ?? "")];
}

function partnerServiceRefId(
  ref: string | { _id?: string; name?: string } | null | undefined
): string {
  if (ref == null) return "";
  if (typeof ref === "object") {
    const obj = ref as { _id?: string; id?: string };
    return String(obj._id ?? obj.id ?? "").trim();
  }
  return String(ref).trim();
}

function partnerServiceRefName(
  ref: string | { _id?: string; name?: string } | null | undefined,
  fallbackId: string
): string {
  if (ref != null && typeof ref === "object" && String(ref.name ?? "").trim()) {
    return String(ref.name).trim();
  }
  return fallbackId || "";
}

function pushServiceIntoBlocks(
  blocks: PartnerCategoryBlockExt[],
  cid: string,
  subId: string,
  categoryActive: boolean,
  subcategoryActive: boolean,
  row: PartnerServiceRow
) {
  const last = blocks[blocks.length - 1];
  const lastSub = last?.subCategoryRows?.[last.subCategoryRows.length - 1];
  if (
    last &&
    String(last.categoryId) === String(cid) &&
    cid &&
    lastSub &&
    String(lastSub.subcategoryId) === String(subId)
  ) {
    lastSub.serviceRows.push(row);
    last.serviceRows = last.subCategoryRows.flatMap((s) => s.serviceRows);
    return;
  }
  if (last && String(last.categoryId) === String(cid) && cid) {
    last.subCategoryRows.push({
      id: newPartnerCatalogRowId(),
      subcategoryId: subId,
      is_active: subcategoryActive,
      serviceRows: [row],
    });
    last.serviceRows = last.subCategoryRows.flatMap((s) => s.serviceRows);
    return;
  }
  blocks.push(
    syncBlockServiceRowsFromSubs({
      id: newPartnerCatalogRowId(),
      categoryId: cid,
      is_active: categoryActive,
      subCategoryRows: [
        {
          id: newPartnerCatalogRowId(),
          subcategoryId: subId,
          is_active: subcategoryActive,
          serviceRows: [row],
        },
      ],
      serviceRows: [],
    })
  );
}

/** Build edit blocks from `partner_services` rows (user-by-id API). */
function buildBlocksFromPartnerServices(
  partnerServices: PartnerServiceApiRow[],
  allServices: ServiceLite[] = []
): PartnerCategoryBlockExt[] {
  const blocks: PartnerCategoryBlockExt[] = [];
  const first = partnerServices[0] as Record<string, unknown> | undefined;

  // Nested: category → subcategories → services
  if (first && Array.isArray(first.subcategories)) {
    for (const cat of partnerServices as unknown as Record<string, unknown>[]) {
      const cid = partnerServiceRefId(
        cat.category_id as PartnerServiceApiRow["category_id"]
      );
      const categoryActive = resolveActiveFlag(cat.is_active, true);
      const subs = Array.isArray(cat.subcategories)
        ? (cat.subcategories as Record<string, unknown>[])
        : [];
      for (const sub of subs) {
        const subId = partnerServiceRefId(
          (sub.subcategory_id ??
            sub.sub_category_id ??
            sub._id ??
            sub.id) as PartnerServiceApiRow["service_id"]
        );
        const subcategoryActive =
          categoryActive && resolveActiveFlag(sub.is_active, true);
        const services = Array.isArray(sub.services)
          ? (sub.services as Record<string, unknown>[])
          : [];
        for (const svc of services) {
          const sid = partnerServiceRefId(
            svc.service_id as PartnerServiceApiRow["service_id"]
          );
          if (!sid) continue;
          pushServiceIntoBlocks(
            blocks,
            cid,
            subId,
            categoryActive,
            subcategoryActive,
            {
              id: newPartnerCatalogRowId(),
              serviceId: sid,
              description: String(svc.description ?? "").trim(),
              price:
                svc.price != null && svc.price !== ""
                  ? String(svc.price)
                  : "",
              is_active:
                subcategoryActive &&
                resolveActiveFlag(svc.is_active, true),
            }
          );
        }
        if (services.length === 0 && (cid || subId)) {
          pushServiceIntoBlocks(
            blocks,
            cid,
            subId,
            categoryActive,
            subcategoryActive,
            emptyPartnerServiceRow()
          );
        }
      }
    }
    return blocks.length > 0 ? blocks : [emptyPartnerCatalogBlockExt("")];
  }

  // Nested: category → services (legacy)
  if (first && Array.isArray(first.services)) {
    for (const cat of partnerServices as unknown as Record<string, unknown>[]) {
      const cid = partnerServiceRefId(
        cat.category_id as PartnerServiceApiRow["category_id"]
      );
      const categoryActive = resolveActiveFlag(cat.is_active, true);
      const services = Array.isArray(cat.services)
        ? (cat.services as Record<string, unknown>[])
        : [];
      for (const svc of services) {
        const sid = partnerServiceRefId(
          svc.service_id as PartnerServiceApiRow["service_id"]
        );
        if (!sid) continue;
        let subId = partnerServiceRefId(
          (svc.subcategory_id ??
            svc.sub_category_id) as PartnerServiceApiRow["service_id"]
        );
        if (!subId) {
          const hit = allServices.find((s) => String(s._id) === String(sid));
          subId = String(hit?.subcategory_id ?? "").trim();
        }
        pushServiceIntoBlocks(
          blocks,
          cid,
          subId,
          categoryActive,
          categoryActive,
          {
            id: newPartnerCatalogRowId(),
            serviceId: sid,
            description: String(svc.description ?? "").trim(),
            price:
              svc.price != null && svc.price !== "" ? String(svc.price) : "",
            is_active:
              categoryActive && resolveActiveFlag(svc.is_active, true),
          }
        );
      }
    }
    return blocks.length > 0 ? blocks : [emptyPartnerCatalogBlockExt("")];
  }

  // Flat partner_services rows
  for (const ps of partnerServices) {
    const sid = partnerServiceRefId(ps.service_id);
    let cid = partnerServiceRefId(ps.category_id);
    if (!cid && sid) {
      const svc = allServices.find((s) => String(s._id) === String(sid));
      if (svc?.category_id) cid = String(svc.category_id);
    }
    const rowRecord = ps as Record<string, unknown>;
    let subId = partnerServiceRefId(
      (rowRecord.subcategory_id ??
        rowRecord.sub_category_id) as PartnerServiceApiRow["service_id"]
    );
    if (!subId && sid) {
      const hit = allServices.find((s) => String(s._id) === String(sid));
      subId = String(hit?.subcategory_id ?? "").trim();
    }
    const categoryActive = resolveActiveFlag(
      rowRecord.category_is_active ?? rowRecord.is_active,
      true
    );
    const subcategoryActive =
      categoryActive &&
      resolveActiveFlag(
        rowRecord.subcategory_is_active ?? rowRecord.is_active,
        true
      );
    const row: PartnerServiceRow = {
      id: newPartnerCatalogRowId(),
      serviceId: sid,
      description: String(ps.description ?? "").trim(),
      price: ps.price != null && ps.price !== "" ? String(ps.price) : "",
      is_active: resolveActiveFlag(
        (ps as { is_active?: unknown }).is_active,
        true
      ),
    };

    pushServiceIntoBlocks(
      blocks,
      cid,
      subId,
      categoryActive,
      subcategoryActive,
      row
    );
  }

  return blocks.length > 0 ? blocks : [emptyPartnerCatalogBlockExt("")];
}

function EditPartnerCategoriesServicesDialogView({
  user,
  initialCategoryIds,
  initialServiceIds,
  onClose,
  onSaved,
}: EditPartnerCategoriesServicesDialogProps) {
  const [categoryOptions, setCategoryOptions] = useState<PartnerSelectOption[]>(
    []
  );
  const [allServices, setAllServices] = useState<ServiceLite[]>([]);
  const [servicesByCategoryId, setServicesByCategoryId] = useState<
    Record<string, PartnerCatalogServiceLite[]>
  >({});
  const [subCategoriesByCategoryId, setSubCategoriesByCategoryId] = useState<
    Record<string, PartnerSelectOption[]>
  >({});
  const [servicesBySubCategoryId, setServicesBySubCategoryId] = useState<
    Record<string, PartnerCatalogServiceLite[]>
  >({});
  const [blocks, setBlocks] = useState<PartnerCategoryBlockExt[]>([
    emptyPartnerCatalogBlockExt(""),
  ]);
  const [saving, setSaving] = useState(false);

  const initialBlockIdsRef = useRef<Set<string>>(new Set());
  const initialRowIdsRef = useRef<Set<string>>(new Set());
  const initialSubRowIdsRef = useRef<Set<string>>(new Set());
  const didInit = useRef(false);
  const loadedServiceCategoryIdsRef = useRef<Set<string>>(new Set());
  const loadingServiceCategoryIdsRef = useRef<Set<string>>(new Set());
  const subCategoriesLoadingRef = useRef<Set<string>>(new Set());
  const servicesBySubLoadingRef = useRef<Set<string>>(new Set());

  const safeBlocks = useMemo(
    () => ensurePartnerCatalogBlocks(blocks),
    [blocks]
  );

  const userRole = String(getLocalStorage(AppConstant.userRole) ?? "").trim();
  const isSuperAdminOrStaff =
    userRole === UserRole.ADMIN || userRole === UserRole.STAFF;

  const catalogFranchiseApiId = useMemo(
    () => resolvePartnerCatalogFranchiseApiId(user),
    [user]
  );

  const catalogLocked = useMemo(
    () => isSuperAdminOrStaff && !catalogFranchiseApiId,
    [isSuperAdminOrStaff, catalogFranchiseApiId]
  );

  /** Stable key — only category ids, not description/price edits on blocks. */
  const blockCategoryIdsKey = useMemo(() => {
    const ids = safeBlocks
      .map((b) => String(b.categoryId ?? "").trim())
      .filter(Boolean);
    const unique = ids.filter((id, i) => ids.indexOf(id) === i);
    unique.sort();
    return unique.join("|");
  }, [safeBlocks]);

  const cityId = user.city_id ?? "";
  const stateId = user.state_id ?? "";

  const isExistingBlock = useCallback(
    (blockId: string) => initialBlockIdsRef.current.has(blockId),
    []
  );

  const isExistingRow = useCallback(
    (rowId: string) => initialRowIdsRef.current.has(rowId),
    []
  );

  const isExistingSubRow = useCallback(
    (rowId: string) => initialSubRowIdsRef.current.has(rowId),
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const svcRes = await fetchService(
          1,
          5000,
          {
            status: "true",
            ...(cityId ? { city_id: cityId } : {}),
            ...(stateId ? { state_id: stateId } : {}),
          },
          [],
          catalogFranchiseApiId || undefined
        );
        if (cancelled) return;
        const list =
          svcRes?.response && Array.isArray(svcRes.services)
            ? svcRes.services
            : [];
        setAllServices(
          list.map((s) => {
            const category_id = String(
              normalizeServiceCategoryRef(
                (s as { category_id?: unknown }).category_id
              )
            );
            const priceRaw =
              (s as { price?: number | null }).price ??
              (s as { minimum_deposit?: number | null }).minimum_deposit;
            const priceNum =
              priceRaw !== undefined && priceRaw !== null
                ? Number(priceRaw)
                : NaN;
            return {
              _id: String((s as { _id?: string })._id ?? ""),
              name: String((s as { name?: string }).name ?? ""),
              category_id,
              category_name: (s as { category_name?: string }).category_name
                ? String((s as { category_name?: string }).category_name)
                : undefined,
              subcategory_id: String(
                (s as { subcategory_id?: string }).subcategory_id ??
                  (s as { sub_category_id?: string }).sub_category_id ??
                  ""
              ).trim(),
              price: Number.isFinite(priceNum) ? priceNum : undefined,
              payment_type: (s as { payment_type?: string }).payment_type
                ? String((s as { payment_type?: string }).payment_type)
                : undefined,
            };
          })
        );
      } catch {
        if (!cancelled) setAllServices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [catalogFranchiseApiId, cityId, stateId]);

  useEffect(() => {
    if (catalogLocked) {
      setCategoryOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchCategory(
          1,
          5000,
          { status: "true" },
          [],
          catalogFranchiseApiId || undefined
        );
        if (cancelled) return;
        if (!res.response) {
          setCategoryOptions([]);
          return;
        }
        const servicesByCat: Record<string, PartnerCatalogServiceLite[]> = {};
        const catList = (Array.isArray(res.categories) ? res.categories : [])
          .map((c) => {
            const raw = c as unknown as Record<string, unknown>;
            const value = String(c._id ?? c.category_id ?? "").trim();
            const related = servicesFromCategoryRelated(raw);
            if (value && related.length > 0) {
              servicesByCat[value] = related;
            }
            return {
              value,
              label: String(c.name ?? "").trim(),
            };
          })
          .filter((c) => c.value);
        setCategoryOptions(catList);
        if (Object.keys(servicesByCat).length > 0) {
          setServicesByCategoryId((prev) => ({ ...prev, ...servicesByCat }));
        }
      } catch {
        if (!cancelled) setCategoryOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [catalogFranchiseApiId, catalogLocked]);

  useEffect(() => {
    loadedServiceCategoryIdsRef.current.clear();
    loadingServiceCategoryIdsRef.current.clear();
  }, [catalogFranchiseApiId, cityId, stateId]);

  const partnerCategoryLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoryOptions) {
      const id = String(c.value ?? "").trim();
      if (id) map.set(id, c.label);
    }
    for (const ps of user.partner_services ?? []) {
      const cid = partnerServiceRefId(ps.category_id);
      const name = partnerServiceRefName(ps.category_id, "");
      if (cid && name) map.set(cid, name);
    }
    const catIds = (user.category_ids ?? []).map(String);
    const catNames = user.category_names ?? [];
    catIds.forEach((id, i) => {
      const cid = String(id ?? "").trim();
      const name =
        catNames[i] != null && String(catNames[i]).trim()
          ? String(catNames[i]).trim()
          : "";
      if (cid && name) map.set(cid, name);
    });
    for (const s of allServices) {
      const cid = String(s.category_id ?? "").trim();
      if (cid && s.category_name) map.set(cid, String(s.category_name));
    }
    return map;
  }, [
    categoryOptions,
    user.partner_services,
    user.category_ids,
    user.category_names,
    allServices,
  ]);

  const catalogServicesForBlocks = useMemo(() => {
    const out: PartnerCatalogServiceLite[] = [];
    const seen = new Set<string>();
    for (const s of allServices) {
      const id = String(s._id).trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(s);
    }
    for (const list of Object.values(servicesBySubCategoryId)) {
      for (const s of list) {
        const id = String(s._id).trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(s);
      }
    }
    for (const list of Object.values(servicesByCategoryId)) {
      for (const s of list) {
        const id = String(s._id).trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(s);
      }
    }
    return out;
  }, [allServices, servicesBySubCategoryId, servicesByCategoryId]);

  const partnerServiceLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ps of user.partner_services ?? []) {
      const sid = partnerServiceRefId(ps.service_id);
      const name = partnerServiceRefName(ps.service_id, "");
      if (sid && name) map.set(sid, name);
    }
    const svcIds = (user.service_ids ?? []).map(String);
    const svcNames = user.service_names ?? [];
    svcIds.forEach((id, i) => {
      const sid = String(id ?? "").trim();
      const name =
        svcNames[i] != null && String(svcNames[i]).trim()
          ? String(svcNames[i]).trim()
          : "";
      if (sid && name) map.set(sid, name);
    });
    for (const s of catalogServicesForBlocks) {
      const sid = String(s._id ?? "").trim();
      const name = String(s.name ?? "").trim();
      if (sid && name) map.set(sid, name);
    }
    return map;
  }, [
    user.partner_services,
    user.service_ids,
    user.service_names,
    catalogServicesForBlocks,
  ]);

  const categorySelectOptionsForBlock = useCallback(
    (block: PartnerCategoryBlock): PartnerSelectOption[] => {
      const taken = new Set(
        safeBlocks
          .filter(
            (b) =>
              b.id !== block.id && String(b.categoryId ?? "").trim() !== ""
          )
          .map((b) => String(b.categoryId))
      );
      const filtered = categoryOptions.filter((c) => !taken.has(String(c.value)));
      const opts: PartnerSelectOption[] = [
        { value: "", label: "Select category" },
        ...filtered,
      ];
      const currentCid = String(block.categoryId ?? "").trim();
      if (currentCid && !opts.some((o) => String(o.value) === currentCid)) {
        opts.push({
          value: currentCid,
          label: partnerCategoryLabelById.get(currentCid) ?? currentCid,
        });
      }
      return opts;
    },
    [categoryOptions, safeBlocks, partnerCategoryLabelById]
  );

  const partnerSubCategoryLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of Object.values(subCategoriesByCategoryId)) {
      for (const o of list) {
        const id = String(o.value ?? "").trim();
        if (id) map.set(id, o.label);
      }
    }
    for (const ps of user.partner_services ?? []) {
      const row = ps as Record<string, unknown>;
      const subId = partnerServiceRefId(
        (row.subcategory_id ??
          row.sub_category_id) as PartnerServiceApiRow["service_id"]
      );
      const name = partnerServiceRefName(
        (row.subcategory_id ??
          row.sub_category_id) as PartnerServiceApiRow["service_id"],
        ""
      );
      if (subId && name) map.set(subId, name);
      const nestedSubs = Array.isArray(row.subcategories)
        ? (row.subcategories as Record<string, unknown>[])
        : [];
      for (const sub of nestedSubs) {
        const id = partnerServiceRefId(
          (sub.subcategory_id ??
            sub.sub_category_id ??
            sub._id) as PartnerServiceApiRow["service_id"]
        );
        const label = partnerServiceRefName(
          (sub.subcategory_id ??
            sub.sub_category_id ??
            sub) as PartnerServiceApiRow["service_id"],
          ""
        );
        if (id && label) map.set(id, label);
      }
    }
    return map;
  }, [subCategoriesByCategoryId, user.partner_services]);

  const subCategorySelectOptionsForRow = useCallback(
    (blockId: string, rowId: string): PartnerSelectOption[] => {
      const block = safeBlocks.find((b) => b.id === blockId);
      const categoryId = String(block?.categoryId ?? "").trim();
      const taken = new Set(
        (block?.subCategoryRows ?? [])
          .filter(
            (r) =>
              r.id !== rowId && String(r.subcategoryId ?? "").trim() !== ""
          )
          .map((r) => String(r.subcategoryId))
      );
      const loaded = categoryId
        ? subCategoriesByCategoryId[categoryId] ?? []
        : [];
      const rest = loaded.filter(
        (o) => o.value && !taken.has(String(o.value))
      );
      const opts: PartnerSelectOption[] = [
        { value: "", label: "Select sub category" },
        ...rest,
      ];
      const current = (block?.subCategoryRows ?? []).find((r) => r.id === rowId);
      const currentId = String(current?.subcategoryId ?? "").trim();
      if (currentId && !opts.some((o) => String(o.value) === currentId)) {
        opts.push({
          value: currentId,
          label: partnerSubCategoryLabelById.get(currentId) ?? currentId,
        });
      }
      return opts;
    },
    [safeBlocks, subCategoriesByCategoryId, partnerSubCategoryLabelById]
  );

  const serviceOptionsForPartnerBlockRow = useCallback(
    (
      block: PartnerCategoryBlock,
      subRow: PartnerSubCategoryRow,
      rowId: string
    ): PartnerSelectOption[] => {
      const categoryId = String(block.categoryId ?? "").trim();
      const subcategoryId = String(subRow.subcategoryId ?? "").trim();
      if (!categoryId) {
        return [{ value: "", label: "Select category first" }];
      }
      if (!subcategoryId) {
        return [{ value: "", label: "Select sub category first" }];
      }

      const rows = subRow.serviceRows ?? [];
      const currentRow = rows.find((r) => r.id === rowId);
      const currentSid = String(currentRow?.serviceId ?? "").trim();

      const selectedElsewhere = new Set(
        rows
          .filter((r) => r.id !== rowId)
          .map((r) => String(r.serviceId ?? "").trim())
          .filter(Boolean)
      );

      const fromSub = servicesBySubCategoryId[subcategoryId] ?? [];
      const baseList =
        fromSub.length > 0
          ? fromSub.map((s) => ({ _id: s._id, name: s.name }))
          : allServices
              .filter((svc) => {
                const svcSub = String(svc.subcategory_id ?? "").trim();
                if (svcSub) return svcSub === subcategoryId;
                return String(svc.category_id) === String(categoryId);
              })
              .map((s) => ({ _id: s._id, name: s.name }));

      const ordered: PartnerSelectOption[] = [];
      const seen = new Set<string>();

      for (const s of baseList) {
        const id = String(s._id).trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ordered.push({ value: id, label: String(s.name) });
      }

      const resolveLabel = (sid: string): string =>
        partnerServiceLabelById.get(sid) ??
        catalogServicesForBlocks.find((x) => String(x._id) === sid)?.name ??
        sid;

      if (currentSid && !seen.has(currentSid)) {
        ordered.push({ value: currentSid, label: resolveLabel(currentSid) });
      }

      const filtered = ordered.filter((o) => {
        if (o.value === currentSid) return true;
        return !selectedElsewhere.has(o.value);
      });

      return [{ value: "", label: "Select service" }, ...filtered];
    },
    [
      allServices,
      servicesBySubCategoryId,
      catalogServicesForBlocks,
      partnerServiceLabelById,
    ]
  );

  const loadSubCategoriesForCategory = useCallback(
    async (categoryId: string) => {
      const cid = String(categoryId ?? "").trim();
      if (!cid || catalogLocked) return;
      if ((subCategoriesByCategoryId[cid] ?? []).length > 0) return;
      if (subCategoriesLoadingRef.current.has(cid)) return;
      subCategoriesLoadingRef.current.add(cid);
      try {
        const params = new URLSearchParams({ category_id: cid });
        const res = await apiRequest(
          `/subcategory/getAll?${params.toString()}`,
          "GET",
          undefined,
          false,
          true
        );
        const options = res.success
          ? extractSubCategoryOptionsFromGetAll(res.data)
          : [];
        setSubCategoriesByCategoryId((prev) => ({
          ...prev,
          [cid]: options,
        }));
      } catch {
        setSubCategoriesByCategoryId((prev) => ({ ...prev, [cid]: [] }));
      } finally {
        subCategoriesLoadingRef.current.delete(cid);
      }
    },
    [catalogLocked, subCategoriesByCategoryId]
  );

  const loadServicesForSubCategory = useCallback(
    async (subcategoryId: string, categoryId?: string) => {
      const sid = String(subcategoryId ?? "").trim();
      if (!sid || catalogLocked) return;
      if ((servicesBySubCategoryId[sid] ?? []).length > 0) return;
      if (servicesBySubLoadingRef.current.has(sid)) return;
      servicesBySubLoadingRef.current.add(sid);
      const cid = String(categoryId ?? "").trim();
      try {
        const params = new URLSearchParams({ subcategory_id: sid });
        const res = await apiRequest(
          `/service/getAll?${params.toString()}`,
          "GET",
          undefined,
          false,
          true
        );
        const mapped = res.success
          ? extractServicesFromGetAll(res.data).map((s) => ({
              ...s,
              category_id: cid || s.category_id,
            }))
          : [];
        setServicesBySubCategoryId((prev) => ({
          ...prev,
          [sid]: mapped,
        }));
      } catch {
        setServicesBySubCategoryId((prev) => ({ ...prev, [sid]: [] }));
      } finally {
        servicesBySubLoadingRef.current.delete(sid);
      }
    },
    [catalogLocked, servicesBySubCategoryId]
  );

  useEffect(() => {
    if (didInit.current) return;

    const partnerServices = user.partner_services;
    if (Array.isArray(partnerServices) && partnerServices.length > 0) {
      didInit.current = true;
      const built = buildBlocksFromPartnerServices(partnerServices, allServices);
      captureInitialCatalogIds(
        built,
        initialBlockIdsRef,
        initialRowIdsRef,
        initialSubRowIdsRef
      );
      setBlocks(built);
      return;
    }

    if (initialServiceIds.length > 0 && allServices.length === 0) return;

    didInit.current = true;
    const built = buildBlocksFromInitial(
      initialServiceIds,
      allServices,
      user,
      initialCategoryIds
    );
    captureInitialCatalogIds(
      built,
      initialBlockIdsRef,
      initialRowIdsRef,
      initialSubRowIdsRef
    );
    setBlocks(built);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once when catalogs/user slices stabilize
  }, [
    allServices,
    initialServiceIds,
    initialCategoryIds,
    user.partner_services,
    user.service_descriptions,
    user.service_prices,
  ]);

  /** When services catalog loads, fill category/subcategory from service if API omitted them. */
  useEffect(() => {
    if (allServices.length === 0) return;
    setBlocks((prev) => {
      let changed = false;
      const next = ensurePartnerCatalogBlocks(prev).map((block) => {
        let nextBlock = block;
        const cid = String(nextBlock.categoryId ?? "").trim();
        if (!cid) {
          for (const sub of nextBlock.subCategoryRows) {
            for (const row of sub.serviceRows) {
              const sid = String(row.serviceId ?? "").trim();
              if (!sid) continue;
              const svc = allServices.find((s) => String(s._id) === sid);
              if (svc?.category_id) {
                changed = true;
                nextBlock = {
                  ...nextBlock,
                  categoryId: String(svc.category_id),
                };
                break;
              }
            }
            if (String(nextBlock.categoryId ?? "").trim()) break;
          }
        }
        const patchedSubs = nextBlock.subCategoryRows.map((sub) => {
          if (String(sub.subcategoryId ?? "").trim()) return sub;
          for (const row of sub.serviceRows) {
            const sid = String(row.serviceId ?? "").trim();
            if (!sid) continue;
            const svc = allServices.find((s) => String(s._id) === sid);
            const subId = String(svc?.subcategory_id ?? "").trim();
            if (subId) {
              changed = true;
              return { ...sub, subcategoryId: subId };
            }
          }
          return sub;
        });
        if (patchedSubs !== nextBlock.subCategoryRows) {
          nextBlock = syncBlockServiceRowsFromSubs({
            ...nextBlock,
            subCategoryRows: patchedSubs,
          });
        }
        return nextBlock;
      });
      return changed ? next : prev;
    });
  }, [allServices]);

  const loadServicesForCategory = useCallback(
    async (categoryId: string, options?: { force?: boolean }) => {
      const cid = String(categoryId ?? "").trim();
      if (!cid || catalogLocked) return;
      if (
        !options?.force &&
        (loadedServiceCategoryIdsRef.current.has(cid) ||
          loadingServiceCategoryIdsRef.current.has(cid))
      ) {
        return;
      }
      loadingServiceCategoryIdsRef.current.add(cid);
      try {
        const svcRes = await fetchService(
          1,
          5000,
          {
            status: "true",
            ...(cityId ? { city_id: cityId } : {}),
            ...(stateId ? { state_id: stateId } : {}),
          },
          [],
          catalogFranchiseApiId || undefined
        );
        const list =
          svcRes.response && Array.isArray(svcRes.services)
            ? svcRes.services
            : [];
        const mapped: PartnerCatalogServiceLite[] = [];
        for (const s of list) {
          if (normalizeServiceCategoryRef(s.category_id) !== cid) continue;
          const priceRaw =
            (s as { price?: number | null }).price ??
            (s as { minimum_deposit?: number | null }).minimum_deposit;
          const priceNum =
            priceRaw !== undefined && priceRaw !== null
              ? Number(priceRaw)
              : NaN;
          mapped.push({
            _id: String((s as { _id?: string })._id ?? ""),
            name: String((s as { name?: string }).name ?? ""),
            category_id: cid,
            price: Number.isFinite(priceNum) ? priceNum : undefined,
            payment_type: String(
              (s as { payment_type?: string }).payment_type ??
                (s as { min_deposit_type?: string }).min_deposit_type ??
                ""
            ).trim(),
          });
        }
        setServicesByCategoryId((prev) => ({ ...prev, [cid]: mapped }));
        loadedServiceCategoryIdsRef.current.add(cid);
      } catch {
        setServicesByCategoryId((prev) => ({ ...prev, [cid]: [] }));
      } finally {
        loadingServiceCategoryIdsRef.current.delete(cid);
      }
    },
    [catalogFranchiseApiId, catalogLocked, cityId, stateId]
  );

  /** Preload franchise-active services / sub categories when block category ids change. */
  useEffect(() => {
    if (catalogLocked || !blockCategoryIdsKey) return;
    for (const cid of blockCategoryIdsKey.split("|").filter(Boolean)) {
      void loadServicesForCategory(cid);
      void loadSubCategoriesForCategory(cid);
    }
  }, [
    blockCategoryIdsKey,
    catalogLocked,
    loadServicesForCategory,
    loadSubCategoriesForCategory,
  ]);

  /** Preload services for selected sub categories. */
  useEffect(() => {
    if (catalogLocked) return;
    for (const block of safeBlocks) {
      for (const sub of block.subCategoryRows ?? []) {
        const subId = String(sub.subcategoryId ?? "").trim();
        if (!subId) continue;
        void loadServicesForSubCategory(subId, block.categoryId);
      }
    }
  }, [safeBlocks, catalogLocked, loadServicesForSubCategory]);

  const addCategoryBlock = useCallback(() => {
    setBlocks((prev) => [
      ...ensurePartnerCatalogBlocks(prev),
      emptyPartnerCatalogBlockExt(""),
    ]);
  }, []);

  const removeCategoryBlock = useCallback((blockId: string) => {
    if (initialBlockIdsRef.current.has(blockId)) return;
    setBlocks((prev) => {
      const list = ensurePartnerCatalogBlocks(prev);
      return list.length <= 1
        ? list
        : list.filter((b) => b.id !== blockId);
    });
  }, []);

  const updateBlockActive = useCallback((blockId: string, is_active: boolean) => {
    setBlocks((prev) =>
      ensurePartnerCatalogBlocks(prev).map((b) =>
        b.id === blockId
          ? syncBlockServiceRowsFromSubs({
              ...b,
              is_active,
              subCategoryRows: (b.subCategoryRows ?? []).map((r) => ({
                ...r,
                is_active: is_active ? r.is_active !== false : false,
                serviceRows: (r.serviceRows ?? []).map((svc) => ({
                  ...svc,
                  is_active: is_active ? svc.is_active !== false : false,
                })),
              })),
            })
          : b
      )
    );
  }, []);

  const updateBlockCategory = useCallback(
    (blockId: string, categoryId: string) => {
      setBlocks((prev) =>
        ensurePartnerCatalogBlocks(prev).map((b) =>
          b.id === blockId
            ? syncBlockServiceRowsFromSubs({
                ...b,
                categoryId,
                subCategoryRows: [emptyPartnerSubCategoryRow()],
              })
            : b
        )
      );
      const cid = String(categoryId ?? "").trim();
      if (!cid || isExistingBlock(blockId)) return;
      void loadSubCategoriesForCategory(cid);
      loadedServiceCategoryIdsRef.current.delete(cid);
      void loadServicesForCategory(cid, { force: true });
    },
    [isExistingBlock, loadServicesForCategory, loadSubCategoriesForCategory]
  );

  const addSubCategoryRow = useCallback((blockId: string) => {
    setBlocks((prev) =>
      ensurePartnerCatalogBlocks(prev).map((b) =>
        b.id === blockId
          ? syncBlockServiceRowsFromSubs({
              ...b,
              subCategoryRows: [
                ...(b.subCategoryRows ?? []),
                emptyPartnerSubCategoryRow(),
              ],
            })
          : b
      )
    );
  }, []);

  const updateSubCategoryRow = useCallback(
    (
      blockId: string,
      rowId: string,
      patch: Partial<Omit<PartnerSubCategoryRow, "id" | "serviceRows">>
    ) => {
      setBlocks((prev) =>
        ensurePartnerCatalogBlocks(prev).map((b) =>
          b.id !== blockId
            ? b
            : syncBlockServiceRowsFromSubs({
                ...b,
                subCategoryRows: (b.subCategoryRows ?? []).map((r) => {
                  if (r.id !== rowId) return r;
                  const next = { ...r, ...patch };
                  if (
                    patch.subcategoryId !== undefined &&
                    String(patch.subcategoryId) !== String(r.subcategoryId)
                  ) {
                    next.serviceRows = [emptyPartnerServiceRow()];
                  }
                  if (patch.is_active === false) {
                    next.serviceRows = (next.serviceRows ?? []).map((svc) => ({
                      ...svc,
                      is_active: false,
                    }));
                  }
                  return next;
                }),
              })
        )
      );
      const subId = String(patch.subcategoryId ?? "").trim();
      if (subId) {
        const block = safeBlocks.find((b) => b.id === blockId);
        void loadServicesForSubCategory(subId, block?.categoryId);
      }
    },
    [loadServicesForSubCategory, safeBlocks]
  );

  const removeSubCategoryRow = useCallback((blockId: string, rowId: string) => {
    if (initialSubRowIdsRef.current.has(rowId)) return;
    setBlocks((prev) =>
      ensurePartnerCatalogBlocks(prev).map((b) => {
        if (b.id !== blockId) return b;
        const rows = b.subCategoryRows ?? [];
        if (rows.length <= 1) return b;
        return syncBlockServiceRowsFromSubs({
          ...b,
          subCategoryRows: rows.filter((r) => r.id !== rowId),
        });
      })
    );
  }, []);

  const addServiceRow = useCallback((blockId: string, subRowId: string) => {
    setBlocks((prev) =>
      ensurePartnerCatalogBlocks(prev).map((b) =>
        b.id !== blockId
          ? b
          : syncBlockServiceRowsFromSubs({
              ...b,
              subCategoryRows: (b.subCategoryRows ?? []).map((sub) =>
                sub.id === subRowId
                  ? {
                      ...sub,
                      serviceRows: [
                        ...(sub.serviceRows ?? []),
                        emptyPartnerServiceRow(),
                      ],
                    }
                  : sub
              ),
            })
      )
    );
  }, []);

  const updateServiceRow = useCallback(
    (
      blockId: string,
      subRowId: string,
      rowId: string,
      patch: Partial<Omit<PartnerServiceRow, "id">>
    ) => {
      setBlocks((prev) =>
        ensurePartnerCatalogBlocks(prev).map((b) =>
          b.id !== blockId
            ? b
            : syncBlockServiceRowsFromSubs({
                ...b,
                subCategoryRows: (b.subCategoryRows ?? []).map((sub) =>
                  sub.id !== subRowId
                    ? sub
                    : {
                        ...sub,
                        serviceRows: (sub.serviceRows ?? []).map((r) =>
                          r.id === rowId ? { ...r, ...patch } : r
                        ),
                      }
                ),
              })
        )
      );
    },
    []
  );

  const removeServiceRow = useCallback(
    (blockId: string, subRowId: string, rowId: string) => {
      if (initialRowIdsRef.current.has(rowId)) return;
      setBlocks((prev) =>
        ensurePartnerCatalogBlocks(prev).map((b) => {
          if (b.id !== blockId) return b;
          return syncBlockServiceRowsFromSubs({
            ...b,
            subCategoryRows: (b.subCategoryRows ?? []).map((sub) => {
              if (sub.id !== subRowId) return sub;
              const rows = sub.serviceRows ?? [];
              if (rows.length <= 1) return sub;
              return {
                ...sub,
                serviceRows: rows.filter((r) => r.id !== rowId),
              };
            }),
          });
        })
      );
    },
    []
  );

  const handleSave = async () => {
    if (!user.city_id) {
      showErrorAlert(
        "Partner must have a city before editing categories and services."
      );
      return;
    }
    if (!user._id) {
      showErrorAlert("Unable to update. ID is missing.");
      return;
    }

    const catalogFlat = flattenPartnerBlocksForSave(
      safeBlocks,
      catalogServicesForBlocks
    );
    if (!catalogFlat.ok) {
      showErrorAlert(catalogFlat.message);
      return;
    }

    const payload: Record<string, unknown> = {
      type: PARTNER_ROLE,
      is_from_web: true,
      registration_type: 1,
      created_by_id: getLocalStorage(AppConstant.createdById),
      name: user.name ?? "",
      email: user.email ?? "",
      phone_number: user.phone_number ?? "",
      address: user.address ?? "",
      state_id: user.state_id ?? "",
      city_id: user.city_id ?? "",
      is_active: user.is_active ?? true,
      pincode: user.pincode ?? "",
      category_ids: catalogFlat.category_ids,
      service_ids: catalogFlat.service_ids,
      service_names: catalogFlat.service_names,
      service_descriptions: catalogFlat.service_descriptions,
      service_prices: catalogFlat.service_prices,
      category_is_active: catalogFlat.category_is_active,
      service_is_active: catalogFlat.service_is_active,
      "partner-services": catalogFlat.partner_services,
      ...(user.profile_url && { profile_url: user.profile_url }),
    };

    setSaving(true);
    try {
      const ok = await createOrUpdateUser(payload, true, user._id);
      if (ok) {
        onSaved(catalogFlat.category_ids, catalogFlat.service_ids);
      }
    } finally {
      setSaving(false);
    }
  };

  const hoverIconBtn = (
    e: React.MouseEvent<HTMLButtonElement>,
    on: boolean
  ) => {
    (e.currentTarget as HTMLButtonElement).style.filter = on
      ? "brightness(0.94)"
      : "";
  };

  return (
    <Modal
      show={true}
      onHide={onClose}
      centered
      size="xl"
      enforceFocus={false}
      dialogClassName="custom-big-modal add-partner-modal edit-partner-catalog-modal-vh"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Edit categories &amp; sub category &amp; services
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        <section className="custom-other-details" style={{ padding: "10px" }}>
          <h3 className="mb-2">Categories and sub categories and services</h3>
          {catalogLocked ? (
            <p className="text-muted small mb-3">
              Unable to resolve this partner&apos;s franchise for the
              catalogue. Ensure the partner is linked to a franchise, or select
              a franchise in the header filter.
            </p>
          ) : null}

          {safeBlocks.map((block) => {
            const blockReadOnly = isExistingBlock(block.id);
            const categoryActive = block.is_active !== false;

            return (
              <div
                key={block.id}
                className="add-partner-catalog-block rounded-3 border px-3 py-3 mb-4"
                style={{
                  borderColor: "var(--lb1-border)",
                  backgroundColor: "var(--bg-color)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <div className="add-partner-catalog-grid add-partner-catalog-grid--category mb-3">
                  <div className="add-partner-catalog-field add-partner-catalog-field--category">
                    <PartnerSingleSelect
                      instanceId={`${block.id}-category`}
                      label="Category"
                      requiredMark
                      options={categorySelectOptionsForBlock(block)}
                      value={block.categoryId}
                      placeholder="Select category"
                      isDisabled={blockReadOnly || catalogLocked}
                      onChange={(cid) => updateBlockCategory(block.id, cid)}
                    />
                  </div>
                  <div className="add-partner-catalog-field add-partner-catalog-field--status">
                    <PartnerCatalogStatusToggle
                      inline
                      instanceId={`${block.id}-category-status`}
                      label="Status"
                      value={categoryActive}
                      disabled={catalogLocked}
                      onChange={(active) =>
                        updateBlockActive(block.id, active)
                      }
                    />
                  </div>
                  <div className="add-partner-catalog-field add-partner-catalog-field--actions">
                    <div className="add-partner-catalog-actions">
                      <button
                        type="button"
                        title="Add another category block"
                        aria-label="Add another category block"
                        style={partnerCatalogOutlineAddBtn}
                        disabled={catalogLocked}
                        onClick={addCategoryBlock}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={(e) => hoverIconBtn(e, true)}
                        onMouseLeave={(e) => hoverIconBtn(e, false)}
                      >
                        <i className="bi bi-plus fs-6" aria-hidden />
                      </button>
                      {!blockReadOnly && safeBlocks.length > 1 ? (
                        <button
                          type="button"
                          title="Remove this category block"
                          aria-label="Remove this category block"
                          style={partnerCatalogOutlineRemoveBtn}
                          onClick={() => removeCategoryBlock(block.id)}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={(e) => hoverIconBtn(e, true)}
                          onMouseLeave={(e) => hoverIconBtn(e, false)}
                        >
                          <i className="bi bi-dash-lg fs-6" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                {(block.subCategoryRows ?? []).map((subRow) => {
                  const subReadOnly = isExistingSubRow(subRow.id);
                  const subActive =
                    categoryActive && subRow.is_active !== false;
                  return (
                    <React.Fragment key={subRow.id}>
                      <div className="add-partner-catalog-grid add-partner-catalog-grid--category mb-3">
                        <div className="add-partner-catalog-field add-partner-catalog-field--category">
                          <PartnerSingleSelect
                            instanceId={`${block.id}-${subRow.id}-subcategory`}
                            label="Sub Category"
                            requiredMark
                            options={subCategorySelectOptionsForRow(
                              block.id,
                              subRow.id
                            )}
                            value={subRow.subcategoryId}
                            placeholder={
                              String(block.categoryId ?? "").trim()
                                ? "Select sub category"
                                : "Select category first"
                            }
                            isDisabled={
                              subReadOnly ||
                              catalogLocked ||
                              !String(block.categoryId ?? "").trim()
                            }
                            onMenuOpen={() => {
                              void loadSubCategoriesForCategory(
                                block.categoryId
                              );
                            }}
                            onChange={(sid) => {
                              updateSubCategoryRow(block.id, subRow.id, {
                                subcategoryId: sid,
                              });
                            }}
                          />
                        </div>
                        <div className="add-partner-catalog-field add-partner-catalog-field--status">
                          <PartnerCatalogStatusToggle
                            inline
                            instanceId={`${block.id}-${subRow.id}-subcategory-status`}
                            label="Status"
                            value={subActive}
                            disabled={catalogLocked || !categoryActive}
                            onChange={(active) => {
                              if (!categoryActive) return;
                              updateSubCategoryRow(block.id, subRow.id, {
                                is_active: active,
                              });
                            }}
                          />
                        </div>
                        <div className="add-partner-catalog-field add-partner-catalog-field--actions">
                          <div className="add-partner-catalog-actions">
                            <button
                              type="button"
                              title="Add another sub category with service"
                              aria-label="Add another sub category with service"
                              style={partnerCatalogOutlineAddBtn}
                              disabled={
                                catalogLocked ||
                                !String(block.categoryId ?? "").trim()
                              }
                              onClick={() => addSubCategoryRow(block.id)}
                              onMouseDown={(e) => e.preventDefault()}
                              onMouseEnter={(e) => hoverIconBtn(e, true)}
                              onMouseLeave={(e) => hoverIconBtn(e, false)}
                            >
                              <i className="bi bi-plus fs-6" aria-hidden />
                            </button>
                            {!subReadOnly &&
                            (block.subCategoryRows ?? []).length > 1 ? (
                              <button
                                type="button"
                                title="Remove this sub category"
                                aria-label="Remove this sub category"
                                style={partnerCatalogOutlineRemoveBtn}
                                onClick={() =>
                                  removeSubCategoryRow(block.id, subRow.id)
                                }
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={(e) => hoverIconBtn(e, true)}
                                onMouseLeave={(e) => hoverIconBtn(e, false)}
                              >
                                <i
                                  className="bi bi-dash-lg fs-6"
                                  aria-hidden
                                />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {(subRow.serviceRows ?? []).map((row) => {
                        const rowReadOnly = isExistingRow(row.id);
                        const serviceActive =
                          subActive && row.is_active !== false;
                        const subcategoryId = String(
                          subRow.subcategoryId ?? ""
                        ).trim();
                        const selectedService = (() => {
                          const sid = String(row.serviceId ?? "").trim();
                          if (!subcategoryId || !sid) return undefined;
                          const list =
                            servicesBySubCategoryId[subcategoryId] ??
                            allServices.filter(
                              (s) =>
                                String(s.subcategory_id ?? "") ===
                                  subcategoryId ||
                                String(s.category_id) ===
                                  String(block.categoryId ?? "")
                            );
                          return list.find((s) => String(s._id) === sid);
                        })();
                        const priceFieldLabel = partnerCatalogPriceLabel(
                          selectedService?.payment_type
                        );

                        return (
                          <div
                            key={row.id}
                            className="add-partner-catalog-grid add-partner-catalog-grid--service mb-2"
                          >
                            <div className="add-partner-catalog-field add-partner-catalog-field--service">
                              <PartnerSingleSelect
                                instanceId={`${block.id}-${subRow.id}-${row.id}-service`}
                                label="Service"
                                requiredMark
                                options={serviceOptionsForPartnerBlockRow(
                                  block,
                                  subRow,
                                  row.id
                                )}
                                value={row.serviceId}
                                placeholder={
                                  subcategoryId
                                    ? "Select service"
                                    : "Select sub category first"
                                }
                                isDisabled={
                                  rowReadOnly ||
                                  catalogLocked ||
                                  !subActive ||
                                  !subcategoryId
                                }
                                onMenuOpen={() => {
                                  if (!subcategoryId) return;
                                  void loadServicesForSubCategory(
                                    subcategoryId,
                                    block.categoryId
                                  );
                                }}
                                onChange={(sid) => {
                                  const list =
                                    servicesBySubCategoryId[subcategoryId] ??
                                    [];
                                  const hit = list.find(
                                    (s) => String(s._id) === String(sid)
                                  );
                                  const priceNum =
                                    hit?.price !== undefined &&
                                    hit?.price !== null
                                      ? Number(hit.price)
                                      : NaN;
                                  const priceStr = Number.isFinite(priceNum)
                                    ? String(priceNum)
                                    : "";
                                  updateServiceRow(
                                    block.id,
                                    subRow.id,
                                    row.id,
                                    {
                                      serviceId: sid,
                                      ...(priceStr ? { price: priceStr } : {}),
                                    }
                                  );
                                }}
                              />
                            </div>
                            <div className="add-partner-catalog-field add-partner-catalog-field--description">
                              <Form.Group
                                controlId={`desc-${block.id}-${subRow.id}-${row.id}`}
                              >
                                <Form.Label className="fw-medium mb-1">
                                  <FieldLabelText
                                    label="Description"
                                    required
                                  />
                                </Form.Label>
                                <Form.Control
                                  as="textarea"
                                  rows={1}
                                  className="custom-form-input"
                                  style={{
                                    ...partnerCatalogControlStyle,
                                    resize: "none",
                                    overflowY: "hidden",
                                    lineHeight: "1.5",
                                  }}
                                  placeholder="Describe this offering"
                                  value={row.description}
                                  ref={(el: HTMLElement | null) => {
                                    if (el) adjustPartnerDescHeight(el);
                                  }}
                                  onChange={(e) => {
                                    adjustPartnerDescHeight(e.currentTarget);
                                    updateServiceRow(
                                      block.id,
                                      subRow.id,
                                      row.id,
                                      {
                                        description: e.target.value,
                                      }
                                    );
                                  }}
                                />
                              </Form.Group>
                            </div>
                            <div className="add-partner-catalog-field add-partner-catalog-field--price">
                              <Form.Group
                                controlId={`price-${block.id}-${subRow.id}-${row.id}`}
                              >
                                <Form.Label className="fw-medium mb-1">
                                  <FieldLabelText
                                    label={priceFieldLabel}
                                    required
                                  />
                                </Form.Label>
                                <InputGroup>
                                  <InputGroup.Text
                                    className="custom-form-input text-muted"
                                    style={{
                                      ...partnerCatalogControlStyle,
                                      borderTopRightRadius: 0,
                                      borderBottomRightRadius: 0,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {AppConstant.currencySymbol}
                                  </InputGroup.Text>
                                  <Form.Control
                                    type="text"
                                    inputMode="decimal"
                                    className="custom-form-input border-start-0"
                                    style={{
                                      ...partnerCatalogControlStyle,
                                      borderLeft: 0,
                                      borderTopLeftRadius: 0,
                                      borderBottomLeftRadius: 0,
                                    }}
                                    placeholder="e.g. 499"
                                    value={row.price}
                                    onChange={(e) =>
                                      updateServiceRow(
                                        block.id,
                                        subRow.id,
                                        row.id,
                                        {
                                          price: e.target.value,
                                        }
                                      )
                                    }
                                  />
                                </InputGroup>
                              </Form.Group>
                            </div>
                            <div className="add-partner-catalog-field add-partner-catalog-field--status">
                              <PartnerCatalogStatusToggle
                                inline
                                instanceId={`${block.id}-${subRow.id}-${row.id}-service-status`}
                                label="Status"
                                value={serviceActive}
                                disabled={catalogLocked || !subActive}
                                onChange={(active) => {
                                  if (!subActive) return;
                                  updateServiceRow(
                                    block.id,
                                    subRow.id,
                                    row.id,
                                    {
                                      is_active: active,
                                    }
                                  );
                                }}
                              />
                            </div>
                            <div className="add-partner-catalog-field add-partner-catalog-field--actions">
                              <div className="add-partner-catalog-actions">
                                <button
                                  type="button"
                                  title="Add another service under this sub category"
                                  aria-label="Add another service under this sub category"
                                  style={partnerCatalogOutlineAddBtn}
                                  disabled={
                                    catalogLocked ||
                                    !subActive ||
                                    !subcategoryId
                                  }
                                  onClick={() =>
                                    addServiceRow(block.id, subRow.id)
                                  }
                                  onMouseDown={(e) => e.preventDefault()}
                                  onMouseEnter={(e) => hoverIconBtn(e, true)}
                                  onMouseLeave={(e) => hoverIconBtn(e, false)}
                                >
                                  <i className="bi bi-plus fs-6" aria-hidden />
                                </button>
                                {!rowReadOnly &&
                                (subRow.serviceRows ?? []).length > 1 ? (
                                  <button
                                    type="button"
                                    title="Remove this service row"
                                    aria-label="Remove this service row"
                                    style={partnerCatalogOutlineRemoveBtn}
                                    onClick={() =>
                                      removeServiceRow(
                                        block.id,
                                        subRow.id,
                                        row.id
                                      )
                                    }
                                    onMouseDown={(e) => e.preventDefault()}
                                    onMouseEnter={(e) =>
                                      hoverIconBtn(e, true)
                                    }
                                    onMouseLeave={(e) =>
                                      hoverIconBtn(e, false)
                                    }
                                  >
                                    <i
                                      className="bi bi-dash-lg fs-6"
                                      aria-hidden
                                    />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })}
        </section>
        <div className="mt-4 text-center d-flex justify-content-end gap-3">
          <Button
            type="button"
            className="custom-btn-primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            Save
          </Button>
          <Button
            type="button"
            className="custom-btn-secondary"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
}

export default EditPartnerCategoriesServicesDialogView;
