import { mainMenuItems } from "../global/layout/menuItems";

/**
 * Maps `mainMenuItems.key` → API `accessible_screens` string (see Postman User create:
 * e.g. `["dashboard", "users", "orders"]`). Extend when backend adds new screens.
 */
const MENU_KEY_TO_ACCESSIBLE_SLUG: Record<string, string> = {
  dashboards: "dashboard",
  "my-franchise": "my_franchise",
  "location-management": "location",
  "franchise-management": "franchise",
  "service-management": "services",
  "user-management": "users",
  "quote-management": "quotes",
  "order-management": "orders",
  financials: "financial",
  "expenses-management": "expenses",
  reports: "reports",
  "partner-management": "subscriptions",
  settings: "settings",
  "support-center": "tickets",
  notifications: "notifications",
  "content-management": "content",
  calendar: "calendar",
};

/** Ordered slugs for selected menu keys (deduped, stable order follows `mainMenuItems`). */
export function mapMenuKeysToAccessibleScreenSlugs(
  menuKeys: string[]
): string[] {
  const want = new Set(menuKeys ?? []);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { key } of mainMenuItems) {
    if (!want.has(key)) continue;
    const slug = MENU_KEY_TO_ACCESSIBLE_SLUG[key];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out.length ? out : ["dashboard"];
}

/** Reverse map API `accessible_screens` slugs to sidebar menu keys. */
export function mapAccessibleScreenSlugsToMenuKeys(slugs: string[]): string[] {
  const inSet = new Set(
    (slugs ?? [])
      .map((s) =>
        String(s || "")
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
  const out: string[] = [];
  for (const { key } of mainMenuItems) {
    const slug = MENU_KEY_TO_ACCESSIBLE_SLUG[key];
    if (slug && inSet.has(slug)) out.push(key);
  }
  return out;
}
