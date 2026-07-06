export interface TaxOtherChargesModel {
  _id: string;
  user_platform_fee: number;
  partner_platform_fee: number;
  partner_commision_fee: number;
  tax_for_customer: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
