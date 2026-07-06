export interface UserHomeCountsModel {
  _id: string;
  total_distance_travelled: number;
  served: number;
  consulted: number;
  captured: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
