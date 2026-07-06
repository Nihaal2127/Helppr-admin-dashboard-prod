import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { Row, Col } from "react-bootstrap";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Pie } from "react-chartjs-2";
import CustomHeader from "../../components/CustomHeader";
import CustomFormSelect from "../../components/CustomFormSelect";
import { DashboardCard, formatDate } from "../../helper/utility";
import {
  DEFAULT_DASHBOARD_STATS,
  DashboardStatsModel,
} from "../../lib/dashboard/dashboardModel";
import {
  getDashboardStats,
  resolveDashboardDateRange,
} from "../../lib/dashboard/dashboardService";
import type { DashboardDateRangeType } from "../../lib/dashboard/dashboardService";
import { useFranchiseHeaderForm } from "../../lib/global/hooks/useFranchiseScopedGetCount";
import CustomDatePicker from "../../components/CustomDatePicker";
import { dateToLocalYmd, todayLocalYmd } from "../../helper/dateFormat";
import { AppConstant } from "../../lib/global/AppConstant";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

const formatDashboardAmount = (value: number) =>
  `${AppConstant.currencySymbol}${Number(value || 0).toLocaleString()}`;

const Dashboard = () => {
  const {
    register: headerRegister,
    setValue: headerSetValue,
    franchiseId,
  } = useFranchiseHeaderForm();
  const { register, setValue } = useForm<any>();
  const [selectedDate, setSelectedDate] = useState<string>(todayLocalYmd());
  const [dateRangeType, setDateRangeType] =
    useState<DashboardDateRangeType>("TODAY");
  const [weekStartDate, setWeekStartDate] = useState<string>(todayLocalYmd());
  const [customFromDate, setCustomFromDate] = useState<string>("");
  const [customToDate, setCustomToDate] = useState<string>("");

  const [dashboardStats, setDashboardStats] =
    useState<DashboardStatsModel>(DEFAULT_DASHBOARD_STATS);

  const dashboardQueryRange = useMemo(
    () =>
      resolveDashboardDateRange({
        dateRangeType,
        selectedDate,
        weekStartDate,
        customFromDate,
        customToDate,
      }),
    [
      dateRangeType,
      selectedDate,
      weekStartDate,
      customFromDate,
      customToDate,
    ]
  );

  useEffect(() => {
    if (!dashboardQueryRange) return;

    let cancelled = false;

    void (async () => {
      const { response, stats } = await getDashboardStats({
        range: dashboardQueryRange,
        franchiseId,
      });
      if (cancelled) return;
      if (response && stats) {
        setDashboardStats({ ...DEFAULT_DASHBOARD_STATS, ...stats });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboardQueryRange, franchiseId]);

  const handleDateRangeTypeChange = (value: DashboardDateRangeType) => {
    setDateRangeType(value);

    const today = new Date();

    if (value === "TODAY") {
      setSelectedDate(dateToLocalYmd(today));
    }

    if (value === "THIS_WEEK") {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(today);
      start.setDate(diff);

      setWeekStartDate(dateToLocalYmd(start));
      setSelectedDate(dateToLocalYmd(today));
    }

    if (value === "THIS_MONTH") {
      setSelectedDate(dateToLocalYmd(today));
    }

    if (value === "THIS_YEAR") {
      setSelectedDate(dateToLocalYmd(today));
    }

    if (value === "CUSTOM_RANGE") {
      // No automatic change to selectedDate; user will pick custom range
    }
  };

  const dateRangeOptions = [
    { value: "TODAY", label: "This Day" },
    { value: "THIS_WEEK", label: "This Week" },
    { value: "THIS_MONTH", label: "This Month" },
    { value: "THIS_YEAR", label: "This Year" },
    { value: "CUSTOM_RANGE", label: "Custom Range" },
  ];

  const customerPay = dashboardStats.payments.customer;
  const partnerPay = dashboardStats.payments.partner;
  const commissionPay = dashboardStats.payments.commission;
  const totalPaymentsAmount =
    dashboardStats.payments.total_payments > 0
      ? dashboardStats.payments.total_payments
      : customerPay + partnerPay + commissionPay;

  /** When breakdown is all zero, show sample bars aligned with Customer / Partner / Commission / Total. */
  const PAYMENTS_CHART_DUMMY = {
    customer: 12000,
    partner: 6500,
    commission: 3500,
  } as const;
  const hasPaymentsBreakdown = totalPaymentsAmount > 0;
  const chartCustomer = hasPaymentsBreakdown
    ? customerPay
    : PAYMENTS_CHART_DUMMY.customer;
  const chartPartner = hasPaymentsBreakdown
    ? partnerPay
    : PAYMENTS_CHART_DUMMY.partner;
  const chartCommission = hasPaymentsBreakdown
    ? commissionPay
    : PAYMENTS_CHART_DUMMY.commission;
  const chartTotal = hasPaymentsBreakdown
    ? totalPaymentsAmount
    : PAYMENTS_CHART_DUMMY.customer +
      PAYMENTS_CHART_DUMMY.partner +
      PAYMENTS_CHART_DUMMY.commission;

  const maxPaymentAmount = Math.max(
    chartCustomer,
    chartPartner,
    chartCommission,
    chartTotal,
    1
  );

  const paymentsChartData = {
    labels: ["Customer", "Partner", "Commission", "Total"],
    datasets: [
      {
        label: "Payments",
        data: [chartCustomer, chartPartner, chartCommission, chartTotal],
        backgroundColor: [
          "rgba(27, 107, 172, 0.7)", // customer — --btn-info
          "rgba(172, 154, 27, 0.7)", // partner — --btn-warning
          "rgba(66, 172, 27, 0.7)", // commission — --btn-success
          "rgba(241, 67, 9, 0.7)", // total — --btn-pending
        ],
        borderColor: ["#1B6BAC", "#AC9A1B", "#42AC1B", "#F14309"],
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const paymentChartSuggestedMax = Math.ceil(maxPaymentAmount / 1000) * 1000;

  const paymentsChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        suggestedMax: paymentChartSuggestedMax,
        ticks: {
          stepSize: Math.max(1000, Math.ceil(paymentChartSuggestedMax / 5)),
          callback: (value: string | number) =>
            `${AppConstant.currencySymbol}${Number(value).toLocaleString()}`,
        },
        grid: {
          color: "rgba(0, 0, 0, 0.05)",
        },
      },
    },
  } as const;

  const quotesTotalRaw =
    dashboardStats.quotes.requests_received +
    dashboardStats.quotes.in_progress +
    dashboardStats.quotes.completed +
    dashboardStats.quotes.cancelled;
  const ordersTotalRaw =
    dashboardStats.orders.in_progress +
    dashboardStats.orders.completed +
    dashboardStats.orders.cancelled;

  /** Sample split when API returns no quote/order totals — keeps the pie usable for layout review. */
  const ORDERS_VS_QUOTES_DESIGN_DUMMY = { quotes: 42, orders: 118 } as const;
  const hasRealOrdersQuotesData = quotesTotalRaw + ordersTotalRaw > 0;
  const quotesTotal = hasRealOrdersQuotesData
    ? quotesTotalRaw
    : ORDERS_VS_QUOTES_DESIGN_DUMMY.quotes;
  const ordersTotal = hasRealOrdersQuotesData
    ? ordersTotalRaw
    : ORDERS_VS_QUOTES_DESIGN_DUMMY.orders;

  const ordersVsQuotesPieData = {
    labels: ["Quotes", "Orders"],
    datasets: [
      {
        data: [quotesTotal, ordersTotal],
        backgroundColor: ["rgba(27, 107, 172, 0.9)", "rgba(66, 172, 27, 0.9)"],
        borderColor: ["#1B6BAC", "#42AC1B"],
        borderWidth: 1,
      },
    ],
  };

  const ordersVsQuotesPieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          boxWidth: 12,
          padding: 12,
          font: { size: 12 },
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: {
            label?: string;
            raw: unknown;
            dataset: { data: unknown[] };
          }) => {
            const value = Number(ctx.raw) || 0;
            const data = ctx.dataset.data as number[];
            const total = data.reduce((a, b) => a + (Number(b) || 0), 0);
            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
            return `${ctx.label ?? ""}: ${value} (${pct}%)`;
          },
        },
      },
    },
  } as const;

  return (
    <>
      <div className="main-page-content dashboard-page">
        <CustomHeader
          title="Dashboard"
          register={headerRegister}
          setValue={headerSetValue}
        />

        <div className="custom-dashboard-card">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <h3 className="m-0 custom-dashboard-title">
                {dateRangeType === "TODAY" && (
                  <>Current Date is : {formatDate(selectedDate)}</>
                )}
                {dateRangeType === "THIS_WEEK" && (
                  <>
                    Current Week : {formatDate(weekStartDate)} to{" "}
                    {formatDate(selectedDate)}
                  </>
                )}
                {dateRangeType === "THIS_MONTH" && (
                  <>
                    Month :{" "}
                    {new Date(`${selectedDate}T00:00:00`).toLocaleString("default", {
                      month: "long",
                      year: "numeric",
                    })}
                  </>
                )}
                {dateRangeType === "THIS_YEAR" && (
                  <>
                    Year :{" "}
                    {new Date(`${selectedDate}T00:00:00`).getFullYear()}
                  </>
                )}
                {dateRangeType === "CUSTOM_RANGE" && (
                  <>
                    Custom Range
                    {customFromDate && customToDate && (
                      <>
                        {" "}
                        : {formatDate(customFromDate)} to{" "}
                        {formatDate(customToDate)}
                      </>
                    )}
                  </>
                )}
              </h3>
            </div>
            <div className="d-flex flex-wrap align-items-center gap-2 dashboard-date-range-controls">
            <div className="dashboard-date-range-select">
                <div className="dashboard-date-range-picker">
                  <CustomFormSelect
                    label=""
                    controlId="Date Range"
                    options={dateRangeOptions}
                    register={register}
                    fieldName="date_range_type"
                    defaultValue={dateRangeType}
                    onChange={(e) =>
                      handleDateRangeTypeChange(
                        e.target.value as DashboardDateRangeType
                      )
                    }
                    asCol={false}
                    noBottomMargin
                  />
                </div>

                {dateRangeType !== "CUSTOM_RANGE" &&
                  dateRangeType !== "THIS_WEEK" && (
                  <div className="dashboard-date-range-picker">
                    <CustomDatePicker
                      label=""
                      controlId="service_date"
                      selectedDate={selectedDate}
                      onChange={(date) => {
                        const iso = date ? dateToLocalYmd(date) : "";
                        setSelectedDate(iso);
                      }}
                      placeholderText={
                        dateRangeType === "THIS_MONTH"
                          ? "Select month"
                          : dateRangeType === "THIS_YEAR"
                            ? "Select year"
                            : "Select date"
                      }
                      pickerMode={
                        dateRangeType === "THIS_MONTH"
                          ? "month"
                          : dateRangeType === "THIS_YEAR"
                            ? "year"
                            : "date"
                      }
                      register={register}
                      setValue={setValue}
                      asCol={false}
                      filterDate={() => true}
                      groupClassName="mb-0"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          {dateRangeType === "CUSTOM_RANGE" && (
            <div className="d-flex flex-wrap gap-2 dashboard-date-range-controls pt-2">
              <div className="dashboard-date-range-picker">
                <CustomDatePicker
                  controlId="service_date_from"
                  selectedDate={customFromDate}
                  onChange={(date) => {
                    const iso = date ? dateToLocalYmd(date) : "";
                    setCustomFromDate(iso);
                  }}
                  placeholderText="From date"
                  register={register}
                  setValue={setValue}
                  groupClassName="w-100 mb-0"
                  asCol={false}
                  showMonthYearDropdowns
                  filterDate={() => true}
                />
              </div>
              <div className="dashboard-date-range-picker">
                <CustomDatePicker
                  controlId="service_date_to"
                  selectedDate={customToDate}
                  onChange={(date) => {
                    const iso = date ? dateToLocalYmd(date) : "";
                    setCustomToDate(iso);
                  }}
                  placeholderText="To date"
                  register={register}
                  setValue={setValue}
                  groupClassName="w-100 mb-0"
                  asCol={false}
                  showMonthYearDropdowns
                  filterDate={() => true}
                />
              </div>
            </div>
          )}
        </div>

        <div className="custom-dashboard-card">
          {/* <h3 className="custom-dashboard-title">{formatDate(selectedDate)} Progress</h3> */}
          <h3 className="custom-dashboard-title">Quotes</h3>
          <div className="d-flex gap-2">
            <DashboardCard
              title="Requests Received"
              count={dashboardStats.quotes.requests_received}
              color="var(--btn-info)"
            />
            <DashboardCard
              title="In Progress"
              count={dashboardStats.quotes.in_progress}
              color="var(--btn-warning)"
            />
            <DashboardCard
              title="Completed"
              count={dashboardStats.quotes.completed}
              color="var(--btn-success)"
            />
            <DashboardCard
              title="Cancelled"
              count={dashboardStats.quotes.cancelled}
              color="var(--btn-danger)"
            />
          </div>
        </div>

        <div className="custom-dashboard-card">
          {/* <h3 className="custom-dashboard-title">{formatDate(selectedDate)} Payments</h3> */}
          <h3 className="custom-dashboard-title">Orders</h3>
          <div className="d-flex gap-2">
            {/* <DashboardCard title="Requests Received" count={dashboardDetails!.pending_order} color="var(--btn-info)" /> */}
            <DashboardCard
              title="In Progress"
              count={dashboardStats.orders.in_progress}
              color="var(--btn-warning)"
            />
            <DashboardCard
              title="Completed"
              count={dashboardStats.orders.completed}
              color="var(--btn-success)"
            />
            <DashboardCard
              title="Cancelled"
              count={dashboardStats.orders.cancelled}
              color="var(--btn-danger)"
            />
          </div>
        </div>

        <div className="custom-dashboard-card">
          <h3 className="custom-dashboard-title">Payments</h3>
          <div className="d-flex gap-2 flex-wrap">
            <DashboardCard
              title="Total Payments"
              count={formatDashboardAmount(totalPaymentsAmount)}
              color="var(--btn-pending)"
            />
            <DashboardCard
              title="Customer"
              count={formatDashboardAmount(dashboardStats.payments.customer)}
              color="var(--btn-info)"
            />
            <DashboardCard
              title="Partner"
              count={formatDashboardAmount(dashboardStats.payments.partner)}
              color="var(--btn-warning)"
            />
            <DashboardCard
              title="Commission"
              count={formatDashboardAmount(dashboardStats.payments.commission)}
              color="var(--btn-success)"
            />
          </div>
        </div>

        <Row className="dashboard-stats-row">
          <Col xs={12} lg={6}>
            <div className="custom-dashboard-card">
              <h3 className="custom-dashboard-title">Services</h3>
              <div className="d-flex gap-2">
                <DashboardCard
                  title="Total"
                  count={dashboardStats.services.total}
                  color="var(--btn-info)"
                />
                <DashboardCard
                  title="Active"
                  count={dashboardStats.services.active}
                  color="var(--btn-success)"
                />
                <DashboardCard
                  title="Inactive"
                  count={dashboardStats.services.inactive}
                  color="var(--btn-danger)"
                />
              </div>
            </div>
          </Col>
          <Col xs={12} lg={6}>
            <div className="custom-dashboard-card">
              <h3 className="custom-dashboard-title">Partners</h3>
              <div className="d-flex gap-2">
                <DashboardCard
                  title="Total"
                  count={dashboardStats.partners.total}
                  color="var(--btn-info)"
                />
                <DashboardCard
                  title="Active"
                  count={dashboardStats.partners.active}
                  color="var(--btn-success)"
                />
                <DashboardCard
                  title="Inactive"
                  count={dashboardStats.partners.inactive}
                  color="var(--btn-danger)"
                />
              </div>
            </div>
          </Col>
        </Row>
        {/* <Row>
                    <Col sm={8}>
                        <div className="custom-dashboard-card">
                            <h3 className="custom-dashboard-title">Services</h3>
                            <div className="d-flex gap-2">
                                <DashboardCard title="Total" count={dashboardDetails!.total_service} color="var(--btn-info)" />
                                <DashboardCard title="Active" count={dashboardDetails!.active_service} color="var(--btn-success)" />
                                <DashboardCard title="Inactive" count={dashboardDetails!.inactive_service} color="var(--btn-danger)" />
                            </div>
                        </div>
                        <div className="custom-dashboard-card">
                            <h3 className="custom-dashboard-title">Partners</h3>
                            <div className="d-flex gap-2">
                                <DashboardCard title="Total" count={dashboardDetails!.total_partner} color="var(--btn-info)" />
                                <DashboardCard title="Active" count={dashboardDetails!.active_partner} color="var(--btn-success)" />
                                <DashboardCard title="Inactive" count={dashboardDetails!.inactive_partner} color="var(--btn-danger)" />
                            </div>
                        </div>
                    </Col>
                    <Col sm={4}>
                        <div className="custom-dashboard-card" style={{ borderRadius: "8px" }}>
                            <h3 className="custom-dashboard-title">Revenue</h3>
                            <label className="custom-dashboard-title-count">{AppConstant.currencySymbol}{dashboardDetails!.revenue}</label>
                            <img src={graphsImg} alt="graph" className="mt-4" />
                        </div>
                    </Col>
                </Row> */}

        <Row className="dashboard-charts-row">
          <Col xs={12} lg={6}>
            <div className="custom-dashboard-card">
              <h3 className="custom-dashboard-title">Payments Overview</h3>
              <div style={{ height: 220 }}>
                <Bar data={paymentsChartData} options={paymentsChartOptions} />
              </div>
              {/* Legacy CSS-only bars kept for reference; Chart.js bar above replaces this */}
              {/*
                            <div className="d-flex align-items-end justify-content-between" style={{ height: 180 }}>
                                ...
                            </div>
                            */}
            </div>
          </Col>
          <Col xs={12} lg={6}>
            <div className="custom-dashboard-card">
              <h3 className="custom-dashboard-title">Orders vs Quotes</h3>
              <div
                className="position-relative w-100"
                style={{ height: 240, minHeight: 220 }}
              >
                <Pie
                  key={`${dashboardQueryRange?.fromDate ?? ""}-${dashboardQueryRange?.toDate ?? ""}-${dateRangeType}-${hasRealOrdersQuotesData}`}
                  data={ordersVsQuotesPieData}
                  options={ordersVsQuotesPieOptions}
                />
              </div>
            </div>
          </Col>
        </Row>
      </div>
    </>
  );
};

export default Dashboard;
