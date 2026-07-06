import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { UserModel } from "../lib/models/UserModel";
import { enrichUserWithAreaName } from "../lib/user/resolveUserAreaDisplay";
import { showLog } from "../helper/utility";
import { normalizeCalendarYmd } from "../helper/dateFormat";
import type { ServerTableSortBy } from "../lib/global/serverTableSort";
import {
  getLocalStorage,
  setLocalStorage,
} from "../lib/global/localStorageHelper";
import { AppConstant } from "../lib/global/AppConstant";
import { PARTNER_VERIFICATION } from "../lib/partner/partnerVerification";
import { buildFullUserUpdatePayload } from "../lib/user/buildFullUserUpdatePayload";
import { mapAccessibleScreenSlugsToMenuKeys } from "../lib/layout/accessibleScreenSlugs";
import { mainMenuItems } from "../lib/layout/menuItems";
import { UserRole } from "../lib/global/AppConstant";
import { franchiseIdForUserGetAll } from "../lib/franchise/headerFranchisePreference";

/**
 * Canonical `UserModel.type` enum used end-to-end (DB / `POST /user/create` / login `record.type` /
 * `GET /user/getDropDown?type=…`). Use these instead of inline numeric literals so we don't accidentally
 * load partners where employees were intended.
 *
 * - `1` Franchise admin
 * - `2` Partner
 * - `3` Franchise employee
 * - `4` User / customer
 * - `5` Super admin
 * - `6` Staff
 */
export const APP_USER_TYPE = {
  FRANCHISE_ADMIN: 1,
  PARTNER: 2,
  FRANCHISE_EMPLOYEE: 3,
  CUSTOMER: 4,
  SUPER_ADMIN: 5,
  STAFF: 6,
} as const;

/**
 * Web dashboard subset of `APP_USER_TYPE` — types that can sign into the web app.
 * Excludes `PARTNER` (mobile partner app) and `CUSTOMER` (mobile customer app).
 */
export const WEB_MANAGEMENT_USER_TYPE = {
  FRANCHISE_ADMIN: APP_USER_TYPE.FRANCHISE_ADMIN,
  FRANCHISE_EMPLOYEE: APP_USER_TYPE.FRANCHISE_EMPLOYEE,
  SUPER_ADMIN: APP_USER_TYPE.SUPER_ADMIN,
  STAFF: APP_USER_TYPE.STAFF,
} as const;

/** Session role string stored under `AppConstant.userRole`, derived from `UserModel.type` after login. */
export type SessionUserRole = (typeof UserRole)[keyof typeof UserRole];

/** Maps API `UserModel.type` to session role for sidebar / guards. */
export function mapWebUserTypeToSessionRole(
  type: number | null | undefined
): SessionUserRole | null {
  const t = Number(type);
  if (!Number.isFinite(t)) return null;
  if (t === WEB_MANAGEMENT_USER_TYPE.SUPER_ADMIN) return UserRole.ADMIN;
  if (t === WEB_MANAGEMENT_USER_TYPE.FRANCHISE_ADMIN)
    return UserRole.FRANCHISE_ADMIN;
  if (t === WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE)
    return UserRole.EMPLOYEE;
  if (t === WEB_MANAGEMENT_USER_TYPE.STAFF) return UserRole.STAFF;
  return null;
}

const WEB_MANAGEMENT_USER_TYPE_SET = new Set<number>(
  Object.values(WEB_MANAGEMENT_USER_TYPE)
);

/** `POST /user/changePassword` — `type` must match the signed-in dashboard user (`APP_USER_TYPE`). */
export function resolveWebManagementUserType(
  userType?: number | null
): number {
  const t = Number(userType);
  if (Number.isFinite(t) && WEB_MANAGEMENT_USER_TYPE_SET.has(t)) {
    return t;
  }
  const role = String(getLocalStorage(AppConstant.userRole) ?? "").trim();
  if (role === UserRole.ADMIN) return WEB_MANAGEMENT_USER_TYPE.SUPER_ADMIN;
  if (role === UserRole.FRANCHISE_ADMIN)
    return WEB_MANAGEMENT_USER_TYPE.FRANCHISE_ADMIN;
  if (role === UserRole.EMPLOYEE)
    return WEB_MANAGEMENT_USER_TYPE.FRANCHISE_EMPLOYEE;
  if (role === UserRole.STAFF) return WEB_MANAGEMENT_USER_TYPE.STAFF;
  return WEB_MANAGEMENT_USER_TYPE.SUPER_ADMIN;
}

