export interface TicketTransferHistoryEntry {
  employeeName: string;
  date: string;
  note?: string;
}

export interface TicketModel {
  _id: string;
  unique_id: string;
  created_by_id: string;
  resolve_by_id: string | null;
  user_unique_id: string | null;
  employee_unique_id: string | null;
  status: number | null;
  resolve_status: number | null;
  created_by_name: string | null;
  email: string | null;
  phone_number: string | null;
  query: string | null;
  contact_type: number | null;
  resolved_by_name: string | null;
  close_date: string | null;
  description: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  transferHistory?: TicketTransferHistoryEntry[];
  currentEmployeeName?: string;
}
