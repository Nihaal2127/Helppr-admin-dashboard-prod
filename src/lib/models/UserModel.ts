import { BankAccountModel } from "./BankAccountModel";
import { DocumentModel } from "./DocumentModel";
import type { PartnerServiceApiRow } from "../partner/partnerCategoryServiceView";

export interface UserModel {
  _id: string;
  name: string | null;
  email: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  experience?: string | number | null;
  phone_number: string | null;
  address: string | null;
  landmark: string | null;
  state_id: string | null;
  city_id: string | null;
  area_id?: string | null;
  state_name: string | null;
  city_name: string | null;
  area_name?: string | null;
  pincode: string | null;
  profile_url: string | null;
  user_id: string | null;
  registration_id: string | null;
  is_from_web: boolean;
  is_active: boolean;
  is_blocked?: boolean;
  is_business: boolean;
  type: number;
  registration_type: string | null;
  device_token: string | null;
  platform_type: number;
  business_info_id: string | null;
  auth_token: string | null;
  created_by_id: string | null;
  last_signin: string | null;
  password: string | null;
  current_password: string | null;
  new_password: string | null;
  confirm_password: string | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  total_amount: number | 0;

  /** Partner payout / wallet list (when API sends them). */
  total_wallet_amount?: number | null;
  last_withdraw_amount?: number | null;
  last_withdraw_date?: string | null;
  /** Text label for wallet type / rules (API may use other keys — map in UI if needed). */
  wallet_definition?: string | null;

  no_of_services?: number | null;
  total_earnings?: number | null;
  bal_payment?: number | null;

  total_payment: number | 0;
  paid_amount: number | 0;
  balance_amount: string | null;
  received_payment: number | 0;
  in_progress_payment: number | 0;
  refund_payment: number | 0;
  payment_mode: string | null;
  last_paid_date: string | null;
  last_service_date: string | null;

  total_service: number | 0;
  service_paid: number | 0;
  service_unpaid: number | 0;
  in_progress_service: number | 0;
  completed_service: number | 0;
  cancelled_service: number | 0;
  my_services: string[] | [];

  bank_account: BankAccountModel | null;
  bank_accounts?: BankAccountModel[] | null;
  documents: DocumentModel[] | [];

  /** Partner catalog (when API returns them). */
  category_ids?: string[] | null;
  service_ids?: string[] | null;
  category_names?: string[] | null;
  service_names?: string[] | null;
  /** Parallel to `service_ids` when API returns partner-specific text/amounts. */
  service_descriptions?: string[] | null;
  service_prices?: (string | number)[] | null;
  /** Partner catalog rows from user-by-id (`category_id` / `service_id` may be populated objects). */
  partner_services?: PartnerServiceApiRow[] | null;

  /** Partner verification: `"pending"` | `"Approved"` | `"Rejected"` (API contract). */
  is_verified?: boolean | string | null;
  /** Set when super admin rejects partner verification (optional UI / API). */
  verification_rejection_reason?: string | null;

  /** Active/history rows from `GET /user/get` / list APIs. */
  partner_subscriptions?:
    | {
        _id?: string;
        partner_id?: string;
        subscription_plan_id?:
          | string
          | {
              _id?: string;
              plan_name?: string;
              price?: number;
              [key: string]: unknown;
            };
        started_at?: string;
        expires_at?: string;
        status?: string;
        [key: string]: unknown;
      }[]
    | null;

  /** Flat subscription fields when API denormalizes on the user row. */
  subscription_plan?: string | null;
  subscription_plan_id?: string | null;
  subscription_start_date?: string | null;
  subscription_end_date?: string | null;
  subscription_price?: number | null;
  partner_subscription_id?: string | null;

  /** Partner verification list (`/user/getVerificationAll`) when API returns these fields. */
  verification_id?: string | null;
  verification_status?: number;
  submitted_at?: string | null;
  verified_at?: string | null;
  document_uploaded_count?: number;

  /** Partner franchise (when API returns flat or populated `franchise_id`). */
  franchise_id?:
    | string
    | {
        _id?: string;
        name?: string;
        email?: string;
        franchise_name?: string;
      }
    | null;
  franchise_name?: string | null;
  franchise_email?: string | null;

  /** Additional saved addresses when the API returns them (e.g. after add from user view). */
  extra_addresses?:
    | {
        _id?: string | null;
        state_id?: string | null;
        city_id?: string | null;
        area_id?: string | null;
        state_name?: string | null;
        city_name?: string | null;
        area_name?: string | null;
        pincode?: string | null;
        address?: string | null;
        address_status?: boolean | string | null;
      }[]
    | null;
}
