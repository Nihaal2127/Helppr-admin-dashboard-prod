import { apiRequest } from "../lib/global/remote/apiHelper";
import { showErrorAlert } from "../lib/global/alertHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import type {
  PartnerSubscriptionModel,
  PostModel,
} from "../lib/types/partnerManagementTypes";
import type { SubscriptionPlanModel } from "../lib/models/SubscriptionPlanModel";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";
import { capitalizeString } from "../helper/utility";
import {
  franchiseIdForScopedListApi,
  sessionMayUseFranchiseIdApiFilter,
} from "../lib/franchise/headerFranchisePreference";
import { getCount } from "./getCountService";
import { resolveMediaAssetSrc } from "./documentUploadService";

export type PortfolioRow = {
  _id: string;
  partner_id: string;
  partner_name: string;
  franchise_id?: string;
  franchise_name: string;
  category: string;
  service: string;
  /** All category names from profile `categories[]` (view dialog). */
  category_names?: string[];
  /** All service names from profile nested `services[]` (view dialog). */
  service_names?: string[];
  total_posts: string;
  total_images: string;
  total_videos: string;
  likes_count: string;
  comments_count: string;
  saves_count: string;
  ratings: string;
  location: string;
  is_active: boolean;
};

type ListStats = { Total: number; Active: number; Inactive: number };

function statsFor(list: Array<{ is_active: boolean }>): ListStats {
  const total = list.length;
  const active = list.filter((x) => x.is_active).length;
  return { Total: total, Active: active, Inactive: total - active };
}

function parseSubscriptionPlanRecord(
  raw: Record<string, unknown>
): SubscriptionPlanModel {
  const id = raw._id ?? raw.id;
  return {
    _id: id != null ? String(id) : "",
    plan_name: String(raw.plan_name ?? "").toLowerCase(),
    plan_description: String(raw.plan_description ?? ""),
    price: raw.price != null && raw.price !== "" ? String(raw.price) : "",
    duration:
      raw.duration != null && raw.duration !== "" ? String(raw.duration) : "",
    duration_type: String(raw.duration_type ?? ""),
    priority:
      raw.priority != null && raw.priority !== "" ? String(raw.priority) : "",
    is_active: Boolean(raw.is_active),
  };
}

function pickSubscriptionPlanListRoot(
  d: Record<string, unknown>
): Record<string, unknown> {
  const inner = d.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return d;
}

function subscriptionPlanListStatsFromResponse(
  root: Record<string, unknown>,
  records: SubscriptionPlanModel[]
): ListStats {
  const st = root.stats as ListStats | undefined;
  if (st && typeof st.Total === "number") return st;

  const total = Number(
    root.total ?? root.totalDocs ?? root.total_count ?? root.count
  );
  const activeN = Number(
    root.active_count ?? root.activeCount ?? root.active_total
  );
  const inactiveN = Number(
    root.inactive_count ?? root.inactiveCount ?? root.inactive_total
  );
  if (
    Number.isFinite(total) &&
    Number.isFinite(activeN) &&
    Number.isFinite(inactiveN)
  ) {
    return { Total: total, Active: activeN, Inactive: inactiveN };
  }
  if (Number.isFinite(total) && Number.isFinite(activeN)) {
    return {
      Total: total,
      Active: activeN,
      Inactive: Math.max(0, total - activeN),
    };
  }
  return statsFor(records);
}

function buildSubscriptionPlanCreateBody(
  plan: SubscriptionPlanModel
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    plan_name: String(plan.plan_name ?? "")
      .trim()
      .toLowerCase(),
    plan_description: String(plan.plan_description ?? "").trim(),
    price: Number(String(plan.price ?? "").replace(/,/g, "")) || 0,
    duration: Number(String(plan.duration ?? "").replace(/,/g, "")) || 0,
    duration_type: String(plan.duration_type ?? "")
      .trim()
      .toLowerCase(),
    is_active: Boolean(plan.is_active),
  };
  const pr = plan.priority != null && String(plan.priority).trim() !== "";
  if (pr) body.priority = Number(String(plan.priority).replace(/,/g, "")) || 0;
  return body;
}

function buildSubscriptionPlanUpdateBody(
  plan: SubscriptionPlanModel
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    plan_description: String(plan.plan_description ?? "").trim(),
    price: Number(String(plan.price ?? "").replace(/,/g, "")) || 0,
    duration: Number(String(plan.duration ?? "").replace(/,/g, "")) || 0,
    duration_type: String(plan.duration_type ?? "")
      .trim()
      .toLowerCase(),
    is_active: Boolean(plan.is_active),
  };
  const pr = plan.priority != null && String(plan.priority).trim() !== "";
  if (pr) body.priority = Number(String(plan.priority).replace(/,/g, "")) || 0;
  return body;
}

