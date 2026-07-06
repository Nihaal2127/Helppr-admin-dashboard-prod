import { AppConstant, UserRole } from "../global/AppConstant";
import { getLocalStorage, setLocalStorage } from "../global/localStorageHelper";

/** Same-tab listeners (e.g. CustomHeader) when preference changes. */
export const HEADER_FRANCHISE_CHANGED_EVENT = "header-franchise-filter-changed";

/** Sentinel used across the app for “all franchises” in the header filter. */
export function readHeaderFranchisePreference(): string {
  const raw = String(getLocalStorage(AppConstant.headerFranchiseFilter) ?? "").trim();
  if (!raw || raw.toLowerCase() === "all") return "all";
  return raw;
}

export function writeHeaderFranchisePreference(franchiseId: string): void {
  const normalized = String(franchiseId ?? "").trim();
  const stored = !normalized || normalized.toLowerCase() === "all" ? "all" : normalized;
  setLocalStorage(AppConstant.headerFranchiseFilter, stored);
  try {
    window.dispatchEvent(
      new CustomEvent(HEADER_FRANCHISE_CHANGED_EVENT, {
        detail: { franchise_id: stored },
      })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Initial `franchise_id` for pages that use `CustomHeader` + `useFranchiseHeaderForm`.
 *
 * Super admin / staff: last choice from local storage ("all" or a franchise id).
 * Franchise admin / employee: no header dropdown — always the session franchise
 * (`AppConstant.partnerId` is set from `user.franchise_id` at login). Otherwise
 * scoped catalogue calls would incorrectly use global `getAll` while `getCount`
 * still received no `franchise_id`.
 */
export function franchiseHeaderFormDefaults(): { franchise_id: string } {
  const role = String(getLocalStorage(AppConstant.userRole) ?? "").trim();
  if (role === UserRole.FRANCHISE_ADMIN || role === UserRole.EMPLOYEE) {
    const sessionFranchiseId = String(
      getLocalStorage(AppConstant.partnerId) ?? ""
    ).trim();
    if (sessionFranchiseId) return { franchise_id: sessionFranchiseId };
  }
  return { franchise_id: readHeaderFranchisePreference() };
}

/** Logged-in franchise admin or franchise employee (portal session). */
export function isFranchisePortalSession(): boolean {
  const role = String(getLocalStorage(AppConstant.userRole) ?? "").trim();
  return role === UserRole.FRANCHISE_ADMIN || role === UserRole.EMPLOYEE;
}

/**
 * Super admin (`UserRole.ADMIN`) and staff may send `franchise_id` on list/count APIs to filter by franchise.
 * Franchise portal users are scoped by the auth token — never send `franchise_id` on those requests.
 */
export function sessionMayUseFranchiseIdApiFilter(): boolean {
  return !isFranchisePortalSession();
}

/**
 * `franchise_id` for list/count/catalog query params — super admin/staff header filter only.
 * Franchise admin/employee: backend scopes by Bearer token; omit `franchise_id`.
 */
export function franchiseIdForApiQuery(
  requestedFranchiseId?: string | null
): string {
  if (isFranchisePortalSession()) return "";
  const fid = String(requestedFranchiseId ?? "").trim();
  if (!fid || fid.toLowerCase() === "all") return "";
  return fid;
}

/** Logged-in franchise id from session (`partnerId` at login) — UI only, not for API query scoping. */
export function sessionFranchiseIdForScopedApis(): string {
  if (!isFranchisePortalSession()) return "";
  return String(getLocalStorage(AppConstant.partnerId) ?? "").trim();
}

/**
 * `franchise_id` for list/count/area APIs that must scope data to one franchise.
 * Franchise admin/employee: always the session franchise (`AppConstant.partnerId`).
 * Super admin/staff: header filter when not "all".
 */
export function franchiseIdForScopedListApi(
  requestedFranchiseId?: string | null
): string {
  if (isFranchisePortalSession()) {
    return sessionFranchiseIdForScopedApis();
  }
  return franchiseIdForApiQuery(requestedFranchiseId);
}

/**
 * `GET /area/getAll?franchise_id=` — super admin/staff may filter any franchise;
 * franchise admin/employee always scope to their session franchise.
 */
export function franchiseIdForAreaGetAll(requestedFranchiseId?: string): string {
  return franchiseIdForScopedListApi(requestedFranchiseId);
}

/**
 * Resolves `franchise_id` for `GET /user/getAll`, verification lists, and `POST /getCount` (`user-management`).
 */
export function franchiseIdForUserGetAll(requestedFranchiseId?: string): string {
  return franchiseIdForScopedListApi(requestedFranchiseId);
}
