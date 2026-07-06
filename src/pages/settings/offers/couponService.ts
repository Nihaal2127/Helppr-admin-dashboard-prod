import { apiRequest } from "../../../lib/global/remote/apiHelper";
import { ApiPaths } from "../../../lib/global/remote/apiPaths";
import { OfferModel } from "../../../lib/models/SettingsModel";
import { showErrorAlert } from "../../../lib/global/alertHelper";
import { normalizeCalendarYmd } from "../../../helper/dateFormat";

export type CouponModel = OfferModel;

export type CouponListFilters = {
  name?: string;
  status?: "all" | "active" | "inactive";
  startDate?: string;
  endDate?: string;
  sortBy?: "name" | "value";
  sortOrder?: "asc" | "desc";
};

export type CouponPageResult = {
  rows: CouponModel[];
  totalPages: number;
  totalItems: number;
  currentPage: number;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function pickCouponRows(payload: Record<string, unknown>): Record<string, unknown>[] {
  const data = toRecord(payload.data);
  if (data && Array.isArray(data.records)) {
    return data.records as Record<string, unknown>[];
  }
  if (Array.isArray(payload.records)) {
    return payload.records as Record<string, unknown>[];
  }
  return [];
}

/** Map `GET/POST/PUT /offer/*` record to UI model (`unique_id` → couponId). */
export function mapApiCouponRecord(raw: Record<string, unknown>): CouponModel | null {
  const id = String(raw._id ?? raw.id ?? "").trim();
  if (!id) return null;

  const typeRaw = String(raw.type ?? raw.offerType ?? "percentage").toLowerCase();
  const offerType: CouponModel["offerType"] =
    typeRaw === "fixed" ? "fixed" : "percentage";

  const isActive =
    raw.is_active === true ||
    raw.is_active === 1 ||
    String(raw.is_active ?? "").toLowerCase() === "true";
  const statusRaw = String(raw.status ?? "").toLowerCase();
  const status: CouponModel["status"] =
    statusRaw === "inactive" || (!isActive && statusRaw !== "active")
      ? "inactive"
      : isActive
        ? "active"
        : "inactive";

  const startDate = normalizeCalendarYmd(
    String(raw.start_date ?? raw.startDate ?? "")
  );
  const endDate = normalizeCalendarYmd(String(raw.end_date ?? raw.endDate ?? ""));

  return {
    id,
    offerId: String(raw.unique_id ?? raw.offer_id ?? raw.offerId ?? id).trim(),
    offerName: String(raw.name ?? raw.offer_name ?? raw.offerName ?? "").trim(),
    offerType,
    totalOfferValue: Number(raw.value ?? raw.totalOfferValue ?? 0) || 0,
    adminContribution:
      Number(raw.admin_contribution ?? raw.adminContribution ?? 0) || 0,
    partnerContribution:
      Number(raw.partner_contribution ?? raw.partnerContribution ?? 0) || 0,
    applicableOn: "orders",
    startDate: startDate || "",
    endDate: endDate || "",
    status,
    createdAt: String(raw.created_at ?? raw.createdAt ?? ""),
  };
}

function pickRecordFromMutationResponse(
  data: unknown
): Record<string, unknown> | null {
  const root = toRecord(data);
  if (!root) return null;
  const record = root.record ?? toRecord(root.data)?.record;
  if (record && typeof record === "object") {
    return record as Record<string, unknown>;
  }
  const records = pickCouponRows(root);
  return records[0] ?? null;
}

export async function fetchCouponsPage(
  page: number,
  limit: number,
  filters: CouponListFilters = {}
): Promise<CouponPageResult | null> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort_by: filters.sortBy ?? "name",
    sort_order: filters.sortOrder ?? "asc",
    _ts: String(Date.now()),
  });

  const name = String(filters.name ?? "").trim();
  if (name) params.set("name", name);

  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }

  const start = normalizeCalendarYmd(filters.startDate);
  const end = normalizeCalendarYmd(filters.endDate);
  if (start) params.set("start_date", start);
  if (end) params.set("end_date", end);

  const res = await apiRequest(
    `${ApiPaths.GET_OFFER_GET_ALL()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!res.success) return null;

  const payload = toRecord(res.data) ?? {};
  const rows = pickCouponRows(payload)
    .map((r) => mapApiCouponRecord(r))
    .filter((c): c is CouponModel => c != null);

  const inner = toRecord(payload.data);
  const totalItems = Number(
    inner?.totalItems ?? payload.totalItems ?? rows.length
  );
  const totalPages = Number(
    inner?.totalPages ?? payload.totalPages ?? 1
  );
  const currentPage = Number(
    inner?.currentPage ?? payload.currentPage ?? page
  );

  return {
    rows,
    totalItems: Number.isFinite(totalItems) ? totalItems : rows.length,
    totalPages: Math.max(1, Number.isFinite(totalPages) ? totalPages : 1),
    currentPage: Number.isFinite(currentPage) ? currentPage : page,
  };
}

export async function fetchCouponById(id: string): Promise<CouponModel | null> {
  const couponId = String(id ?? "").trim();
  if (!couponId) return null;

  const res = await apiRequest(
    ApiPaths.GET_OFFER_BY_ID(couponId),
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!res.success) return null;

  const payload = toRecord(res.data) ?? {};
  const record =
    toRecord(payload.record) ??
    toRecord(payload.data)?.record ??
    pickCouponRows(payload)[0];

  if (!record || typeof record !== "object") return null;
  return mapApiCouponRecord(record as Record<string, unknown>);
}

export type CouponSavePayload = {
  offerName: string;
  offerType: "percentage" | "fixed";
  totalOfferValue: number;
  adminContribution: number;
  partnerContribution: number;
  startDate: string;
  endDate: string;
  status: "active" | "inactive";
};

function couponBodyFromPayload(payload: CouponSavePayload): Record<string, unknown> {
  return {
    name: payload.offerName.trim(),
    type: payload.offerType,
    value: payload.totalOfferValue,
    admin_contribution: payload.adminContribution,
    partner_contribution: payload.partnerContribution,
    start_date: normalizeCalendarYmd(payload.startDate),
    end_date: normalizeCalendarYmd(payload.endDate),
    is_active: payload.status === "active",
  };
}

export function validateCouponPayload(payload: CouponSavePayload): string | null {
  if (!payload.offerName.trim()) return "Coupon name is required.";
  if (!normalizeCalendarYmd(payload.startDate)) return "Start date is required.";
  if (!normalizeCalendarYmd(payload.endDate)) return "End date is required.";

  const value = Number(payload.totalOfferValue);
  const admin = Number(payload.adminContribution);
  const partner = Number(payload.partnerContribution);

  if (!Number.isFinite(value) || value < 0) {
    return "Coupon value must be a valid number.";
  }

  if (payload.offerType === "percentage") {
    if (value >= 100 || admin >= 100 || partner >= 100) {
      return "For percentage coupons, value and contributions must each be below 100.";
    }
  }

  return null;
}

export async function createCoupon(
  payload: CouponSavePayload
): Promise<CouponModel | null> {
  const validationError = validateCouponPayload(payload);
  if (validationError) {
    showErrorAlert(validationError);
    return null;
  }

  const res = await apiRequest(
    ApiPaths.CREATE_OFFER,
    "POST",
    couponBodyFromPayload(payload)
  );
  if (!res.success) return null;

  const record = pickRecordFromMutationResponse(res.data);
  return record ? mapApiCouponRecord(record) : null;
}

export async function updateCoupon(
  id: string,
  payload: CouponSavePayload
): Promise<CouponModel | null> {
  const couponId = String(id ?? "").trim();
  if (!couponId) {
    showErrorAlert("Unable to update. Coupon id is missing.");
    return null;
  }

  const validationError = validateCouponPayload(payload);
  if (validationError) {
    showErrorAlert(validationError);
    return null;
  }

  const res = await apiRequest(
    ApiPaths.UPDATE_OFFER(couponId),
    "PUT",
    couponBodyFromPayload(payload)
  );
  if (!res.success) return null;

  const record = pickRecordFromMutationResponse(res.data);
  return record ? mapApiCouponRecord(record) : null;
}

export async function deleteCoupon(id: string): Promise<boolean> {
  const couponId = String(id ?? "").trim();
  if (!couponId) {
    showErrorAlert("Invalid coupon id.");
    return false;
  }

  const res = await apiRequest(ApiPaths.DELETE_OFFER(couponId), "DELETE");
  return Boolean(res.success);
}
