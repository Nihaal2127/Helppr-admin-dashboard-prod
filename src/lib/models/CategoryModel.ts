export interface CategoryModel {
  _id: string;
  category_id: string;
  name: string;
  desc: string;
  services: number;
  helpers: number;
  state_ids?: string[];
  city_ids?: string[];
  service_ids?: string[];
  /** When API sends display names for list/hover (optional). */
  service_names?: string[];
  franchise_id?: string;
  franchise_name?: string;
  image_url: string;
  is_active: boolean;
  /** Present on `GET /category/getAll/:franchise_id` → `all_*`: assigned on/off for this franchise (vs global `is_active`). */
  franchise_active?: boolean;
  /** `GET /franchise-category/getAll` — global catalogue on/off. */
  global_active?: boolean;
  franchise_enabled?: boolean;
  partner_enabled?: boolean;
  effective_active?: boolean;
  is_request?: boolean;
  /** `pending` | `approved` | `rejected` (API may also send `approve` / `reject`). */
  approval_status?: string;
  is_rejected?: boolean | null;
  rejection_reason?: string;
  requested_by?: { id?: string; name?: string } | string;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}