export type AvailablePageEntry = { page: string; url: string };

function normalizeAppPath(path: string): string {
  const p = (path ?? "").trim();
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

/**
 * Maps selected `mainMenuItems` keys to `available_pages` entries (`page` = menu label, `url` = route path).
 */
export const mapMenuKeysToAvailablePages = (
  keys: string[]
): AvailablePageEntry[] => {
  const keySet = new Set(keys ?? []);
  const pages: AvailablePageEntry[] = [];
  for (const item of mainMenuItems) {
    if (!keySet.has(item.key)) continue;
    pages.push({ page: item.label, url: normalizeAppPath(item.path) });
  }
  if (pages.length) return pages;
  const defaultItem = mainMenuItems[0];
  return [
    {
      page: defaultItem?.label ?? "Dashboard",
      url: normalizeAppPath(defaultItem?.path ?? "/dashboard"),
    },
  ];
};

/** Reconstruct menu keys from stored `{ page, url }` rows (e.g. when editing a user). */
export const menuKeysFromAvailablePages = (
  pages: AvailablePageEntry[] | null | undefined
): string[] => {
  if (!pages?.length) return [];
  const byUrl = new Map(
    mainMenuItems.map(
      (i) => [normalizeAppPath(i.path), i.key] as [string, string]
    )
  );
  const keys: string[] = [];
  for (const p of pages) {
    const k = byUrl.get(normalizeAppPath(p.url));
    if (k) keys.push(k);
  }
  return keys;
};

/** Staff users always get Profile; order follows selected menu keys then Profile when added. */
export function staffAvailablePagesFromMenuKeys(
  menuKeys: string[]
): AvailablePageEntry[] {
  const pages = mapMenuKeysToAvailablePages(menuKeys);
  const hasProfile = pages.some((p) => normalizeAppPath(p.url) === "/profile");
  if (hasProfile) return pages;
  return [...pages, { page: "Profile", url: "/profile" }];
}

export const normalizePhoneForUserCreate = (phone: string): string => {
  const t = (phone ?? "").trim();
  if (!t) return t;
  if (t.startsWith("+")) return t;
  const digits = t.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  return t;
};

function formatDobForCreatePayload(value?: string | null): string | undefined {
  return normalizeCalendarYmd(value);
}

export type CreateWebManagementUserBody = {
  name: string;
  email: string;
  phone_number: string;
  type: number;
  /** Required for most environments when creating a login-capable user. */
  password?: string;
  confirm_password?: string;
  /** Optional API status (typically `active` or `inactive`). */
  status?: string;
  is_from_web: boolean;
  created_by_id: string;
  franchise_id?: string;
  state_id?: string;
  city_id?: string;
  available_pages?: AvailablePageEntry[];
  /**
   * Optional; if omitted, API payload `accessible_screens` mirrors `available_pages` (same shape).
   */
  accessible_screens?: AvailablePageEntry[];
  profile_url?: string;
  gender?: string;
  date_of_birth?: string;
  /**
   * App-side name; request body sends `chat` (boolean).
   */
  chat_enabled?: boolean;
  imageFile?: File;
};

/**
 * `POST` `ApiPaths.CREATE_USER` with Postman-style body (web super admin / staff / etc.).
 * Returns parsed `record` when the API succeeds (shape may vary by environment).
 */
export const createWebManagementUser = async (
  body: CreateWebManagementUserBody
): Promise<{ ok: true; record: unknown } | { ok: false }> => {
  const availablePages = Array.isArray(body.available_pages)
    ? body.available_pages
    : [];
  const pageRows: AvailablePageEntry[] = availablePages.map((p) => ({
    page: p.page,
    url: normalizeAppPath(p.url),
  }));
  const screensFromBody = Array.isArray(body.accessible_screens)
    ? (body.accessible_screens as AvailablePageEntry[]).map((p) => ({
        page: p.page,
        url: normalizeAppPath(p.url),
      }))
    : null;
  const accessibleScreensRows = screensFromBody ?? pageRows;

  const requestBody: Record<string, unknown> = {
    name: body.name,
    email: body.email,
    phone_number: normalizePhoneForUserCreate(body.phone_number),
    type: body.type,
    is_from_web: body.is_from_web,
    created_by_id: body.created_by_id,
  };
  const pw = String(body.password ?? "").trim();
  if (pw) {
    requestBody.password = pw;
    const confirm = String(body.confirm_password ?? "").trim();
    requestBody.confirm_password = confirm || pw;
  }
  if (body.available_pages !== undefined) {
    requestBody.available_pages = pageRows;
    // Same as `available_pages` — server expects the same structure for `accessible_screens`.
    requestBody.accessible_screens = accessibleScreensRows;
  } else if (
    Array.isArray(body.accessible_screens) &&
    body.accessible_screens.length
  ) {
    requestBody.accessible_screens = accessibleScreensRows;
  }
  if (body.status != null && String(body.status).trim() !== "") {
    const s = String(body.status).trim().toLowerCase();
    requestBody.status = s;
    requestBody.is_active = s !== "inactive";
  }
  if (body.franchise_id) requestBody.franchise_id = body.franchise_id;
  if (body.state_id) requestBody.state_id = body.state_id;
  if (body.city_id) requestBody.city_id = body.city_id;
  if (body.profile_url) requestBody.profile_url = body.profile_url;
  if (body.gender) requestBody.gender = String(body.gender).trim().toLowerCase();
  const dob = formatDobForCreatePayload(body.date_of_birth);
  if (dob) requestBody.date_of_birth = dob;
  if (body.chat_enabled !== undefined) {
    requestBody.chat = Boolean(body.chat_enabled);
  }

  const imageFile = body.imageFile;
  const shouldSendMultipart = Boolean(imageFile);

  let requestPayload: Record<string, unknown> | FormData = requestBody;
  if (shouldSendMultipart) {
    const formData = new FormData();
    Object.entries(requestBody).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === "object") {
        formData.append(key, JSON.stringify(value));
        return;
      }
      formData.append(key, String(value));
    });
    formData.append("image", imageFile as File);
    requestPayload = formData;
  }

  const response = await apiRequest(
    ApiPaths.CREATE_USER,
    "POST",
    requestPayload,
    shouldSendMultipart
  );

  if (!response.success) {
    return { ok: false };
  }

  const data: any = response.data;
  const record = data?.record ?? data?.data?.record ?? data?.user ?? data;
  return { ok: true, record };
};

