import {
  ExpenseCategoryModel,
  OfferModel,
  RoleSettingsModel,
  StaffSettingsModel,
} from "../lib/models/SettingsModel";
import { offersMockSeed } from "../mockData/settingsOffersMockData";
import { rolesMockSeed } from "../mockData/settingsRolesMockData";
import { staffMockSeed } from "../mockData/settingsStaffMockData";
import { expenseCategoriesMockSeed } from "../mockData/settingsExpenseCategoryMockData";
import { AppConstant } from "../lib/global/AppConstant";
import { getLocalStorage } from "../lib/global/localStorageHelper";
import { showErrorAlert } from "../lib/global/alertHelper";
import { genderForApiPayload } from "../lib/user/genderOptions";
import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import {
  createOrUpdateUser,
  createWebManagementUser,
  fetchUserById,
  menuKeysFromUserAccess,
  mapMenuKeysToAvailablePages,
  staffAvailablePagesFromMenuKeys,
  WEB_MANAGEMENT_USER_TYPE,
} from "./userService";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";
import { fetchFranchiseById } from "./franchiseService";
import { normalizeCalendarYmd, todayLocalYmd } from "../helper/dateFormat";
import { sessionMayUseFranchiseIdApiFilter } from "../lib/franchise/headerFranchisePreference";

const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function dobForApiPayload(value?: string | null): string | undefined {
  return normalizeCalendarYmd(value);
}

function dobFromApiRaw(raw: Record<string, unknown>): string | undefined {
  const ymd = dobForApiPayload(
    String(raw.date_of_birth ?? raw.dateOfBirth ?? "").trim() || undefined
  );
  return ymd || undefined;
}

// ----------------------
// Offer mock data (in-memory, no localStorage)
// ----------------------

let mockOffers: OfferModel[] = offersMockSeed.map((item, index) => {
  const now = new Date().toISOString();
  return {
    ...item,
    id: `${Date.now()}-${index}`,
    createdAt: now,
    startDate: item.startDate || now,
    endDate: item.endDate || now,
  };
});

let mockRoles: RoleSettingsModel[] = rolesMockSeed.map((item, index) => {
  const now = new Date().toISOString();
  return {
    ...item,
    id: `${Date.now()}-role-${index}`,
    createdDate: now,
  };
});

let mockExpenseCategories: ExpenseCategoryModel[] =
  expenseCategoriesMockSeed.map((item, index) => {
    const now = new Date().toISOString();
    return {
      ...item,
      id: `${Date.now()}-expense-category-${index}`,
      createdDate: now,
    };
  });

let mockStaff: StaffSettingsModel[] = staffMockSeed.map((item, index) => {
  const now = new Date().toISOString();
  return {
    ...item,
    id: `${Date.now()}-staff-${index}`,
    createdDate: now,
  };
});

// Kept for backward compatibility with existing page calls.
export const ensureSettingsSeedData = () => {};

// Offers API (mock, in-memory)

export const getOffers = (): OfferModel[] => {
  return [...mockOffers];
};

function pickOfferRows(payload: Record<string, unknown>): Record<string, unknown>[] {
  const data = payload.data;
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { records?: unknown }).records)
  ) {
    return (data as { records: Record<string, unknown>[] }).records;
  }
  if (Array.isArray(payload.records)) {
    return payload.records as Record<string, unknown>[];
  }
  return [];
}

function mapApiOfferRecord(raw: Record<string, unknown>): OfferModel | null {
  const id = String(raw._id ?? raw.id ?? "").trim();
  if (!id) return null;
  const typeRaw = String(raw.type ?? raw.offerType ?? "percentage").toLowerCase();
  const offerType: OfferModel["offerType"] =
    typeRaw === "fixed" ? "fixed" : "percentage";
  const isActive = raw.is_active !== false && raw.is_active !== 0;
  const startDate =
    normalizeCalendarYmd(String(raw.start_date ?? raw.startDate ?? "")) ?? "";
  const endDate =
    normalizeCalendarYmd(String(raw.end_date ?? raw.endDate ?? "")) ?? "";
  return {
    id,
    offerId: String(raw.unique_id ?? raw.offer_id ?? raw.offerId ?? id).trim(),
    offerName: String(raw.name ?? raw.offer_name ?? raw.offerName ?? id).trim(),
    offerType,
    totalOfferValue: Number(raw.value ?? raw.totalOfferValue ?? 0) || 0,
    adminContribution:
      Number(raw.admin_contribution ?? raw.adminContribution ?? 0) || 0,
    partnerContribution:
      Number(raw.partner_contribution ?? raw.partnerContribution ?? 0) || 0,
    applicableOn: "orders",
    startDate,
    endDate,
    status: isActive ? "active" : "inactive",
    createdAt: String(raw.created_at ?? raw.createdAt ?? ""),
  };
}

/**
 * True when today's local calendar date is within the offer window (inclusive).
 * Hides not-yet-started (today < start) and expired (today > end) coupons.
 */
