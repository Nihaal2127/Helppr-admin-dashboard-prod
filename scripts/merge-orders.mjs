import fs from "fs";
import path from "path";

const root = path.resolve(".");
const dir = path.join(root, "src/lib/order");

const types = fs
  .readFileSync(path.join(dir, "orderTypes.ts"), "utf8")
  .replace(/^\/\*\* Order models[\s\S]*?\*\/\n\n/, "");

const api = fs.readFileSync(path.join(root, "src/services/orderService.ts"), "utf8");

const helpers = fs
  .readFileSync(path.join(dir, "orderHelpers.ts"), "utf8")
  .replace(/^\/\*\*[\s\S]*?\*\/\n\n/, "")
  .replace(/^import type \{ OrderItemModel, OrderModel \} from "\.\/orderTypes";\n/, "");

const invoiceRaw = fs.readFileSync(path.join(dir, "orderService.ts"), "utf8");
const invoice = invoiceRaw
  .replace(/^import html2pdf.*\n/, "")
  .replace(/^import \{ fetchOrderById \} from "\.\.\/\.\.\/services\/orderService";\n/, "")
  .replace(/^import type \{ OrderModel \} from "\.\/orderTypes";\n/, "")
  .replace(/^import \{ OrderPaymentModeEnum, OrderStatusEnum \} from "\.\/orderTypes";\n/, "")
  .replace(/^export \{[\s\S]*?\} from "\.\.\/\.\.\/services\/orderService";\nexport type \{[\s\S]*?\} from "\.\.\/\.\.\/services\/orderService";\n\n/, "");

const statusSlug = `
// --- API status slugs (GET /order/getAll) ---
const ORDER_STATUS_API_SLUG: Record<OrderTabKey, string> = {
  2: "in-progress",
  3: "completed",
  4: "cancelled",
  5: "refunded",
};
const API_SLUG_TO_NUM: Record<string, number> = {
  pending: 1,
  "in-progress": 2,
  in_progress: 2,
  completed: 3,
  cancelled: 4,
  canceled: 4,
  refunded: 5,
};
export function normalizeOrderStatusFromApi(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (API_SLUG_TO_NUM[s] != null) return API_SLUG_TO_NUM[s];
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
export function orderStatusToApiSlug(
  status: string | number
): string | undefined {
  const n = Number(status);
  if (Number.isFinite(n) && ORDER_STATUS_API_SLUG[n as OrderTabKey]) {
    return ORDER_STATUS_API_SLUG[n as OrderTabKey];
  }
  const s = String(status).trim().toLowerCase().replace(/_/g, "-");
  if (API_SLUG_TO_NUM[s] != null) {
    return ORDER_STATUS_API_SLUG[API_SLUG_TO_NUM[s] as OrderTabKey];
  }
  if (["in-progress", "completed", "cancelled", "refunded"].includes(s)) {
    return s;
  }
  return undefined;
}
`;

const header = `/**
 * Orders module — types, API, helpers, invoice (single file).
 */
import html2pdf from "html2pdf.js";
import { apiRequest } from "../global/remote/apiHelper";
import { ApiPaths } from "../global/remote/apiPaths";
import { showLog } from "../../helper/logger";
import { formatDate, formatUtcToLocalTime } from "../../helper/utility";
import type { ServerTableSortBy } from "../global/serverTableSort";
import { sessionMayUseFranchiseIdApiFilter } from "../franchise/headerFranchisePreference";
import { CategoryModel } from "../models/CategoryModel";
import { CityModel } from "../models/CityModel";
import { ServiceModel } from "../models/ServiceModel";
import { UserModel } from "../models/UserModel";
import type { OfferModel } from "../models/SettingsModel";
import { getOffers } from "../../services/settingsService";
import {
  customerPaymentStatusLabelFromSlug,
  normalizeCustomerPaymentStatusSlug,
  normalizePartnerPaymentStatusSlug,
  partnerPaymentStatusLabelFromSlug,
} from "../financial/paymentStatus";
import type { AddQuoteFormValues } from "../types/quoteTypes";
import {
  workTimeToTimeStorage,
  formatQuoteAddressRowAsServiceLine,
} from "../quote/quoteHelpers";
import type { QuoteAddressRowUi } from "../quote/quoteHelpers";
import {
  deriveQuoteScheduleMetrics,
  resolveFranchiseIdForQuoteForm,
} from "../../services/quoteService";
import type { QuoteServiceScheduleMode } from "../../services/quoteService";
import logoDark from "../../assets/icons/login_logo.svg";
import { AppConstant } from "../global/AppConstant";

`;

const apiBody = api
  .replace(/^import[\s\S]*?sessionMayUseFranchiseIdApiFilter.*\n\n/, "")
  .replace(
    "const order_status = Number(orderStatusRaw);",
    "const order_status = normalizeOrderStatusFromApi(orderStatusRaw);"
  )
  .replace(
    /const status =\s*\n\s*filters\.status && filters\.status !== "All"\s*\n\s*\? filters\.status\.toLowerCase\(\)\s*\n\s*: "";/,
    'const statusSlug =\n    filters.status && filters.status !== "All"\n      ? orderStatusToApiSlug(filters.status)\n      : undefined;'
  )
  .replace(
    /\.\.\.\(status && \{ order_status: status \}\),/,
    "...(statusSlug && { order_status: statusSlug }),"
  );

const out =
  header +
  "\n// ========== Types ==========\n" +
  types +
  "\n" +
  statusSlug +
  "\n// ========== API ==========\n" +
  apiBody +
  "\n// ========== Helpers ==========\n" +
  helpers +
  "\n// ========== Invoice ==========\n" +
  invoice;

fs.writeFileSync(path.join(dir, "orders.ts"), out);
console.log("Wrote orders.ts", out.split("\n").length, "lines");
