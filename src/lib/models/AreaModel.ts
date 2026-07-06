export interface AreaModel {
  _id: string;
  name: string | null;
  city_id: string | null;
  city_name?: string | null;
  state_id?: string | null;
  state_name?: string | null;
  is_active: boolean;
  pincodes?: string[] | null;
  pincode?: string | null;
  pin_codes?: string[] | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}