export async function fetchSubscriptionPlans(
  page: number,
  limit: number,
  filters: { name?: string; status?: string; sort?: string },
  sortBy: ServerTableSortBy = []
): Promise<{
  response: boolean;
  records: SubscriptionPlanModel[];
  totalPages: number;
  stats: ListStats;
}> {
  const primarySort = sortBy[0];

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const nameTrim = (filters.name ?? "").trim();
  if (nameTrim) {
    params.set("name", nameTrim);
    params.set("keyword", nameTrim);
    const lower = nameTrim.toLowerCase();
    if (["basic", "silver", "gold", "platinum"].includes(lower)) {
      params.set("plan_name", lower);
    }
  }
  if (filters.status && filters.status !== "all") {
    const s = filters.status.toLowerCase();
    if (s === "active") params.set("is_active", "true");
    else if (s === "inactive" || s === "expired")
      params.set("is_active", "false");
    else if (s === "true" || s === "false") params.set("is_active", s);
  }
  if (filters.sort) params.set("sort", filters.sort);
  if (primarySort?.id) {
    params.set("sort_by", primarySort.id);
    params.set("sort_order", primarySort.desc ? "desc" : "asc");
  }

  const res = await apiRequest(
    `${ApiPaths.SUBSCRIPTION_PLAN_GET_ALL()}?${params.toString()}`,
    "GET"
  );
  if (!res.success) {
    return {
      response: false,
      records: [],
      totalPages: 0,
      stats: { Total: 0, Active: 0, Inactive: 0 },
    };
  }

  const root = pickSubscriptionPlanListRoot(
    (res.data ?? {}) as Record<string, unknown>
  );
  const rawList = (root.records ?? root.list ?? []) as Record<
    string,
    unknown
  >[];
  const records = Array.isArray(rawList)
    ? rawList.map((r) => parseSubscriptionPlanRecord(r))
    : [];
  const totalPages = Number(root.totalPages ?? root.total_pages ?? 0) || 0;
  const stats = subscriptionPlanListStatsFromResponse(root, records);

  return { response: true, records, totalPages, stats };
}

export async function voidSubscriptionPlan(id: string): Promise<boolean> {
  const res = await apiRequest(ApiPaths.SUBSCRIPTION_PLAN_DELETE(id), "DELETE");
  return Boolean(res.success);
}

export async function saveSubscriptionPlan(
  plan: SubscriptionPlanModel,
  isUpdate: boolean
): Promise<boolean> {
  if (isUpdate) {
    if (!plan._id) return false;
    const res = await apiRequest(
      ApiPaths.SUBSCRIPTION_PLAN_UPDATE(plan._id),
      "PUT",
      buildSubscriptionPlanUpdateBody(plan)
    );
    return Boolean(res.success);
  }
  const res = await apiRequest(
    ApiPaths.SUBSCRIPTION_PLAN_CREATE,
    "POST",
    buildSubscriptionPlanCreateBody(plan)
  );
  return Boolean(res.success);
}

export type SubscriptionPlanOption = {
  value: string;
  label: string;
  price: number | null;
};

export async function fetchSubscriptionPlanOptions(): Promise<
  SubscriptionPlanOption[]
> {
  const res = await apiRequest(
    ApiPaths.SUBSCRIPTION_PLAN_GET_DROP_DOWN(),
    "GET"
  );
  if (!res.success) return [];

  const root = pickSubscriptionPlanListRoot(
    (res.data ?? {}) as Record<string, unknown>
  );
  const rawList = (root.records ??
    root.list ??
    res.data?.records ??
    []) as Record<string, unknown>[];
  if (!Array.isArray(rawList)) return [];

  const out: SubscriptionPlanOption[] = [];
  for (const r of rawList) {
    const name = String(r.plan_name ?? "")
      .trim()
      .toLowerCase();
    if (!name) continue;
    if (r.is_active === false) continue;
    const id =
      r._id != null && String(r._id).trim() !== "" ? String(r._id) : "";
    const priceRaw = r.price;
    const priceNum =
      typeof priceRaw === "number"
        ? priceRaw
        : priceRaw != null && String(priceRaw).trim() !== ""
        ? Number(priceRaw)
        : NaN;
    out.push({
      value: id || name,
      label: capitalizeString(name),
      price: Number.isFinite(priceNum) ? priceNum : null,
    });
  }
  return out;
}

export async function fetchSubscriptionPlanDropDown(): Promise<
  { value: string; label: string }[]
> {
  const opts = await fetchSubscriptionPlanOptions();
  return opts.map(({ value, label }) => ({ value, label }));
}

function pickPartnerSubListRoot(
  d: Record<string, unknown>
): Record<string, unknown> {
  const inner = d.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return d;
}

function mapPartnerSubscriptionApiRecord(
  raw: Record<string, unknown>
): PartnerSubscriptionModel {
  const id = String(
    raw._id ??
      raw.id ??
      raw.subscription_id ??
      raw.partner_subscription_id ??
      ""
  ).trim();

  let partnerId = "";
  let partnerName = String(raw.partner_name ?? "");
  const pid = raw.partner_id;
  if (typeof pid === "string") {
    partnerId = pid;
  } else if (pid && typeof pid === "object") {
    const po = pid as Record<string, unknown>;
    partnerId = String(po._id ?? po.id ?? "");
    partnerName = partnerName || String(po.name ?? po.partner_name ?? "");
  }

  let planId = "";
  let planName = "";
  const spRef = raw.subscription_plan;
  const spIdField = raw.subscription_plan_id;
  if (typeof spIdField === "string" && spIdField.trim()) {
    planId = spIdField.trim();
  } else if (spIdField && typeof spIdField === "object") {
    const p = spIdField as Record<string, unknown>;
    planId = String(p._id ?? p.id ?? "");
    planName = String(p.plan_name ?? "").toLowerCase();
  } else if (typeof spRef === "string") {
    planName = spRef.toLowerCase();
  } else if (spRef && typeof spRef === "object") {
    const p = spRef as Record<string, unknown>;
    planId = planId || String(p._id ?? p.id ?? "");
    planName = String(p.plan_name ?? "").toLowerCase();
  }

  const start = String(
    raw.started_at ?? raw.subscription_start_date ?? raw.start_date ?? ""
  ).slice(0, 10);
  const end = String(
    raw.expires_at ?? raw.subscription_end_date ?? raw.end_date ?? ""
  ).slice(0, 10);
  const statusStr = String(raw.status ?? "").toLowerCase();
  const isActive = statusStr === "active" || raw.is_active === true;

  return {
    _id: id,
    partner_id: partnerId,
    partner_name: partnerName,
    subscription_plan: planName,
    subscription_plan_id: planId,
    subscription_start_date: start,
    subscription_end_date: end,
    rating: String(raw.rating ?? ""),
    location: String(raw.location ?? ""),
    address: String(raw.address ?? ""),
    banner_image: String(raw.banner_image ?? ""),
    is_active: isActive,
    notes: String(raw.notes ?? ""),
  };
}

