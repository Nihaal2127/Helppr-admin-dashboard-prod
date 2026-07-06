export interface BankAccountModel {
  _id: string;
  partner_id: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  branch_name: string;
  is_primary: boolean | true;
  is_active?: boolean;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}
