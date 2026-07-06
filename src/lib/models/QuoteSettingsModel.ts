export interface QuoteSettingsModel {
  _id: string;
  free_quotes_per_user: number;
  no_of_quotes: number;
  quotes_price: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