type UserAccessLike = {
  available_pages?: unknown;
  accessible_screens?: unknown;
};

/**
 * Build allowed sidebar menu keys from login `record` access fields.
 * Supports `available_pages` and/or `accessible_screens` as `[{page,url}]` (mirrored) or legacy `accessible_screens` as string[] slugs.
 */
export function menuKeysFromUserAccess(
  record: UserAccessLike | null | undefined
): string[] {
  if (!record) return [];

  const available = Array.isArray(record.available_pages)
    ? menuKeysFromAvailablePages(record.available_pages as AvailablePageEntry[])
    : [];

  const rawScreens = record.accessible_screens;
  const fromSlugs =
    Array.isArray(rawScreens) && rawScreens.every((x) => typeof x === "string")
      ? mapAccessibleScreenSlugsToMenuKeys(rawScreens as string[])
      : [];

  const fromRows =
    Array.isArray(rawScreens) &&
    rawScreens.some((x) => typeof x === "object" && x != null)
      ? menuKeysFromAvailablePages(rawScreens as AvailablePageEntry[])
      : [];

  const merged = new Set<string>([...available, ...fromSlugs, ...fromRows]);
  return Array.from(merged);
}

function hasPersistedMenuAccessKeys(): boolean {
  const raw = getLocalStorage(AppConstant.userAccessibleMenuKeys);
  if (!raw || !String(raw).trim()) return false;
  try {
    const parsed = JSON.parse(String(raw));
    return (
      Array.isArray(parsed) &&
      parsed.some((x) => String(x ?? "").trim().length > 0)
    );
  } catch {
    return false;
  }
}