export function isOfferWithinValidityPeriod(
  offer: Pick<OfferModel, "startDate" | "endDate">,
  todayYmd: string = todayLocalYmd()
): boolean {
  const start = normalizeCalendarYmd(offer.startDate);
  const end = normalizeCalendarYmd(offer.endDate);
  if (start && todayYmd < start) return false;
  if (end && todayYmd > end) return false;
  return true;
}

/** @deprecated Use isOfferWithinValidityPeriod */
export function isOfferNotExpired(
  offer: Pick<OfferModel, "endDate" | "startDate">,
  todayYmd: string = todayLocalYmd()
): boolean {
  return isOfferWithinValidityPeriod(offer, todayYmd);
}

function activeValidOffersForToday(offers: OfferModel[]): OfferModel[] {
  return offers.filter(
    (o) => o.status === "active" && isOfferWithinValidityPeriod(o)
  );
}

/** `GET /offer/getAll?is_active=true` — coupons valid for today (start ≤ today ≤ end). */
export async function fetchActiveOffers(): Promise<OfferModel[]> {
  try {
    const res = await apiRequest(
      `${ApiPaths.GET_OFFER_GET_ALL()}?is_active=true`,
      "GET",
      undefined,
      false,
      true,
      true
    );
    if (!res.success) return activeValidOffersForToday(getOffers());
    const payload =
      res.data && typeof res.data === "object"
        ? (res.data as Record<string, unknown>)
        : {};
    const records = pickOfferRows(payload);
    if (!records.length) {
      return activeValidOffersForToday(getOffers());
    }
    return records
      .map((r) => mapApiOfferRecord(r))
      .filter((o): o is OfferModel => o != null && o.status === "active")
      .filter((o) => isOfferWithinValidityPeriod(o));
  } catch {
    return activeValidOffersForToday(getOffers());
  }
}

export const saveOffer = (
  payload: Omit<OfferModel, "id" | "createdAt">,
  id?: string
) => {
  if (id) {
    mockOffers = mockOffers.map((item) =>
      item.id === id ? { ...item, ...payload } : item
    );
    return;
  }

  const now = new Date().toISOString();
  const newOffer: OfferModel = {
    ...payload,
    id: generateId(),
    createdAt: now,
    startDate: payload.startDate || now,
    endDate: payload.endDate || now,
  };

  mockOffers = [newOffer, ...mockOffers];
};

export const voidOffer = (id: string) => {
  mockOffers = mockOffers.map((item) =>
    item.id === id ? { ...item, status: "inactive" as const } : item
  );
};

export const getRoles = (): RoleSettingsModel[] => [...mockRoles];
export const saveRole = (
  payload: Omit<RoleSettingsModel, "id" | "createdDate">,
  id?: string,
  opts?: { newId?: string }
) => {
  if (id) {
    mockRoles = mockRoles.map((item) =>
      item.id === id ? { ...item, ...payload } : item
    );
    return;
  }

  mockRoles = [
    {
      ...payload,
      id: opts?.newId ?? generateId(),
      createdDate: new Date().toISOString(),
    },
    ...mockRoles,
  ];
};
export const voidRole = (id: string) => {
  mockRoles = mockRoles.map((item) =>
    item.id === id ? { ...item, status: "inactive" as const } : item
  );
};

export const getStaff = (): StaffSettingsModel[] => [...mockStaff];

type SettingsRoleStaffApiData = {
  roles: RoleSettingsModel[];
  staff: StaffSettingsModel[];
};

export type SettingsSectionPageResult = {
  roles: RoleSettingsModel[];
  staff: StaffSettingsModel[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
};

function normalizeActiveStatus(raw: unknown): "active" | "inactive" {
  if (raw === true || raw === 1 || String(raw).toLowerCase() === "active")
    return "active";
  if (raw === false || raw === 0 || String(raw).toLowerCase() === "inactive")
    return "inactive";
  return "active";
}

/** Normalize franchise id whether API sends a string or a populated `{ _id }` object. */
function normalizeFranchiseIdField(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "object" && raw !== null && "_id" in raw) {
    return String((raw as { _id?: unknown })._id ?? "").trim();
  }
  return String(raw).trim();
}

function extractAssignedFranchiseLabel(raw: Record<string, unknown>): string {
  const nested = raw.franchise;
  const nestedObj =
    nested && typeof nested === "object" && nested !== null
      ? (nested as Record<string, unknown>)
      : null;
  const label = String(
    raw.franchise_name ??
      raw.franchiseName ??
      raw.assigned_franchise ??
      raw.assignedFranchise ??
      nestedObj?.name ??
      ""
  ).trim();
  return label;
}

function extractFranchiseIdFromUserRaw(raw: Record<string, unknown>): string {
  const nested = raw.franchise;
  const nestedObj =
    nested && typeof nested === "object" && nested !== null
      ? (nested as Record<string, unknown>)
      : null;
  const idRaw =
    raw.franchise_id ?? raw.franchiseId ?? nestedObj?._id ?? nestedObj?.id;
  return normalizeFranchiseIdField(idRaw);
}

