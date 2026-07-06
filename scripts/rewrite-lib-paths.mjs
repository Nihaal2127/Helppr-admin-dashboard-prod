/**
 * After folder moves: rewrite import path segments under src/.
 */
import fs from "fs";
import path from "path";

const srcRoot = path.resolve("src");

const walk = (dir, out = []) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
};

const pairs = [
  ["lib/remote/", "lib/global/remote/"],
  ["lib/constant/", "lib/global/constant/"],
  ["lib/helper/", "lib/global/helper/"],
  ["lib/models/dashboard/dashboardModel", "lib/dashboard/dashboardModel"],
  ["lib/services/dashboard/dashboardService", "lib/dashboard/dashboardService"],
  ["lib/services/orderService", "lib/order/orderService"],
  ["lib/models/OrderModel", "lib/order/OrderModel"],
  ["lib/models/OrderItemModel", "lib/order/OrderItemModel"],
  ["lib/global/helper/orderPaymentsExport", "lib/order/orderPaymentsExport"],
  ["lib/global/helper/orderDisplayHelpers", "lib/order/orderDisplayHelpers"],
  ["lib/global/helper/orderPaymentStorage", "lib/order/orderPaymentStorage"],
  ["lib/global/helper/orderPaymentPreviewDummy", "lib/order/orderPaymentPreviewDummy"],
  ["lib/global/helper/invoicePdfTemplate", "lib/order/invoicePdfTemplate"],
];

for (const abs of walk(srcRoot)) {
  let s = fs.readFileSync(abs, "utf8");
  const orig = s;
  for (const [a, b] of pairs) s = s.split(a).join(b);
  if (s !== orig) fs.writeFileSync(abs, s, "utf8");
}

console.log("lib-path-rewrite done");