/** Maps react-table column ids to `GET …/partner-subscription/getAll` `sort_by` values. */
function mapPartnerSubscriptionSortField(columnId: string): string {
  const id = String(columnId ?? "").trim();
  const map: Record<string, string> = {
    partner_name: "partner_name",
    subscription_plan: "subscription_plan",
    subscription_start_date: "subscription_start_date",
    subscription_end_date: "subscription_end_date",
    is_active: "is_active",
  };
  return map[id] ?? id;
}

function resolvePartnerSubscriptionTotalPages(
  root: Record<string, unknown>,
  limit: number,
  recordCount: number
): number {
  const explicit = Number(root.totalPages ?? root.total_pages ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const total = Number(
    root.total ?? root.totalDocs ?? root.total_count ?? root.count ?? 0
  );
  if (Number.isFinite(total) && total > 0 && limit > 0) {
    return Math.max(1, Math.ceil(total / limit));
  }
  if (recordCount > 0 && limit > 0) return 1;
  return 0;
}

function partnerSubListStatsFromResponse(
  root: Record<string, unknown>,
  records: PartnerSubscriptionModel[]
): ListStats {
  const st = root.stats as ListStats | undefined;
  if (st && typeof st.Total === "number") return st;
  const total = Number(
    root.total ?? root.totalDocs ?? root.total_count ?? root.count
  );
  const activeN = Number(root.active_count ?? root.activeCount);
  const inactiveN = Number(root.inactive_count ?? root.inactiveCount);
  if (
    Number.isFinite(total) &&
    Number.isFinite(activeN) &&
    Number.isFinite(inactiveN)
  ) {
    return { Total: total, Active: activeN, Inactive: inactiveN };
  }
  if (Number.isFinite(total) && Number.isFinite(activeN)) {
    return {
      Total: total,
      Active: activeN,
      Inactive: Math.max(0, total - activeN),
    };
  }
  return statsFor(records);
}

export async function fetchPartnerSubscriptions(
  page: number,
  limit: number,
  filters: {
    name?: string;
    status?: string;
    sort?: string;
    planType?: string;
    /** UI passes Area _id (`fetchAreaDropDown`) or "all". */
    location?: string;
    fromDate?: string;
    toDate?: string;
    /** Optional server-side scoping when supported by backend. */
    cityId?: string;
    franchiseId?: string;
  },
  sortBy: ServerTableSortBy = []
): Promise<{
  response: boolean;
  records: PartnerSubscriptionModel[];
  totalPages: number;
  stats: ListStats;
}> {
  const primarySort = sortBy[0];

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const statusLower = (filters.status ?? "").toLowerCase();
  if (statusLower && statusLower !== "all") {
    if (statusLower === "active" || statusLower === "true")
      params.set("status", "active");
    else if (statusLower === "inactive" || statusLower === "false")
      params.set("status", "cancelled");
    else if (statusLower === "expired") params.set("status", "expired");
    else params.set("status", statusLower);
  }
  const nameKw = (filters.name ?? "").trim();
  if (nameKw) {
    /** Postman: `search` = partner name substring; also accepts `partner_name`. */
    params.set("search", nameKw);
    params.set("partner_name", nameKw);
  }
  const planT = (filters.planType ?? "").trim();
  if (planT && planT !== "all") {
    if (/^[a-f\d]{24}$/i.test(planT)) {
      params.set("subscription_plan_id", planT);
    } else {
      const slug = planT.trim().toLowerCase();
      if (["basic", "silver", "gold", "platinum"].includes(slug)) {
        params.set("plan_name", slug);
        params.set("subscription_plan", slug);
      }
    }
  }
  const areaId = (filters.location ?? "").trim();
  if (areaId && areaId !== "all" && /^[a-f\d]{24}$/i.test(areaId)) {
    params.set("area_id", areaId);
  }
  const fromDate = (filters.fromDate ?? "").trim().slice(0, 10);
  const toDate = (filters.toDate ?? "").trim().slice(0, 10);
  /** Postman: `from_date` / `to_date` on `started_at` (from only, to only, or range). */
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  const cityId = (filters.cityId ?? "").trim();
  if (cityId && /^[a-f\d]{24}$/i.test(cityId)) {
    params.set("city_id", cityId);
  }
  const franchiseId = (filters.franchiseId ?? "").trim();
  if (
    sessionMayUseFranchiseIdApiFilter() &&
    franchiseId &&
    /^[a-f\d]{24}$/i.test(franchiseId)
  ) {
    params.set("franchise_id", franchiseId);
  }
  if (filters.sort) params.set("sort", filters.sort);
  if (primarySort?.id) {
    params.set("sort_by", mapPartnerSubscriptionSortField(primarySort.id));
    params.set("sort_order", primarySort.desc ? "desc" : "asc");
  }

  const res = await apiRequest(
    `${ApiPaths.PARTNER_SUBSCRIPTION_GET_ALL()}?${params.toString()}`,
    "GET"
  );
  if (!res.success)
    return {
      response: false,
      records: [],
      totalPages: 0,
      stats: { Total: 0, Active: 0, Inactive: 0 },
    };
  const root = pickPartnerSubListRoot(
    (res.data ?? {}) as Record<string, unknown>
  );
  const rawList = (root.records ?? root.list ?? []) as Record<
    string,
    unknown
  >[];
  const records = Array.isArray(rawList)
    ? rawList.map((r) => mapPartnerSubscriptionApiRecord(r))
    : [];

  const totalPages = resolvePartnerSubscriptionTotalPages(
    root,
    limit,
    records.length
  );
  const stats = partnerSubListStatsFromResponse(root, records);
  return { response: true, records, totalPages, stats };
}

export async function voidPartnerSubscription(id: string): Promise<boolean> {
  const res = await apiRequest(
    ApiPaths.PARTNER_SUBSCRIPTION_DELETE(id),
    "DELETE"
  );
  return Boolean(res.success);
}

/**
 * Persists a partner subscription. Update vs create is determined only by `sub._id`
 * (Postman: `PUT /partner-subscription/update/:id` vs `POST /partner-subscription/create`).
 */
export async function savePartnerSubscription(
  sub: PartnerSubscriptionModel
): Promise<boolean> {
  const updateExisting = Boolean(String(sub._id ?? "").trim());

  if (updateExisting) {
    if (!String(sub._id ?? "").trim()) {
      showErrorAlert("Missing subscription id; cannot update this record.");
      return false;
    }
    const body: Record<string, unknown> = {
      status: sub.is_active ? "active" : "cancelled",
    };
    const notes = (sub.notes ?? "").trim();
    if (notes) body.notes = notes;
    if (sub.subscription_start_date?.trim())
      body.started_at = sub.subscription_start_date.trim();
    if (sub.subscription_end_date?.trim())
      body.expires_at = sub.subscription_end_date.trim();
    const pid = (sub.subscription_plan_id ?? "").trim();
    if (pid && /^[a-f\d]{24}$/i.test(pid)) {
      body.subscription_plan_id = pid;
    }
    const res = await apiRequest(
      ApiPaths.PARTNER_SUBSCRIPTION_UPDATE(String(sub._id)),
      "PUT",
      body
    );
    return Boolean(res.success);
  }

  const planId = (
    sub.subscription_plan_id ||
    sub.subscription_plan ||
    ""
  ).trim();
  const partnerId = (sub.partner_id || "").trim();
  if (!partnerId || !planId) {
    showErrorAlert("Partner and subscription plan are required before saving.");
    return false;
  }
  const createBody: Record<string, unknown> = {
    partner_id: partnerId,
    subscription_plan_id: planId,
  };
  const n = (sub.notes ?? "").trim();
  if (n) createBody.notes = n;
  if (sub.subscription_start_date?.trim())
    createBody.started_at = sub.subscription_start_date.trim();
  if (sub.subscription_end_date?.trim())
    createBody.expires_at = sub.subscription_end_date.trim();
  const res = await apiRequest(
    ApiPaths.PARTNER_SUBSCRIPTION_CREATE,
    "POST",
    createBody
  );
  return Boolean(res.success);
}

function formatPortfolioCount(val: unknown): string {
  if (val == null || val === "") return "0";
  return String(val);
}

function isMongoObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

function pickPartnersBrowseEnvelope(d: Record<string, unknown>): {
  partners: Record<string, unknown>[];
  totalPages: number;
  totalItems: number;
} {
  const inner =
    d.data != null && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : d;
  const partnersRaw = (inner.partners ?? d.partners ?? []) as unknown[];
  const partners = Array.isArray(partnersRaw)
    ? partnersRaw.filter(
        (row) => row != null && typeof row === "object" && !Array.isArray(row)
      )
    : [];
  const totalPages = Number(
    d.totalPages ?? inner.totalPages ?? d.total_pages ?? inner.total_pages ?? 0
  );
  const totalItems = Number(
    d.totalItems ??
      inner.totalItems ??
      d.total ??
      inner.total ??
      partners.length
  );
  return {
    partners: partners as Record<string, unknown>[],
    totalPages: Number.isFinite(totalPages) ? totalPages : 0,
    totalItems: Number.isFinite(totalItems) ? totalItems : 0,
  };
}

function extractPartnerCatalogNameLists(raw: Record<string, unknown>): {
  category_names: string[];
  service_names: string[];
} {
  const categoriesArr = Array.isArray(raw.categories) ? raw.categories : [];
  const categoryNames: string[] = [];
  const serviceNames: string[] = [];
  const seenCategories = new Set<string>();
  const seenServices = new Set<string>();

  for (const cat of categoriesArr) {
    if (!cat || typeof cat !== "object") continue;
    const catObj = cat as Record<string, unknown>;
    const catName = String(
      catObj.category_name ?? catObj.name ?? catObj.category ?? ""
    ).trim();
    if (catName && !seenCategories.has(catName.toLowerCase())) {
      seenCategories.add(catName.toLowerCase());
      categoryNames.push(catName);
    }
    const services = Array.isArray(catObj.services) ? catObj.services : [];
    for (const svc of services) {
      if (!svc || typeof svc !== "object") continue;
      const svcObj = svc as Record<string, unknown>;
      const svcName = String(
        svcObj.service_name ?? svcObj.name ?? svcObj.service ?? ""
      ).trim();
      if (svcName && !seenServices.has(svcName.toLowerCase())) {
        seenServices.add(svcName.toLowerCase());
        serviceNames.push(svcName);
      }
    }
  }

  return { category_names: categoryNames, service_names: serviceNames };
}

function firstPartnerCategoryService(raw: Record<string, unknown>): {
  category: string;
  categoryId: string;
  service: string;
  serviceId: string;
} {
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const firstCat = categories[0];
  const catObj =
    firstCat && typeof firstCat === "object"
      ? (firstCat as Record<string, unknown>)
      : null;
  const catServices = catObj?.services;
  const services = Array.isArray(catServices)
    ? catServices
    : Array.isArray(raw.services)
      ? raw.services
      : [];
  const firstSvc = services[0];
  const svcObj =
    firstSvc && typeof firstSvc === "object"
      ? (firstSvc as Record<string, unknown>)
      : null;

  return {
    category: String(
      catObj?.name ?? catObj?.category_name ?? raw.category ?? raw.category_name ?? ""
    ).trim(),
    categoryId: String(catObj?._id ?? catObj?.id ?? raw.category_id ?? "").trim(),
    service: String(
      svcObj?.name ??
        svcObj?.service_name ??
        raw.service ??
        raw.service_name ??
        ""
    ).trim(),
    serviceId: String(svcObj?._id ?? svcObj?.id ?? raw.service_id ?? "").trim(),
  };
}

function mapPartnersBrowseToPortfolioRow(
  raw: Record<string, unknown>
): PortfolioRow {
  const { category, service } = firstPartnerCategoryService(raw);
  const { category_names, service_names } = extractPartnerCatalogNameLists(raw);
  const statsSource =
    raw.portfolio && typeof raw.portfolio === "object"
      ? (raw.portfolio as Record<string, unknown>)
      : raw;
  const partnerIdString =
    typeof raw.partner_id === "string" ? raw.partner_id.trim() : "";
  const businessPartnerId = String(
    raw.partner_business_id ??
      raw.partner_code ??
      (partnerIdString && !isMongoObjectId(partnerIdString)
        ? partnerIdString
        : undefined) ??
      ""
  ).trim();
  const partnerMongoId = String(
    raw._id ??
      raw.id ??
      (partnerIdString && isMongoObjectId(partnerIdString)
        ? partnerIdString
        : undefined) ??
      ""
  ).trim();
  const isActiveRaw = raw.is_active ?? raw.isActive;
  const isActive =
    isActiveRaw === false ||
    String(isActiveRaw ?? "").toLowerCase() === "false"
      ? false
      : true;

  const franchiseIdRef =
    raw.franchise_id && typeof raw.franchise_id === "object"
      ? (raw.franchise_id as Record<string, unknown>)
      : null;

  return {
    _id: partnerMongoId || businessPartnerId,
    partner_id: businessPartnerId || partnerMongoId,
    partner_name: String(raw.name ?? raw.partner_name ?? "").trim(),
    franchise_id: String(
      (typeof raw.franchise_id === "string" ? raw.franchise_id : "") ||
        franchiseIdRef?._id ||
        franchiseIdRef?.id ||
        ""
    ).trim(),
    franchise_name: String(
      raw.franchise_name ??
        franchiseIdRef?.name ??
        franchiseIdRef?.franchise_name ??
        ""
    ).trim(),
    category,
    service,
    category_names,
    service_names,
    total_posts: formatPortfolioCount(
      statsSource.total_posts ??
        statsSource.totalPosts ??
        statsSource.posts_count ??
        statsSource.post_count
    ),
    total_images: formatPortfolioCount(
      statsSource.total_images ??
        statsSource.totalImages ??
        statsSource.images_count ??
        statsSource.image_count
    ),
    total_videos: formatPortfolioCount(
      statsSource.total_videos ??
        statsSource.totalVideos ??
        statsSource.videos_count ??
        statsSource.video_count
    ),
    likes_count: formatPortfolioCount(
      statsSource.likes_count ?? statsSource.likesCount ?? statsSource.likes
    ),
    comments_count: formatPortfolioCount(
      statsSource.comments_count ??
        statsSource.commentsCount ??
        statsSource.comments
    ),
    saves_count: formatPortfolioCount(
      statsSource.saves_count ?? statsSource.savesCount ?? statsSource.saves
    ),
    ratings: formatPortfolioCount(
      raw.average_rating ?? raw.ratings ?? raw.rating ?? raw.rating_count
    ),
    location: String(
      raw.location ?? raw.city ?? raw.area ?? raw.area_name ?? ""
    ).trim(),
    is_active: isActive,
  };
}

function portfolioStatsFromPartnersBrowse(
  totalItems: number,
  records: PortfolioRow[]
): ListStats {
  if (totalItems > 0) {
    const active = records.filter((row) => row.is_active).length;
    const inactive = records.filter((row) => !row.is_active).length;
    if (records.length === totalItems) {
      return { Total: totalItems, Active: active, Inactive: inactive };
    }
    return {
      Total: totalItems,
      Active: active > 0 ? active : totalItems,
      Inactive: inactive,
    };
  }
  return statsFor(records);
}

function applyPortfolioClientFilters(
  records: PortfolioRow[],
  filters: {
    name?: string;
    status?: string;
    category?: string;
    service?: string;
    location?: string;
    sort?: string;
  }
): PortfolioRow[] {
  let data = [...records];
  const statusRaw = String(filters.status ?? "").trim().toLowerCase();
  if (statusRaw === "true" || statusRaw === "active") {
    data = data.filter((row) => row.is_active);
  } else if (statusRaw === "false" || statusRaw === "inactive") {
    data = data.filter((row) => !row.is_active);
  }

  const categoryRaw = (filters.category ?? "").trim();
  if (categoryRaw && categoryRaw !== "all" && !isMongoObjectId(categoryRaw)) {
    const needle = categoryRaw.toLowerCase();
    data = data.filter((row) =>
      (row.category || "").toLowerCase().includes(needle)
    );
  }

  const serviceRaw = (filters.service ?? "").trim();
  if (serviceRaw && serviceRaw !== "all" && !isMongoObjectId(serviceRaw)) {
    const needle = serviceRaw.toLowerCase();
    data = data.filter((row) =>
      (row.service || "").toLowerCase().includes(needle)
    );
  }

  const locationRaw = (filters.location ?? "").trim();
  if (locationRaw && locationRaw !== "all") {
    const needle = locationRaw.toLowerCase();
    data = data.filter((row) =>
      (row.location || "").toLowerCase().includes(needle)
    );
  }

  const sortRaw = String(filters.sort ?? "").toLowerCase();
  if (sortRaw) {
    const ascending = sortRaw === "asc" || sortRaw === "1";
    data.sort((a, b) =>
      ascending
        ? a.partner_name.localeCompare(b.partner_name)
        : b.partner_name.localeCompare(a.partner_name)
    );
  }

  return data;
}

export async function fetchPortfolios(
  page: number,
  limit: number,
  filters: {
    name?: string;
    status?: string;
    sort?: string;
    category?: string;
    service?: string;
    location?: string;
    franchiseId?: string;
  },
  sortBy: ServerTableSortBy = []
): Promise<{
  response: boolean;
  records: PortfolioRow[];
  totalPages: number;
  stats: ListStats;
}> {
  const primarySort = sortBy[0];

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const searchText = (filters.name ?? "").trim();
  if (searchText) params.set("search", searchText);

  const categoryFilter = (filters.category ?? "").trim();
  if (categoryFilter && categoryFilter !== "all" && isMongoObjectId(categoryFilter)) {
    params.set("category_id", categoryFilter);
  }
  const serviceFilter = (filters.service ?? "").trim();
  if (serviceFilter && serviceFilter !== "all" && isMongoObjectId(serviceFilter)) {
    params.set("service_id", serviceFilter);
  }

  const franchiseId = (filters.franchiseId ?? "").trim();
  if (franchiseId && isMongoObjectId(franchiseId)) {
    params.set("franchise_id", franchiseId);
  }

  const res = await apiRequest(
    `${ApiPaths.PARTNERS_BROWSE_LIST()}?${params.toString()}`,
    "GET"
  );
  if (!res.success)
    return {
      response: false,
      records: [],
      totalPages: 0,
      stats: { Total: 0, Active: 0, Inactive: 0 },
    };

  const { partners, totalPages, totalItems } = pickPartnersBrowseEnvelope(
    (res.data ?? {}) as Record<string, unknown>
  );
  let records = partners.map((row) => mapPartnersBrowseToPortfolioRow(row));
  records = applyPortfolioClientFilters(records, {
    ...filters,
    sort: primarySort
      ? primarySort.desc
        ? "-1"
        : "1"
      : filters.sort,
  });
  const stats = portfolioStatsFromPartnersBrowse(totalItems, records);
  return {
    response: true,
    records,
    totalPages: Math.max(0, totalPages),
    stats,
  };
}

/** Postman `GET /api/partners/:partnerId` — portfolio view details. */
export async function fetchPortfolioProfile(
  partnerId: string,
  headerFranchiseId?: string | null,
  partnerFranchiseId?: string
): Promise<{ response: boolean; portfolio: PortfolioRow | null }> {
  const id = String(partnerId ?? "").trim();
  if (!id) return { response: false, portfolio: null };

  const params = new URLSearchParams();
  const rowFranchiseId = String(partnerFranchiseId ?? "").trim();
  const scopedFranchiseId =
    (rowFranchiseId && isMongoObjectId(rowFranchiseId)
      ? rowFranchiseId
      : "") || franchiseIdForScopedListApi(headerFranchiseId);
  if (scopedFranchiseId && isMongoObjectId(scopedFranchiseId)) {
    params.set("franchise_id", scopedFranchiseId);
  }
  const query = params.toString();
  const res = await apiRequest(
    `${ApiPaths.PARTNERS_BROWSE_PROFILE(id)}${query ? `?${query}` : ""}`,
    "GET",
    undefined,
    false,
    false,
    true
  );
  if (!res.success) return { response: false, portfolio: null };

  const body = (res.data ?? {}) as Record<string, unknown>;
  const inner =
    body.data != null && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : body;
  const partnerRaw = inner.partner ?? inner;
  if (!partnerRaw || typeof partnerRaw !== "object" || Array.isArray(partnerRaw)) {
    return { response: false, portfolio: null };
  }
  const partnerRecord = {
    ...(partnerRaw as Record<string, unknown>),
    ...(Array.isArray(inner.categories) ? { categories: inner.categories } : {}),
    franchise_id:
      inner.franchise_id ??
      (partnerRaw as Record<string, unknown>).franchise_id ??
      rowFranchiseId,
    franchise_name:
      inner.franchise_name ??
      (partnerRaw as Record<string, unknown>).franchise_name,
  };
  return {
    response: true,
    portfolio: mapPartnersBrowseToPortfolioRow(partnerRecord),
  };
}

export async function voidPortfolio(id: string): Promise<boolean> {
  return false;
}

export type PostManagementStats = {
  Total: number;
  Published: number;
  Hidden: number;
  Removed: number;
};

const EMPTY_POST_STATS: PostManagementStats = {
  Total: 0,
  Published: 0,
  Hidden: 0,
  Removed: 0,
};

/** Human label for post `status` (`published` | `hidden` | `removed`). */
export function postStatusDisplayLabel(status: PostModel["status"]): string {
  if (status === "published") return "Published";
  if (status === "hidden") return "Hidden";
  if (status === "removed") return "Removed";
  return capitalizeString(status);
}

/** Bootstrap text class for post status in tables and detail views. */
export function postStatusTextClass(status: PostModel["status"]): string {
  if (status === "published") return "text-success fw-bold";
  if (status === "hidden") return "text-warning fw-bold";
  return "text-danger fw-bold";
}

/** Summary filter ↔ `GET /api/partner-post/getAll?status=`. */
export function uiPostStatusToApi(
  status: "all" | PostModel["status"]
): string | undefined {
  if (status === "all") return undefined;
  return status;
}

function normalizePartnerPostStatus(
  status: string | undefined
): PostModel["status"] {
  const s = String(status ?? "").toLowerCase();
  if (s === "published" || s === "hidden" || s === "removed") return s;
  return "published";
}

function pickPartnerPostListRoot(
  d: Record<string, unknown>
): Record<string, unknown> {
  const inner = d.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return d;
}

function countMediaFromPost(raw: Record<string, unknown>): {
  images: string[];
  videos: string[];
} {
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const pushUrl = (url: unknown, bucket: string[]) => {
    const resolved = resolveMediaAssetSrc(String(url ?? ""));
    if (resolved) bucket.push(resolved);
  };

  const images = raw.images;
  if (Array.isArray(images)) {
    for (const item of images) {
      if (typeof item === "string") pushUrl(item, imageUrls);
      else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        pushUrl(o.url ?? o.image_url ?? o.path, imageUrls);
      }
    }
  }
  const imageUrlsField = raw.image_urls ?? raw.imageUrls;
  if (Array.isArray(imageUrlsField)) {
    for (const u of imageUrlsField) pushUrl(u, imageUrls);
  }

  const videos = raw.videos;
  if (Array.isArray(videos)) {
    for (const item of videos) {
      if (typeof item === "string") pushUrl(item, videoUrls);
      else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        pushUrl(o.url ?? o.video_url ?? o.path, videoUrls);
      }
    }
  }
  const videoUrlsField = raw.video_urls ?? raw.videoUrls;
  if (Array.isArray(videoUrlsField)) {
    for (const u of videoUrlsField) pushUrl(u, videoUrls);
  }

  return { images: imageUrls, videos: videoUrls };
}

