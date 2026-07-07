import { CURRENCY } from "./paymentAndCurrency";

const CHAT_SERVICE_URL = "https://chat.helppr.in";

/**
 * Chat base URL for REST + Socket.IO.
 * Hard-coded HTTPS — CRA bakes REACT_APP_* at build time; ignoring env avoids
 * stale `http://` values from server CI/.env in production bundles.
 */
export function getChatServiceUrl(): string {
  const fromEnv = process.env.REACT_APP_CHAT_SERVICE_URL?.trim();
  if (fromEnv && /^https:\/\//i.test(fromEnv)) {
    return fromEnv.replace(/\/$/, "");
  }
  return CHAT_SERVICE_URL;
}

export const AppConstant = {
  BASE_URL:
    "https://app.helppr.in/api", //Help Pr Live
  /** Chat Service VPS — REST + Socket.IO (see CHAT_MODULE_FRONTEND.md). */
  get CHAT_SERVICE_URL(): string {
    return getChatServiceUrl();
  },
  IMAGE_BASE_URL: "", //Help Pr Live
  // BASE_URL: "http://localhost:5001/api",
  // BASE_URL: "https://raamisegei.execute-api.us-east-1.amazonaws.com/dev/api",
  // IMAGE_BASE_URL: "https://d2d4noj5f8gqer.cloudfront.net/",
  authToken: "authToken",
  deviceToken: "deviceToken",

  isAdmin: "isAdmin",

  /** "admin" | "franchise_admin" | "employee" | "staff" — set on login from API user `type` (see `mapWebUserTypeToSessionRole`). */
  userRole: "userRole",
  userAccessibleMenuKeys: "userAccessibleMenuKeys",
  adminId: "adminId",
  partnerId: "partnerId",
  /** Super admin / staff: last chosen header franchise filter (`"all"` or franchise `_id`). Cleared with `clearLocalStorage` on logout. */
  headerFranchiseFilter: "headerFranchiseFilter",
  createdById: "createdById",
  isAuthenticated: "isAuthenticated",
  canAccessExpenseSheet: "canAccessExpenseSheet",
  CART_KEY: "cart",
  currencySymbol: CURRENCY.symbol,
  currencyCode: CURRENCY.code,
  percentageSymbol: "%",
  companyName: "Helper",
  helplineNumber: "+61434380737",
  supportEmail: "info@sostyres.com.au",
  companyLocation: " 8/41 Lensworth St, Coopers plains,4108, Australia",

};

/** Values stored under AppConstant.userRole */
export const UserRole = {
  ADMIN: "admin",
  FRANCHISE_ADMIN: "franchise_admin",
  EMPLOYEE: "employee",
  STAFF: "staff",
} as const;