function mapApiUserToRoleSettingsModel(
  raw: Record<string, unknown>,
  roleType: "franchise_admin" | "employee"
): RoleSettingsModel {
  const id = String(raw._id ?? raw.id ?? generateId());
  const roleId = String(raw.user_id ?? raw.userId ?? raw.role_id ?? id);
  const name = String(raw.name ?? raw.role_name ?? "-");
  const perms = menuKeysFromUserAccess(raw);
  const franchise_id = extractFranchiseIdFromUserRaw(raw);
  const assignedLabel = extractAssignedFranchiseLabel(raw);
  return {
    id,
    roleId,
    roleName: name,
    roleType,
    assignedFranchise: assignedLabel || undefined,
    franchise_id: franchise_id || undefined,
    state_id: String(raw.state_id ?? "").trim() || undefined,
    city_id: String(raw.city_id ?? "").trim() || undefined,
    email: String(raw.email ?? "").trim() || undefined,
    phone_number: String(raw.phone_number ?? "").trim() || undefined,
    gender: genderForApiPayload(raw.gender) ?? undefined,
    date_of_birth: dobFromApiRaw(raw),
    profile_url: String(raw.profile_url ?? "").trim() || undefined,
    status: normalizeActiveStatus(raw.is_active),
    createdDate: String(raw.created_at ?? new Date().toISOString()),
    screenPermissions: perms,
  };
}

function mapApiUserToStaffSettingsModel(
  raw: Record<string, unknown>
): StaffSettingsModel {
  const id = String(raw._id ?? raw.id ?? generateId());
  const staffId = String(raw.user_id ?? raw.userId ?? raw.staff_id ?? id);
  return {
    id,
    staffId,
    name: String(raw.name ?? "-"),
    email: String(raw.email ?? "").trim() || undefined,
    phone_number: String(raw.phone_number ?? "").trim() || undefined,
    gender: genderForApiPayload(raw.gender) ?? undefined,
    date_of_birth: dobFromApiRaw(raw),
    profile_url: String(raw.profile_url ?? "").trim() || undefined,
    status: normalizeActiveStatus(raw.is_active),
    createdDate: String(raw.created_at ?? new Date().toISOString()),
    screenPermissions: menuKeysFromUserAccess(raw),
    allFranchises: true,
    franchisePermissions: [],
  };
}

function mapRowsByType(
  type: number,
  rows: Record<string, unknown>[]
): { roles: RoleSettingsModel[]; staff: StaffSettingsModel[] } {
  if (type === WEB_MANAGEMENT_USER_TYPE.FRANCHISE_ADMIN) {
    return {
      roles: rows.map((u) =>
        mapApiUserToRoleSettingsModel(u, "franchise_admin")
      ),
      staff: [] as StaffSettingsModel[],
    };
  }
  if (type === WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE) {
    return {
      roles: rows.map((u) => mapApiUserToRoleSettingsModel(u, "employee")),
      staff: [] as StaffSettingsModel[],
    };
  }
  if (type === WEB_MANAGEMENT_USER_TYPE.STAFF) {
    return {
      roles: [] as RoleSettingsModel[],
      staff: rows.map(mapApiUserToStaffSettingsModel),
    };
  }
  return {
    roles: [] as RoleSettingsModel[],
    staff: [] as StaffSettingsModel[],
  };
}