/**
 * Refresh current session's accessible menu keys from `/user/get/:id`
 * without forcing logout/login.
 * Returns `true` when stored keys were updated.
 *
 * By default skips the HTTP call when `userAccessibleMenuKeys` is already
 * populated (login persisted it). Pass `{ force: true }` to always refetch
 * (e.g. after an admin updates your permissions).
 */
export async function refreshSessionAccessibleMenuKeys(options?: {
  force?: boolean;
}): Promise<boolean> {
  const force = Boolean(options?.force);
  const authToken = String(getLocalStorage(AppConstant.authToken) ?? "").trim();
  const currentUserId = String(getLocalStorage(AppConstant.adminId) ?? "").trim();
  if (!authToken || !currentUserId) return false;

  if (!force && hasPersistedMenuAccessKeys()) {
    return false;
  }

  const response = await apiRequest(
    `${ApiPaths.GET_USER_BY_ID()}/${currentUserId}`,
    "GET",
    undefined,
    false,
    true,
    true
  );
  if (!response.success) return false;

  const payload = (response as any).data ?? {};
  const record =
    payload.record ?? payload.data?.record ?? payload.user ?? payload.data ?? null;
  if (!record || typeof record !== "object") return false;

  const nextKeys = menuKeysFromUserAccess(record as UserAccessLike);
  const prevRaw = getLocalStorage(AppConstant.userAccessibleMenuKeys);
  let prevKeys: string[] = [];
  try {
    const parsed = prevRaw ? JSON.parse(prevRaw) : [];
    prevKeys = Array.isArray(parsed) ? parsed.map((x) => String(x ?? "")) : [];
  } catch {
    prevKeys = [];
  }

  const prevNorm = Array.from(new Set(prevKeys.filter(Boolean))).sort();
  const nextNorm = Array.from(new Set(nextKeys.filter(Boolean))).sort();
  const changed =
    prevNorm.length !== nextNorm.length ||
    prevNorm.some((v, i) => v !== nextNorm[i]);

  if (changed) {
    setLocalStorage(
      AppConstant.userAccessibleMenuKeys,
      JSON.stringify(nextNorm)
    );
  }
  return changed;
}

/** Staging/API may return `records` on `data`, `data.data`, or a bare array — keep dropdowns from going empty. */
function extractUserDropDownRecords(data: unknown): UserModel[] {
  if (Array.isArray(data)) return data as UserModel[];
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  if (Array.isArray(root.records)) return root.records as UserModel[];
  const nested = root.data;
  if (Array.isArray(nested)) return nested as UserModel[];
  if (nested && typeof nested === "object") {
    const inner = nested as Record<string, unknown>;
    if (Array.isArray(inner.records)) return inner.records as UserModel[];
    const deeper = inner.data;
    if (Array.isArray(deeper)) return deeper as UserModel[];
    if (deeper && typeof deeper === "object") {
      const d2 = deeper as Record<string, unknown>;
      if (Array.isArray(d2.records)) return d2.records as UserModel[];
    }
  }
  return [];
}

export type UserDropDownExtraQuery = {
  /** When set (e.g. super admin Add Quote), forwarded as `franchise_id` for scoped lists (`type=3` employees, often `type=4` customers). */
  franchise_id?: string;
};

/**
 * `GET /api/user/getDropDown?type=…` — `type` uses {@link APP_USER_TYPE} (`4` customer, `3` franchise employee, `2` partner, etc.).
 * Optional `service_id` for partner-style lists; optional `franchise_id` when the API scopes dropdowns by franchise.
 */
export const fetchUserDropDown = async (
  type: number,
  serviceId?: string,
  extra?: UserDropDownExtraQuery
): Promise<{ users: UserModel[] }> => {
  const fid = franchiseIdForUserGetAll(extra?.franchise_id);
  const params = new URLSearchParams({
    type: String(type),
    ...(serviceId && { service_id: serviceId }),
    ...(fid ? { franchise_id: fid } : {}),
  });
  const response = await apiRequest(
    `${ApiPaths.GET_USER_DROP_DOWN()}?${params.toString()}`,
    "GET"
  );

  if (response.success) {
    return {
      users: extractUserDropDownRecords(response.data),
    };
  } else {
    showLog(response.message || "Failed to fetch user");
    return { users: [] };
  }
};

