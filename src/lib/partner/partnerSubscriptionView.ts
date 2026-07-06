import { UserModel } from "../models/UserModel";
import { AppConstant } from "../global/AppConstant";
import { capitalizeString } from "../../helper/utility";

export type PartnerSubscriptionApiRow = Record<string, unknown>;

export type PartnerSubscriptionDisplay = {
  subscriptionId: string;
  planId: string;
  planSlug: string;
  planLabel: string;
  price: number | null;
  startDate: string;
  endDate: string;
  status: string;
};

function toYmd(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function planSlugFromName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

function parsePlanRef(raw: unknown): {
  planId: string;
  planName: string;
  price: number | null;
} {
  if (typeof raw === "string") {
    const id = raw.trim();
    return { planId: id, planName: id, price: null };
  }
  if (raw && typeof raw === "object") {
    const p = raw as Record<string, unknown>;
    const priceRaw = p.price;
    const priceNum =
      typeof priceRaw === "number"
        ? priceRaw
        : priceRaw != null && String(priceRaw).trim() !== ""
        ? Number(priceRaw)
        : NaN;
    return {
      planId: String(p._id ?? p.id ?? "").trim(),
      planName: String(p.plan_name ?? "").trim(),
      price: Number.isFinite(priceNum) ? priceNum : null,
    };
  }
  return { planId: "", planName: "", price: null };
}

function pickPrimarySubscription(
  rows: PartnerSubscriptionApiRow[]
): PartnerSubscriptionApiRow | null {
  if (!rows.length) return null;
  const active = rows.filter(
    (r) => String(r.status ?? "").toLowerCase() === "active"
  );
  const pool = active.length ? active : rows;
  return (
    [...pool].sort((a, b) => {
      const ta =
        Date.parse(String(a.started_at ?? a.created_at ?? "")) || 0;
      const tb =
        Date.parse(String(b.started_at ?? b.created_at ?? "")) || 0;
      return tb - ta;
    })[0] ?? null
  );
}

function displayFromRaw(
  raw: PartnerSubscriptionApiRow | null
): PartnerSubscriptionDisplay | null {
  if (!raw) return null;

  const subscriptionId = String(raw._id ?? raw.id ?? "").trim();
  const planFromIdField = parsePlanRef(raw.subscription_plan_id);
  const planFromRef = parsePlanRef(raw.subscription_plan);
  const planId = planFromIdField.planId || planFromRef.planId;
  const planName =
    planFromIdField.planName ||
    planFromRef.planName ||
    String(raw.subscription_plan ?? "").trim();
  const price =
    planFromIdField.price ?? planFromRef.price ?? null;

  const startDate = toYmd(
    raw.started_at ?? raw.subscription_start_date ?? raw.start_date
  );
  const endDate = toYmd(
    raw.expires_at ?? raw.subscription_end_date ?? raw.end_date
  );

  const planLabel = planName
    ? capitalizeString(planName.replace(/_/g, " "))
    : planId
    ? planId
    : "—";

  return {
    subscriptionId,
    planId,
    planSlug: planSlugFromName(planName || planId),
    planLabel,
    price,
    startDate,
    endDate,
    status: String(raw.status ?? "").trim(),
  };
}

/** Resolves the partner's primary subscription for list cells and detail views. */
export function partnerSubscriptionDisplayFromUser(
  user: UserModel | Record<string, unknown> | null | undefined
): PartnerSubscriptionDisplay | null {
  if (!user) return null;
  const record = user as Record<string, unknown>;
  const list = record.partner_subscriptions;
  if (Array.isArray(list) && list.length > 0) {
    const picked = pickPrimarySubscription(list as PartnerSubscriptionApiRow[]);
    const fromList = displayFromRaw(picked);
    if (fromList) return fromList;
  }

  const flatPlanId = String(record.subscription_plan_id ?? "").trim();
  const flatPlanName = String(record.subscription_plan ?? "").trim();
  const flatStart = toYmd(
    record.subscription_start_date ?? record.started_at
  );
  const flatEnd = toYmd(record.subscription_end_date ?? record.expires_at);
  if (!flatPlanId && !flatPlanName && !flatStart && !flatEnd) return null;

  const planLabel = flatPlanName
    ? capitalizeString(flatPlanName.replace(/_/g, " "))
    : flatPlanId;

  return {
    subscriptionId: String(record.partner_subscription_id ?? "").trim(),
    planId: flatPlanId,
    planSlug: planSlugFromName(flatPlanName || flatPlanId),
    planLabel,
    price:
      typeof record.subscription_price === "number"
        ? record.subscription_price
        : null,
    startDate: flatStart,
    endDate: flatEnd,
    status: String(record.subscription_status ?? "").trim(),
  };
}

export function partnerSubscriptionPriceLabel(
  sub: PartnerSubscriptionDisplay | null | undefined
): string {
  if (!sub || sub.price == null || !Number.isFinite(sub.price)) return "—";
  return `${AppConstant.currencySymbol}${sub.price}`;
}

export function partnerSubscriptionFormValuesFromUser(
  user: UserModel | null | undefined
): {
  partner_subscription_id: string;
  subscription_plan_id: string;
  subscription_plan: string;
  subscription_start_date: string;
  subscription_end_date: string;
} {
  const sub = partnerSubscriptionDisplayFromUser(user);
  if (!sub) {
    return {
      partner_subscription_id: "",
      subscription_plan_id: "",
      subscription_plan: "",
      subscription_start_date: "",
      subscription_end_date: "",
    };
  }
  return {
    partner_subscription_id: sub.subscriptionId,
    subscription_plan_id: sub.planId,
    subscription_plan: sub.planSlug,
    subscription_start_date: sub.startDate,
    subscription_end_date: sub.endDate,
  };
}

/** Preserve subscription on `PUT /user/update` when the form does not send these keys. */
export function partnerSubscriptionPayloadFromUser(
  user: UserModel
): Record<string, unknown> {
  const sub = partnerSubscriptionDisplayFromUser(user);
  if (!sub) return {};
  const out: Record<string, unknown> = {};
  if (sub.subscriptionId) out.partner_subscription_id = sub.subscriptionId;
  if (sub.planId) out.subscription_plan_id = sub.planId;
  if (sub.planSlug) out.subscription_plan = sub.planSlug;
  if (sub.startDate) out.subscription_start_date = sub.startDate;
  if (sub.endDate) out.subscription_end_date = sub.endDate;
  if (sub.price != null) out.subscription_price = sub.price;
  return out;
}
