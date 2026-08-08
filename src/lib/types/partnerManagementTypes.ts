export type PartnerSubscriptionModel = {
  _id?: string;
  partner_id: string;
  partner_name: string;
  /** Plan tier slug for display (e.g. `basic`). */
  subscription_plan: string;
  /** When using live APIs, selected subscription plan document id. */
  subscription_plan_id?: string;
  subscription_start_date: string;
  subscription_end_date: string;
  rating: string;
  location?: string;
  address?: string;
  /** Platinum banner storage path / URL (`banner_image_url` on update API). */
  banner_image?: string;
  /** Optional notes for `/partner-subscription/create|update`. */
  notes?: string;
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
  /** API values from `GET /api/partner-post/getAll`. */
  status: "published" | "hidden" | "removed" | "pending" | "rejected";
  rejection_reason?: string;
  images?: string[];
  videos?: string[];
};
