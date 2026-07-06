import type { SubscriptionPlanModel } from "../lib/models/SubscriptionPlanModel";

/** Mock seed only — no imports from pages (keeps mock data free of UI modules). */
export const partnerSubscriptionPlansSeed: SubscriptionPlanModel[] = [
  {
    _id: "PLN001",
    plan_name: "basic",
    plan_description: "Basic subscription plan for starterrr users ",
    price: "499",
    duration: "30",
    duration_type: "days",
    is_active: true,
  },
  {
    _id: "PLN002",
    plan_name: "silver",
    plan_description: "Silver subscription plan for regular users",
    price: "999",
    duration: "3",
    duration_type: "months",
    is_active: true,
  },
  {
    _id: "PLN003",
    plan_name: "gold",
    plan_description: "Gold subscription plan with premium benefits",
    price: "1999",
    duration: "6",
    duration_type: "months",
    is_active: false,
  },
  {
    _id: "PLN004",
    plan_name: "platinum",
    plan_description: "Platinum subscription plan for enterprise users",
    price: "4999",
    duration: "12",
    duration_type: "months",
    is_active: true,
  },
];
