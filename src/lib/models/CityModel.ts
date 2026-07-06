export interface CityModel {
  _id: string;
  name: string;
  city_id: string;
  state_id: string;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  state_name: string;
}