function mapPartnerPostApiRecord(raw: Record<string, unknown>): PostModel {
  const partnerObj =
    raw.partner && typeof raw.partner === "object"
      ? (raw.partner as Record<string, unknown>)
      : null;
  const partnerIdRef =
    raw.partner_id && typeof raw.partner_id === "object"
      ? (raw.partner_id as Record<string, unknown>)
      : null;

  const partnerId = String(
    (typeof raw.partner_id === "string" ? raw.partner_id : "") ||
      partnerObj?._id ||
      partnerObj?.id ||
      partnerIdRef?._id ||
      partnerIdRef?.id ||
      ""
  ).trim();
  const partnerName = String(
    raw.partner_name ??
      partnerObj?.name ??
      partnerObj?.partner_name ??
      partnerIdRef?.name ??
      partnerIdRef?.partner_name ??
      ""
  ).trim();

  const { images, videos } = countMediaFromPost(raw);
  const mediaType: PostModel["media_type"] =
    videos.length > 0 && images.length === 0 ? "video" : "image";

  const uploaded = String(
    raw.created_at ??
      raw.uploaded_at ??
      raw.uploaded_date ??
      raw.createdAt ??
      ""
  ).slice(0, 10);

  return {
    _id: String(raw._id ?? raw.id ?? "").trim() || undefined,
    partner_id: partnerId,
    partner_name: partnerName,
    description: String(raw.description ?? "").trim(),
    media_type: mediaType,
    no_of_images: images.length,
    no_of_videos: videos.length,
    images,
    videos,
    location: String(raw.location ?? "").trim(),
    uploaded_date: uploaded,
    status: normalizePartnerPostStatus(String(raw.status ?? "")),
  };
}

