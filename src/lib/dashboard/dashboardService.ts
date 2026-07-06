import { apiRequest } from "../global/remote/apiHelper";
import { ApiPaths } from "../global/remote/apiPaths";
import { franchiseIdForApiQuery } from "../franchise/headerFranchisePreference";
import { dateToLocalYmd } from "../../helper/dateFormat";
import {
  DashboardStatsModel,
  DEFAULT_DASHBOARD_STATS,
} from "./dashboardModel";

export type DashboardDateRangeType =
  | "TODAY"
  | "THIS_WEEK"
  | "THIS_MONTH"
  | "THIS_YEAR"
  | "CUSTOM_RANGE";

export type DashboardDateRangeQuery = {
  fromDate: string;
  toDate: string;
  dateRangeType: DashboardDateRangeType;
};

export function resolveDashboardDateRange(input: {
  dateRangeType: DashboardDateRangeType;
  selectedDate: string;
  weekStartDate: string;
  customFromDate: string;
  customToDate: string;
}): DashboardDateRangeQuery | null {
  const { dateRangeType, selectedDate, weekStartDate, customFromDate, customToDate } =
    input;

  if (dateRangeType === "CUSTOM_RANGE") {
    if (!customFromDate.trim() || !customToDate.trim()) return null;
    return {
      fromDate: customFromDate,
      toDate: customToDate,
      dateRangeType,
    };
  }

  if (!selectedDate.trim()) return null;

  if (dateRangeType === "TODAY") {
    return { fromDate: selectedDate, toDate: selectedDate, dateRangeType };
  }

  if (dateRangeType === "THIS_WEEK") {
    return {
      fromDate: weekStartDate || selectedDate,
      toDate: selectedDate,
      dateRangeType,
    };
  }

  const anchor = new Date(`${selectedDate}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return null;

  if (dateRangeType === "THIS_MONTH") {
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return {
      fromDate: dateToLocalYmd(monthStart),
      toDate: dateToLocalYmd(monthEnd),
      dateRangeType,
    };
  }

  const year = anchor.getFullYear();
  return {
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
    dateRangeType,
  };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapDashboardStatsRecord(raw: unknown): DashboardStatsModel {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const quotes =
    record.quotes && typeof record.quotes === "object"
      ? (record.quotes as Record<string, unknown>)
      : {};
  const orders =
    record.orders && typeof record.orders === "object"
      ? (record.orders as Record<string, unknown>)
      : {};
  const payments =
    record.payments && typeof record.payments === "object"
      ? (record.payments as Record<string, unknown>)
      : {};
  const services =
    record.services && typeof record.services === "object"
      ? (record.services as Record<string, unknown>)
      : {};
  const partners =
    record.partners && typeof record.partners === "object"
      ? (record.partners as Record<string, unknown>)
      : {};

  return {
    quotes: {
      requests_received: num(quotes.requests_received),
      in_progress: num(quotes.in_progress),
      completed: num(quotes.completed),
      cancelled: num(quotes.cancelled),
    },
    orders: {
      in_progress: num(orders.in_progress),
      completed: num(orders.completed),
      cancelled: num(orders.cancelled),
    },
    payments: {
      total_payments: num(payments.total_payments),
      customer: num(payments.customer),
      partner: num(payments.partner),
      commission: num(payments.commission),
    },
    services: {
      total: num(services.total),
      active: num(services.active),
      inactive: num(services.inactive),
    },
    partners: {
      total: num(partners.total),
      active: num(partners.active),
      inactive: num(partners.inactive),
    },
    franchise_id:
      record.franchise_id != null ? String(record.franchise_id) : null,
    from_date: record.from_date != null ? String(record.from_date) : null,
    to_date: record.to_date != null ? String(record.to_date) : null,
  };
}

export type DashboardStatsQuery = {
  range: DashboardDateRangeQuery;
  franchiseId?: string;
};

/** `GET /api/dashboard/stats` — admin home KPIs (Postman §03 — Dashboard). */
export const getDashboardStats = async (
  query: DashboardStatsQuery
): Promise<{ response: boolean; stats: DashboardStatsModel | null }> => {
  const params = new URLSearchParams();
  const franchiseId = franchiseIdForApiQuery(query.franchiseId);
  if (franchiseId) params.set("franchise_id", franchiseId);
  params.set("from_date", query.range.fromDate);
  params.set("to_date", query.range.toDate);

  const response = await apiRequest(
    `${ApiPaths.GET_DASHBOARD_STATS()}?${params.toString()}`,
    "GET"
  );

  if (response.success) {
    const data = response.data as Record<string, unknown> | undefined;
    const record = data?.record ?? data;
    return {
      response: true,
      stats: {
        ...DEFAULT_DASHBOARD_STATS,
        ...mapDashboardStatsRecord(record),
      },
    };
  }

  return { response: false, stats: null };
};
