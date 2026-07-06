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
  ["lib/global/constant/AppConstant", "lib/global/AppConstant"],
  ["lib/global/constant/RoleEnum", "lib/global/RoleEnum"],
  ["lib/global/constant/ResolveStatusEnum", "lib/global/ResolveStatusEnum"],
  ["lib/global/constant/VerificationStatusEnum", "lib/global/VerificationStatusEnum"],
  ["lib/global/constant/OrderStatusEnum", "lib/order/OrderStatusEnum"],
  ["lib/global/constant/PaymentEnum", "lib/order/PaymentEnum"],
  ["lib/global/constant/partnerVerification", "lib/partner/partnerVerification"],
  ["lib/global/constant/ServiceStatusEnum", "lib/user/ServiceStatusEnum"],
  ["lib/global/helper/alertHelper", "lib/global/alertHelper"],
  ["lib/global/helper/DialogManager", "lib/global/DialogManager"],
  ["lib/global/helper/localStorageHelper", "lib/global/localStorageHelper"],
  ["lib/global/helper/authSessionHelper", "lib/global/authSessionHelper"],
  ["lib/global/helper/useViewPort", "lib/global/useViewPort"],
  ["lib/global/helper/serverTableSort", "lib/global/serverTableSort"],
  ["lib/global/helper/getCountRouteType", "lib/global/getCountRouteType"],
  ["lib/global/helper/headerFranchisePreference", "lib/franchise/headerFranchisePreference"],
  ["lib/global/helper/franchiseCatalog", "lib/franchise/franchiseCatalog"],
  ["lib/global/helper/pincodeValidation", "lib/user/pincodeValidation"],
  ["lib/global/helper/userFormValidation", "lib/user/userFormValidation"],
  ["lib/global/helper/userAddressPreview", "lib/user/userAddressPreview"],
  ["lib/global/helper/serviceMinDepositDisplay", "lib/service/serviceMinDepositDisplay"],
  ["lib/global/helper/expensesExport", "lib/expenses/expensesExport"],
  ["lib/global/helper/reports/reportFilterShared", "lib/reports/reportFilterShared"],
  ["lib/global/helper/userManagement/partnerCategoryServiceView", "lib/partner/partnerCategoryServiceView"],
  ["lib/global/helper/ticketManagement/ticketDisputeHelpers", "lib/ticket/ticketDisputeHelpers"],
  ["../helper/franchiseCatalog", "../franchise/franchiseCatalog"],
  ["../global/helper/alertHelper", "../global/alertHelper"],
  ["../global/helper/DialogManager", "../global/DialogManager"],
  ["../global/helper/localStorageHelper", "../global/localStorageHelper"],
  ["../global/helper/authSessionHelper", "../global/authSessionHelper"],
  ["../global/helper/useViewPort", "../global/useViewPort"],
  ["../global/helper/serverTableSort", "../global/serverTableSort"],
  ["../global/helper/getCountRouteType", "../global/getCountRouteType"],
  ["../global/helper/headerFranchisePreference", "../franchise/headerFranchisePreference"],
  ["../global/helper/franchiseCatalog", "../franchise/franchiseCatalog"],
  ["../global/helper/pincodeValidation", "../user/pincodeValidation"],
  ["../global/helper/userFormValidation", "../user/userFormValidation"],
  ["../global/helper/userAddressPreview", "../user/userAddressPreview"],
  ["../global/helper/serviceMinDepositDisplay", "../service/serviceMinDepositDisplay"],
  ["../global/helper/expensesExport", "../expenses/expensesExport"],
  ["../global/helper/reports/reportFilterShared", "../reports/reportFilterShared"],
  ["../global/helper/userManagement/partnerCategoryServiceView", "../partner/partnerCategoryServiceView"],
  ["../global/helper/ticketManagement/ticketDisputeHelpers", "../ticket/ticketDisputeHelpers"],
  ["../global/constant/AppConstant", "../global/AppConstant"],
  ["../global/constant/RoleEnum", "../global/RoleEnum"],
  ["../global/constant/ResolveStatusEnum", "../global/ResolveStatusEnum"],
  ["../global/constant/VerificationStatusEnum", "../global/VerificationStatusEnum"],
  ["../global/constant/OrderStatusEnum", "../order/OrderStatusEnum"],
  ["../global/constant/PaymentEnum", "../order/PaymentEnum"],
  ["../global/constant/partnerVerification", "../partner/partnerVerification"],
  ["../global/constant/ServiceStatusEnum", "../user/ServiceStatusEnum"],
];

for (const abs of walk(srcRoot)) {
  let s = fs.readFileSync(abs, "utf8");
  const orig = s;
  for (const [a, b] of pairs) s = s.split(a).join(b);
  if (s !== orig) fs.writeFileSync(abs, s, "utf8");
}

console.log("import path rewrite done");