function resolvePartnerPostTotalPages(
  root: Record<string, unknown>,
  limit: number,
  recordCount: number
): number {
  const explicit = Number(root.totalPages ?? root.total_pages ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const total = Number(
    root.totalItems ?? root.total ?? root.totalDocs ?? root.total_count ?? 0
  );
  if (Number.isFinite(total) && total > 0 && limit > 0) {
    return Math.max(1, Math.ceil(total / limit));
  }
  if (recordCount > 0 && limit > 0) return 1;
  return 0;
}

async function fetchPartnerPostListPage(
  page: number,
  limit: number,
  filters: {
    status?: string;
    franchiseId?: string;
  }
): Promise<{ root: Record<string, unknown>; records: PostModel[] }> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const apiStatus = filters.status?.trim();
  if (apiStatus) params.set("status", apiStatus);
  const franchiseId = (filters.franchiseId ?? "").trim();
  if (
    sessionMayUseFranchiseIdApiFilter() &&
    franchiseId &&
    /^[a-f\d]{24}$/i.test(franchiseId)
  ) {
    params.set("franchise_id", franchiseId);
  }

  const res = await apiRequest(
    `${ApiPaths.PARTNER_POST_GET_ALL()}?${params.toString()}`,
    "GET"
  );
  if (!res.success) return { root: {}, records: [] };

  const root = pickPartnerPostListRoot(
    (res.data ?? {}) as Record<string, unknown>
  );
  const rawList = (root.records ?? root.list ?? []) as Record<string, unknown>[];
  const records = Array.isArray(rawList)
    ? rawList.map((r) => mapPartnerPostApiRecord(r))
    : [];
  return { root, records };
}

