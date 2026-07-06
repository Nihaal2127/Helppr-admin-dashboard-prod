export interface CountModel {
  total_state: number | 0;
  active_state: number | 0;
  inactive_state: number | 0;

  total_city: number | 0;
  active_city: number | 0;
  inactive_city: number | 0;

  total_area: number;
  active_area: number;
  inactive_area: number;

  total_category: number | 0;
  active_category: number | 0;
  inactive_category: number | 0;
  requested_category?: number | 0;

  total_service: number | 0;
  active_service: number | 0;
  inactive_service: number | 0;
  requested_service?: number | 0;

  total_user: number | 0;
  active_user: number | 0;
  inactive_user: number | 0;
  blocked_user: number | 0;

  total_employee: number | 0;
  active_employee: number | 0;
  inactive_employee: number | 0;

  total_partner: number | 0;
  active_partner: number | 0;
  inactive_partner: number | 0;

  blocked_partner: number | 0;
  total_document: number | 0;
  pending_document: number | 0;
  verified_document: number | 0;
  reject_document: number | 0;

  received_amount: number | 0;
  pending_amount: number | 0;

  completed_amount: number | 0;
  returned_amount: number | 0;

  total_franchise: number | 0;
  active_franchise: number | 0;
  inactive_franchise: number | 0;

  total_requestedcategory: number | 0;
  active_requestedcategory: number | 0;
  inactive_requestedcategory: number | 0;

  total_requestedservice: number | 0;
  active_requestedservice: number | 0;
  inactive_requestedservice: number | 0;

  /** POST /getCount with type partner-management (Postman Partner Management folder). */
  total_plans?: number;
  active_plans?: number;
  inactive_plans?: number;
  total_partner_subscriptions?: number;
  active_partner_subscriptions?: number;
  inactive_partner_subscriptions?: number;

  /** Present when `POST /getCount` body includes `{ "type": "quote-management" }` (field names vary by backend). */
  quote_new?: number;
  quote_pending?: number;
  quote_accepted?: number;
  quote_success?: number;
  quote_failed?: number;
  total_quotes?: number;

  /** Present when `POST /getCount` body includes `{ "type": "order-management" }` (field names vary by backend). */
  order_in_progress?: number;
  order_completed?: number;
  order_cancelled?: number;
  order_refunded?: number;

  /** `POST /getCount` `{ "type": "financial-order-payments" }` */
  total_completed_orders?: number;
  total_in_progress_orders?: number;
  total_partner_pending_amount?: number;
  total_user_pending_amount?: number;

  /**
   * `POST /getCount` `{ "type": "partner-post-management" }` (type 16).
   * Post buckets: `published`, `hidden`, `removed`.
   * Report buckets: `pending`, `reviewed`, `dismissed` (separate from post status).
   */
  published?: number;
  hidden?: number;
  removed?: number;
  reviewed?: number;
  dismissed?: number;
}
