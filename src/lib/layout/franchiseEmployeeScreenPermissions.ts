import { mainMenuItems } from "../global/layout/menuItems";

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

export function labelForFranchiseEmployeeScreenKey(key: string): string {
  return mainMenuItems.find((item) => item.key === key)?.label ?? key;
}