/**
 * Maps `GET /partner-post/getCounts` or `POST /getCount` `{ type: "partner-post-management" }`
 * into post summary cards (Published / Hidden / Removed). Report buckets (`pending`, `reviewed`,
 * `dismissed`) are ignored here — they belong to the reports queue, not the post list.
 */
export function mapPostManagementStatsFromCountRecord(
  record: Record<string, unknown> | null | undefined
): PostManagementStats | null {
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
  const published = pick("published");
  const hidden = pick("hidden");
  const removed = pick("removed");
  const explicitTotal = pick("total", "total_posts", "total_partner_posts");
  if (
    published === null &&
    hidden === null &&
    removed === null &&
    explicitTotal === null
  ) {
    return null;
  }
  const pub = published ?? 0;
  const hid = hidden ?? 0;
  const rem = removed ?? 0;
  return {
    Total: explicitTotal ?? pub + hid + rem,
    Published: pub,
    Hidden: hid,
    Removed: rem,
  };
}

function pickPartnerPostCountsRecord(
  data: unknown
): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const record = d.record;
  if (record && typeof record === "object" && !Array.isArray(record)) {
    return record as Record<string, unknown>;
  }
  const inner = d.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const innerRecord = (inner as Record<string, unknown>).record;
    if (
      innerRecord &&
      typeof innerRecord === "object" &&
      !Array.isArray(innerRecord)
    ) {
      return innerRecord as Record<string, unknown>;
    }
    return inner as Record<string, unknown>;
  }
  return d;
}

