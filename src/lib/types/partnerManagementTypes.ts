export type PartnerSubscriptionModel = {
  _id?: string;
  partner_id: string;
  partner_name: string;
  /** Plan tier slug for display / mock (e.g. `basic`). */
  subscription_plan: string;
  /** When using live APIs, selected subscription plan document id. */
  subscription_plan_id?: string;
  subscription_start_date: string;
  subscription_end_date: string;
  rating: string;
  location?: string;
  address?: string;
  /** Shown for platinum plans (banner / hero image URL or data URL from upload). */
  banner_image?: string;
  /** Optional notes for `/partner-subscription/create|update`. */
  notes?: string;
  /** Mock-only: force “remaining days” cell to show this value in red (design demo). */
  remaining_days_demo?: number;
  is_active: boolean;
};

export type PostModel = {
  /** Mongo `_id` from `GET /api/partner-post/getAll`. */
  _id?: string;
  id?: number;
  partner_id: string;
  partner_name: string;
  description: string;
  media_type: "image" | "video";
  no_of_images?: number;
  no_of_videos?: number;
  location: string;
  uploaded_date: string;
  /** API values from `GET /api/partner-post/getAll` — `published` | `hidden` | `removed`. */
  status: "published" | "hidden" | "removed";
  images?: string[];
  videos?: string[];
};
