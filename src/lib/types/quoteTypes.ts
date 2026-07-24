export type QuoteTabKey = "new" | "pending" | "accepted" | "success" | "failed";

export type AddQuoteFormValues = {
  /** Super-admin / staff: franchise for `POST /quote/create`. */
  franchise_id?: string;
  /** Selected user id (dropdown value). */
  user_id: string;
  user_name: string;
  requested_services: string;
  requested_partner: string;
  employee_id: string;
  category_id: string;
  requested_date: string;
  /** End date when service schedule mode is `range`. */
  requested_date_to: string;
  requested_time: string;
  /** Start / end time when mode is `hourly`. */
  requested_time_from: string;
  requested_time_to: string;
  service_price: string;
  /** User notes; sent as `quote_description`. */
  user_description: string;
  /** Admin notes; sent as `admin_description`. */
  admin_description: string;
};

export type QuoteRow = {
  _id: string;
  quote_id: string;
  requested_services: string;
  requested_partner: string;
  partner_name?: string;
  employee_id?: string;
  employee_name?: string;
  employee_phone?: string;
  user_name: string;
  door_no: string;
  street: string;
  city: string;
  requested_date: string;
  requested_time: string;
  /** Raw schedule from API (`from_date` / `to_date` as YYYY-MM-DD). */
  from_date?: string;
  to_date?: string;
  work_start_time?: string;
  work_end_time?: string;
  work_hours_per_day?: number;
  total_work_hours?: number;
  /** Base service charge (scheduled service total). */
  total_service_charge?: number;
  service_price?: number;
  commission_percent?: number;
  commission_amount?: number;
  tax_percent?: number;
  tax_amount?: number;
  sub_total?: number;
  total_price?: number;
  minimum_deposit_percent?: number;
  minimum_deposit_amount?: number;
  cancellation_reason?: string;
  rejection_reason?: string;
  scheduled_date?: string;
  service_from_time?: string;
  service_to_time?: string;
  order_id?: string;
  services?: string;
  order_status?: string;
  payment_method?: string;
  payment_status?: string;
  payment_reference?: string;
  payment_date?: string;
  /**
   * UI quote status (example: "New", "Pending", "Accepted", "Success", "Failed")
   */
  status: string;
  /**
   * Enriched fields for New-tab quote view modal
   */
  user_id?: string;
  phone_number?: string;
  user_email?: string;
  user_city?: string;
  profile_url?: string | null;
  partner_profile_url?: string | null;
  employee_profile_url?: string | null;
  category_id?: string;
  category_name?: string;
  /** Resolved catalog service display name (parallel to `category_name`). */
  service_name?: string;
  area?: string;
  landmark?: string;
  state?: string;
  /** Raw `address_id.address` from GET /quote/get (composite line). */
  address_line?: string;
  pincode?: string;
  service_id?: string;
  partner_id?: string;
  partner_user_id?: string;
  partner_phone?: string;
  partner_city?: string;
  partner_email?: string;
  franchise_id?: string;
  franchise_name?: string;
  franchise_state_name?: string;
  franchise_city_name?: string;
  address_id?: string;
  employee_email?: string;
  /** User notes from API `quote_description`. */
  description?: string;
  /** Admin notes from API `admin_description`. */
  admin_description?: string;
};
