/**
 * Maps the current URL to the `POST /api/getCount` `type` field.
 * The API rejects a body with no `type`; always send `{ type, franchise_id? }`.
 *
 * Extend `RULES` when a new page gets dashboard cards + franchise header; keep longest paths first
 * (prefix match uses the first matching rule).
 */
export type GetCountPathResolution = { type: number | string };

type Rule = { prefix: string; res: GetCountPathResolution };

const RULES_UNSORTED: Rule[] = [
  {
    prefix: "/franchise-management",
    res: { type: "franchise-management" },
  },
  { prefix: "/location-management", res: { type: 1 } },
  {
    prefix: "/service-management",
    res: { type: "service-management" },
  },
  { prefix: "/user-management", res: { type: "user-management" } },
  {
    prefix: "/quote-management",
    res: { type: "quote-management" },
  },
  { prefix: "/financial-partner-payments", res: { type: 5 } },
  {
    prefix: "/financial-order-payments",
    res: { type: "financial-order-payments" },
  },
  {
    prefix: "/order-management",
    res: { type: "order-management" },
  },
  {
    prefix: "/partner-management",
    res: { type: "partner-management" },
  },
  { prefix: "/my-franchise", res: { type: "my-franchise" } },
];

const RULES: Rule[] = [...RULES_UNSORTED].sort(
  (a, b) => b.prefix.length - a.prefix.length
);

function normalizePathname(pathname: string): string {
  const p = pathname.trim() || "/";
  if (p.length > 1 && p.endsWith("/")) return p.replace(/\/+$/, "");
  return p;
}

/**
 * Returns how to call `getCount` for this pathname, or `null` if the route is not registered
 * (caller should pass an explicit `type` or skip counts).
 */
export function resolveGetCountTypeFromPathname(
  pathname: string
): GetCountPathResolution | null {
  const p = normalizePathname(pathname);
  for (const { prefix, res } of RULES) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return res;
  }
  return null;
}
