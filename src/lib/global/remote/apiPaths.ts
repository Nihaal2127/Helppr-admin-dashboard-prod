export const ApiPaths = {
  LOGIN: () => `/auth/login`,
  FORGOT_PASSWORD: () => `/auth/forgotPassword`,
  LOGOUT: () => `/auth/logout`,
  SEND_OTP: () => `/otp/send-otp`,
  VERIFY_OTP: () => `/otp/verify-otp`,
  GET_COUNT: "/getCount",
  /** @deprecated Legacy dashboard — prefer `GET_DASHBOARD_STATS`. */
  GET_DASHBOARD_DATA: () => `/dashboard/getData`,
  /** Admin home dashboard KPIs (`from_date`, `to_date`, optional `franchise_id`). */
  GET_DASHBOARD_STATS: () => `/dashboard/stats`,
  EXPORT_ORDER_REPORT: `/export/order-report`,
  EXPORT_QUOTE_REPORT: `/export/quote-report`,
  EXPORT_PARTNER_REPORT: `/export/partner-report`,
  GET_USER_BY_ID: () => `/user/get`,
  CREATE_USER: "/user/create",
  GET_USER: () => `/user/getAll`,
  GET_VERIFICATION: () => `/user/getVerificationAll`,
  GET_USER_DROP_DOWN: () => `/user/getDropDown`,
  GET_PARTNER_DROP_DOWN: () => `/user/getPartnerDropDown`,
  UPDATE_USER: (id: string) => `/user/update/${id}`,
  /** Mobile address CRUD endpoint used for type-4 address deletion by address row id. */
  DELETE_MOBILE_USER_ADDRESS: (addressId: string) =>
    `/mobile/user/addresses/${addressId}`,
  DELETE_USER: (id: string) => `/user/delete/${id}`,
  EXPORT_USER: `/export/user`,
  EXPORT_PARTNER: `/export/partner`,
  EXPORT_VERIFICATION_USER: `/export/verification`,
  EXPORT_USER_ROLE: `/export/user_role`,
  EXPORT_USER_SERVICE: `/export/user_service`,
  CHANGE_PASSWORD: "/user/changePassword",
  DOCUMENT_UPLOAD: "/document_upload/files",
  UPDATE_DOCUMENT_UPLOAD: "/document_upload/update_files",
  GET_STATE: () => `/state/getAll`,
  GET_STATE_DROP_DOWN: () => `/state/getDropDown`,
  CREATE_STATE: "/state/create",
  UPDATE_STATE: (id: string) => `/state/update/${id}`,
  DELETE_STATE: (id: string) => `/state/delete/${id}`,
  EXPORT_STATE: `/export/state`,
  GET_CITY: () => `/city/getAll`,
  GET_CITY_DROP_DOWN: () => `/city/getDropDown`,
  CREATE_CITY: "/city/create",
  UPDATE_CITY: (id: string) => `/city/update/${id}`,
  DELETE_CITY: (id: string) => `/city/delete/${id}`,
  EXPORT_CITY: `/export/city`,
  
  GET_FRANCHISE_DROP_DOWN: () => "/franchise/getDropDown?full_list=true",
  GET_FRANCHISE_DROP_DOWN_ASSIGNED: () => "/franchise/getDropDown",
  /** Scoped catalogue + people for a franchise (quote / order flows). */
  GET_FRANCHISE_RELATED_CATALOG: (franchiseId: string) =>
    `/franchise/related-catalog/${franchiseId}`,
  GET_FRANCHISE: () => "/franchise/getAll",
  GET_FRANCHISE_BY_ID: (id: string) => `/franchise/get/${id}`,
  CREATE_FRANCHISE: "/franchise/create",
  UPDATE_FRANCHISE: (id: string) => `/franchise/update/${id}`,
  DELETE_FRANCHISE: (id: string) => `/franchise/delete/${id}`,
  EXPORT_FRANCHISE: `/export/franchise`,
  /** Franchise ↔ catalogue mapping (see API-Service-Category-Franchise-Requests.txt). */
  GET_FRANCHISE_SERVICE_ALL: () => `/franchise-service/getAll`,
  UPDATE_FRANCHISE_SERVICE: (id: string) =>
    `/franchise-service/update/${id}`,
  GET_FRANCHISE_CATEGORY_ALL: () => `/franchise-category/getAll`,
  UPDATE_FRANCHISE_CATEGORY: (id: string) =>
    `/franchise-category/update/${id}`,
  /** List — GET with query: page, limit, sort, name, city_id, state_id, is_active, pincode */
  GET_AREA: () => `/area/getAll`,
  GET_AREA_BY_ID: (id: string) => `/area/get/${id}`,
  CREATE_AREA: `/area/create`,
  UPDATE_AREA: (id: string) => `/area/update/${id}`,
  DELETE_AREA: (id: string) => `/area/delete/${id}`,
  /** Optional query: city_id, state_id (comma-separated) */
  GET_AREA_DROP_DOWN: () => `/area/getDropDown`,
  /** POST — same pattern as `EXPORT_STATE` / `EXPORT_CITY` */
  EXPORT_AREA: `/export/area`,
  GET_CATEGORY: () => `/category/getAll`,
  /** Legacy path-style scoped list; prefer `GET_FRANCHISE_CATEGORY_ALL` + `?franchise_id=`. */
  GET_CATEGORY_FOR_FRANCHISE: (franchiseId: string) =>
    `/category/getAll/${franchiseId}`,
  GET_CATEGORY_BY_ID: (id: string) => `/category/get/${id}`,
  GET_CATEGORY_DROP_DOWN: () => `/category/getDropDown`,
  CREATE_CATEGORY: "/category/create",
  CREATE_CATEGORY_REQUEST: "/category/create-request",
  UPDATE_CATEGORY: (id: string) => `/category/update/${id}`,
  UPDATE_CATEGORY_REQUEST: (id: string) => `/category/update-request/${id}`,
  DELETE_CATEGORY: (id: string) => `/category/delete/${id}`,
  EXPORT_CATEGORY: `/export/category`,
  GET_SERVICE: () => `/service/getAll`,
  /** Legacy path-style scoped list; prefer `GET_FRANCHISE_SERVICE_ALL` + `?franchise_id=`. */
  GET_SERVICE_FOR_FRANCHISE: (franchiseId: string) =>
    `/service/getAll/${franchiseId}`,
  GET_SERVICE_BY_ID: (id: string) => `/service/get/${id}`,
  GET_SERVICE_DROP_DOWN: () => `/service/getDropDown`,
  CREATE_SERVICE: "/service/create",
  CREATE_SERVICE_REQUEST: "/service/create-request",
  UPDATE_SERVICE: (id: string) => `/service/update/${id}`,
  UPDATE_SERVICE_REQUEST: (id: string) => `/service/update-request/${id}`,
  DELETE_SERVICE: (id: string) => `/service/delete/${id}`,
  EXPORT_SERVICE: `/export/service`,
  CREATE_BANK_ACCOUNT: "/bank_account/create",
  UPDATE_BANK_ACCOUNT: (id: string) => `/bank_account/update/${id}`,
  UPDATE_PARTNER_DOCUMENT: (id: string) =>
    `/partner_document/updateDocument/${id}`,
  DELETE_PARTNER_DOCUMENT: (id: string) => `/partner_document/delete/${id}`,
  UPDATE_STATUS_PARTNER_DOCUMENT: (id: string) =>
    `/partner_document/updateStatus/${id}`,
  CREATE_ORDER: "/order/create",
  GET_ORDER: () => `/order/getAll`,
  GET_ORDER_BY_ID: () => `/order/get`,
  GET_CUSTOMER_ORDERS: "/order/getCustomerOrder",
  UPDATE_ORDER: (id: string) => `/order/update/${id}`,
  DELETE_ORDER: (id: string) => `/order/delete/${id}`,
  CANCLE_ORDER: (id: string) => `/order/cancle/${id}`,
  EXPORT_ORDER: `/export/orders`,
  ORDER_CANCLE_SERVICE: (id: string) => `/order/cancleService/${id}`,
  ORDER_UPDATE_SERVICE: (id: string) => `/order/serviceUpdate/${id}`,
  GET_COMISSION_ORDER: () => `/order/getComissionOrder`,
  PAY_COMISSION: "/order_service/payComission",
  /** Manual wallet payout (amount, payment method, description). Align path with backend. */
  /** Partner payout — wallet list (Postman §37). */
  PARTNER_PAYOUT_GET_ALL: () => `/partner_payout/getAll`,
  /** Dropdown for “Add payout” modal. */
  PARTNER_PAYOUT_PARTNERS: () => `/partner_payout/partners`,
  /** Ledger credits/debits for one partner (`?id=` Mongo partner `_id`). */
  PARTNER_PAYOUT_SHOW: () => `/partner_payout/show`,
  PARTNER_PAYOUT_CREATE: "/partner_payout/create",
  /** Financial — Order refunds (Postman §38 — `/api/refund/*`). */
  REFUND_GET_ALL: () => `/refund/getAll`,
  REFUND_ELIGIBLE_ORDERS: () => `/refund/eligible-orders`,
  REFUND_GET_BY_ID: (id: string) => `/refund/getById/${id}`,
  REFUND_CREATE: "/refund/create",
  /** Record offline refund split (admin commission vs partner wallet). Align with backend. */
  /** @deprecated Legacy order refund — use `REFUND_CREATE`. */
  ORDER_REFUND: "/order/refund",
  GET_TAX_OTHER_CHARGES_BY_ID: () => `/tax/get`,
  CREATE_TAX_OTHER_CHARGES: "/tax/create",
  UPDATE_TAX_OTHER_CHARGES: (id: string) => `/tax/update/${id}`,
  /** Financial — Order Payments grid (Postman §23A — one row per order). */
  ORDER_FINANCIAL_PAYMENTS_GET_ALL: () => `/order/financial-payments/getAll`,
  ORDER_FINANCIAL_PAYMENTS_GET_BY_ID: (id: string) =>
    `/order/financial-payments/get/${id}`,
  /** Legacy line-item list (Partner Payments page, payout pending lines). */
  GET_ORDER_SERVICE_ALL: () => `/order_service/getAll`,
  EXPORT_ORDER_PAYMENTS: `/export/orders_payments`,
  EXPORT_PARTNER_PAYMENTS: `/export/partner_payments`,
  GET_TICKET: () => `/ticket/getAll`,
  GET_TICKET_BY_ID: () => `/ticket/get`,
  CREATE_TICKET: "/ticket/create",
  UPDATE_TICKET_STATUS: (id: string) => `/ticket/updateTicketStatus/${id}`,
  DELETE_TICKET: (id: string) => `/ticket/delete/${id}`,
  EXPORT_TICKET: `/export/tickets`,
  GET_DISPUTES: () => `/dispute/getAll`,
  GET_DISPUTE_BY_ID: (id: string) => `/dispute/get/${id}`,
  UPDATE_DISPUTE: (id: string) => `/dispute/update/${id}`,
  GET_USER_HOME_COUNTS_BY_ID: () => `/user_home_counts/get`,
  CREATE_USER_HOME_COUNTS: "/user_home_counts/create",
  UPDATE_USER_HOME_COUNTS: (id: string) => `/user_home_counts/update/${id}`,
  /** Settings — global quote config (Postman §33b — create once, then update). */
  GET_QUOTE_SETTINGS: () => `/quote_settings/get`,
  CREATE_QUOTE_SETTINGS: "/quote_settings/create",
  UPDATE_QUOTE_SETTINGS: (id: string) => `/quote_settings/update/${id}`,
  // Expenses management
  GET_EXPENSES: () => `/expense-management/getAll`,
  GET_EXPENSE_BY_ID: (id: string) => `/expense-management/get/${id}`,
  CREATE_EXPENSE: `/expense-management/create`,
  UPDATE_EXPENSE: (id: string) => `/expense-management/update/${id}`,
  DELETE_EXPENSE: (id: string) => `/expense-management/delete/${id}`,
  EXPORT_EXPENSES: `/export/expenses`,
  // Expense category management
  GET_EXPENSE_CATEGORY: () => `/expense-category-management/getAll`,
  GET_EXPENSE_CATEGORY_BY_ID: (id: string) =>
    `/expense-category-management/get/${id}`,
  CREATE_EXPENSE_CATEGORY: `/expense-category-management/create`,
  UPDATE_EXPENSE_CATEGORY: (id: string) =>
    `/expense-category-management/update/${id}`,
  DELETE_EXPENSE_CATEGORY: (id: string) =>
    `/expense-category-management/delete/${id}`,
  // Quotes — see Help-PR-Area-Franchise-Subscription Postman folder "Quote"
  GET_QUOTES: () => `/quote/getAll`,
  GET_QUOTE_BY_ID: (id: string) => `/quote/get/${id}`,
  GET_QUOTE_CUSTOMER_QUOTES: () => `/quote/getCustomerQuotes`,
  CREATE_QUOTE: () => `/quote/create`,
  UPDATE_QUOTE: (id: string) => `/quote/update/${id}`,
  DELETE_QUOTE: (id: string) => `/quote/delete/${id}`,
  GET_QUOTE_COUNTS: () => `/quote/getCounts`,
  /** Offers / coupons (Settings → Coupon management). */
  GET_OFFER_GET_ALL: () => `/offer/getAll`,
  GET_OFFER_BY_ID: (id: string) => `/offer/get/${id}`,
  CREATE_OFFER: `/offer/create`,
  UPDATE_OFFER: (id: string) => `/offer/update/${id}`,
  DELETE_OFFER: (id: string) => `/offer/delete/${id}`,
  // Partner management
  /** Global subscription tier catalog (Postman: `/subscription-plan/*`). */
  SUBSCRIPTION_PLAN_GET_ALL: () => `/subscription-plan/getAll`,
  SUBSCRIPTION_PLAN_GET: (id: string) => `/subscription-plan/get/${id}`,
  SUBSCRIPTION_PLAN_CREATE: `/subscription-plan/create`,
  SUBSCRIPTION_PLAN_UPDATE: (id: string) => `/subscription-plan/update/${id}`,
  SUBSCRIPTION_PLAN_DELETE: (id: string) => `/subscription-plan/delete/${id}`,
  SUBSCRIPTION_PLAN_GET_DROP_DOWN: () => `/subscription-plan/getDropDown`,
  GET_PARTNER_SUBSCRIPTION_PLANS: () => `/partner/subscription/plans`,
  CREATE_PARTNER_SUBSCRIPTION_PLAN: `/partner/subscription/plans/create`,
  UPDATE_PARTNER_SUBSCRIPTION_PLAN: (id: string) =>
    `/partner/subscription/plans/update/${id}`,
  VOID_PARTNER_SUBSCRIPTION_PLAN: (id: string) =>
    `/partner/subscription/plans/void/${id}`,
  /**
   * Partner subscription **assignments** (Postman folder: partner-subscription), e.g.
   * `PUT …/api/partner-subscription/update/:partner_subscription_id`.
   * Not the same as `SUBSCRIPTION_PLAN_*` above (global plan catalog).
   */
  PARTNER_SUBSCRIPTION_GET_ALL: () => `/partner-subscription/getAll`,
  PARTNER_SUBSCRIPTION_GET: (id: string) => `/partner-subscription/get/${id}`,
  PARTNER_SUBSCRIPTION_CREATE: `/partner-subscription/create`,
  PARTNER_SUBSCRIPTION_UPDATE: (id: string) =>
    `/partner-subscription/update/${id}`,
  PARTNER_SUBSCRIPTION_DELETE: (id: string) =>
    `/partner-subscription/delete/${id}`,
  GET_PARTNER_SUBSCRIPTIONS: () => `/partner/subscriptions`,
  CREATE_PARTNER_SUBSCRIPTION: `/partner/subscriptions/create`,
  UPDATE_PARTNER_SUBSCRIPTION: (id: string) =>
    `/partner/subscriptions/update/${id}`,
  VOID_PARTNER_SUBSCRIPTION: (id: string) =>
    `/partner/subscriptions/void/${id}`,
  /** Postman folder 42 — Partners browse (Portfolio Management list) */
  PARTNERS_BROWSE_LIST: () => `/partners`,
  PARTNERS_BROWSE_PROFILE: (partnerId: string) => `/partners/${partnerId}`,
  GET_PARTNER_POSTS: () => `/partner/posts`,
  /** Admin moderation — Postman folder 43 — Partner post management */
  PARTNER_POST_GET_COUNTS: () => `/partner-post/getCounts`,
  PARTNER_POST_GET_ALL: () => `/partner-post/getAll`,
  PARTNER_POST_MODERATE: (postId: string) =>
    `/partner-post/moderate/${postId}`,
  // Content management
  CONTENT_MANAGEMENT_GET_ALL: () => `/content-management/getAll`,
  CONTENT_MANAGEMENT_GET: (id: string) => `/content-management/get/${id}`,
  CONTENT_MANAGEMENT_CREATE: `/content-management/create`,
  CONTENT_MANAGEMENT_UPDATE: (id: string) => `/content-management/update/${id}`,
  CONTENT_MANAGEMENT_DELETE: (id: string) => `/content-management/delete/${id}`,
  /** Calendar — appointments linked to orders (Postman § appointment). */
  APPOINTMENT_GET_ALL: () => `/appointment/getAll`,
  APPOINTMENT_GET_BY_ID: (id: string) => `/appointment/get/${id}`,
  APPOINTMENT_GET_BY_ORDER: (orderId: string) =>
    `/appointment/getByOrder/${orderId}`,
  APPOINTMENT_CREATE: `/appointment/create`,
  APPOINTMENT_UPDATE: (id: string) => `/appointment/update/${id}`,
  APPOINTMENT_DELETE: (id: string) => `/appointment/delete/${id}`,
  /** Web inbox — Postman §30 Notifications */
  GET_NOTIFICATIONS: () => `/notifications`,
  GET_NOTIFICATIONS_UNREAD_COUNT: () => `/notifications/unread-count`,
  PUT_NOTIFICATION_READ: (id: string) => `/notifications/${id}/read`,
  PUT_NOTIFICATIONS_READ_ALL: () => `/notifications/read-all`,
};