/**
 * `GET /api/user/getPartnerDropDown` — preferred for partner pickers when `service_id` is known (Postman: Quote / partner lists).
 */
export const fetchPartnerDropDown = async (
  serviceId?: string
): Promise<{ partners: UserModel[] }> => {
  const params = new URLSearchParams({
    ...(serviceId && { service_id: serviceId }),
  });
  const response = await apiRequest(
    `${ApiPaths.GET_PARTNER_DROP_DOWN()}?${params.toString()}`,
    "GET"
  );

  if (response.success) {
    return { partners: extractUserDropDownRecords(response.data) };
  } else {
    showLog(response.message || "Failed to fetch partner");
    return { partners: [] };
  }
};

export type UserListFilters = {
  search?: string;
  keyword?: string;
  status?: string;
  is_blocked?: "true" | "false";
  /** Partner list: `Approved` — verified partners; verification queue uses `GET_VERIFICATION` or filters. */
  is_verified?: string;
  sort?: string;
  franchise_id?: string;
  /** e.g. pending | cleared — sent when backend supports partner wallet filtering */
  wallet_status?: string;
  from_date?: string;
  to_date?: string;
  /** `GET /user/getVerificationAll` — e.g. `1` for pending (matches Postman `verification_status`). */
  verification_status?: string;
};

export const fetchUser = async (
  isVerification: boolean,
  type: number,
  page: number,
  pageSize: number,
  filters: UserListFilters,
  sortBy: ServerTableSortBy = [],
  signal?: AbortSignal
): Promise<{ response: boolean; users: UserModel[]; totalPages: number }> => {
  const primarySort = sortBy[0];
  const mappedSortField = (() => {
    if (!primarySort?.id) return undefined;
    const id = primarySort.id;
    if (id === "name") {
      if (type === APP_USER_TYPE.CUSTOMER) return "user_name";
      if (type === APP_USER_TYPE.PARTNER) return "name";
      return id;
    }
    if (type === APP_USER_TYPE.PARTNER && id === "no_of_services") {
      return "no_of_services";
    }
    return id;
  })();

  const statusRaw = String(filters.status ?? "").trim().toLowerCase();
  const blockedFilter =
    statusRaw === "blocked"
      ? "true"
      : filters.is_blocked !== undefined
      ? filters.is_blocked
      : undefined;

  const franchiseIdQuery = franchiseIdForUserGetAll(filters.franchise_id);

  const searchText = (filters.search ?? filters.keyword)?.trim();
  const params = new URLSearchParams({
    type: String(type),
    page: String(page),
    limit: String(pageSize),
    ...(searchText && { name: searchText }),
    ...(searchText && { keyword: searchText }),
    ...(searchText && { search: searchText }),
    ...(searchText && { user_name: searchText }),
    ...(searchText && { partner_name: searchText }),
    ...(filters.is_verified !== undefined &&
      filters.is_verified !== "" && {
        is_verified: String(filters.is_verified),
      }),
    ...(filters.verification_status !== undefined &&
      filters.verification_status !== "" && {
        verification_status: String(filters.verification_status),
      }),
    ...(filters.status &&
      filters.status !== "All" &&
      statusRaw !== "blocked" && { is_active: filters.status.toLowerCase() }),
    ...(blockedFilter && { is_blocked: blockedFilter }),
    ...(filters.sort && { sort: filters.sort }),
    ...(franchiseIdQuery ? { franchise_id: franchiseIdQuery } : {}),
    ...(filters.wallet_status &&
      filters.wallet_status !== "all" && {
        wallet_status: filters.wallet_status,
      }),
    ...(filters.from_date && { from_date: filters.from_date }),
    ...(filters.to_date && { to_date: filters.to_date }),
    ...(mappedSortField && { sort_by: mappedSortField }),
    ...(primarySort && { sort_order: primarySort.desc ? "desc" : "asc" }),
    ...(mappedSortField && { sort_field: mappedSortField }),
  });

  const response = await apiRequest(
    `${
      isVerification ? ApiPaths.GET_VERIFICATION() : ApiPaths.GET_USER()
    }?${params.toString()}`,
    "GET",
    undefined,
    false,
    false,
    false,
    false,
    signal
  );

  if ((response as { aborted?: boolean }).aborted) {
    return { response: false, users: [], totalPages: 0 };
  }

  if (response.success) {
    return {
      response: true,
      users: response.data.records,
      totalPages: response.data.totalPages,
    };
  } else {
    showLog(response.message || "Failed to fetch users");
    return {
      response: false,
      users: [],
      totalPages: 0,
    };
  }
};

