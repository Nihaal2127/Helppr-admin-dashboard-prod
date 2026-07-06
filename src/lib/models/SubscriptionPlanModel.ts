export type SubscriptionPlanModel = {
  _id: string;
  plan_name: string;
  plan_description: string;
  price: string;
  duration: string;
  duration_type: string;
  priority?: string;
  is_active: boolean;
};
