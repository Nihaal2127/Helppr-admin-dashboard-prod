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
};

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
  rowIdsRef: React.MutableRefObject<Set<string>>
) {
  const blockIds = new Set<string>();
  const rowIds = new Set<string>();
  for (const b of blocks) {
    const cid = String(b.categoryId ?? "").trim();
    const rowsWithService = b.serviceRows.filter((r) =>
      String(r.serviceId ?? "").trim()
    );
    if (cid) blockIds.add(b.id);
    if (rowsWithService.length > 0) blockIds.add(b.id);
    for (const r of rowsWithService) {
      rowIds.add(r.id);
    }
  }
  blockIdsRef.current = blockIds;
  rowIdsRef.current = rowIds;
}

export type EditPartnerCategoriesServicesDialogProps = {
  user: UserModel;
  initialCategoryIds: string[];
  initialServiceIds: string[];
  onClose: () => void;
  onSaved: (categoryIds: string[], serviceIds: string[]) => void;
};

/** Group flat `service_ids` into blocks: consecutive services with the same category share one block. */
function buildBlocksFromInitial(
  serviceIds: string[],
  allServices: ServiceLite[],
  user: UserModel,
  initialCategoryIds: string[]
): PartnerCategoryBlock[] {
  if (serviceIds.length === 0) {
    return [emptyPartnerCatalogBlock(initialCategoryIds[0] ?? "")];
  }

  const blocks: PartnerCategoryBlock[] = [];
  let flatIndex = 0;

  for (const sid of serviceIds) {
    const svc = allServices.find((s) => String(s._id) === String(sid));
    const cid = svc ? String(svc.category_id) : initialCategoryIds[0] ?? "";
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
    if (last && String(last.categoryId) === String(cid) && cid) {
      last.serviceRows.push(row);
    } else {
      blocks.push({
        id: newPartnerCatalogRowId(),
        categoryId: cid,
        is_active: categoryActiveFromUser(user, cid, initialCategoryIds),
        serviceRows: [row],
      });
    }
  }

  return blocks.length > 0
    ? blocks
    : [emptyPartnerCatalogBlock(initialCategoryIds[0] ?? "")];
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

/** Build edit blocks from `partner_services` rows (user-by-id API). */
function buildBlocksFromPartnerServices(
  partnerServices: PartnerServiceApiRow[],
  allServices: ServiceLite[] = []
): PartnerCategoryBlock[] {
  const blocks: PartnerCategoryBlock[] = [];

  for (const ps of partnerServices) {
    const sid = partnerServiceRefId(ps.service_id);
    let cid = partnerServiceRefId(ps.category_id);
    if (!cid && sid) {
      const svc = allServices.find((s) => String(s._id) === String(sid));
      if (svc?.category_id) cid = String(svc.category_id);
    }
    const row: PartnerServiceRow = {
      id: newPartnerCatalogRowId(),
      serviceId: sid,
      description: String(ps.description ?? "").trim(),
      price:
        ps.price != null && ps.price !== "" ? String(ps.price) : "",
      is_active: resolveActiveFlag(
        (ps as { is_active?: unknown }).is_active,
        true
      ),
    };

    const last = blocks[blocks.length - 1];
    if (last && String(last.categoryId) === String(cid) && cid) {
      last.serviceRows.push(row);
    } else {
      blocks.push({
        id: newPartnerCatalogRowId(),
        categoryId: cid,
        is_active: resolveActiveFlag(
          (ps as { category_is_active?: unknown }).category_is_active ??
            (ps as { is_active?: unknown }).is_active,
          true
        ),
        serviceRows: [row],
      });
    }
  }

  return blocks.length > 0 ? blocks : [emptyPartnerCatalogBlock("")];
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
  const [blocks, setBlocks] = useState<PartnerCategoryBlock[]>([]);
  const [saving, setSaving] = useState(false);

  const initialBlockIdsRef = useRef<Set<string>>(new Set());
  const initialRowIdsRef = useRef<Set<string>>(new Set());
  const didInit = useRef(false);
  const loadedServiceCategoryIdsRef = useRef<Set<string>>(new Set());
  const loadingServiceCategoryIdsRef = useRef<Set<string>>(new Set());

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
    const ids = blocks
      .map((b) => String(b.categoryId ?? "").trim())
      .filter(Boolean);
    const unique = ids.filter((id, i) => ids.indexOf(id) === i);
    unique.sort();
    return unique.join("|");
  }, [blocks]);

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
    for (const list of Object.values(servicesByCategoryId)) {
      for (const s of list) {
        const id = String(s._id).trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(s);
      }
    }
    return out;
  }, [allServices, servicesByCategoryId]);

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
        blocks
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
    [categoryOptions, blocks, partnerCategoryLabelById]
  );

  const serviceOptionsForPartnerBlockRow = useCallback(
    (block: PartnerCategoryBlock, rowId: string): PartnerSelectOption[] => {
      const categoryId = String(block.categoryId ?? "").trim();
      if (!categoryId) {
        return [{ value: "", label: "Select category first" }];
      }

      const currentRow = block.serviceRows.find((r) => r.id === rowId);
      const currentSid = String(currentRow?.serviceId ?? "").trim();

      const selectedElsewhere = new Set(
        block.serviceRows
          .filter((r) => r.id !== rowId)
          .map((r) => String(r.serviceId ?? "").trim())
          .filter(Boolean)
      );

      const fromCategory = servicesByCategoryId[categoryId] ?? [];
      const baseList =
        fromCategory.length > 0
          ? fromCategory.map((s) => ({ _id: s._id, name: s.name }))
          : allServices
              .filter((svc) => String(svc.category_id) === String(categoryId))
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
    [allServices, servicesByCategoryId, catalogServicesForBlocks, partnerServiceLabelById]
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
        initialRowIdsRef
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
    captureInitialCatalogIds(built, initialBlockIdsRef, initialRowIdsRef);
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

  /** When services catalog loads, fill category from service if API row omitted `category_id`. */
  useEffect(() => {
    if (allServices.length === 0) return;
    setBlocks((prev) => {
      let changed = false;
      const next = prev.map((block) => {
        const cid = String(block.categoryId ?? "").trim();
        if (cid) return block;
        for (const row of block.serviceRows) {
          const sid = String(row.serviceId ?? "").trim();
          if (!sid) continue;
          const svc = allServices.find((s) => String(s._id) === sid);
          if (svc?.category_id) {
            changed = true;
            return { ...block, categoryId: String(svc.category_id) };
          }
        }
        return block;
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

  /** Preload franchise-active services when block category ids change (not on description/price typing). */
  useEffect(() => {
    if (catalogLocked || !blockCategoryIdsKey) return;
    for (const cid of blockCategoryIdsKey.split("|").filter(Boolean)) {
      void loadServicesForCategory(cid);
    }
  }, [blockCategoryIdsKey, catalogLocked, loadServicesForCategory]);

  const addCategoryBlock = useCallback(() => {
    setBlocks((prev) => [...prev, emptyPartnerCatalogBlock("")]);
  }, []);

  const removeCategoryBlock = useCallback((blockId: string) => {
    if (initialBlockIdsRef.current.has(blockId)) return;
    setBlocks((prev) =>
      prev.length <= 1 ? prev : prev.filter((b) => b.id !== blockId)
    );
  }, []);

  const removeServiceRow = useCallback((blockId: string, rowId: string) => {
    if (initialRowIdsRef.current.has(rowId)) return;
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        if (b.serviceRows.length <= 1) return b;
        return {
          ...b,
          serviceRows: b.serviceRows.filter((r) => r.id !== rowId),
        };
      })
    );
  }, []);

  const updateBlockActive = useCallback((blockId: string, is_active: boolean) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              is_active,
              serviceRows: (b.serviceRows ?? []).map((r) => ({
                ...r,
                is_active: is_active ? r.is_active !== false : false,
              })),
            }
          : b
      )
    );
  }, []);

  const updateBlockCategory = useCallback(
    (blockId: string, categoryId: string) => {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId
            ? {
                ...b,
                categoryId,
                serviceRows: b.serviceRows.map((r) => ({
                  ...r,
                  serviceId: "",
                  price: "",
                })),
              }
            : b
        )
      );
      const cid = String(categoryId ?? "").trim();
      if (!cid || isExistingBlock(blockId)) return;
      loadedServiceCategoryIdsRef.current.delete(cid);
      void loadServicesForCategory(cid, { force: true });
    },
    [isExistingBlock, loadServicesForCategory]
  );

  const addServiceRow = useCallback((blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              serviceRows: [...b.serviceRows, emptyPartnerServiceRow()],
            }
          : b
      )
    );
  }, []);

  const updateServiceRow = useCallback(
    (
      blockId: string,
      rowId: string,
      patch: Partial<Omit<PartnerServiceRow, "id">>
    ) => {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id !== blockId
            ? b
            : {
                ...b,
                serviceRows: b.serviceRows.map((r) =>
                  r.id === rowId ? { ...r, ...patch } : r
                ),
              }
        )
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
      blocks,
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
          Edit categories &amp; services
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        <section className="custom-other-details" style={{ padding: "10px" }}>
          <h3 className="mb-2">Categories and services</h3>
          {catalogLocked ? (
            <p className="text-muted small mb-3">
              Unable to resolve this partner&apos;s franchise for the
              catalogue. Ensure the partner is linked to a franchise, or select
              a franchise in the header filter.
            </p>
          ) : null}

          {blocks.map((block) => {
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
                      {!blockReadOnly && blocks.length > 1 ? (
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

                {block.serviceRows.map((row) => {
                  const rowReadOnly = isExistingRow(row.id);
                  const serviceActive =
                    categoryActive && row.is_active !== false;
                  const categoryId = String(block.categoryId ?? "").trim();
                  const selectedService = (() => {
                    const sid = String(row.serviceId ?? "").trim();
                    if (!categoryId || !sid) return undefined;
                    const list =
                      servicesByCategoryId[categoryId] ??
                      allServices.filter(
                        (s) => String(s.category_id) === categoryId
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
                          instanceId={`${block.id}-${row.id}-service`}
                          label="Service"
                          requiredMark
                          options={serviceOptionsForPartnerBlockRow(
                            block,
                            row.id
                          )}
                          value={row.serviceId}
                          placeholder="Select service"
                          isDisabled={
                            rowReadOnly ||
                            catalogLocked ||
                            !categoryActive
                          }
                          onChange={(sid) => {
                            updateServiceRow(block.id, row.id, {
                              serviceId: sid,
                            });
                          }}
                        />
                      </div>
                      <div className="add-partner-catalog-field add-partner-catalog-field--description">
                        <Form.Group controlId={`desc-${block.id}-${row.id}`}>
                          <Form.Label className="fw-medium mb-1">
                            <FieldLabelText label="Description" required />
                          </Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={1}
                            className="custom-form-input"
                            style={{
                              ...partnerCatalogControlStyle,
                              resize: "vertical",
                            }}
                            placeholder="Describe this offering"
                            value={row.description}
                            onChange={(e) =>
                              updateServiceRow(block.id, row.id, {
                                description: e.target.value,
                              })
                            }
                          />
                        </Form.Group>
                      </div>
                      <div className="add-partner-catalog-field add-partner-catalog-field--price">
                        <Form.Group controlId={`price-${block.id}-${row.id}`}>
                          <Form.Label className="fw-medium mb-1">
                            <FieldLabelText label={priceFieldLabel} required />
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
                                updateServiceRow(block.id, row.id, {
                                  price: e.target.value,
                                })
                              }
                            />
                          </InputGroup>
                        
                        </Form.Group>
                      </div>
                      <div className="add-partner-catalog-field add-partner-catalog-field--status">
                        <PartnerCatalogStatusToggle
                          inline
                          instanceId={`${block.id}-${row.id}-service-status`}
                          label="Status"
                          value={serviceActive}
                          disabled={catalogLocked || !categoryActive}
                          onChange={(active) => {
                            if (!categoryActive) return;
                            updateServiceRow(block.id, row.id, {
                              is_active: active,
                            });
                          }}
                        />
                      </div>
                      <div className="add-partner-catalog-field add-partner-catalog-field--actions">
                        <div className="add-partner-catalog-actions">
                          <button
                            type="button"
                            title="Add another service in this category"
                            aria-label="Add another service in this category"
                            style={partnerCatalogOutlineAddBtn}
                            disabled={catalogLocked || !categoryActive}
                            onClick={() => addServiceRow(block.id)}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={(e) => hoverIconBtn(e, true)}
                            onMouseLeave={(e) => hoverIconBtn(e, false)}
                          >
                            <i className="bi bi-plus fs-6" aria-hidden />
                          </button>
                          {!rowReadOnly && block.serviceRows.length > 1 ? (
                            <button
                              type="button"
                              title="Remove this service row"
                              aria-label="Remove this service row"
                              style={partnerCatalogOutlineRemoveBtn}
                              onClick={() =>
                                removeServiceRow(block.id, row.id)
                              }
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
