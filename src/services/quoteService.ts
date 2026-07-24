import type {
  QuoteRow,
  QuoteTabKey,
} from "../lib/types/quoteTypes";
import {
  APP_USER_TYPE,
  fetchPartnerDropDown,
  fetchUserDropDown,
} from "./userService";
import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";
import { fetchCategoryDropDown } from "./categoryService";
import { fetchServiceById, fetchServiceDropDown } from "./servicesService";
import type { ServiceDropDownOption } from "./servicesService";
import { normalizeServiceCategoryRef } from "./servicesService";
import {
  extractMinDepositTypeKey,
  labelForMinDepositType,
} from "../lib/service/serviceMinDepositDisplay";
import { getLocalStorage } from "../lib/global/localStorageHelper";
import { AppConstant, UserRole } from "../lib/global/AppConstant";
import { franchiseIdForApiQuery } from "../lib/franchise/headerFranchisePreference";
import {
  displayStateName,
  stripKnownAddressParts,
} from "../lib/quote/quoteAddressCore";
import {
  ceilWholeDaysInclusive,
  ceilWholeHoursBetweenHHmm,
  scheduleTotalWorkHours,
} from "../lib/quote/scheduleBillingDuration";

export type OptionType = { value: string; label: string };

/** How the Add Quote form collects schedule fields for a chosen service. */
export type QuoteServiceScheduleMode = "single" | "range" | "hourly";

export type QuoteUserOption = OptionType & { user_name: string };

/**
 * Maps a service label to schedule UI: one day, date range, or one day with time window.
 * Heuristic over mock labels; with live API, options use real service names from dropdown.
 */
export function getQuoteServiceScheduleMode(
  serviceLabel: string
): QuoteServiceScheduleMode {
  const s = String(serviceLabel || "")
    .toLowerCase()
    .trim();
  if (!s) return "single";

  if (
    /sofa|deep cleaning|full home|termite|painting|marble polishing|office sanitization|terrace waterproof|elevator|home cleaning and dusting/.test(
      s
    )
  ) {
    return "range";
  }
  if (
    /repair|ac |^ac |split ac|geyser|microwave|refrigerator|washing machine|cctv|laptop|electrical|plumbing|kitchen sink|pest control|installation|install|chimney|led tv|inverter|water tank|bathroom sanitization|garden|curtain|window mesh|roof leak|false ceiling|glass facade|wooden flooring/.test(
      s
    )
  ) {
    return "hourly";
  }
  return "single";
}

/**
 * Add-quote schedule layout from service `payment_type` / `min_deposit_type`, with label fallback when API omits type.
 * - **per_day**, **per_month** → date range + daily time window (`range`).
 * - **per_hour**, **per_consultancy** → single date + start/end times (`hourly`).
 */
export function getQuoteScheduleModeFromServiceOption(opts: {
  payment_type?: string;
  label: string;
}): QuoteServiceScheduleMode {
  const payType = str(opts.payment_type);
  const key = extractMinDepositTypeKey(payType);
  if (key === "per_day" || key === "per_month") return "range";
  if (key === "per_hour" || key === "per_consultancy") return "hourly";
  if (payType) return "hourly";
  return getQuoteServiceScheduleMode(str(opts.label));
}

/** Schedule layout from catalog option + partner `active_services_providing` row. */
export function getQuoteScheduleModeForPartnerService(
  serviceOption: { payment_type?: string; label?: string } | undefined,
  partner: Record<string, unknown> | null | undefined,
  serviceId: string | undefined | null
): QuoteServiceScheduleMode {
  const row = getPartnerActiveServiceProvidingRow(partner, serviceId);
  const nested = row?.service as Record<string, unknown> | undefined;
  return getQuoteScheduleModeFromServiceOption({
    payment_type: firstNonEmptyPaymentType(
      serviceOption?.payment_type,
      row?.payment_type,
      row?.min_deposit_type,
      nested?.payment_type,
      nested?.min_deposit_type
    ),
    label: str(serviceOption?.label ?? nested?.name ?? nested?.service_name),
  });
}

export type QuoteListSort = ServerTableSortBy;

export type QuoteListFilters = {
  keyword?: string;
  from_date?: string | null;
  to_date?: string | null;
  /** When set, appended to `GET /quote/getAll` (franchise-scoped list). */
  franchise_id?: string | null;
};

/**
 * Raw `record` from `GET /franchise/related-catalog/:id`.
 *
 * Current API (partner-scoped catalog):
 * - `franchise` — `_id`, `name`, `area_id[]`
 * - `partners[]` — each with `active_services_providing[]` (nested `service`) and
 *   `active_categories_providing[]` (nested `category`, `services[]` id list)
 * - `employees[]`, `customers[]` (customers include `addresses[]` with `area_id`)
 *
 * Legacy optional top-level: `categories`, `services`, `franchise_categories`, `franchise_services`.
 */
export type FranchiseRelatedCatalogRecord = {
  franchise?: {
    _id?: string;
    name?: string;
    area_id?: unknown;
    pincode?: string;
    pincodes?: unknown[];
  };
  franchise_categories?: unknown[];
  franchise_services?: unknown[];
  categories?: unknown[];
  services?: unknown[];
  partners?: unknown[];
  employees?: unknown[];
  customers?: unknown[];
  areas?: unknown[];
  franchise_areas?: unknown[];
};

function asObjectRecords(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x != null && typeof x === "object") as Record<
    string,
    unknown
  >[];
}

/** One in-flight `related-catalog` request per franchise id (quote page + effect may both ask). */
const relatedCatalogInflight = new Map<
  string,
  Promise<{ success: boolean; record: FranchiseRelatedCatalogRecord | null }>
>();

/**
 * Loads franchise-scoped categories, services, partners, and employees in one call
 * (`GET /franchise/related-catalog/:franchiseId`).
 */
export async function fetchFranchiseRelatedCatalog(
  franchiseId: string
): Promise<{ success: boolean; record: FranchiseRelatedCatalogRecord | null }> {
  const id = str(franchiseId);
  if (!id) return { success: false, record: null };

  const existing = relatedCatalogInflight.get(id);
  if (existing) return existing;

  const p = (async (): Promise<{
    success: boolean;
    record: FranchiseRelatedCatalogRecord | null;
  }> => {
    const res = await apiRequest(
      ApiPaths.GET_FRANCHISE_RELATED_CATALOG(id),
      "GET",
      undefined,
      false,
      true,
      true
    );
    if (!res.success) return { success: false, record: null };
    const raw =
      (res.data as { record?: unknown })?.record ??
      (res.data as { data?: { record?: unknown } })?.data?.record;
    if (!raw || typeof raw !== "object")
      return { success: true, record: { categories: [], services: [] } };
    return { success: true, record: raw as FranchiseRelatedCatalogRecord };
  })();

  relatedCatalogInflight.set(id, p);
  void p.finally(() => {
    relatedCatalogInflight.delete(id);
  });
  return p;
}

export type MappedFranchiseQuoteCatalog = {
  quoteCategoryOptions: OptionType[];
  quoteCatalogServices: ServiceDropDownOption[];
  quotePartnerRecords: Record<string, unknown>[];
  quoteEmployeeOptions: OptionType[];
  quoteEmployeeRecords: Record<string, unknown>[];
  quoteUserOptions: QuoteUserOption[];
  /** Same customers as `quoteUserOptions` — full rows for addresses without `GET /user/get/:id`. */
  quoteCustomerRecords: Record<string, unknown>[];
};

function categoryIdFromFranchiseCategoryRow(
  fc: Record<string, unknown>
): string {
  const nested = fc.category as Record<string, unknown> | undefined;
  return str(
    fc.category_id ??
      nested?._id ??
      nested?.id ??
      fc.franchise_category_id
  );
}

function categoryNameFromFranchiseCategoryRow(
  fc: Record<string, unknown>
): string {
  const nested = fc.category as Record<string, unknown> | undefined;
  return str(fc.name ?? nested?.name ?? nested?.category_name);
}

/** Staging `record.categories[]`: `{ category_id, is_active, category?: { _id, name } }`. */
function categoryIdFromHydratedRow(c: Record<string, unknown>): string {
  const nested = c.category as Record<string, unknown> | undefined;
  return str(
    c.category_id ?? nested?._id ?? nested?.id ?? c._id ?? c.id
  );
}

function categoryNameFromHydratedRow(c: Record<string, unknown>): string {
  const nested = c.category as Record<string, unknown> | undefined;
  return str(
    nested?.name ?? nested?.category_name ?? c.name ?? c.category_name
  );
}

function mergeCategoriesFromFranchiseCategoryDocs(
  record: FranchiseRelatedCatalogRecord,
  catById: Map<string, string>
): void {
  for (const doc of asObjectRecords(record.franchise_categories)) {
    const list = doc.categories_list;
    if (!Array.isArray(list)) {
      const id = categoryIdFromFranchiseCategoryRow(doc);
      if (!id) continue;
      const active = doc.is_active !== false && doc.is_active !== 0;
      if ("is_active" in doc && !active) continue;
      const name = categoryNameFromFranchiseCategoryRow(doc) || id;
      if (!catById.has(id)) catById.set(id, name);
      continue;
    }
    const activeSet = new Set(
      Array.isArray(doc.active_categories)
        ? (doc.active_categories as unknown[]).map((x) => str(x)).filter(Boolean)
        : []
    );
    for (const row of asObjectRecords(list as unknown[])) {
      const cid = str(row.category_id ?? row._id ?? row.id);
      if (!cid) continue;
      if (activeSet.size > 0 && !activeSet.has(cid)) continue;
      if (row.is_active === false || row.is_active === 0) continue;
      const nested = row.category as Record<string, unknown> | undefined;
      const name =
        str(nested?.name ?? nested?.category_name) ||
        categoryNameFromFranchiseCategoryRow(row) ||
        cid;
      if (!catById.has(cid)) catById.set(cid, name);
    }
  }
}

function collectFranchiseActiveServiceIds(
  record: FranchiseRelatedCatalogRecord
): Set<string> {
  const ids = new Set<string>();
  for (const doc of asObjectRecords(record.franchise_services)) {
    if (!Array.isArray(doc.active_services)) continue;
    for (const x of doc.active_services as unknown[]) {
      const id = str(x);
      if (id) ids.add(id);
    }
  }
  if (!ids.size) {
    for (const partner of asObjectRecords(record.partners)) {
      if (!isPartnerRecordEligible(partner)) continue;
      for (const row of partnerServicesProvidingRows(partner)) {
        const inner = row.service as Record<string, unknown> | undefined;
        const sid =
          normalizeMongoRef(row.service_id) ||
          (inner ? normalizeMongoRef(inner._id ?? inner.id) : "") ||
          str(row._id ?? row.id);
        if (sid) ids.add(sid);
      }
    }
  }
  return ids;
}

function readFiniteNumber(
  row: Record<string, unknown>,
  key: string
): number | undefined {
  const n = Number(row[key]);
  return Number.isFinite(n) ? n : undefined;
}

/** Reads first finite number from API quote row (camelCase + snake_case). */
function readQuoteAmount(
  row: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const n = readFiniteNumber(row, key);
    if (n !== undefined) return n;
  }
  return undefined;
}

/** Tax / commission / min-deposit fields from hydrated `service` or mapping row (for Add Quote breakdown). */
function quoteServiceFeeFieldsFromRow(
  inner: Record<string, unknown> | undefined,
  row: Record<string, unknown>
): Partial<ServiceDropDownOption> {
  const src =
    inner && typeof inner === "object" && Object.keys(inner).length > 0
      ? inner
      : row;
  const tax = readFiniteNumber(src, "tax") ?? readFiniteNumber(row, "tax");
  const commission =
    readFiniteNumber(src, "commission") ??
    readFiniteNumber(row, "commission");
  const minimum_deposit =
    readFiniteNumber(src, "minimum_deposit") ??
    readFiniteNumber(row, "minimum_deposit");
  const min_deposit_value =
    readFiniteNumber(src, "min_deposit_value") ??
    readFiniteNumber(row, "min_deposit_value") ??
    minimum_deposit;
  const min_deposit_type = str(
    (src.min_deposit_type as unknown) ??
      (src.payment_type as unknown) ??
      (row.min_deposit_type as unknown) ??
      (row.payment_type as unknown) ??
      ""
  );
  const out: Partial<ServiceDropDownOption> = {};
  if (tax !== undefined) out.tax = tax;
  if (commission !== undefined) out.commission = commission;
  if (minimum_deposit !== undefined) out.minimum_deposit = minimum_deposit;
  if (min_deposit_value !== undefined) out.min_deposit_value = min_deposit_value;
  if (min_deposit_type) out.min_deposit_type = min_deposit_type;
  return out;
}

