# `src/lib` — TypeScript only

## `lib/global/`

Cross-cutting code only (no `constant/` or `helper/` subfolders anymore):

- **Root `.ts`**: `AppConstant`, `paymentAndCurrency` (`roundMoney`, `formatMoney2`, `formatCurrency`, payment methods), `RoleEnum`, `ResolveStatusEnum`, `VerificationStatusEnum`, `alertHelper`, `DialogManager`, `localStorageHelper`, `authSessionHelper`, `useViewPort`, `serverTableSort`, `getCountRouteType`
- **`global/remote/`** — `apiHelper`, `apiPaths`

## Shared `lib/` folders (not under `global/`)

- **`lib/layout/`** — `menuItems`, screen slugs, franchise employee permissions
- **`lib/routes/`** — `roleAccess`
- **`global/hooks/`** — shared hooks (e.g. `useFranchiseScopedGetCount`)
- **`lib/types/`** — shared / ambient types

`src/helper/utility.tsx` stays outside `lib/` (React helpers).

## Feature folders

| Folder | Contents (examples) |
|--------|---------------------|
| **`lib/dashboard/`** | `dashboardModel`, `dashboardService` |
| **`lib/order/orders.ts`** | Types, API (`fetchOrder`, `createOrUpdateOrder`, …), helpers, invoice PDF |
| **`lib/quote/quoteHelpers.ts`** | Quote UI logic, mappers, hooks, pricing |
| **`lib/quote/quoteAddressCore.ts`** | Pure address helpers (used by quoteService + quoteHelpers) |
| **`lib/franchise/`** | `headerFranchisePreference`, `franchiseCatalog` |
| **`lib/user/`** | `pincodeValidation`, `userFormValidation`, `userAddressPreview`, `ServiceStatusEnum` |
| **`lib/partner/`** | `partnerVerification`, `partnerCategoryServiceView` |
| **`lib/ticket/`** | `ticketDisputeHelpers` |
| **`lib/reports/`** | `reportFilterShared` |
| **`lib/expenses/`** | `expensesExport` |
| **`lib/service/`** | `serviceMinDepositDisplay` (shared by quote + service management) |

API services (`userService`, `franchiseService`, …) currently live under **`src/services/`** (import as `../../lib/services/...` only after they are moved under `lib/services/`).

## Imports

Use explicit paths, e.g. `../../lib/global/AppConstant`, `../../lib/layout/menuItems`, `../../lib/types/quoteTypes`, `../../lib/order/orders`, `../../lib/franchise/headerFranchisePreference`.