/** `GET /api/partner-post/getCounts` — preferred dashboard counts (Postman §5.1). */
export async function fetchPartnerPostCounts(
  franchiseId?: string
): Promise<PostManagementStats | null> {
  const params = new URLSearchParams();
  const fid = (franchiseId ?? "").trim();
  if (
    sessionMayUseFranchiseIdApiFilter() &&
    fid &&
    /^[a-f\d]{24}$/i.test(fid)
  ) {
    params.set("franchise_id", fid);
  }
  const qs = params.toString();
  const res = await apiRequest(
    `${ApiPaths.PARTNER_POST_GET_COUNTS()}${qs ? `?${qs}` : ""}`,
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!res.success) return null;
  const raw = pickPartnerPostCountsRecord(res.data);
  if (!raw) return null;
  return mapPostManagementStatsFromCountRecord(raw);
}

/** Summary cards — `GET /getCounts`, then `POST /getCount` `{ type: "partner-post-management" }`. */
export async function fetchPostManagementSummary(
  franchiseId?: string
): Promise<PostManagementStats> {
  const fromGetCounts = await fetchPartnerPostCounts(franchiseId);
  if (fromGetCounts) return fromGetCounts;

  const fid = (franchiseId ?? "").trim();
  const scope = fid ? { franchise_id: fid } : undefined;
  const { responseCount, countModel } = await getCount(
    "partner-post-management",
    scope
  );
  if (responseCount && countModel) {
    const mapped = mapPostManagementStatsFromCountRecord(
      countModel as unknown as Record<string, unknown>
    );
    if (mapped) return mapped;
  }
  return EMPTY_POST_STATS;
}