function mergeServicesFromFranchiseServiceDocs(
  record: FranchiseRelatedCatalogRecord,
  catById: Map<string, string>,
  franchiseActiveSvcIds: Set<string>,
  seenSvc: Set<string>,
  out: ServiceDropDownOption[]
): void {
  const detailByServiceId = new Map<string, Record<string, unknown>>();
  for (const s of asObjectRecords(record.services)) {
    const inner = s.service as Record<string, unknown> | undefined;
    const sid = str(s.service_id ?? inner?._id ?? s._id ?? s.id);
    if (!sid) continue;
    detailByServiceId.set(sid, inner ?? s);
  }

  for (const doc of asObjectRecords(record.franchise_services)) {
    const list = doc.services_list;
    if (!Array.isArray(list)) {
      const inner = doc.service as Record<string, unknown> | undefined;
      const id = str(doc.service_id ?? inner?._id ?? doc._id);
      if (!id || seenSvc.has(id)) continue;
      if (doc.is_active === false || doc.is_active === 0) continue;
      const catRef = inner
        ? normalizeServiceCategoryRef(
            inner.category_id ?? inner.category ?? inner.categoryId
          )
        : normalizeServiceCategoryRef(
            doc.category_id ?? doc.category ?? doc.categoryId
          );
      const allow =
        !catRef ||
        catById.size === 0 ||
        catById.has(catRef) ||
        franchiseActiveSvcIds.has(id);
      if (!allow) continue;
      seenSvc.add(id);
      out.push({
        value: id,
        label: str(inner?.name ?? doc.name) || id,
        price: inner?.price != null ? Number(inner.price) : undefined,
        category_id: catRef || undefined,
        payment_type: str(
          inner?.payment_type ?? inner?.min_deposit_type ?? ""
        ),
        ...quoteServiceFeeFieldsFromRow(inner, doc as Record<string, unknown>),
      });
      continue;
    }
    const activeSet = new Set(
      Array.isArray(doc.active_services)
        ? (doc.active_services as unknown[]).map((x) => str(x)).filter(Boolean)
        : []
    );
    for (const row of asObjectRecords(list as unknown[])) {
      const sid = str(row.service_id ?? row._id ?? row.id);
      if (!sid || seenSvc.has(sid)) continue;
      if (activeSet.size > 0 && !activeSet.has(sid)) continue;
      if (row.is_active === false || row.is_active === 0) continue;
      const inner =
        (row.service as Record<string, unknown> | undefined) ??
        detailByServiceId.get(sid);
      const catRef = inner
        ? normalizeServiceCategoryRef(
            inner.category_id ?? inner.category ?? inner.categoryId
          )
        : "";
      const allow =
        !catRef ||
        catById.size === 0 ||
        catById.has(catRef) ||
        franchiseActiveSvcIds.has(sid);
      if (!allow) continue;
      seenSvc.add(sid);
      out.push({
        value: sid,
        label: str(inner?.name ?? row.name) || sid,
        price: inner?.price != null ? Number(inner.price) : undefined,
        category_id: catRef || undefined,
        payment_type: str(
          inner?.payment_type ?? inner?.min_deposit_type ?? ""
        ),
        ...quoteServiceFeeFieldsFromRow(
          inner ?? detailByServiceId.get(sid),
          row as Record<string, unknown>
        ),
      });
    }
  }
}

/** Partner catalog row enabled at partner level (`is_active` / `effective_active`). */
function isPartnerProvidingRowEligible(row: Record<string, unknown>): boolean {
  if (row.is_active === false || row.is_active === 0) return false;
  if (row.effective_active === false || row.effective_active === 0) return false;
  return true;
}

function isPartnerRecordEligible(p: Record<string, unknown>): boolean {
  if (p.is_active === false || p.is_active === 0) return false;
  if (p.is_blocked === true) return false;
  return true;
}

/**
 * Partner service rows — when `active_services_providing` is present (including `[]`),
 * use only that list (new related-catalog API). Legacy `services_providing` only if active key missing.
 */
function partnerServicesProvidingRows(
  partner: Record<string, unknown> | null | undefined
): Record<string, unknown>[] {
  if (!partner) return [];
  const active =
    partner.active_services_providing ?? partner.activeServicesProviding;
  if (Array.isArray(active)) {
    return asObjectRecords(active).filter(isPartnerProvidingRowEligible);
  }
  const all = partner.services_providing ?? partner.servicesProviding;
  if (!Array.isArray(all)) return [];
  return asObjectRecords(all).filter(isPartnerProvidingRowEligible);
}

/** Same rules as {@link partnerServicesProvidingRows} for `active_categories_providing`. */
function partnerCategoriesProvidingRows(
  partner: Record<string, unknown> | null | undefined
): Record<string, unknown>[] {
  if (!partner) return [];
  const active =
    partner.active_categories_providing ?? partner.activeCategoriesProviding;
  if (Array.isArray(active)) {
    return asObjectRecords(active).filter(isPartnerProvidingRowEligible);
  }
  const all = partner.categories_providing ?? partner.categoriesProviding;
  if (!Array.isArray(all)) return [];
  return asObjectRecords(all).filter(isPartnerProvidingRowEligible);
}

function franchiseCatalogHasLegacyTopLevelLists(
  record: FranchiseRelatedCatalogRecord
): boolean {
  return (
    asObjectRecords(record.categories).length > 0 ||
    asObjectRecords(record.services).length > 0 ||
    asObjectRecords(record.franchise_categories).length > 0 ||
    asObjectRecords(record.franchise_services).length > 0
  );
}

function mapRelatedCatalogEmployeesAndCustomers(
  record: FranchiseRelatedCatalogRecord,
  out: MappedFranchiseQuoteCatalog
): void {
  for (const e of asObjectRecords(record.employees)) {
    const id = str(e._id ?? e.id);
    if (!id) continue;
    if (e.is_active === false || e.is_active === 0) continue;
    if (e.is_blocked === true) continue;
    out.quoteEmployeeRecords.push(e);
    out.quoteEmployeeOptions.push({
      value: id,
      label: str(e.name ?? e.user_name ?? e.user_id) || id,
    });
  }
  out.quoteEmployeeOptions.sort((a, b) => a.label.localeCompare(b.label));

  out.quoteCustomerRecords = asObjectRecords(record.customers).filter((c) => {
    if (c.is_active === false || c.is_active === 0) return false;
    if (c.is_blocked === true) return false;
    return true;
  });

  for (const u of out.quoteCustomerRecords) {
    const id = str(u._id ?? u.id);
    if (!id) continue;
    const name = str(u.name) || id;
    const email = str(u.email);
    const label = email ? `${name} (${email})` : name;
    out.quoteUserOptions.push({ value: id, label, user_name: name });
  }
  out.quoteUserOptions.sort((a, b) =>
    a.user_name.localeCompare(b.user_name)
  );
}

/** Service ids allowed under a partner category row (`active_categories_providing[].services`). */
export function getPartnerCategoryAllowedServiceIds(
  partner: Record<string, unknown> | null | undefined,
  categoryId: string
): Set<string> | null {
  if (!partner) return null;
  const cid = normalizeServiceCategoryRef(categoryId);
  if (!cid) return null;
  for (const row of partnerCategoriesProvidingRows(partner)) {
    const nested = row.category as Record<string, unknown> | undefined;
    const rowCid = normalizeServiceCategoryRef(
      row.category_id ?? nested?._id ?? nested?.id
    );
    if (rowCid !== cid) continue;
    if (!Array.isArray(row.services)) return null;
    const out = new Set<string>();
    for (const x of row.services as unknown[]) {
      const id = normalizeMongoRef(x);
      if (id) out.add(id);
    }
    return out;
  }
  return null;
}

/** Partner services for one category (category_id + optional `services[]` on category row). */
export function filterPartnerServicesForCategory(
  partnerServices: ServiceDropDownOption[],
  partner: Record<string, unknown> | null | undefined,
  categoryId: string
): ServiceDropDownOption[] {
  const cid = normalizeServiceCategoryRef(categoryId);
  if (!cid) return [];
  let list = partnerServices.filter(
    (o) => normalizeServiceCategoryRef(o.category_id) === cid
  );
  const allowed = getPartnerCategoryAllowedServiceIds(partner, cid);
  if (allowed != null) {
    list = list.filter((o) => allowed.has(String(o.value)));
  }
  return list;
}

function pushPartnerServiceRowToCatalog(
  row: Record<string, unknown>,
  catById: Map<string, string>,
  seenSvc: Set<string>,
  services: ServiceDropDownOption[]
): void {
  if (!isPartnerProvidingRowEligible(row)) return;
      const inner = row.service as Record<string, unknown> | undefined;
      const sid =
        normalizeMongoRef(row.service_id) ||
        (inner ? normalizeMongoRef(inner._id ?? inner.id) : "") ||
        str(row._id ?? row.id);
      if (!sid || seenSvc.has(sid)) return;
      const catRef =
        normalizeServiceCategoryRef(row.category_id) ||
        (inner
          ? normalizeServiceCategoryRef(
              inner.category_id ?? inner.category ?? inner.categoryId
            )
          : "");
      if (catRef && !catById.has(catRef)) {
        const catNested = row.category as Record<string, unknown> | undefined;
        const catName =
          str(catNested?.name ?? catNested?.category_name) || catRef;
        catById.set(catRef, catName);
      }
      seenSvc.add(sid);
      services.push({
        value: sid,
        label: str(inner?.name ?? row.name) || sid,
        price:
          row.price != null
            ? Number(row.price)
            : inner?.price != null
            ? Number(inner.price)
            : undefined,
        category_id: catRef || undefined,
        payment_type: firstNonEmptyPaymentType(
          row.payment_type,
          row.min_deposit_type,
          inner?.payment_type,
          inner?.min_deposit_type
        ),
        ...quoteServiceFeeFieldsFromRow(inner, row),
      });
}

/**
 * When franchise mapping has no active services, partner rows still expose offerings via
 * `services_providing` / `categories_providing` on `related-catalog` partners.
 */
function mergePartnerProvidingIntoCatalog(
  record: FranchiseRelatedCatalogRecord,
  catById: Map<string, string>,
  seenSvc: Set<string>,
  services: ServiceDropDownOption[]
): void {
  for (const partner of asObjectRecords(record.partners)) {
    if (!isPartnerRecordEligible(partner)) continue;
    for (const row of partnerCategoriesProvidingRows(partner)) {
      const nested = row.category as Record<string, unknown> | undefined;
      const cid = str(row.category_id ?? nested?._id ?? nested?.id);
      if (!cid) continue;
      const name =
        str(nested?.name ?? nested?.category_name ?? row.name) || cid;
      if (!catById.has(cid)) catById.set(cid, name);
    }
    for (const row of partnerServicesProvidingRows(partner)) {
      pushPartnerServiceRowToCatalog(row, catById, seenSvc, services);
    }
  }
}

