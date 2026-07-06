export interface DocumentModel {
  _id: string;
  partner_id: string | null;
  document_id: string | null;
  name: string | null;
  rejected_reasone: string | "";
  document_image: string | "";
  verification_status: number | 1;
  is_optional: boolean | true;
  is_active: boolean | true;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}