export const fetchSettingsSectionPageByType = async (
  type: number,
  page: number,
  limit: number,
  filters?: {
    keyword?: string;
    status?: "all" | "active" | "inactive";
    franchiseId?: string;
  },
  sortBy: ServerTableSortBy = []
): Promise<SettingsSectionPageResult | null> => {
  const primarySort = sortBy[0];
  const mappedSortField = (() => {
    if (!primarySort?.id) return undefined;
    if (primarySort.id === "roleName" || primarySort.id === "name")
      return "name";
    if (primarySort.id === "email") return "email";
    return undefined;
  })();
  const keyword = filters?.keyword?.trim();
  const params = new URLSearchParams({
    type: String(type),
    page: String(page),
    limit: String(limit),
    _ts: String(Date.now()),
    ...(keyword ? { keyword } : {}),
    ...(keyword ? { search: keyword } : {}),
    ...(keyword ? { name: keyword } : {}),
    ...(filters?.status && filters.status !== "all"
      ? { is_active: filters.status === "active" ? "true" : "false" }
      : {}),
    ...(sessionMayUseFranchiseIdApiFilter() &&
    filters?.franchiseId &&
    String(filters.franchiseId).trim()
      ? { franchise_id: filters.franchiseId }
      : {}),
    ...(mappedSortField ? { sort_by: mappedSortField } : {}),
    ...(mappedSortField ? { sortBy: mappedSortField } : {}),
    ...(primarySort ? { sort_order: primarySort.desc ? "desc" : "asc" } : {}),
    ...(primarySort ? { sortOrder: primarySort.desc ? "desc" : "asc" } : {}),
  });

  const res = await apiRequest(
    `${ApiPaths.GET_USER()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!res.success) return null;

  const d = (res.data ?? {}) as Record<string, unknown>;
  const records = (
    Array.isArray((d.data as Record<string, unknown> | undefined)?.records)
      ? (d.data as Record<string, unknown>).records
      : Array.isArray(d.records)
      ? d.records
      : []
  ) as Record<string, unknown>[];

  const totalItems = Number(
    (d.data as Record<string, unknown> | undefined)?.totalItems ??
      d.totalItems ??
      records.length
  );
  const totalPages = Number(
    (d.data as Record<string, unknown> | undefined)?.totalPages ??
      d.totalPages ??
      1
  );
  const currentPage = Number(
    (d.data as Record<string, unknown> | undefined)?.currentPage ??
      d.currentPage ??
      page
  );

  const mapped = mapRowsByType(type, records);
  return {
    ...mapped,
    totalItems: Number.isFinite(totalItems) ? totalItems : records.length,
    totalPages: Number.isFinite(totalPages) ? totalPages : 1,
    currentPage: Number.isFinite(currentPage) ? currentPage : page,
  };
};

async function fetchAllUsersByType(
  type: number
): Promise<Record<string, unknown>[] | null> {
  const limit = 100;
  const maxPages = 30;
  const all: Record<string, unknown>[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      type: String(type),
      _ts: String(Date.now()),
    });
    const res = await apiRequest(
      `${ApiPaths.GET_USER()}?${params.toString()}`,
      "GET",
      undefined,
      false,
      true,
      true
    );
    if (!res.success) return null;
    const d = (res.data ?? {}) as Record<string, unknown>;
    const records = (
      Array.isArray((d.data as Record<string, unknown> | undefined)?.records)
        ? (d.data as Record<string, unknown>).records
        : Array.isArray(d.records)
        ? d.records
        : []
    ) as Record<string, unknown>[];
    all.push(...records);
    const totalPagesRaw =
      (d.data as Record<string, unknown> | undefined)?.totalPages ??
      d.totalPages ??
      1;
    const totalPages = Number(totalPagesRaw);
    if (!Number.isFinite(totalPages) || page >= totalPages) break;
  }
  return all;
}

/**
 * Load settings-role members from `/user/getAll` using dashboard user list `type=4`,
 * then split by each record's actual `type` (1/3/6).
 */
export const fetchRoleAndStaffFromApi =
  async (): Promise<SettingsRoleStaffApiData | null> => {
    const allDashboardMembers = await fetchAllUsersByType(4);
    if (!allDashboardMembers) return null;
    const admins = allDashboardMembers.filter(
      (u) =>
        Number((u as Record<string, unknown>).type) ===
        WEB_MANAGEMENT_USER_TYPE.FRANCHISE_ADMIN
    );
    const employees = allDashboardMembers.filter(
      (u) =>
        Number((u as Record<string, unknown>).type) ===
        WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE
    );
    const staff = allDashboardMembers.filter(
      (u) =>
        Number((u as Record<string, unknown>).type) ===
        WEB_MANAGEMENT_USER_TYPE.STAFF
    );
    const mapped: SettingsRoleStaffApiData = {
      roles: [
        ...admins.map((u) =>
          mapApiUserToRoleSettingsModel(u, "franchise_admin")
        ),
        ...employees.map((u) => mapApiUserToRoleSettingsModel(u, "employee")),
      ],
      staff: staff.map(mapApiUserToStaffSettingsModel),
    };
    // Keep existing `getRoles/getStaff/save*` flow consistent with API-loaded data.
    mockRoles = mapped.roles.map((r) => ({ ...r }));
    mockStaff = mapped.staff.map((s) => ({ ...s }));
    return mapped;
  };

/**
 * Fetch only one settings-role section using a specific `type` query.
 * - 1: franchise admin
 * - 3: franchise employee
 * - 6: staff
 */
export const fetchSettingsSectionByType = async (
  type: number
): Promise<{
  roles: RoleSettingsModel[];
  staff: StaffSettingsModel[];
} | null> => {
  const rows = await fetchAllUsersByType(type);
  if (rows && rows.length > 0) {
    return mapRowsByType(type, rows);
  }

  // Fallback: some environments fail/empty on specific type calls but succeed on dashboard list type=4.
  const allDashboardMembers = await fetchAllUsersByType(4);
  if (!allDashboardMembers) return null;
  const filtered = allDashboardMembers.filter(
    (u) => Number((u as Record<string, unknown>).type) === Number(type)
  );
  return mapRowsByType(type, filtered);
};

export const saveStaff = (
  payload: Omit<StaffSettingsModel, "id" | "createdDate">,
  id?: string,
  opts?: { newId?: string }
) => {
  if (id) {
    mockStaff = mockStaff.map((item) =>
      item.id === id ? { ...item, ...payload } : item
    );
    return;
  }

  mockStaff = [
    {
      ...payload,
      id: opts?.newId ?? generateId(),
      createdDate: new Date().toISOString(),
    },
    ...mockStaff,
  ];
};

function profileUrlForApi(profileUrl?: string): string | undefined {
  const u = (profileUrl ?? "").trim();
  if (!u || u.startsWith("uploads/")) return undefined;
  return u;
}

function pickRecordId(
  record: Record<string, unknown> | null | undefined
): string | undefined {
  if (!record) return undefined;
  const id = record._id ?? record.id;
  return id != null ? String(id) : undefined;
}

function sanitizeStatus(status?: string): "active" | "inactive" {
  return String(status ?? "active").toLowerCase() === "inactive"
    ? "inactive"
    : "active";
}

function updateStatusPayloadValue(status?: string): boolean {
  return sanitizeStatus(status) === "active";
}

function normalizedPagesFromPermKeys(keys: string[]) {
  return mapMenuKeysToAvailablePages(keys);
}

/**
 * Create franchise admin / franchise employee via `POST /user/create` (Postman web types),
 * then append to in-memory list for the settings UI.
 */
export const createRoleUserWithApi = async (
  payload: Omit<RoleSettingsModel, "id" | "createdDate">,
  imageFile?: File,
  password?: string
): Promise<{ ok: true; newUserId?: string } | { ok: false }> => {
  const createdById = (getLocalStorage(AppConstant.createdById) ?? "").trim();
  if (!createdById) {
    showErrorAlert("Missing session (created_by_id). Please log in again.");
    return { ok: false };
  }

  const type =
    payload.roleType === "franchise_admin"
      ? WEB_MANAGEMENT_USER_TYPE.FRANCHISE_ADMIN
      : WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE;

  const permKeys = payload.screenPermissions ?? [];
  const commonBody = {
    name: payload.roleName.trim(),
    email: (payload.email ?? "").trim(),
    phone_number: (payload.phone_number ?? "").trim(),
    ...(genderForApiPayload(payload.gender)
      ? { gender: genderForApiPayload(payload.gender) }
      : {}),
    ...(dobForApiPayload(payload.date_of_birth)
      ? { date_of_birth: dobForApiPayload(payload.date_of_birth) }
      : {}),
    type,
    status: (payload.status ?? "active").toLowerCase(),
    is_from_web: true,
    created_by_id: createdById,
    franchise_id: payload.franchise_id,
    state_id: payload.state_id,
    city_id: payload.city_id,
    profile_url: profileUrlForApi(payload.profile_url),
  };
  const pwd = String(password ?? "").trim();
  const result = await createWebManagementUser(
    payload.roleType === "franchise_admin"
      ? {
          ...commonBody,
          ...(pwd ? { password: pwd } : {}),
          // Franchise admin screens are fixed by role; do not send screen list payload.
          imageFile,
        }
      : {
          ...commonBody,
          ...(pwd ? { password: pwd } : {}),
          available_pages: mapMenuKeysToAvailablePages(permKeys),
          imageFile,
        }
  );

  if (!result.ok) return { ok: false };

  const raw = result.record as Record<string, unknown> | null | undefined;
  const serverId = pickRecordId(raw);
  const roleId = String(
    raw?.user_id ?? raw?.userId ?? payload.roleId ?? serverId ?? generateId()
  );
  const isActive = raw?.is_active !== false;

  saveRole(
    {
      ...payload,
      roleId,
      roleName: String(raw?.name ?? payload.roleName),
      email: (raw?.email as string | undefined) ?? payload.email,
      phone_number:
        (raw?.phone_number as string | undefined) ?? payload.phone_number,
      profile_url:
        (raw?.profile_url as string | undefined) ?? payload.profile_url,
      status: isActive ? "active" : "inactive",
    },
    undefined,
    serverId ? { newId: serverId } : undefined
  );
  return { ok: true, newUserId: serverId };
};

/** Update franchise admin / franchise employee via `PUT /user/update/:id`. */
export const updateRoleUserWithApi = async (
  id: string,
  payload: Omit<RoleSettingsModel, "id" | "createdDate">,
  imageFile?: File,
  options?: { suppressSuccessAlert?: boolean }
): Promise<boolean> => {
  const userId = String(id || "").trim();
  if (!userId) return false;

  const isFranchiseAdmin = payload.roleType === "franchise_admin";
  const permKeys = payload.screenPermissions ?? [];
  const availablePages = normalizedPagesFromPermKeys(permKeys);

  const body: Record<string, unknown> = {
    name: payload.roleName.trim(),
    email: (payload.email ?? "").trim(),
    phone_number: (payload.phone_number ?? "").trim(),
    ...(genderForApiPayload(payload.gender)
      ? { gender: genderForApiPayload(payload.gender) }
      : {}),
    ...(dobForApiPayload(payload.date_of_birth)
      ? { date_of_birth: dobForApiPayload(payload.date_of_birth) }
      : {}),
    status: sanitizeStatus(payload.status),
    is_active: updateStatusPayloadValue(payload.status),
    franchise_id: payload.franchise_id,
    state_id: payload.state_id,
    city_id: payload.city_id,
    profile_url: profileUrlForApi(payload.profile_url),
  };
  if (!isFranchiseAdmin) {
    body.available_pages = availablePages;
    body.accessible_screens = availablePages;
  }

  return createOrUpdateUser(
    body,
    true,
    userId,
    imageFile ? { image: imageFile } : undefined,
    { suppressSuccessAlert: Boolean(options?.suppressSuccessAlert) }
  );
};

/**
 * Link a franchise admin user to a franchise using the same fields as Settings → Role
 * (`franchise_id`, `state_id`, `city_id` on `PUT /user/update`). Saving a franchise with
 * `admin_id` alone often does not update the user record, so logins miss franchise scope.
 */
export const assignFranchiseToAdminUser = async (params: {
  adminUserId: string;
  franchiseId: string;
  stateId: string;
  cityId: string;
}): Promise<boolean> => {
  const adminUserId = String(params.adminUserId ?? "").trim();
  const franchiseId = String(params.franchiseId ?? "").trim();
  if (!adminUserId || !franchiseId) return true;

  /**
   * Franchise form may use static fallback state/city slugs when dropdown APIs fail.
   * `PUT /user/update` expects the same ids the franchise and Settings → Role use (usually DB ids).
   * Load the saved franchise so we send canonical `state_id` / `city_id` with `franchise_id`.
   */
  let resolvedStateId = String(params.stateId ?? "").trim();
  let resolvedCityId = String(params.cityId ?? "").trim();
  const franchiseRecord = await fetchFranchiseById(franchiseId);
  if (franchiseRecord) {
    const fs = String(franchiseRecord.state_id ?? "").trim();
    const fc = String(franchiseRecord.city_id ?? "").trim();
    if (fs) resolvedStateId = fs;
    if (fc) resolvedCityId = fc;
  }

  const { response, user } = await fetchUserById(adminUserId);
  if (!response || !user) {
    showErrorAlert(
      "Franchise saved, but the admin user could not be loaded to link this franchise. Assign the franchise under Settings → Role if needed."
    );
    return false;
  }

  const record = user as unknown as Record<string, unknown>;
  const userType = Number(record.type);
  const roleType: "franchise_admin" | "employee" =
    userType === WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE
      ? "employee"
      : "franchise_admin";

  const mapped = mapApiUserToRoleSettingsModel(record, roleType);
  const stateId = resolvedStateId || mapped.state_id || "";
  const cityId = resolvedCityId || mapped.city_id || "";

  const payload: Omit<RoleSettingsModel, "id" | "createdDate"> = {
    roleId: mapped.roleId,
    roleName: mapped.roleName,
    roleType: mapped.roleType,
    assignedFranchise: mapped.assignedFranchise,
    email: mapped.email,
    phone_number: mapped.phone_number,
    profile_url: mapped.profile_url,
    status: mapped.status,
    screenPermissions: mapped.screenPermissions ?? [],
    franchise_id: franchiseId,
    state_id: stateId,
    city_id: cityId,
  };

  const ok = await updateRoleUserWithApi(adminUserId, payload, undefined, {
    suppressSuccessAlert: true,
  });
  if (!ok) {
    showErrorAlert(
      "Franchise saved, but linking this admin to the franchise failed. Assign the franchise under Settings → Role."
    );
  }
  return ok;
};

/**
 * Create staff (Postman `type: 6`) via `POST /user/create`, then append to in-memory list.
 */
export const createStaffUserWithApi = async (
  payload: Omit<StaffSettingsModel, "id" | "createdDate">,
  imageFile?: File,
  password?: string
): Promise<boolean> => {
  const createdById = (getLocalStorage(AppConstant.createdById) ?? "").trim();
  if (!createdById) {
    showErrorAlert("Missing session (created_by_id). Please log in again.");
    return false;
  }

  const staffPermKeys = (payload.screenPermissions ?? []).filter(
    (k) => k !== "my-franchise"
  );
  const pwd = String(password ?? "").trim();
  const result = await createWebManagementUser({
    name: payload.name.trim(),
    email: (payload.email ?? "").trim(),
    phone_number: (payload.phone_number ?? "").trim(),
    ...(genderForApiPayload(payload.gender)
      ? { gender: genderForApiPayload(payload.gender) }
      : {}),
    ...(dobForApiPayload(payload.date_of_birth)
      ? { date_of_birth: dobForApiPayload(payload.date_of_birth) }
      : {}),
    type: WEB_MANAGEMENT_USER_TYPE.STAFF,
    status: (payload.status ?? "active").toLowerCase(),
    is_from_web: true,
    created_by_id: createdById,
    available_pages: staffAvailablePagesFromMenuKeys(staffPermKeys),
    profile_url: profileUrlForApi(payload.profile_url),
    ...(pwd ? { password: pwd } : {}),
    imageFile,
  });

  if (!result.ok) return false;

  const raw = result.record as Record<string, unknown> | null | undefined;
  const serverId = pickRecordId(raw);
  const staffId = String(
    raw?.user_id ?? raw?.userId ?? payload.staffId ?? serverId ?? generateId()
  );
  const isActive = raw?.is_active !== false;

  saveStaff(
    {
      ...payload,
      staffId,
      name: String(raw?.name ?? payload.name),
      email: (raw?.email as string | undefined) ?? payload.email,
      phone_number:
        (raw?.phone_number as string | undefined) ?? payload.phone_number,
      profile_url:
        (raw?.profile_url as string | undefined) ?? payload.profile_url,
      status: isActive ? "active" : "inactive",
    },
    undefined,
    serverId ? { newId: serverId } : undefined
  );
  return true;
};

/** Update staff via `PUT /user/update/:id`. */
export const updateStaffUserWithApi = async (
  id: string,
  payload: Omit<StaffSettingsModel, "id" | "createdDate">,
  imageFile?: File
): Promise<boolean> => {
  const userId = String(id || "").trim();
  if (!userId) return false;
  const staffPermKeys = (payload.screenPermissions ?? []).filter(
    (k) => k !== "my-franchise"
  );
  const pages = staffAvailablePagesFromMenuKeys(staffPermKeys);

  const body: Record<string, unknown> = {
    name: payload.name.trim(),
    email: (payload.email ?? "").trim(),
    phone_number: (payload.phone_number ?? "").trim(),
    ...(genderForApiPayload(payload.gender)
      ? { gender: genderForApiPayload(payload.gender) }
      : {}),
    ...(dobForApiPayload(payload.date_of_birth)
      ? { date_of_birth: dobForApiPayload(payload.date_of_birth) }
      : {}),
    status: sanitizeStatus(payload.status),
    is_active: updateStatusPayloadValue(payload.status),
    profile_url: profileUrlForApi(payload.profile_url),
    available_pages: pages,
    accessible_screens: pages,
  };

  return createOrUpdateUser(
    body,
    true,
    userId,
    imageFile ? { image: imageFile } : undefined
  );
};

export const getExpenseCategories = (): ExpenseCategoryModel[] => [
  ...mockExpenseCategories,
];
export const saveExpenseCategory = (
  payload: Omit<ExpenseCategoryModel, "id" | "createdDate">,
  id?: string
) => {
  if (id) {
    mockExpenseCategories = mockExpenseCategories.map((item) =>
      item.id === id ? { ...item, ...payload } : item
    );
    return;
  }
  mockExpenseCategories = [
    {
      ...payload,
      id: generateId(),
      createdDate: new Date().toISOString(),
    },
    ...mockExpenseCategories,
  ];
};

export const voidExpenseCategory = (id: string) => {
  mockExpenseCategories = mockExpenseCategories.filter(
    (item) => item.id !== id
  );
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function pickExpenseCategoryRows(
  payload: Record<string, unknown>
): Record<string, unknown>[] {
  const data = toRecord(payload.data);
  const records = data?.records;
  if (Array.isArray(records)) return records as Record<string, unknown>[];
  if (Array.isArray(payload.records))
    return payload.records as Record<string, unknown>[];
  const nestedData = data?.data;
  if (Array.isArray(nestedData)) return nestedData as Record<string, unknown>[];
  if (Array.isArray(payload.data))
    return payload.data as Record<string, unknown>[];
  return [];
}

function mapApiExpenseCategorySubcategories(
  raw: Record<string, unknown>
): ExpenseCategoryModel["subcategories"] {
  const rawList = raw.subcategories;
  if (!Array.isArray(rawList)) return undefined;
  const mapped = rawList
    .map((item) => {
      const row =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : null;
      if (!row) return null;
      const subCategoryName = String(
        row.sub_category_name ?? row.subCategoryName ?? ""
      ).trim();
      if (!subCategoryName) return null;
      const subcategoryId = String(
        row.subcategory_id ??
          row.sub_category_id ??
          row.subCategoryId ??
          ""
      ).trim();
      return {
        subcategoryId: subcategoryId || undefined,
        subCategoryName,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  return mapped.length > 0 ? mapped : undefined;
}

function mapApiExpenseCategory(
  raw: Record<string, unknown>
): ExpenseCategoryModel {
  const rowId = String(
    raw._id ?? raw.id ?? raw.expense_category_id ?? generateId()
  );
  const subcategories = mapApiExpenseCategorySubcategories(raw);
  const subCategoryNamesFromList =
    subcategories?.map((row) => row.subCategoryName).filter(Boolean) ?? [];
  const subCategoryName =
    String(raw.sub_category_name ?? raw.subCategoryName ?? "").trim() ||
    subCategoryNamesFromList[0] ||
    "";
  return {
    id: rowId,
    categoryId:
      String(raw.category_id ?? raw.categoryId ?? rowId).trim() || rowId,
    subCategoryId:
      String(
        raw.subcategory_id ??
          raw.sub_category_id ??
          raw.subCategoryId ??
          subcategories?.[0]?.subcategoryId ??
          raw.service_id ??
          raw.serviceId ??
          ""
      ).trim() || undefined,
    franchiseId:
      String(raw.franchise_id ?? raw.franchiseId ?? "").trim() || undefined,
    franchiseName:
      String(raw.franchise_name ?? raw.franchiseName ?? "").trim() || undefined,
    categoryName: String(raw.category_name ?? raw.categoryName ?? "").trim(),
    subCategoryName,
    subcategories,
    description: String(raw.description ?? "").trim(),
    createdDate: String(
      raw.created_at ?? raw.createdDate ?? new Date().toISOString()
    ),
  };
}

/** Single page from `/expense-category-management/getAll?page=&limit=` (Postman contract). */
export const fetchExpenseCategoriesPage = async (
  page = 1,
  limit = 100,
  filters?: {
    search?: string;
    sort?: string;
    sortOrder?: "asc" | "desc";
    startDate?: string;
    endDate?: string;
    franchiseId?: string;
  }
): Promise<{
  rows: ExpenseCategoryModel[];
  totalPages: number;
  totalItems?: number;
} | null> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(filters?.search ? { search: filters.search } : {}),
    ...(filters?.sort ? { sort: filters.sort } : {}),
    ...(filters?.sortOrder ? { sort_order: filters.sortOrder } : {}),
    ...(filters?.startDate ? { startDate: filters.startDate } : {}),
    ...(filters?.endDate ? { endDate: filters.endDate } : {}),
    ...(filters?.franchiseId ? { franchise_id: filters.franchiseId } : {}),
    _ts: String(Date.now()),
  });
  const res = await apiRequest(
    `${ApiPaths.GET_EXPENSE_CATEGORY()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!res.success) return null;

  const payload = toRecord(res.data) ?? {};
  const rows = pickExpenseCategoryRows(payload).map(mapApiExpenseCategory);

  const data = toRecord(payload.data);
  const inner =
    data != null && typeof data === "object" && !Array.isArray(data)
      ? data
      : null;
  const totalPagesRaw =
    inner?.totalPages ?? data?.totalPages ?? payload.totalPages ?? 0;
  const totalItemsRaw =
    inner?.totalItems ?? data?.totalItems ?? payload.totalItems;
  let totalPages = Number(totalPagesRaw);
  const totalItemsParsed =
    totalItemsRaw === undefined ||
    totalItemsRaw === null ||
    totalItemsRaw === ""
      ? undefined
      : Number(totalItemsRaw);
  const totalItems =
    totalItemsParsed !== undefined && !Number.isNaN(totalItemsParsed)
      ? totalItemsParsed
      : undefined;

  if (!Number.isFinite(totalPages) || totalPages < 1) {
    if (totalItems !== undefined && limit > 0) {
      totalPages = Math.max(1, Math.ceil(totalItems / limit));
    } else if (rows.length < limit) {
      totalPages = Math.max(1, page);
    } else {
      totalPages = Math.max(page + 1, 2);
    }
  } else {
    totalPages = Math.max(1, totalPages);
  }

  return { rows, totalPages, totalItems };
};

const EXPENSE_CATEGORY_FETCH_BATCH = 100;

/** Walks all API pages (page + limit) and refreshes local mock cache. */
export const fetchAllExpenseCategoriesWithApi = async (): Promise<
  ExpenseCategoryModel[] | null
> => {
  let page = 1;
  const all: ExpenseCategoryModel[] = [];
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const chunk = await fetchExpenseCategoriesPage(
      page,
      EXPENSE_CATEGORY_FETCH_BATCH
    );
    if (!chunk) return null;
    if (chunk.rows.length === 0) break;
    all.push(...chunk.rows);
    if (chunk.rows.length < EXPENSE_CATEGORY_FETCH_BATCH) break;
    page += 1;
    if (page > 500) break;
  }
  mockExpenseCategories = all.map((item) => ({ ...item }));
  return all;
};