function userSelectLabel(user: UserModel): string {
  const name = String(user.name ?? "").trim();
  if (name) return name;
  const email = String(user.email ?? "").trim();
  if (email) return email;
  const phone = String(user.phone_number ?? "").trim();
  if (phone) return phone;
  return String(user.user_id ?? "").trim() || "User";
}

/** Paginate `GET /user/getAll` for one user type (scoped by token / franchise filter). */
async function fetchAllUsersByType(
  type: number,
  filters: UserListFilters = {}
): Promise<UserModel[]> {
  const pageSize = 200;
  let page = 1;
  const allUsers: UserModel[] = [];

  for (;;) {
    const res = await fetchUser(false, type, page, pageSize, filters);
    if (!res.response) break;
    allUsers.push(...(res.users ?? []));
    if (!res.totalPages || page >= res.totalPages) break;
    page += 1;
    if (page > 100) break;
  }

  return allUsers;
}

/**
 * Franchise admins + employees for chat transfer (`GET /user/getAll`, type `1` and `3`).
 * Franchise portal users are scoped by Bearer token; super admin/staff use optional franchise scope.
 */
export async function fetchChatTransferAssigneeOptions(
  franchiseId?: string,
  excludeUserId?: string
): Promise<{ value: string; label: string }[]> {
  const filters: UserListFilters = franchiseId
    ? { franchise_id: franchiseId }
    : {};

  const [admins, employees] = await Promise.all([
    fetchAllUsersByType(APP_USER_TYPE.FRANCHISE_ADMIN, filters),
    fetchAllUsersByType(APP_USER_TYPE.FRANCHISE_EMPLOYEE, filters),
  ]);

  const exclude = String(excludeUserId ?? "").trim();
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];

  for (const user of [...admins, ...employees]) {
    const value = String(user._id ?? "").trim();
    if (!value || seen.has(value)) continue;
    if (exclude && value === exclude) continue;
    seen.add(value);
    options.push({ value, label: userSelectLabel(user) });
  }

  return options.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
}

export const fetchUserById = async (
  id: string
): Promise<{ response: boolean; user: UserModel | null }> => {
  const response = await apiRequest(
    `${ApiPaths.GET_USER_BY_ID()}/${id}`,
    "GET"
  );
  if (response.success) {
    const user = await enrichUserWithAreaName(
      (response.data?.record ?? null) as UserModel | null
    );
    return {
      response: true,
      user,
    };
  } else {
    return {
      response: false,
      user: null,
    };
  }
};

export async function createUserAddressExtra(
  userId: string,
  payload: {
    address: string;
    state_id: string;
    city_id: string;
    pincode: string;
    area_id?: string;
    contact_name?: string;
    contact_number?: string;
    address_status?: boolean;
  }
): Promise<boolean> {
  const response = await apiRequest(
    ApiPaths.UPDATE_USER(userId),
    "PUT",
    {
      add_new_address: true,
      ...payload,
    },
    false,
    false,
    false,
    true
  );
  return Boolean(response.success);
}

export async function updateUserAddressById(
  userId: string,
  payload: {
    address_id: string;
    address?: string;
    state_id?: string;
    city_id?: string;
    pincode?: string;
    area_id?: string;
    contact_name?: string;
    contact_number?: string;
    address_status?: boolean;
  }
): Promise<boolean> {
  const response = await apiRequest(
    ApiPaths.UPDATE_USER(userId),
    "PUT",
    payload,
    false,
    false,
    false,
    true
  );
  return Boolean(response.success);
}

export async function deleteMobileUserAddress(
  addressId: string
): Promise<boolean> {
  const response = await apiRequest(
    ApiPaths.DELETE_MOBILE_USER_ADDRESS(addressId),
    "DELETE",
    undefined,
    false,
    false,
    false,
    true
  );
  return Boolean(response.success);
}

