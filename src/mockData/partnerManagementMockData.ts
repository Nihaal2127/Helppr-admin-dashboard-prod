import type {
  PartnerSubscriptionModel,
  PostModel,
} from "../lib/types/partnerManagementTypes";

type PortfolioSeedRow = {
  _id: string;
  partner_id: string;
  partner_name: string;
  franchise_name?: string;
  category: string;
  service: string;
  total_posts: string;
  total_images: string;
  total_videos: string;
  likes_count: string;
  comments_count: string;
  saves_count: string;
  ratings: string;
  location: string;
  is_active: boolean;
};

export { partnerSubscriptionPlansSeed } from "./partnerSubscriptionPlansSeedData";

export const partnerSubscriptionsSeed: PartnerSubscriptionModel[] = [
  {
    _id: "1",
    partner_id: "P001",
    partner_name: "Rahul1",
    subscription_plan: "basic",
    subscription_plan_id: "basic",
    subscription_start_date: "2026-03-01",
    subscription_end_date: "2026-03-31",
    rating: "4.2",
    address:
      "Flat 402, Sri Sai Residency, Road No. 10, Banjara Hills, Hyderabad, Telangana 500034, India",
    is_active: false,
  },
  {
    _id: "2",
    partner_id: "P002",
    partner_name: "Kiran",
    subscription_plan: "silver",
    subscription_start_date: "2026-03-05",
    subscription_end_date: "2026-06-05",
    rating: "4.6",
    address:
      "Door No. 29-14-55, Prakasam Road, Suryaraopeta, Vijayawada, Andhra Pradesh 520002, India",
    is_active: true,
  },
  {
    _id: "3",
    partner_id: "P003",
    partner_name: "Suresh",
    subscription_plan: "gold",
    subscription_plan_id: "gold",
    subscription_start_date: "2026-02-01",
    subscription_end_date: "2026-08-01",
    rating: "4.0",
    address:
      "Plot 18, Sector 5, MVP Colony, Near MVP Double Road, Visakhapatnam, Andhra Pradesh 530017, India",
    is_active: false,
  },
  {
    _id: "4",
    partner_id: "P004",
    partner_name: "Teja",
    subscription_plan: "platinum",
    subscription_plan_id: "platinum",
    subscription_start_date: "2026-01-01",
    subscription_end_date: "2027-01-01",
    rating: "4.9",
    address:
      "H.No. 2-3-111, Hanamkonda Main Road, Balasamudram, Warangal, Telangana 506001, India",
    banner_image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80",
    is_active: true,
  },
  /** Design demo row: “7 days” in red in Remaining Days column (mock only). */
  {
    _id: "demo-rem-7",
    partner_id: "P099",
    partner_name: "Kishore",
    subscription_plan: "silver",
    subscription_plan_id: "silver",
    subscription_start_date: "2026-04-01",
    subscription_end_date: "2026-04-29",
    rating: "4.5",
    is_active: true,
    remaining_days_demo: 7,
  },
];

export const partnerPortfoliosSeed: PortfolioSeedRow[] = [
  {
    _id: "1",
    partner_id: "PT001",
    partner_name: "Teja Partner",
    franchise_name: "Hyderabad Franchise",
    category: "Photography",
    service: "Wedding Shoot",
    total_posts: "24",
    total_images: "180",
    total_videos: "15",
    likes_count: "1200",
    comments_count: "245",
    saves_count: "310",
    ratings: "4.8",
    location: "Hyderabad",
    is_active: true,
  },
  {
    _id: "2",
    partner_id: "PT002",
    partner_name: "Rock Studio",
    category: "Beauty",
    service: "Makeup Service",
    total_posts: "18",
    total_images: "95",
    total_videos: "10",
    likes_count: "840",
    comments_count: "120",
    saves_count: "190",
    ratings: "4.5",
    location: "Vijayawada",
    is_active: true,
  },
  {
    _id: "3",
    partner_id: "PT003",
    partner_name: "Alpha Events",
    category: "Events",
    service: "Decoration",
    total_posts: "30",
    total_images: "220",
    total_videos: "20",
    likes_count: "1600",
    comments_count: "340",
    saves_count: "420",
    ratings: "4.9",
    location: "Visakhapatnam",
    is_active: true,
  },
  {
    _id: "4",
    partner_id: "PT004",
    partner_name: "Prime Services",
    category: "Food",
    service: "Catering",
    total_posts: "12",
    total_images: "60",
    total_videos: "6",
    likes_count: "530",
    comments_count: "80",
    saves_count: "110",
    ratings: "4.3",
    location: "Warangal",
    is_active: false,
  },
];

export const partnerPostsSeed: PostModel[] = [
  {
    id: 1,
    partner_id: "P001",
    partner_name: "Rahul",
    description: "Wedding shoot and outdoor photography session.",
    media_type: "image",
    location: "Hyderabad",
    uploaded_date: "2026-03-20",
    status: "hidden",
  },
  {
    id: 2,
    partner_id: "P002",
    partner_name: "Kiran",
    description: "Food reel with cinematic highlights.",
    media_type: "video",
    location: "Bangalore",
    uploaded_date: "2026-03-19",
    status: "published",
  },
  {
    id: 3,
    partner_id: "P003",
    partner_name: "Teja",
    description: "Product ad campaign image set.",
    media_type: "image",
    location: "Chennai",
    uploaded_date: "2026-03-18",
    status: "removed",
  },
  {
    id: 4,
    partner_id: "P004",
    partner_name: "Arjun",
    description: "Pre wedding teaser video shoot.",
    media_type: "video",
    location: "Hyderabad",
    uploaded_date: "2026-03-17",
    status: "hidden",
  },
];