/** Service dropdown options for one partner (names from nested `service`). */
export function buildPartnerServiceOptionsFromProviding(
  partner: Record<string, unknown> | null | undefined
): ServiceDropDownOption[] {
  const out: ServiceDropDownOption[] = [];
  const seen = new Set<string>();
  for (const row of partnerServicesProvidingRows(partner)) {
    pushPartnerServiceRowToCatalog(row, new Map(), seen, out);
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Category dropdown options for one partner (names from nested `category`). */
export function buildPartnerCategoryOptionsFromProviding(
  partner: Record<string, unknown> | null | undefined
): OptionType[] {
  const out: OptionType[] = [];
  const seen = new Set<string>();
  for (const row of partnerCategoriesProvidingRows(partner)) {
    const nested = row.category as Record<string, unknown> | undefined;
    const cid = str(row.category_id ?? nested?._id ?? nested?.id);
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    const name = str(nested?.name ?? nested?.category_name ?? row.name) || cid;
    out.push({ value: cid, label: name });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Maps `related-catalog` payload into quote form dropdowns (categories, services, partners, employees, customers).
 * Supports hydrated `categories` / `services` / `customers` rows (staging) and mapping-doc shapes as fallback.
 */
export function mapRelatedCatalogToQuoteOptions(
  record: FranchiseRelatedCatalogRecord | null | undefined
): MappedFranchiseQuoteCatalog {
  const out: MappedFranchiseQuoteCatalog = {
    quoteCategoryOptions: [],
    quoteCatalogServices: [],
    quotePartnerRecords: [],
    quoteEmployeeOptions: [],
    quoteEmployeeRecords: [],
    quoteUserOptions: [],
    quoteCustomerRecords: [],
  };
  if (!record) return out;

  const catById = new Map<string, string>();
  const seenSvc = new Set<string>();

  /** New API: catalog only on `partners[].active_*_providing` (no top-level categories/services). */
  const partnerOnlyCatalog =
    asObjectRecords(record.partners).length > 0 &&
    !franchiseCatalogHasLegacyTopLevelLists(record);

  if (partnerOnlyCatalog) {
    mergePartnerProvidingIntoCatalog(record, catById, seenSvc, out.quoteCatalogServices);
    out.quoteCategoryOptions = Array.from(catById.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    out.quoteCatalogServices.sort((a, b) => a.label.localeCompare(b.label));
    out.quotePartnerRecords = asObjectRecords(record.partners).filter(
      isPartnerRecordEligible
    );
    mapRelatedCatalogEmployeesAndCustomers(record, out);
    return out;
  }

  for (const c of asObjectRecords(record.categories)) {
    const id = categoryIdFromHydratedRow(c);
    if (!id) continue;
    const rowActive = c.is_active !== false && c.is_active !== 0;
    if ("is_active" in c && !rowActive) continue;
    const nested = c.category as Record<string, unknown> | undefined;
    if (nested && "is_active" in nested) {
      const na = nested.is_active !== false && nested.is_active !== 0;
      if (!na) continue;
    }
    const name = categoryNameFromHydratedRow(c) || id;
    catById.set(id, name);
  }

  mergeCategoriesFromFranchiseCategoryDocs(record, catById);

  const franchiseActiveSvcIds = collectFranchiseActiveServiceIds(record);

  for (const s of asObjectRecords(record.services)) {
    const inner = s.service as Record<string, unknown> | undefined;
    const id = str(
      s.service_id ?? s._id ?? s.id ?? inner?._id ?? inner?.id
    );
    if (!id || seenSvc.has(id)) continue;
    const rowActive = s.is_active !== false && s.is_active !== 0;
    if ("is_active" in s && !rowActive) continue;
    const catRef = inner
      ? normalizeServiceCategoryRef(
          inner.category_id ?? inner.category ?? inner.categoryId
        )
      : normalizeServiceCategoryRef(
          s.category_id ?? s.category ?? s.categoryId
        );
    const allowSvc =
      !catRef ||
      catById.size === 0 ||
      catById.has(catRef) ||
      franchiseActiveSvcIds.has(id);
    if (!allowSvc) continue;
    seenSvc.add(id);
    out.quoteCatalogServices.push({
      value: id,
      label:
        str(inner?.name ?? inner?.service_name ?? s.name ?? s.service_name) ||
        id,
      price:
        inner?.price != null
          ? Number(inner.price)
          : s.price != null
          ? Number(s.price)
          : undefined,
      category_id: catRef || undefined,
      payment_type: str(
        inner?.payment_type ??
          inner?.min_deposit_type ??
          s.payment_type ??
          s.min_deposit_type ??
          ""
      ),
      ...quoteServiceFeeFieldsFromRow(
        inner,
        s as Record<string, unknown>
      ),
    });
  }

  if (!seenSvc.size) {
    mergeServicesFromFranchiseServiceDocs(
      record,
      catById,
      franchiseActiveSvcIds,
      seenSvc,
      out.quoteCatalogServices
    );
  }

  /** Partner-only catalog API: offerings live on `partners[].active_*_providing`. */
  mergePartnerProvidingIntoCatalog(
    record,
    catById,
    seenSvc,
    out.quoteCatalogServices
  );

  out.quoteCategoryOptions = Array.from(catById.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  out.quoteCatalogServices.sort((a, b) => a.label.localeCompare(b.label));

  out.quotePartnerRecords = asObjectRecords(record.partners).filter(
    isPartnerRecordEligible
  );

  mapRelatedCatalogEmployeesAndCustomers(record, out);

  return out;
}

/** Related-catalog partner row includes `active_services_providing` (may be `[]`). */
function partnerActiveServicesProvidingIsList(
  partner: Record<string, unknown> | null | undefined
): boolean {
  if (!partner) return false;
  const active =
    partner.active_services_providing ?? partner.activeServicesProviding;
  return Array.isArray(active);
}

/** Related-catalog partner row includes `active_categories_providing` (may be `[]`). */
function partnerActiveCategoriesProvidingIsList(
  partner: Record<string, unknown> | null | undefined
): boolean {
  if (!partner) return false;
  const active =
    partner.active_categories_providing ?? partner.activeCategoriesProviding;
  return Array.isArray(active);
}

/**
 * Partner explicitly has no offerings (`active_*_providing: []` on both lists).
 * Differs from missing fields (legacy) where franchise-wide catalog may apply.
 */
export function partnerHasNoCatalogOfferings(
  partner: Record<string, unknown> | null | undefined
): boolean {
  if (!partner) return false;
  if (
    !partnerActiveServicesProvidingIsList(partner) &&
    !partnerActiveCategoriesProvidingIsList(partner)
  ) {
    return false;
  }
  return (
    partnerServicesProvidingRows(partner).length === 0 &&
    partnerCategoriesProvidingRows(partner).length === 0
  );
}

/**
 * Service ids a partner is configured to provide (`active_services_providing`, etc.).
 * - `null` ⇒ field missing (legacy) — caller may use full franchise catalog.
 * - empty `Set` ⇒ explicit `[]` — partner offers no services.
 */
export function getPartnerProvidingServiceIdSet(
  partner: Record<string, unknown> | null | undefined
): Set<string> | null {
  if (!partner) return null;
  const explicitList = partnerActiveServicesProvidingIsList(partner);
  const rows = partnerServicesProvidingRows(partner);
  const out = new Set<string>();
  for (const o of rows) {
    const inner = o.service as Record<string, unknown> | undefined;
    const id =
      normalizeMongoRef(o.service_id) ||
      (inner ? normalizeMongoRef(inner._id ?? inner.id) : "") ||
      str(o._id ?? o.id);
    if (id) out.add(id);
  }
  if (explicitList) return out;
  if (!rows.length) return null;
  return out.size ? out : null;
}

/** Services dropdown for the selected partner (not whole franchise unless legacy row). */
export function buildQuoteCatalogServicesForPartner(
  quoteCatalogServices: ServiceDropDownOption[],
  partner: Record<string, unknown> | null | undefined
): ServiceDropDownOption[] {
  if (!partner) return [];
  const fromPartner = buildPartnerServiceOptionsFromProviding(partner);
  if (fromPartner.length > 0) return fromPartner;
  const allow = getPartnerProvidingServiceIdSet(partner);
  if (allow === null) return quoteCatalogServices;
  if (allow.size === 0) return [];
  return quoteCatalogServices.filter((o) => allow.has(String(o.value)));
}

/** Category dropdown for the selected partner. */
export function buildQuoteCategoryOptionsForSelectedPartner(
  quoteCategoryOptions: OptionType[],
  quoteCatalogServices: ServiceDropDownOption[],
  partner: Record<string, unknown> | null | undefined
): OptionType[] {
  if (!partner) return [];
  const fromPartner = buildPartnerCategoryOptionsFromProviding(partner);
  if (fromPartner.length > 0) return fromPartner;
  if (partnerHasNoCatalogOfferings(partner)) return [];
  return buildQuoteCategoryOptionsForPartner(
    quoteCategoryOptions,
    buildQuoteCatalogServicesForPartner(quoteCatalogServices, partner),
    partner
  );
}

/**
 * Category ids the partner can work in (`available_categories` on `related-catalog` partners).
 * Returns `null` when missing or empty ⇒ do not restrict categories beyond franchise + services.
 */
export function getPartnerAvailableCategoryIdSet(
  partner: Record<string, unknown> | null | undefined
): Set<string> | null {
  if (!partner) return null;
  const raw =
    partner.available_categories ?? partner.availableCategories;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = new Set<string>();
  for (const x of raw as unknown[]) {
    if (x == null) continue;
    if (typeof x === "string" || typeof x === "number") {
      const id = str(x);
      if (id) out.add(id);
      continue;
    }
    if (typeof x === "object") {
      const o = x as Record<string, unknown>;
      const id = str(o._id ?? o.category_id ?? o.id);
      if (id) out.add(id);
    }
  }
  return out.size ? out : null;
}

/**
 * Category ids from `active_services_providing[].category_id` (and nested `service.category_id`).
 * Use with franchise catalog so quote UI matches what the partner actually offers.
 */
export function getPartnerCategoryIdsFromProviding(
  partner: Record<string, unknown> | null | undefined
): Set<string> {
  const out = new Set<string>();
  if (!partner) return out;
  for (const row of partnerCategoriesProvidingRows(partner)) {
    const nested = row.category as Record<string, unknown> | undefined;
    const cid = str(row.category_id ?? nested?._id ?? nested?.id);
    if (cid) out.add(cid);
  }
  for (const o of partnerServicesProvidingRows(partner)) {
    const direct = normalizeServiceCategoryRef(o.category_id);
    if (direct) out.add(direct);
    const svc = o.service as Record<string, unknown> | undefined;
    if (svc) {
      const ref = normalizeServiceCategoryRef(
        svc.category_id ?? svc.category ?? svc.categoryId
      );
      if (ref) out.add(ref);
    }
  }
  return out;
}

/** Dropdown options from `active_categories_providing` (partner-scoped categories). */
export function getPartnerCategoryOptionsFromActiveCategoriesProviding(
  partner: Record<string, unknown> | null | undefined
): OptionType[] {
  return buildPartnerCategoryOptionsFromProviding(partner);
}

/**
 * Category dropdown for a selected partner: franchise catalog + partner providing rows,
 * without emptying the list when franchise inactive categories omit partner offerings.
 */
export function buildQuoteCategoryOptionsForPartner(
  quoteCategoryOptions: OptionType[],
  quoteCatalogServicesForPartner: ServiceDropDownOption[],
  partner: Record<string, unknown> | null | undefined
): OptionType[] {
  const partnerCatIds = getPartnerAvailableCategoryIdSet(partner);
  const catIdsFromProviding = getPartnerCategoryIdsFromProviding(partner);
  const catIdsFromServices = new Set(
    quoteCatalogServicesForPartner
      .map((o) => normalizeServiceCategoryRef(o.category_id))
      .filter(Boolean)
  );
  catIdsFromProviding.forEach((id) => catIdsFromServices.add(id));

  const optionById = new Map(
    quoteCategoryOptions.map((c) => [String(c.value), c] as const)
  );
  for (const opt of getPartnerCategoryOptionsFromActiveCategoriesProviding(
    partner
  )) {
    if (!optionById.has(String(opt.value))) {
      optionById.set(String(opt.value), opt);
    }
  }

  const allOptions = Array.from(optionById.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  let base =
    catIdsFromServices.size === 0
      ? partnerHasNoCatalogOfferings(partner)
        ? []
        : allOptions
      : allOptions.filter((c) => catIdsFromServices.has(String(c.value)));

  if (partnerCatIds && partnerCatIds.size > 0) {
    const narrowed = base.filter((c) => partnerCatIds.has(String(c.value)));
    if (narrowed.length > 0) base = narrowed;
  }

  if (base.length === 0 && partner) {
    const fromCats =
      getPartnerCategoryOptionsFromActiveCategoriesProviding(partner);
    if (fromCats.length > 0) base = fromCats;
  }

  return base;
}

/** Resolves a Mongo-style id whether the API sends a string or a populated `{ _id }`. */
function normalizeMongoRef(v: unknown): string {
  if (v == null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return str(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return str(o._id ?? o.id ?? (o as { $oid?: unknown }).$oid);
  }
  return "";
}

function providingRowMatchesServiceId(
  o: Record<string, unknown>,
  sid: string
): boolean {
  if (!sid) return false;
  const ids = new Set<string>();
  const add = (v: unknown) => {
    const s = normalizeMongoRef(v);
    if (s) ids.add(s);
  };
  add(o.service_id);
  add(o.serviceId);
  add(o.id);
  add(o._id);
  const nested = o.service as Record<string, unknown> | undefined;
  if (nested && typeof nested === "object") {
    add(nested._id);
    add(nested.id);
    add(nested.service_id);
  }
  return ids.has(sid);
}

/** One row from `active_services_providing` for `serviceId`, if any. */
export function getPartnerActiveServiceProvidingRow(
  partner: Record<string, unknown> | null | undefined,
  serviceId: string | undefined | null
): Record<string, unknown> | null {
  const sid = str(serviceId);
  if (!partner || !sid) return null;
  for (const o of partnerServicesProvidingRows(partner)) {
    if (providingRowMatchesServiceId(o, sid)) return o;
  }
  return null;
}

/** Whether a franchise partner offers `serviceId` (optional `categoryId` scope). */
export function partnerProvidesQuoteService(
  partner: Record<string, unknown>,
  quoteCatalogServices: ServiceDropDownOption[],
  serviceId: string,
  categoryId?: string
): boolean {
  const sid = str(serviceId);
  if (!sid || !isPartnerRecordEligible(partner)) return false;

  if (getPartnerActiveServiceProvidingRow(partner, sid)) return true;

  const cid = normalizeServiceCategoryRef(categoryId);
  if (cid) {
    const allowed = getPartnerCategoryAllowedServiceIds(partner, cid);
    if (allowed != null && allowed.has(sid)) return true;
  }

  const allow = getPartnerProvidingServiceIdSet(partner);
  if (allow !== null) return allow.has(sid);

  if (partnerHasNoCatalogOfferings(partner)) return false;

  const partnerServices = buildQuoteCatalogServicesForPartner(
    quoteCatalogServices,
    partner
  );
  const pool = partnerServices.length ? partnerServices : quoteCatalogServices;
  if (pool.some((o) => String(o.value) === sid)) return true;

  if (cid) {
    return filterPartnerServicesForCategory(pool, partner, cid).some(
      (o) => String(o.value) === sid
    );
  }

  return false;
}

/** New-tab mobile quotes: partners in franchise who provide the prefilled service. */
export function buildQuotePartnerOptionsForPrefilledService(
  partnerRecords: Record<string, unknown>[],
  quoteCatalogServices: ServiceDropDownOption[],
  serviceId: string,
  categoryId?: string
): OptionType[] {
  const sid = str(serviceId);
  if (!sid) return [];
  const out: OptionType[] = [];
  for (const p of partnerRecords) {
    if (!partnerProvidesQuoteService(p, quoteCatalogServices, sid, categoryId)) {
      continue;
    }
    const value = String(
      p.partner_id ?? p._id ?? p.user_id ?? p.id ?? ""
    ).trim();
    if (!value) continue;
    const label = String(
      p.partner_name ?? p.name ?? p.user_name ?? value
    ).trim();
    out.push({ value, label: label || value });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function buildQuotePrefilledCategoryOptions(
  quoteCategoryOptions: OptionType[],
  categoryId: string,
  categoryName?: string
): OptionType[] {
  const cid = normalizeServiceCategoryRef(categoryId);
  if (!cid) return [];
  const match = quoteCategoryOptions.find((o) => String(o.value) === cid);
  if (match) return [match];
  const name = str(categoryName);
  return [{ value: cid, label: name || cid }];
}

function enrichQuoteServiceOptionLabel(
  opt: ServiceDropDownOption,
  sid: string,
  nameCandidates: unknown[]
): ServiceDropDownOption {
  const human = pickHumanQuoteServiceLabel([...nameCandidates, opt.label], sid);
  if (!human || human === opt.label) return opt;
  return { ...opt, label: human };
}

export function buildQuotePrefilledServiceOptions(
  quoteCatalogServices: ServiceDropDownOption[],
  serviceId: string,
  serviceName?: string,
  categoryId?: string,
  extraNameCandidates: unknown[] = []
): ServiceDropDownOption[] {
  const sid = str(serviceId);
  if (!sid) return [];
  const nameCandidates = [serviceName, ...extraNameCandidates];
  const match = quoteCatalogServices.find((o) => String(o.value) === sid);
  if (match) {
    return [enrichQuoteServiceOptionLabel(match, sid, nameCandidates)];
  }
  const cid = normalizeServiceCategoryRef(categoryId);
  const label =
    pickHumanQuoteServiceLabel(nameCandidates, sid) || sid;
  return [
    {
      value: sid,
      label,
      category_id: cid || undefined,
    },
  ];
}

function applyQuoteServiceNameFromFees(
  quote: QuoteRow,
  serviceFees: ServiceDropDownOption | undefined
): QuoteRow {
  const feeLabel = pickHumanQuoteServiceLabel(
    [serviceFees?.label],
    quote.service_id
  );
  if (!feeLabel) return quote;
  const next = { ...quote };
  if (!next.service_name) next.service_name = feeLabel;
  if (
    !next.requested_services ||
    isMongoObjectId(next.requested_services) ||
    next.requested_services === next.service_id
  ) {
    next.requested_services = feeLabel;
  }
  return next;
}

/** Resolve catalogue service name from `service_id` when quote GET omits populated refs. */
export async function enrichQuoteRowServiceName(
  quote: QuoteRow
): Promise<QuoteRow> {
  const sid = str(quote.service_id);
  if (!sid) return quote;

  const existing = pickHumanQuoteServiceLabel(
    [quote.service_name, quote.requested_services],
    sid
  );
  if (existing) {
    return {
      ...quote,
      service_name: existing,
      requested_services: existing,
    };
  }

  const { service } = await fetchServiceById(sid);
  let name = str(service?.name);
  if (!name || isMongoObjectId(name)) {
    const cid = str(quote.category_id);
    const list = await fetchServiceDropDown(cid || undefined);
    const match = list.find((o) => String(o.value) === sid);
    name = str(match?.label);
  }
  if (!name || isMongoObjectId(name)) return quote;

  return {
    ...quote,
    service_name: name,
    requested_services: name,
  };
}

/**
 * Prefer partner `active_services_providing` for tax / minimum_deposit / commission
 * (see related-catalog partner rows); nested `service` is a fallback when the
 * global catalogue row omits those fields.
 */
export function mergeQuoteServiceFeesForBreakdown(
  catalogOpt: ServiceDropDownOption | undefined,
  partner: Record<string, unknown> | null | undefined,
  serviceId: string | undefined | null
): ServiceDropDownOption | undefined {
  const pr = getPartnerActiveServiceProvidingRow(partner, serviceId);
  if (!catalogOpt && !pr) return undefined;
  const base: ServiceDropDownOption =
    catalogOpt ?? { value: str(serviceId), label: "" };
  if (!pr) return catalogOpt;

  const nested = pr.service as Record<string, unknown> | undefined;

  const tax =
    readFiniteNumber(pr, "tax") ??
    (nested ? readFiniteNumber(nested, "tax") : undefined) ??
    base.tax;
  const commission =
    readFiniteNumber(pr, "commission") ??
    readFiniteNumber(pr, "admin_commission") ??
    (nested ? readFiniteNumber(nested, "commission") : undefined) ??
    (nested ? readFiniteNumber(nested, "admin_commission") : undefined) ??
    base.commission;
  const minimum_deposit =
    readFiniteNumber(pr, "minimum_deposit") ??
    (nested ? readFiniteNumber(nested, "minimum_deposit") : undefined) ??
    base.minimum_deposit;
  const min_deposit_value =
    readFiniteNumber(pr, "min_deposit_value") ??
    (nested ? readFiniteNumber(nested, "min_deposit_value") : undefined) ??
    minimum_deposit ??
    base.min_deposit_value;

  const pay = firstNonEmptyPaymentType(
    pr.payment_type,
    pr.min_deposit_type,
    nested?.payment_type,
    nested?.min_deposit_type
  );
  const mdType = firstNonEmptyPaymentType(
    pr.min_deposit_type,
    pr.payment_type,
    nested?.min_deposit_type,
    nested?.payment_type
  );

  const out: ServiceDropDownOption = { ...base };
  if (tax !== undefined) out.tax = tax;
  if (commission !== undefined) out.commission = commission;
  if (minimum_deposit !== undefined) out.minimum_deposit = minimum_deposit;
  if (min_deposit_value !== undefined) out.min_deposit_value = min_deposit_value;
  if (mdType) {
    out.min_deposit_type = mdType;
  } else if (pay) {
    out.min_deposit_type = pay;
  }
  if (pay) {
    out.payment_type = pay;
  }
  return out;
}

export type QuoteScheduleMetrics = {
  from_date: string;
  to_date: string;
  work_start_time: string;
  work_end_time: string;
  work_hours_per_day: number;
  days: number;
  total_work_hours: number;
};

/**
 * Same schedule math as create-quote (`from_date` / `to_date` / work hours).
 * Used for automatic price = partner unit rate × duration.
 */
export function deriveQuoteScheduleMetrics(input: {
  scheduleMode: QuoteServiceScheduleMode;
  requested_date: string;
  requested_date_to: string;
  requested_time: string;
  requested_time_from: string;
  requested_time_to: string;
}): QuoteScheduleMetrics | null {
  const from_date = isoOrDateToYmd(str(input.requested_date));
  if (!from_date) return null;

  let to_date = isoOrDateToYmd(str(input.requested_date_to)) || from_date;
  if (input.scheduleMode === "range") {
    to_date = isoOrDateToYmd(str(input.requested_date_to)) || from_date;
  } else {
    to_date = from_date;
  }

  let work_start_time = "09:00";
  let work_end_time = "17:00";
  if (input.scheduleMode === "hourly") {
    work_start_time = timeStorageToHHmm(input.requested_time_from);
    work_end_time = timeStorageToHHmm(input.requested_time_to);
  } else if (input.scheduleMode === "range") {
    const wf = str(input.requested_time_from);
    const wt = str(input.requested_time_to);
    if (wf && wt) {
      work_start_time = timeStorageToHHmm(wf);
      work_end_time = timeStorageToHHmm(wt);
    } else {
      work_start_time = timeStorageToHHmm(input.requested_time);
      const [h, m] = work_start_time.split(":").map((x) => parseInt(x, 10));
      const endH = Math.min(23, (h || 9) + 2);
      work_end_time = `${pad2(endH)}:${pad2(m || 0)}`;
    }
  } else if (input.scheduleMode === "single") {
    const wf = str(input.requested_time_from);
    const wt = str(input.requested_time_to);
    if (wf && wt) {
      work_start_time = timeStorageToHHmm(wf);
      work_end_time = timeStorageToHHmm(wt);
    } else {
      work_start_time = timeStorageToHHmm(input.requested_time);
      const [h, m] = work_start_time.split(":").map((x) => parseInt(x, 10));
      const endH = Math.min(23, (h || 9) + 2);
      work_end_time = `${pad2(endH)}:${pad2(m || 0)}`;
    }
  } else {
    work_start_time = timeStorageToHHmm(input.requested_time_from);
    work_end_time = timeStorageToHHmm(input.requested_time_to);
  }

  const work_hours_per_day = ceilWholeHoursBetweenHHmm(
    work_start_time,
    work_end_time
  );
  const days = ceilWholeDaysInclusive(from_date, to_date);
  const total_work_hours = scheduleTotalWorkHours(work_hours_per_day, days);
  return {
    from_date,
    to_date,
    work_start_time,
    work_end_time,
    work_hours_per_day,
    days,
    total_work_hours,
  };
}

/** Partner rate + billing type; nested `service` and catalog option fill gaps when partner fields are blank. */
export function resolvePartnerServiceBillingFields(
  row: Record<string, unknown>,
  catalogPaymentType?: string
): {
  unit: number;
  rawType: string;
  key: string;
} {
  const nested = row.service as Record<string, unknown> | undefined;
  const rowPrice = readFiniteNumber(row, "price");
  const nestedPrice = nested ? readFiniteNumber(nested, "price") : undefined;
  const unit =
    rowPrice != null
      ? rowPrice
      : nestedPrice != null
      ? nestedPrice
      : 0;
  const rawType = firstNonEmptyPaymentType(
    row.payment_type,
    row.min_deposit_type,
    nested?.payment_type,
    nested?.min_deposit_type,
    catalogPaymentType
  );
  return {
    unit: Number.isFinite(unit) ? unit : 0,
    rawType,
    key: extractMinDepositTypeKey(rawType),
  };
}

/**
 * Suggested **pre-tax** service total from partner line (`price`, `payment_type`) × schedule.
 * Tax is shown in the Add Quote breakdown only; do not bake tax into this amount (avoids double counting with the breakdown).
 */
export function computeAutoQuotePriceFromPartner(
  partnerServiceRow: Record<string, unknown> | null | undefined,
  metrics: QuoteScheduleMetrics,
  catalogPaymentType?: string
): number {
  if (!partnerServiceRow) return 0;
  const { unit, key } = resolvePartnerServiceBillingFields(
    partnerServiceRow,
    catalogPaymentType
  );
  if (!Number.isFinite(unit)) return 0;
  let sub = 0;
  if (key === "per_hour") {
    sub = unit * metrics.total_work_hours;
  } else if (key === "per_day") {
    sub = unit * metrics.days;
  } else if (key === "per_month") {
    const months = Math.max(1, Math.ceil(metrics.days / 30));
    sub = unit * months;
  } else if (key === "per_consultancy") {
    sub = unit;
  } else {
    sub = unit * metrics.days;
  }
  return Math.max(0, Math.round(sub * 100) / 100);
}

export type QuoteSchedulePricePreview = {
  billingLabel: string;
  primaryLine: string;
  secondaryLine?: string;
  preTaxTotal: number;
};

/**
 * One-line pre-tax total explanation for Add Quote (matches `computeAutoQuotePriceFromPartner`).
 */
export function buildQuoteSchedulePricePreview(
  partnerServiceRow: Record<string, unknown> | null | undefined,
  metrics: QuoteScheduleMetrics | null,
  currencySymbol: string,
  catalogPaymentType?: string
): QuoteSchedulePricePreview | null {
  if (!partnerServiceRow || !metrics) return null;
  const { unit, rawType, key } = resolvePartnerServiceBillingFields(
    partnerServiceRow,
    catalogPaymentType
  );
  if (!Number.isFinite(unit) || unit < 0) return null;
  const billingLabel = labelForMinDepositType(rawType) || key || "Billing";
  const sym = currencySymbol;
  const fmt = (n: number) =>
    `${sym}${String(Math.round(n * 100) / 100).replace(/\.00$/, "")}`;

  if (key === "per_hour") {
    const totalH = metrics.total_work_hours;
    const sub = unit * totalH;
    return {
      billingLabel,
      primaryLine: `${fmt(unit)}/hr × ${totalH} h = ${fmt(sub)}`,
      secondaryLine: `${metrics.work_hours_per_day} h/day × ${metrics.days} day(s)`,
      preTaxTotal: Math.max(0, Math.round(sub * 100) / 100),
    };
  }
  if (key === "per_day") {
    const d = metrics.days;
    const sub = unit * d;
    return {
      billingLabel,
      primaryLine: `${fmt(unit)}/day × ${d} day(s) = ${fmt(sub)}`,
      preTaxTotal: Math.max(0, Math.round(sub * 100) / 100),
    };
  }
  if (key === "per_month") {
    const months = Math.max(1, Math.ceil(metrics.days / 30));
    const sub = unit * months;
    return {
      billingLabel,
      primaryLine: `${fmt(unit)}/month × ${months} month(s) = ${fmt(sub)}`,
      secondaryLine: `${metrics.days} day(s) in range · ${metrics.work_start_time}–${metrics.work_end_time} daily`,
      preTaxTotal: Math.max(0, Math.round(sub * 100) / 100),
    };
  }
  if (key === "per_consultancy") {
    const sub = unit;
    return {
      billingLabel,
      primaryLine: `${fmt(unit)} × 1 = ${fmt(sub)}`,
      secondaryLine: `${metrics.work_start_time}–${metrics.work_end_time}`,
      preTaxTotal: Math.max(0, Math.round(sub * 100) / 100),
    };
  }
  const d = metrics.days;
  const sub = unit * d;
  return {
    billingLabel,
    primaryLine: `${fmt(unit)}/day × ${d} day(s) = ${fmt(sub)}`,
    preTaxTotal: Math.max(0, Math.round(sub * 100) / 100),
  };
}

export function filterCatalogPartnerRecordsByService(
  partners: Record<string, unknown>[],
  serviceId: string | undefined
): Record<string, unknown>[] {
  const sid = str(serviceId);
  if (!sid || !partners.length) return partners;

  const rowMatches = (p: Record<string, unknown>): boolean => {
    const direct = str(p.service_id ?? p.serviceId);
    if (direct && direct === sid) return true;
    const raw =
      p.services ??
      p.service_ids ??
      p.partner_services ??
      p.my_services ??
      p.service_list;
    if (Array.isArray(raw)) {
      return raw.some((x) => {
        if (x == null) return false;
        if (typeof x === "string" || typeof x === "number")
          return str(x) === sid;
        if (typeof x === "object") {
          const o = x as Record<string, unknown>;
          return str(o.service_id ?? o._id ?? o.id) === sid;
        }
        return false;
      });
    }
    if (typeof raw === "string" && raw.includes(sid)) return true;
    return false;
  };

  const filtered = partners.filter(rowMatches);
  return filtered.length ? filtered : partners;
}

/** `GET /user/getDropDown?type=4` — customers / end users (see `APP_USER_TYPE` in `userService`). */
const CUSTOMER_USER_TYPE = APP_USER_TYPE.CUSTOMER;
/** `GET /user/getDropDown?type=3` — franchise employees. */
const EMPLOYEE_USER_TYPE = APP_USER_TYPE.FRANCHISE_EMPLOYEE;
/** `GET /user/getDropDown?type=2` — partners (fallback when `getPartnerDropDown` is empty). */
const PARTNER_USER_TYPE = APP_USER_TYPE.PARTNER;

/**
 * Tab key → `GET /quote/getAll?status=` bucket name (same rules as `getCounts`).
 * Kept as a named export so list/count code and HMR reloads never reference a removed symbol.
 */
export const QUOTE_TAB_API_STATUS: Record<QuoteTabKey, string> = {
  new: "new",
  pending: "pending",
  accepted: "accepted",
  success: "success",
  failed: "failed",
};

/** Active tab → `GET /quote/getAll?status=` dashboard bucket. */
export function quoteListStatusParam(tab: QuoteTabKey): string {
  return QUOTE_TAB_API_STATUS[tab] ?? tab;
}

const QUOTE_SORTABLE_ACCESSORS = new Set([
  "quote_id",
  "requested_services",
  "services",
  "requested_partner",
  "partner_name",
  "user_name",
  "service_price",
  "requested_date",
  "scheduled_date",
  "status",
]);

/** Table column accessor → `GET /quote/getAll` `sort_by` (Postman). */
const QUOTE_LIST_SORT_TO_API: Record<string, string> = {
  quote_id: "quote_sequence_id",
  service_price: "service_price",
  requested_date: "from_date",
  scheduled_date: "from_date",
  status: "status",
  requested_services: "created_at",
  services: "created_at",
  requested_partner: "created_at",
  partner_name: "created_at",
  user_name: "created_at",
};

export function normalizeQuoteListSort(sort: QuoteListSort): QuoteListSort {
  if (!sort.length) return [];
  const first = sort[0];
  if (!first?.id || !QUOTE_SORTABLE_ACCESSORS.has(first.id)) return [];
  return [{ id: first.id, desc: Boolean(first.desc) }];
}

export function quoteListSortToApi(
  sort: QuoteListSort
): { sort_by: string; sort_order: "asc" | "desc" } | null {
  const safe = normalizeQuoteListSort(sort);
  if (!safe.length) return null;
  const { id, desc } = safe[0];
  return {
    sort_by: QUOTE_LIST_SORT_TO_API[id] ?? "created_at",
    sort_order: desc ? "desc" : "asc",
  };
}

/** Maps `GET /quote/getCounts` or `POST /getCount` quote-management `record` into tab totals. */
export function mapQuoteTabCountsFromRecord(
  record: Record<string, unknown> | null | undefined
): Partial<Record<QuoteTabKey, number>> | null {
  if (!record || typeof record !== "object") return null;
  const byLower = new Map(
    Object.entries(record).map(([k, v]) => [k.toLowerCase(), v])
  );
  const pick = (...aliases: string[]): number | null => {
    for (const a of aliases) {
      const v = byLower.get(a.toLowerCase());
      if (v !== undefined && v !== null) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };
  const out: Partial<Record<QuoteTabKey, number>> = {};
  const assign = (key: QuoteTabKey, ...aliases: string[]) => {
    const n = pick(...aliases);
    if (n !== null) out[key] = n;
  };
  assign("new", "quote_new", "new_quote", "new", "total_new", "quotes_new");
  assign(
    "pending",
    "quote_pending",
    "pending_quote",
    "pending",
    "total_pending",
    "quotes_pending"
  );
  assign(
    "accepted",
    "quote_accepted",
    "accepted_quote",
    "accepted",
    "total_accepted",
    "quotes_accepted"
  );
  assign(
    "success",
    "quote_success",
    "success_quote",
    "success",
    "total_success",
    "quotes_success"
  );
  assign(
    "failed",
    "quote_failed",
    "failed_quote",
    "failed",
    "total_failed",
    "quotes_failed"
  );
  if (Object.keys(out).length === 0) return null;
  for (const key of Object.keys(QUOTE_TAB_API_STATUS) as QuoteTabKey[]) {
    if (out[key] === undefined) out[key] = 0;
  }
  return out;
}

/** `GET /quote/getCounts` — dashboard tab badges (Postman). */
export async function fetchQuoteCounts(
  franchiseId?: string | null
): Promise<Partial<Record<QuoteTabKey, number>> | null> {
  const params = new URLSearchParams();
  const fid = franchiseIdForApiQuery(franchiseId);
  if (fid) params.set("franchise_id", fid);
  const qs = params.toString();
  const res = await apiRequest(
    `${ApiPaths.GET_QUOTE_COUNTS()}${qs ? `?${qs}` : ""}`,
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!res.success) return null;
  const raw =
    (res.data as { record?: unknown })?.record ??
    (res.data as { data?: { record?: unknown } })?.data?.record ??
    (res.data as { data?: unknown })?.data;
  if (!raw || typeof raw !== "object") return null;
  return mapQuoteTabCountsFromRecord(raw as Record<string, unknown>);
}

function toQuoteApiBody(
  body: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...body };
  if (
    "description" in out &&
    out.description != null &&
    String(out.description).trim() &&
    !("quote_description" in out) &&
    !("admin_description" in out) &&
    !("user_description" in out)
  ) {
    out.quote_description = out.description;
    delete out.description;
  }
  return out;
}

function str(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "undefined" || s === "null" || s === "[object Object]" ? "" : s;
}

/** First non-empty billing type (`??` does not skip empty strings from the API). */
export function firstNonEmptyPaymentType(...candidates: unknown[]): string {
  for (const c of candidates) {
    const t = str(c);
    if (t) return t;
  }
  return "";
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** Populated ref `{ _id, name, ... }` or raw id string/number. */
function refId(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return str(v);
  if (isPlainObject(v)) return str(v._id);
  return "";
}

/**
 * Catalog service id for quote add/edit dropdowns.
 * GET /quote/get may return `service_id` as a partner-providing row with nested `service_id.service`.
 */
export function resolveQuoteCatalogServiceId(
  r: Record<string, unknown>
): string {
  const servicePackageRef = nestedObj(r.service_id);
  const innerCatalogService = servicePackageRef
    ? nestedObj(servicePackageRef.service_id)
    : undefined;

  const fromInner = refId(innerCatalogService);
  if (fromInner) return fromInner;

  const fromPackageServiceField = normalizeMongoRef(servicePackageRef?.service_id);
  if (fromPackageServiceField) return fromPackageServiceField;

  if (typeof r.service_id === "string" || typeof r.service_id === "number") {
    return str(r.service_id);
  }

  const flatService = nestedObj(r.service);
  if (flatService) return refId(flatService);

  return refId(servicePackageRef);
}

function nestedObj(v: unknown): Record<string, unknown> | undefined {
  return isPlainObject(v) ? v : undefined;
}

function isMongoObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value.trim());
}

/** First human-readable service label from a quote API row (skips raw ObjectIds). */
function pickHumanQuoteServiceLabel(
  candidates: unknown[],
  catalogServiceId?: string
): string {
  const sid = str(catalogServiceId);
  for (const c of candidates) {
    const label = str(c);
    if (!label) continue;
    if (sid && label === sid) continue;
    if (isMongoObjectId(label)) continue;
    return label;
  }
  return "";
}

export function resolveQuoteServiceDisplayName(
  r: Record<string, unknown>,
  catalogServiceId?: string
): string {
  const servicePackageRef = nestedObj(r.service_id);
  const packageServiceRef = servicePackageRef
    ? nestedObj(servicePackageRef.service) ??
      nestedObj(servicePackageRef.service_id)
    : undefined;
  const innerCatalogService = servicePackageRef
    ? nestedObj(servicePackageRef.service_id) ?? packageServiceRef
    : undefined;
  const serviceRef =
    innerCatalogService ??
    packageServiceRef ??
    servicePackageRef ??
    nestedObj(r.service);
  const requestedServicesRef = nestedObj(r.requested_services);
  const sid = catalogServiceId || resolveQuoteCatalogServiceId(r);

  return pickHumanQuoteServiceLabel(
    [
      r.service_name,
      requestedServicesRef?.name,
      requestedServicesRef?.service_name,
      typeof r.requested_services === "string" ||
      typeof r.requested_services === "number"
        ? r.requested_services
        : undefined,
      packageServiceRef?.name,
      packageServiceRef?.service_name,
      innerCatalogService?.name,
      innerCatalogService?.service_name,
      servicePackageRef?.name,
      servicePackageRef?.service_name,
      serviceRef?.name,
      serviceRef?.service_name,
      r.services,
      r.service_summary,
      r.name,
    ],
    sid
  );
}

/** Human-readable order number for Success quotes — not the order Mongo `_id`. */
function resolveQuoteOrderDisplayId(
  r: Record<string, unknown>
): string | undefined {
  const orderRef =
    nestedObj(r.order_id) ?? nestedObj(r.order) ?? nestedObj(r.order_info);

  for (const c of [
    r.order_unique_id,
    r.orderUniqueId,
    orderRef?.unique_id,
    orderRef?.order_unique_id,
    orderRef?.uniqueId,
  ]) {
    const label = str(c);
    if (label) return label;
  }

  const rawOrderId = r.order_id ?? r.orderId;
  if (typeof rawOrderId === "string" || typeof rawOrderId === "number") {
    const label = str(rawOrderId);
    if (label && !isMongoObjectId(label)) return label;
  }

  if (orderRef) {
    for (const c of [orderRef.order_id, orderRef.orderId]) {
      const label = str(c);
      if (label && !isMongoObjectId(label)) return label;
    }
  }

  return undefined;
}

/** API `from_date` / `to_date` may be full ISO; normalize to `YYYY-MM-DD` for schedule UI. */
function isoOrDateToYmd(input: string): string {
  const t = str(input);
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Convert `2000-01-01THH:mm:00` storage to `HH:mm` (24h). */
export function timeStorageToHHmm(storage: string | null | undefined): string {
  const t = str(storage);
  if (!t) return "09:00";
  const m = t.match(/T(\d{1,2}):(\d{2})/);
  if (m) {
    const hh = Math.min(23, parseInt(m[1], 10));
    const mm = Math.min(59, parseInt(m[2], 10));
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      return `${pad2(hh)}:${pad2(mm)}`;
    }
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "09:00";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `"2:30 PM"` style → `HH:mm` */
export function amPmDisplayToHHmm(label: string | undefined | null): string {
  const t = str(label);
  if (!t || t === "-") return "";
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${pad2(h)}:${pad2(min)}`;
}

/**
 * API `status` string (or legacy numeric) → lowercase bucket key for tabs / PUT body.
 */
export function normalizeQuoteApiStatus(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const byNumber: Record<number, string> = {
      1: "new",
      2: "pending",
      3: "accepted",
      4: "success",
      5: "failed",
    };
    const mapped = byNumber[raw];
    if (mapped) return mapped;
  }
  const s = str(raw).toLowerCase();
  const map: Record<string, string> = {
    new: "new",
    pending: "pending",
    accepted: "accepted",
    approved: "accepted",
    success: "success",
    converted: "success",
    failed: "failed",
    rejected: "failed",
    cancelled: "failed",
    canceled: "failed",
    expired: "failed",
    "1": "new",
    "2": "pending",
    "3": "accepted",
    "4": "success",
    "5": "failed",
  };
  return map[s] || s;
}

/** Display label for table / view (from API status key). */
export function quoteStatusDisplayLabel(apiStatus: string): string {
  return formatStatusLabel(apiStatus);
}

/**
 * Normalizes API status (lifecycle codes, bucket labels, or display strings) to UI tab labels.
 * List/count buckets (`new`, `pending`, …) are applied server-side on `getAll` / `getCounts`.
 */
function formatStatusLabel(raw: unknown): string {
  const dashboardByNumber: Record<number, string> = {
    1: "New",
    2: "Pending",
    3: "Accepted",
    4: "Success",
    5: "Failed",
  };
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const lab = dashboardByNumber[raw];
    if (lab) return lab;
    const lifecycleByNumber: Record<number, string> = {
      1: "Pending",
      2: "Accepted",
      3: "Failed",
      4: "Success",
      5: "Failed",
      6: "Failed",
    };
    const alt = lifecycleByNumber[raw];
    if (alt) return alt;
  }
  const s = str(raw);
  const dashboardByDigit: Record<string, string> = {
    "1": "New",
    "2": "Pending",
    "3": "Accepted",
    "4": "Success",
    "5": "Failed",
  };
  if (dashboardByDigit[s]) return dashboardByDigit[s];
  const k = s.toLowerCase();
  const map: Record<string, string> = {
    new: "New",
    pending: "Pending",
    approved: "Accepted",
    accepted: "Accepted",
    rejected: "Failed",
    converted: "Success",
    success: "Success",
    cancelled: "Failed",
    canceled: "Failed",
    expired: "Failed",
    failed: "Failed",
  };
  return map[k] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : "New");
}

function extractPagedRecords(data: any): {
  records: unknown[];
  totalPages: number;
  totalCount: number;
} {
  const d = data ?? {};
  const inner = d.data ?? d;
  const records = Array.isArray(inner.records)
    ? inner.records
    : Array.isArray(d.records)
    ? d.records
    : [];
  const totalPages = Number(inner.totalPages ?? d.totalPages ?? 0) || 0;
  const rawTotal =
    inner.totalItems ??
    inner.total_count ??
    inner.totalCount ??
    inner.total ??
    inner.count ??
    d.totalItems ??
    d.total_count ??
    d.totalCount;
  let totalCount = Number(rawTotal);
  if (!Number.isFinite(totalCount) || totalCount < 0) totalCount = 0;
  return { records, totalPages, totalCount };
}

export function mapServerQuoteRecord(r: Record<string, unknown>): QuoteRow {
  const mongoId = str(r._id);

  const userRef = nestedObj(r.user_id) ?? nestedObj(r.user);
  const partnerRef = nestedObj(r.partner_id) ?? nestedObj(r.partner);
  const employeeRef = nestedObj(r.employee_id) ?? nestedObj(r.employee);
  const franchiseRef = nestedObj(r.franchise_id);
  const categoryRef = nestedObj(r.category_id) ?? nestedObj(r.category);
  const servicePackageRef = nestedObj(r.service_id);
  const packageServiceRef = servicePackageRef
    ? nestedObj(servicePackageRef.service) ??
      nestedObj(servicePackageRef.service_id)
    : undefined;
  const innerCatalogService = servicePackageRef
    ? nestedObj(servicePackageRef.service_id) ?? packageServiceRef
    : undefined;
  const addressRef =
    nestedObj(r.address_id) ??
    nestedObj(r.address) ??
    nestedObj(r.user_address);

  const quoteId =
    str(
      r.quote_sequence_id ??
        r.quote_id ??
        r.quoteId ??
        r.quote_number ??
        r.reference
    ) || mongoId;

  const catalogServiceId = resolveQuoteCatalogServiceId(r);
  const service_name = resolveQuoteServiceDisplayName(r, catalogServiceId);
  const requested_services = service_name;

  const fromD = isoOrDateToYmd(str(r.from_date ?? r.fromDate ?? ""));
  const toD = isoOrDateToYmd(str(r.to_date ?? r.toDate ?? ""));
  let requested_date = str(r.requested_date);
  if (!requested_date && (fromD || toD)) {
    if (fromD && toD && fromD !== toD) requested_date = `${fromD} to ${toD}`;
    else requested_date = fromD || toD;
  }

  const ws = str(r.work_start_time ?? r.workStartTime);
  const we = str(r.work_end_time ?? r.workEndTime);
  let requested_time = str(r.requested_time);
  if (!requested_time && ws && we) {
    requested_time = `${ws} to ${we}`;
  } else if (!requested_time && ws) {
    requested_time = ws;
  }
  if (!requested_time) requested_time = "-";

  const partnerName = str(
    r.partner_name ??
      r.requested_partner ??
      partnerRef?.name ??
      partnerRef?.partner_name
  );
  const requested_partner =
    str(r.requested_partner) || partnerName || refId(r.partner_id);

  const statusApi = normalizeQuoteApiStatus(
    r.status ?? r.status_label ?? r.status_name ?? r.quote_status ?? "new"
  );
  const status = quoteStatusDisplayLabel(statusApi);

  const user_name = str(
    r.user_name ?? userRef?.name ?? r.customer_name ?? ""
  );
  const user_id = refId(r.user_id) || refId(r.user);

  const addr = addressRef ?? {};
  const cityIdObj = nestedObj(addr.city_id);
  const stateIdObj = nestedObj(addr.state_id);
  const areaIdObj = nestedObj(addr.area_id);
  const door_no = str(addr.door_no ?? addr.door_number ?? r.door_no);
  const state = displayStateName(
    str(stateIdObj?.name ?? addr.state_name ?? addr.state ?? r.state)
  );
  const city = str(
    addr.city ??
      addr.city_name ??
      cityIdObj?.name ??
      r.city ??
      r.user_city
  );
  const area = str(
    areaIdObj?.name ?? addr.area ?? addr.area_name ?? r.area
  );
  const landmark = str(addr.landmark ?? r.landmark);
  const pincode = str(addr.pincode ?? r.pincode);
  const freeformAddress = str(addr.address);
  const address_line = freeformAddress;
  const explicitStreet = str(addr.street ?? addr.street_name ?? r.street);
  let streetCombined = explicitStreet;
  if (!streetCombined && freeformAddress) {
    streetCombined =
      stripKnownAddressParts(freeformAddress, [state, city, area]) ||
      freeformAddress;
  }

  return {
    _id: mongoId || quoteId,
    quote_id: quoteId,
    requested_services,
    requested_partner,
    partner_name: partnerName || undefined,
    employee_id: refId(r.employee_id) || str(r.employeeId) || undefined,
    employee_name:
      str(r.employee_name ?? r.employeeName ?? employeeRef?.name) || undefined,
    employee_phone:
      str(
        r.employee_phone ??
          r.employeePhone ??
          employeeRef?.phone_number
      ) || undefined,
    user_name,
    door_no,
    street: streetCombined,
    city,
    requested_date,
    requested_time,
    from_date: fromD || undefined,
    to_date: toD || undefined,
    work_start_time: ws || undefined,
    work_end_time: we || undefined,
    work_hours_per_day: readQuoteAmount(
      r,
      "work_hours_per_day",
      "workHoursPerDay"
    ),
    total_work_hours: readQuoteAmount(
      r,
      "total_work_hours",
      "totalWorkHours"
    ),
    total_service_charge: readQuoteAmount(
      r,
      "total_service_charge",
      "totalServiceCharge"
    ),
    service_price:
      readQuoteAmount(r, "service_price", "servicePrice", "price") ??
      readQuoteAmount(r, "total_service_charge", "totalServiceCharge"),
    commission_percent: readQuoteAmount(
      r,
      "commission_percent",
      "commissionPercent",
      "commission_percentage"
    ),
    commission_amount: readQuoteAmount(
      r,
      "commission_amount",
      "commissionAmount"
    ),
    tax_percent: readQuoteAmount(
      r,
      "tax_percent",
      "taxPercent",
      "tax_percentage"
    ),
    tax_amount: readQuoteAmount(r, "tax_amount", "taxAmount"),
    sub_total: readQuoteAmount(r, "sub_total", "subTotal", "subtotal"),
    total_price: readQuoteAmount(
      r,
      "total_price",
      "totalPrice",
      "grand_total"
    ),
    minimum_deposit_percent: readQuoteAmount(
      r,
      "minimum_deposit_percent",
      "minimumDepositPercent"
    ),
    minimum_deposit_amount: readQuoteAmount(
      r,
      "minimum_deposit_amount",
      "minimumDepositAmount",
      "minimum_deposit"
    ),
    scheduled_date: str(
      r.scheduled_date ?? r.scheduledDate ?? r.scheduled_service_date
    ),
    service_from_time: str(
      r.scheduled_time_from ??
        r.service_from_time ??
        r.scheduled_start_time
    ),
    service_to_time: str(
      r.scheduled_time_to ?? r.service_to_time ?? r.scheduled_end_time
    ),
    order_id: resolveQuoteOrderDisplayId(r),
    cancellation_reason:
      str(r.cancellation_reason ?? r.cancellationReason) || undefined,
    rejection_reason:
      str(r.rejection_reason ?? r.rejectionReason) || undefined,
    services: str(r.services ?? r.service_summary) || undefined,
    order_status: str(r.order_status) || undefined,
    payment_method: str(r.payment_method) || undefined,
    payment_status: str(r.payment_status) || undefined,
    payment_reference: str(r.payment_reference) || undefined,
    payment_date: str(r.payment_date) || undefined,
    status,
    user_id: user_id || undefined,
    phone_number:
      str(
        r.phone_number ??
          userRef?.phone_number ??
          r.user_phone ??
          addr.contact_number
      ) || undefined,
    user_email: str(r.user_email ?? userRef?.email) || undefined,
    user_city: str(r.user_city ?? userRef?.city_name ?? city) || undefined,
    profile_url: (() => {
      const s = str(r.profile_url ?? userRef?.profile_url);
      return s || null;
    })(),
    partner_profile_url: (() => {
      const s = str(r.partner_profile_url ?? partnerRef?.profile_url);
      return s || null;
    })(),
    employee_profile_url: (() => {
      const s = str(r.employee_profile_url ?? employeeRef?.profile_url);
      return s || null;
    })(),
    category_id: refId(r.category_id) || refId(categoryRef) || undefined,
    category_name: str(r.category_name ?? categoryRef?.name) || undefined,
    service_name: service_name || undefined,
    area: area || undefined,
    landmark: landmark || undefined,
    state: state || undefined,
    address_line: address_line || undefined,
    pincode: pincode || undefined,
    service_id: catalogServiceId || undefined,
    partner_id: refId(r.partner_id) || refId(partnerRef) || undefined,
    partner_user_id:
      str(r.partner_user_id ?? partnerRef?.user_id) || undefined,
    partner_phone: str(r.partner_phone ?? partnerRef?.phone_number) || undefined,
    partner_city: str(r.partner_city ?? partnerRef?.city_name) || undefined,
    partner_email: str(r.partner_email ?? partnerRef?.email) || undefined,
    franchise_id: refId(r.franchise_id) || refId(franchiseRef) || undefined,
    franchise_name:
      str(r.franchise_name ?? franchiseRef?.name ?? franchiseRef?.franchise_name) ||
      undefined,
    franchise_state_name:
      str(
        r.franchise_state_name ??
          franchiseRef?.state_name ??
          franchiseRef?.state
      ) || undefined,
    franchise_city_name:
      str(
        r.franchise_city_name ?? franchiseRef?.city_name ?? franchiseRef?.city
      ) || undefined,
    address_id: refId(r.address_id) || refId(addressRef) || undefined,
    employee_email:
      str(r.employee_email ?? employeeRef?.email) || undefined,
    description:
      str(
        r.quote_description ??
          r.customer_description ??
          r.description ??
          r.user_description
      ) || undefined,
    admin_description: str(r.admin_description ?? "") || undefined,
  };
}

export async function fetchQuotes(
  tab: QuoteTabKey,
  page: number,
  pageSize: number,
  filters: QuoteListFilters,
  sort: QuoteListSort = []
): Promise<{
  response: boolean;
  quotes: QuoteRow[];
  totalPages: number;
  totalCount: number;
}> {
  const fid = franchiseIdForApiQuery(filters.franchise_id);
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    status: QUOTE_TAB_API_STATUS[tab],
    include_history: "false",
    ...(filters.keyword ? { search: filters.keyword.trim() } : {}),
    ...(filters.from_date ? { from_date: filters.from_date } : {}),
    ...(filters.to_date ? { to_date: filters.to_date } : {}),
    ...(fid ? { franchise_id: fid } : {}),
  });

  const apiSort = quoteListSortToApi(sort);
  if (apiSort) {
    params.set("sort_by", apiSort.sort_by);
    params.set("sort_order", apiSort.sort_order);
  } else {
    params.set("sort_by", "created_at");
    params.set("sort_order", "desc");
  }

  const res = await apiRequest(
    `${ApiPaths.GET_QUOTES()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    true,
    false
  );

  if (!res.success)
    return { response: false, quotes: [], totalPages: 0, totalCount: 0 };

  const { records, totalPages, totalCount: tc } = extractPagedRecords(
    res.data
  );
  let totalCount = tc;
  const quotes = records.map((row) =>
    mapServerQuoteRecord(row as Record<string, unknown>)
  );

  if (!Number.isFinite(totalCount) || totalCount < 0) {
    totalCount =
      totalPages > 0 && page === totalPages
        ? (totalPages - 1) * pageSize + quotes.length
        : quotes.length;
  }

  return { response: true, quotes, totalPages, totalCount };
}

export async function fetchQuoteServiceOptionsForCategory(
  categoryId: string | null | undefined
): Promise<ServiceDropDownOption[]> {
  const cid = str(categoryId);
  if (!cid) return [];

  return fetchServiceDropDown(cid);
}

/**
 * Loads Add Quote static dropdowns (aligned with Help-PR Postman “Quote” create body sources):
 * `GET /category/getDropDown`, `GET /user/getDropDown?type=4` (customers), `GET /user/getDropDown?type=3` (employees).
 * When `franchiseId` is set (super admin / staff after choosing **Franchise**), adds `franchise_id` to user dropdowns so lists match that franchise.
 */
export async function fetchQuoteCreateOptions(opts?: {
  franchiseId?: string;
}): Promise<{
  quotePartnerOptions: OptionType[];
  quoteUserOptions: QuoteUserOption[];
  quoteEmployeeOptions: OptionType[];
  quoteCategoryOptions: OptionType[];
}> {
  const scopedFranchiseId = franchiseIdForApiQuery(opts?.franchiseId);
  const extra = scopedFranchiseId
    ? { franchise_id: scopedFranchiseId }
    : undefined;
  const [quoteCategoryOptions, customers, employees] = await Promise.all([
    fetchCategoryDropDown(),
    fetchUserDropDown(CUSTOMER_USER_TYPE, undefined, extra),
    fetchUserDropDown(EMPLOYEE_USER_TYPE, undefined, extra),
  ]);

  const quoteUserOptions: QuoteUserOption[] = (customers.users ?? []).map(
    (u: any) => {
      const name = str(u.name) || str(u._id);
      const phone = str(u.phone_number);
      const label = phone ? `${name} (${phone})` : name;
      return {
        value: str(u._id),
        label,
        user_name: name,
      };
    }
  );

  const quoteEmployeeOptions: OptionType[] = (employees.users ?? []).map(
    (u: any) => ({
      value: str(u._id),
      label: str(u.name) || str(u._id),
    })
  );

  return {
    quotePartnerOptions: [],
    quoteUserOptions: quoteUserOptions.sort((a, b) =>
      a.user_name.localeCompare(b.user_name)
    ),
    quoteEmployeeOptions: quoteEmployeeOptions.sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
    quoteCategoryOptions,
  };
}

export async function fetchQuotePartnerDropDown(serviceId?: string): Promise<{
  partners: Array<any>;
}> {
  // Prefer `GET /user/getPartnerDropDown?service_id=…` (Postman); fall back to `GET /user/getDropDown?type=2&service_id=…`.
  const sid = str(serviceId);
  const fromPartnerApi = await fetchPartnerDropDown(sid || undefined);
  if (fromPartnerApi.partners?.length) {
    return { partners: fromPartnerApi.partners };
  }
  const { users } = await fetchUserDropDown(PARTNER_USER_TYPE, sid || undefined);
  return { partners: users };
}

async function quoteMutation(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<boolean> {
  const payload =
    body != null && typeof body === "object" && !Array.isArray(body)
      ? toQuoteApiBody(body as Record<string, unknown>)
      : body;
  const res = await apiRequest(
    path,
    method,
    payload === undefined ? undefined : payload,
    false,
    false,
    false,
    true
  );
  return Boolean(res.success);
}

export type QuoteUpdateResult = {
  success: boolean;
  message?: string;
  record?: Record<string, unknown>;
  order?: { order_id?: string; unique_id?: string };
};

async function quotePut(
  quoteMongoId: string,
  body: Record<string, unknown>
): Promise<QuoteUpdateResult> {
  const id = str(quoteMongoId);
  if (!id) return { success: false };
  const payload = toQuoteApiBody(body);
  const res = await apiRequest(
    ApiPaths.UPDATE_QUOTE(id),
    "PUT",
    payload,
    false,
    false,
    false,
    true
  );
  const data = (res.data ?? {}) as Record<string, unknown>;
  const orderRaw = data.order;
  const order =
    orderRaw != null && typeof orderRaw === "object" && !Array.isArray(orderRaw)
      ? (orderRaw as Record<string, unknown>)
      : undefined;
  return {
    success: Boolean(res.success),
    message: str(data.message) || undefined,
    record:
      data.record != null && typeof data.record === "object"
        ? (data.record as Record<string, unknown>)
        : undefined,
    order: order
      ? {
          order_id: str(order._id ?? order.order_id) || undefined,
          unique_id: str(order.unique_id ?? order.order_id) || undefined,
        }
      : undefined,
  };
}

/**
 * Tax / commission / min-deposit for view breakdown from `GET /quote/get/:id`
 * populated `service_id` / `partner_id` — no related-catalog call.
 */
/** @deprecated Stale import — use `fetchQuoteDetailById` / `extractServiceFeesFromQuoteRecord`. */
export function extractServiceFeesFromQuoteRow(): undefined {
  return undefined;
}

export function extractServiceFeesFromQuoteRecord(
  raw: Record<string, unknown>
): ServiceDropDownOption | undefined {
  const servicePackageRef = nestedObj(raw.service_id) ?? nestedObj(raw.service);
  const packageServiceRef = servicePackageRef
    ? nestedObj(servicePackageRef.service) ??
      nestedObj(servicePackageRef.service_id)
    : undefined;
  const innerCatalogService = servicePackageRef
    ? nestedObj(servicePackageRef.service_id) ?? packageServiceRef
    : undefined;
  const partnerRef = nestedObj(raw.partner_id) ?? nestedObj(raw.partner);

  const catalogServiceId =
    refId(innerCatalogService) ||
    refId(packageServiceRef) ||
    refId(servicePackageRef);
  const providingRowId = refId(servicePackageRef);
  const serviceId =
    catalogServiceId || providingRowId || str(raw.service_id);
  if (!serviceId && !servicePackageRef && !innerCatalogService) return undefined;

  /** On GET /quote/get, tax / commission / min deposit live on the partner-providing row (`service_id`). */
  const feeSourceRow = (servicePackageRef ??
    packageServiceRef ??
    innerCatalogService) as Record<string, unknown> | undefined;
  const catalogInner = innerCatalogService ?? packageServiceRef;

  const feeLabel = pickHumanQuoteServiceLabel(
    [
      innerCatalogService?.name,
      innerCatalogService?.service_name,
      packageServiceRef?.name,
      packageServiceRef?.service_name,
      feeSourceRow?.name,
      feeSourceRow?.service_name,
      raw.service_name,
    ],
    catalogServiceId || serviceId
  );

  const catalogOpt: ServiceDropDownOption | undefined = feeSourceRow
    ? {
        value: catalogServiceId || providingRowId || str(feeSourceRow._id),
        label: feeLabel,
        ...quoteServiceFeeFieldsFromRow(
          catalogInner ?? undefined,
          feeSourceRow
        ),
        payment_type: str(
          servicePackageRef?.payment_type ??
            servicePackageRef?.min_deposit_type ??
            feeSourceRow.payment_type ??
            feeSourceRow.min_deposit_type ??
            ""
        ),
        price:
          servicePackageRef?.price != null
            ? Number(servicePackageRef.price)
            : innerCatalogService?.price != null
            ? Number(innerCatalogService.price)
            : feeSourceRow.price != null
            ? Number(feeSourceRow.price)
            : undefined,
      }
    : catalogServiceId || serviceId
    ? {
        value: catalogServiceId || serviceId,
        label: feeLabel,
      }
    : undefined;

  return mergeQuoteServiceFeesForBreakdown(
    catalogOpt,
    partnerRef ?? null,
    catalogServiceId || serviceId
  );
}

export async function fetchQuoteById(
  quoteMongoId: string
): Promise<QuoteRow | null> {
  const id = str(quoteMongoId);
  if (!id) return null;
  const res = await apiRequest(
    ApiPaths.GET_QUOTE_BY_ID(id),
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!res.success) return null;
  const raw =
    (res.data as any)?.record ??
    (res.data as any)?.data?.record ??
    (res.data as any)?.data;
  if (!raw || typeof raw !== "object") return null;
  return mapServerQuoteRecord(raw as Record<string, unknown>);
}

/** `GET /quote/get/:id` — quote row plus fee fields from populated refs (view modal). */
export async function fetchQuoteDetailById(quoteMongoId: string): Promise<{
  quote: QuoteRow | null;
  serviceFees: ServiceDropDownOption | undefined;
}> {
  const id = str(quoteMongoId);
  if (!id) return { quote: null, serviceFees: undefined };
  const res = await apiRequest(
    ApiPaths.GET_QUOTE_BY_ID(id),
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!res.success) return { quote: null, serviceFees: undefined };
  const raw =
    (res.data as any)?.record ??
    (res.data as any)?.data?.record ??
    (res.data as any)?.data;
  if (!raw || typeof raw !== "object") {
    return { quote: null, serviceFees: undefined };
  }
  const record = raw as Record<string, unknown>;
  let serviceFees = extractServiceFeesFromQuoteRecord(record);
  let quote = applyQuoteServiceNameFromFees(
    mapServerQuoteRecord(record),
    serviceFees
  );
  quote = await enrichQuoteRowServiceName(quote);
  const resolvedName = pickHumanQuoteServiceLabel(
    [quote.service_name, quote.requested_services],
    quote.service_id
  );
  if (
    resolvedName &&
    serviceFees &&
    (!serviceFees.label ||
      isMongoObjectId(serviceFees.label) ||
      serviceFees.label === quote.service_id)
  ) {
    serviceFees = { ...serviceFees, label: resolvedName };
  }
  return { quote, serviceFees };
}

export async function fetchCustomerQuotes(
  userId: string
): Promise<QuoteRow[]> {
  const uid = str(userId);
  if (!uid) return [];
  const res = await apiRequest(
    `${ApiPaths.GET_QUOTE_CUSTOMER_QUOTES()}?user_id=${encodeURIComponent(
      uid
    )}`,
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!res.success) return [];
  const { records } = extractPagedRecords(res.data);
  return records.map((r) => mapServerQuoteRecord(r as Record<string, unknown>));
}

/** POST `/quote/create` — `service_price` is the scheduled service total only (Add Quote breakdown is UI-only). */
export type CreateQuoteBody = {
  user_id: string;
  category_id: string;
  service_id: string;
  partner_id?: string;
  employee_id?: string;
  service_price: number;
  franchise_id: string;
  address_id: string;
  created_by_id: string;
  from_date: string;
  to_date: string;
  work_hours_per_day: number;
  total_work_hours: number;
  work_start_time: string;
  work_end_time: string;
  /** User notes (`quote_description`). */
  quote_description?: string;
  /** Admin notes. */
  admin_description?: string;
};

export async function createQuote(body: CreateQuoteBody): Promise<boolean> {
  return quoteMutation("POST", ApiPaths.CREATE_QUOTE(), body);
}

export async function updateQuote(
  quoteMongoId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const res = await quotePut(quoteMongoId, patch);
  return res.success;
}

/** PUT `/quote/update/:id` with `status: "accepted"`. */
export async function approveQuote(quoteMongoId: string): Promise<boolean> {
  return updateQuote(quoteMongoId, { status: "accepted" });
}

/** PUT `/quote/update/:id` with `status: "failed"` + `rejection_reason`. */
export async function rejectQuote(
  quoteMongoId: string,
  rejection_reason: string
): Promise<boolean> {
  return updateQuote(quoteMongoId, {
    status: "failed",
    rejection_reason: str(rejection_reason) || "Rejected",
  });
}

/** PUT `/quote/update/:id` with `status: "failed"` + `cancellation_reason`. */
export async function cancelQuote(
  quoteMongoId: string,
  cancellation_reason: string
): Promise<boolean> {
  return updateQuote(quoteMongoId, {
    status: "failed",
    cancellation_reason: str(cancellation_reason) || "Cancelled",
  });
}

export type ConvertQuoteToOrderResult = {
  ok: boolean;
  orderUniqueId?: string;
  alreadyLinked?: boolean;
};

/** PUT `/quote/update/:id` with `status: "success"` (creates order; idempotent if already linked). */
export async function convertQuoteToOrder(
  quoteMongoId: string
): Promise<ConvertQuoteToOrderResult> {
  const res = await quotePut(quoteMongoId, { status: "success" });
  if (!res.success) return { ok: false };
  const msg = str(res.message).toLowerCase();
  const alreadyLinked = msg.includes("already linked");
  const orderUniqueId =
    res.order?.unique_id ||
    str(res.record?.order_id) ||
    res.order?.order_id ||
    undefined;
  return { ok: true, orderUniqueId, alreadyLinked };
}

export async function deleteQuote(quoteMongoId: string): Promise<boolean> {
  const id = str(quoteMongoId);
  if (!id) return false;
  return quoteMutation("DELETE", ApiPaths.DELETE_QUOTE(id));
}

export type QuoteHeaderPatch = {
  service_price?: number;
  /** API status key or display label (`new`, `Accepted`, …). */
  status?: string;
  rejection_reason?: string;
  cancellation_reason?: string;
};

/** Price and/or status via single PUT `/quote/update/:id`. */
export async function applyQuoteHeaderPatch(
  quoteMongoId: string,
  patch: QuoteHeaderPatch
): Promise<boolean> {
  const body: Record<string, unknown> = {};

  if (patch.service_price != null) {
    body.service_price = patch.service_price;
  }

  if (patch.status != null) {
    const sk = normalizeQuoteApiStatus(patch.status);
    if (!sk) return false;
    body.status = sk;
    if (sk === "failed") {
      if (patch.cancellation_reason) {
        body.cancellation_reason = str(patch.cancellation_reason);
      } else if (patch.rejection_reason) {
        body.rejection_reason = str(patch.rejection_reason);
      } else {
        body.rejection_reason = "Marked as failed";
      }
    }
  }

  if (Object.keys(body).length === 0) return true;
  return updateQuote(quoteMongoId, body);
}

export async function applyQuoteSchedulePatch(
  quoteMongoId: string,
  patch: {
    scheduled_date: string;
    scheduled_time_from: string;
    scheduled_time_to: string;
    status: string;
  }
): Promise<boolean> {
  const id = str(quoteMongoId);
  if (!id) return false;

  const ymd =
    patch.scheduled_date.length >= 10
      ? patch.scheduled_date.slice(0, 10)
      : patch.scheduled_date;
  const ws = amPmDisplayToHHmm(patch.scheduled_time_from);
  const we = amPmDisplayToHHmm(patch.scheduled_time_to);
  if (!ymd || !ws || !we) return false;

  const perDay = ceilWholeHoursBetweenHHmm(ws, we);
  const total = perDay;

  const ok = await updateQuote(id, {
    from_date: ymd,
    to_date: ymd,
    work_start_time: ws,
    work_end_time: we,
    work_hours_per_day: perDay,
    total_work_hours: total,
  });
  if (!ok) return false;
  if (!patch.status) return true;
  return applyQuoteHeaderPatch(id, { status: patch.status });
}

export async function updateQuotePartner(
  quoteMongoId: string,
  partner_id: string
): Promise<boolean> {
  const id = str(quoteMongoId);
  if (!id || !str(partner_id)) return false;
  return updateQuote(id, { partner_id: str(partner_id) });
}

export async function updateQuoteEmployee(
  quoteMongoId: string,
  employee_id: string
): Promise<boolean> {
  const id = str(quoteMongoId);
  if (!id || !str(employee_id)) return false;
  return updateQuote(id, { employee_id: str(employee_id) });
}

/** Resolve `franchise_id` for create quote (franchise users vs admin). */
export function resolveFranchiseIdForQuoteForm(
  selectedFranchiseId: string | undefined | null
): string {
  const role = getLocalStorage(AppConstant.userRole);
  const selected = str(selectedFranchiseId);
  if (
    role === UserRole.FRANCHISE_ADMIN ||
    role === UserRole.EMPLOYEE
  ) {
    return str(getLocalStorage(AppConstant.partnerId)) || selected;
  }
  return selected;
}

export function buildCreateQuotePayload(input: {
  user_id: string;
  category_id: string;
  service_id: string;
  partner_id?: string;
  employee_id?: string;
  service_price: number;
  franchise_id: string;
  address_id: string;
  scheduleMode: QuoteServiceScheduleMode;
  requested_date: string;
  requested_date_to: string;
  requested_time: string;
  requested_time_from: string;
  requested_time_to: string;
  user_description?: string;
  admin_description?: string;
}): CreateQuoteBody | null {
  const created_by_id = str(getLocalStorage(AppConstant.createdById));
  const franchise_id = str(input.franchise_id);
  const user_id = str(input.user_id);
  const category_id = str(input.category_id);
  const service_id = str(input.service_id);
  if (!user_id || !category_id || !service_id || !franchise_id || !created_by_id)
    return null;

  const metrics = deriveQuoteScheduleMetrics({
    scheduleMode: input.scheduleMode,
    requested_date: input.requested_date,
    requested_date_to: input.requested_date_to,
    requested_time: input.requested_time,
    requested_time_from: input.requested_time_from,
    requested_time_to: input.requested_time_to,
  });
  if (!metrics) return null;

  const userDescription = str(input.user_description);
  const adminDescription = str(input.admin_description);
  return {
    user_id,
    category_id,
    service_id,
    partner_id: str(input.partner_id) || undefined,
    employee_id: str(input.employee_id) || undefined,
    service_price: input.service_price,
    franchise_id,
    address_id: str(input.address_id),
    created_by_id,
    from_date: metrics.from_date,
    to_date: metrics.to_date,
    work_hours_per_day: metrics.work_hours_per_day,
    total_work_hours: metrics.total_work_hours,
    work_start_time: metrics.work_start_time,
    work_end_time: metrics.work_end_time,
    ...(userDescription ? { quote_description: userDescription } : {}),
    ...(adminDescription ? { admin_description: adminDescription } : {}),
  };
}
