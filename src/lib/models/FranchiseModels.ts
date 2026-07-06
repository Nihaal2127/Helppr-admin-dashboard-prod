export interface FranchiseModel {
  _id?: string;
  name: string;
  email?: string;
  phone_number?: string;
  state_id: string;
  state_name?: string;
  city_id: string;
  city_name?: string;
  area_id: string;
  area_name?: string;
  admin_id: string;
  admin_name?: string;
  is_active: boolean;
  /** Explicit category picks (multi-select). */
  category_ids?: string[];
  /** API may return this key instead of `category_ids`. */
  categories?: string[];
  category_names?: string[];
  /** Service picks; may include all services from selected categories. */
  service_ids?: string[];
  /** API may return this key instead of `service_ids`. */
  services?: string[];
  service_names?: string[];
  /**
   * Populated from `GET /franchise/get/:id` when the API returns mapping rows
   * (`categories_list`, `franchise_categories`, etc.) with `{ category_id, is_active }`.
   */
  franchise_category_active?: Record<string, boolean>;
  /**
   * Same for services (`services_list`, `franchise_services`, … `{ service_id, is_active }`).
   */
  franchise_service_active?: Record<string, boolean>;
}
