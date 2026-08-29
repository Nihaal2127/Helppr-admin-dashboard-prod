import { UserRole } from "../global/AppConstant";
import { mainMenuItems } from "../global/layout/menuItems";
import { isMainMenuItemVisibleForRole } from "../routes/roleAccess";
import {
  screenPermissionKeysFromItems,
  screenPermissionsForPayload,
} from "./screenPermissionSelection";

/** @deprecated No frontend exclusions — all screens may be assigned per backend policy. */
export const FRANCHISE_EMPLOYEE_EXCLUDED_SCREEN_KEYS = [] as const;

/** @deprecated Always false — permissions come from backend only. */
export function isFranchiseEmployeeExcludedScreenKey(_key: string): boolean {
  return false;
}

/** Main-nav entries assignable to a franchise employee (all sidebar modules). */
export function getFranchiseEmployeeScreenMenuItems() {
  return mainMenuItems;
}

const employeeAssignableMenuKeys = screenPermissionKeysFromItems(
  getFranchiseEmployeeScreenMenuItems()
);

/**
 * Sidebar modules a franchise admin can access (role-based; not stored in
 * `userAccessibleMenuKeys`). Franchise employees should inherit this set.
 */
export function getFranchiseAdminEffectiveMenuKeys(): string[] {
  return mainMenuItems
    .filter(({ key }) =>
      isMainMenuItemVisibleForRole(key, UserRole.FRANCHISE_ADMIN, null)
    )
    .map((item) => item.key);
}

/** Menu keys to persist for a franchise employee — mirrors franchise admin access. */
export function franchiseEmployeeScreenPermissionKeysFromAdmin(
  adminMenuKeys?: string[] | null
): string[] {
  const effectiveAdmin = getFranchiseAdminEffectiveMenuKeys();
  const fromAdmin = (adminMenuKeys ?? []).filter((key) =>
    effectiveAdmin.includes(key)
  );
  const source = fromAdmin.length > 0 ? fromAdmin : effectiveAdmin;
  return screenPermissionsForPayload(source, employeeAssignableMenuKeys);
}

export function labelForFranchiseEmployeeScreenKey(key: string): string {
  return mainMenuItems.find((item) => item.key === key)?.label ?? key;
}