/** API create/update using Postman expense-category-management contract. */
export const saveExpenseCategoryWithApi = async (
  payload: Omit<ExpenseCategoryModel, "id" | "createdDate"> & {
    /** Create flow: one or more sub categories sent as an array. */
    subCategoryNames?: string[];
  },
  id?: string
): Promise<boolean> => {
  const isUpdate = Boolean(String(id ?? "").trim());
  const subCategoryNames = (payload.subCategoryNames ?? [])
    .map((name) => String(name).trim())
    .filter(Boolean);
  const body: Record<string, unknown> = {
    franchise_id: String(payload.franchiseId ?? "").trim(),
    category_name: payload.categoryName.trim(),
    description: (payload.description ?? "").trim(),
  };
  body.sub_category_name =
    subCategoryNames.length > 0
      ? subCategoryNames
      : [payload.subCategoryName.trim()].filter(Boolean);
  const endpoint = isUpdate
    ? ApiPaths.UPDATE_EXPENSE_CATEGORY(String(id).trim())
    : ApiPaths.CREATE_EXPENSE_CATEGORY;

  const res = await apiRequest(endpoint, isUpdate ? "PUT" : "POST", body);
  if (!res.success) return false;

  // Refresh local cache from API after mutating operations.
  await fetchAllExpenseCategoriesWithApi();
  return true;
};

/** API delete via `/expense-category-management/delete/:id`. */
export const voidExpenseCategoryWithApi = async (
  id: string
): Promise<boolean> => {
  const targetId = String(id ?? "").trim();
  if (!targetId) {
    showErrorAlert("Invalid expense category id.");
    return false;
  }
  const res = await apiRequest(
    ApiPaths.DELETE_EXPENSE_CATEGORY(targetId),
    "DELETE"
  );
  if (!res.success) return false;
  await fetchAllExpenseCategoriesWithApi();
  return true;
};
