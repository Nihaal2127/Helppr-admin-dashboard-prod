export interface DashboardQuotesStats {
  requests_received: number;
  in_progress: number;
  completed: number;
  cancelled: number;
}

export interface DashboardOrdersStats {
  in_progress: number;
  completed: number;
  cancelled: number;
}

export interface DashboardPaymentsStats {
  total_payments: number;
  customer: number;
  partner: number;
  commission: number;
}

export interface DashboardServicesStats {
  total: number;
  active: number;
  inactive: number;
}

export interface DashboardPartnersStats {
  total: number;
  active: number;
  inactive: number;
}

/** `GET /api/dashboard/stats` — `record` shape (Postman §03 — Dashboard). */
export interface DashboardStatsModel {
  quotes: DashboardQuotesStats;
  orders: DashboardOrdersStats;
  payments: DashboardPaymentsStats;
  services: DashboardServicesStats;
  partners: DashboardPartnersStats;
  franchise_id?: string | null;
  from_date?: string | null;
  to_date?: string | null;
}

export const DEFAULT_DASHBOARD_STATS: DashboardStatsModel = {
  quotes: {
    requests_received: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  },
  orders: {
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  },
  payments: {
    total_payments: 0,
    customer: 0,
    partner: 0,
    commission: 0,
  },
  services: {
    total: 0,
    active: 0,
    inactive: 0,
  },
  partners: {
    total: 0,
    active: 0,
    inactive: 0,
  },
};