/** Super admin approve/reject partner verification (`PUT /user/update/:id`). */
export async function updatePartnerVerificationDecision(
  partnerUserId: string,
  decision: {
    approved: boolean;
    verification_rejection_reason?: string;
  }
): Promise<boolean> {
  const id = String(partnerUserId ?? "").trim();
  if (!id) return false;
  const body: Record<string, unknown> = {
    is_verified: decision.approved
      ? PARTNER_VERIFICATION.APPROVED
      : PARTNER_VERIFICATION.REJECTED,
    ...(decision.approved
      ? { verification_rejection_reason: "" }
      : {
          verification_rejection_reason: String(
            decision.verification_rejection_reason ?? ""
          ).trim(),
        }),
  };
  return createOrUpdateUser(body, true, id, null);
}

export const deleteUser = async (id: string): Promise<boolean> => {
  const response = await apiRequest(ApiPaths.DELETE_USER(id), "DELETE");
  if (response.success) {
    return true;
  } else {
    showLog(response.message || "Failed to delete users");
    return false;
  }
};

export type UserMultipartUploads = {
  image?: File | null;
  /** Keys match `PARTNER_CREATE_DOCUMENT_FIELDS` in `partnerFormDocuments.ts`. */
  partnerDocumentFiles?: Partial<Record<string, File>>;
};

function resolveUserMultipartUploads(
  uploads?: UserMultipartUploads | File | null
): UserMultipartUploads {
  if (!uploads) return {};
  if (uploads instanceof File) return { image: uploads };
  return uploads;
}

export type CreateOrUpdateUserOptions = {
  suppressSuccessAlert?: boolean;
};

/** API requires `confirm_password` whenever `password` is sent. */
function attachPasswordConfirmFields(body: Record<string, unknown>): void {
  const password = String(body.password ?? "").trim();
  if (!password) {
    delete body.password;
    delete body.confirm_password;
    return;
  }
  body.password = password;
  const confirm = String(body.confirm_password ?? "").trim();
  body.confirm_password = confirm || password;
}

export const createOrUpdateUser = async (
  payload: any,
  isEditable: boolean,
  id?: string,
  uploads?: UserMultipartUploads | File | null,
  options?: CreateOrUpdateUserOptions
): Promise<boolean> => {
  const path = isEditable ? ApiPaths.UPDATE_USER(id!) : ApiPaths.CREATE_USER;
  const method = isEditable ? "PUT" : "POST";

  let mergedPayload: Record<string, unknown> =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...payload }
      : { ...(payload as Record<string, unknown>) };

  if (isEditable && id) {
    const { response, user } = await fetchUserById(id);
    if (response && user) {
      mergedPayload = buildFullUserUpdatePayload(
        user,
        mergedPayload as Record<string, unknown>
      );
    }
  }

  const { image, partnerDocumentFiles } = resolveUserMultipartUploads(uploads);
  const docFileEntries = Object.entries(partnerDocumentFiles ?? {}).filter(
    (entry): entry is [string, File] => entry[1] instanceof File
  );
  attachPasswordConfirmFields(mergedPayload);

  const shouldSendMultipart = Boolean(image) || docFileEntries.length > 0;
  let bodyToSend: any = mergedPayload;

  if (shouldSendMultipart) {
    const formData = new FormData();
    Object.entries(mergedPayload ?? {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === "object") {
        formData.append(key, JSON.stringify(value));
        return;
      }
      formData.append(key, String(value));
    });
    if (image) {
      formData.append("image", image);
    }
    for (const [fieldName, file] of docFileEntries) {
      formData.append(fieldName, file);
    }
    if (
      !isEditable &&
      Number(mergedPayload?.type) === 2 &&
      !formData.has("partner_documents")
    ) {
      formData.append("partner_documents", "{}");
    }
    bodyToSend = formData;
  }

  const response = await apiRequest(
    path,
    method,
    bodyToSend,
    shouldSendMultipart,
    false,
    false,
    Boolean(options?.suppressSuccessAlert)
  );
  if (response.success) {
    return true;
  }
  return false;
};
