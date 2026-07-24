# `src/pages` layout

- **Feature folders** (`auth`, `dashboard`, `orderManagement`, …): one product area each. Prefer **`index.tsx`** as the default route screen for that folder.
- **`public/`**: Standalone screens (errors, legal / info pages). Lazy-loaded from **`../pages/public/...`** in `routes/Routes.tsx` (path relative to `routes/`).
- **Co-located UI**: Dialogs and screens live under the feature folder (e.g. `pages/dashboard/index.tsx`).
- **Layered `.ts`**: All TypeScript modules live under **`src/lib/`**. Use **`lib/global/`** for cross-cutting code (remote, constants, shared helpers, layout menu data, route guards, hooks, shared types). Use **`lib/<feature>/`** (e.g. `lib/dashboard/`, `lib/order/`, `lib/quote/`) for code that belongs to one product area—see `src/lib/README.md`.
- **`src/pages` is `.tsx` only**: Route screens and dialogs live here. Put supporting `.ts` in **`src/quote/`** (quote UI logic) or **`src/helper/<module>/`** as appropriate—see `quote/`, `helper/reports/`, `helper/ticketManagement/`.
- **Imports**: Use normal relative paths (`../../components`, `../services`, …) or co-located `./` imports. Shared dialogs live under **`src/components/`** (`user/`, `order/`, `partner/`, …)—avoid importing another feature’s `pages/` tree from a different feature when possible.