export async function fetchPostList(
  page: number,
  limit: number,
  filters: {
    status?: "all" | PostModel["status"];
    franchiseId?: string;
    name?: string;
    sort?: string;
  } = {}
): Promise<{
  response: boolean;
  records: PostModel[];
  totalPages: number;
}> {
  const apiStatus = uiPostStatusToApi(filters.status ?? "all");
  const { root, records: apiRecords } = await fetchPartnerPostListPage(
    page,
    limit,
    {
      status: apiStatus,
      franchiseId: filters.franchiseId,
    }
  );

  let records = apiRecords;
  const keyword = (filters.name ?? "").trim().toLowerCase();
  if (keyword) {
    records = records.filter((item) =>
      item.partner_name.toLowerCase().includes(keyword)
    );
  }
  const sortRaw = String(filters.sort ?? "").toLowerCase();
  if (sortRaw) {
    const ascending = sortRaw === "asc" || sortRaw === "1";
    records = [...records].sort((a, b) => {
      const first = new Date(a.uploaded_date).getTime();
      const second = new Date(b.uploaded_date).getTime();
      return ascending ? first - second : second - first;
    });
  }

  const totalPages = resolvePartnerPostTotalPages(root, limit, apiRecords.length);
  return { response: true, records, totalPages };
}

/** @deprecated Use `fetchPostList` for the table and `fetchPostManagementSummary` for summary cards. */
export const fetchPosts = fetchPostList;

export async function moderatePartnerPost(
  postId: string,
  status: PostModel["status"]
): Promise<boolean> {
  const id = String(postId ?? "").trim();
  if (!id) return false;
  const res = await apiRequest(
    ApiPaths.PARTNER_POST_MODERATE(id),
    "PUT",
    { status }
  );
  return Boolean(res.success);
}
