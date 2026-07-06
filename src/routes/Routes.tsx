import React from "react";
import LazyRouteBoundary from "../components/LazyRouteBoundary";

function resolveLazyModule(module: Record<string, unknown>): {
  default: React.ComponentType<unknown>;
} {
  const m = module ?? {};
  if (m.default != null && typeof m.default === "function") {
    return { default: m.default as React.ComponentType<unknown> };
  }
  const keys = Object.keys(m).filter((k) => k !== "__esModule");
  for (const k of keys) {
    const exp = m[k];
    if (typeof exp === "function") {
      return { default: exp as React.ComponentType<unknown> };
    }
  }
  throw new Error("Lazy route module has no component export");
}

async function importLazyRoute(
  importer: () => Promise<Record<string, unknown>>,
  attempt = 0
): Promise<{ default: React.ComponentType<unknown> }> {
  try {
    const mod = await importer();
    return resolveLazyModule(mod);
  } catch (err) {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 150));
      return importLazyRoute(importer, attempt + 1);
    }
    throw err;
  }
}

const lazyPage = (importer: () => Promise<Record<string, unknown>>) => {
  const LazyInner = React.lazy(() => importLazyRoute(importer));
  const Wrapped: React.FC = () => (
    <LazyRouteBoundary>
      <LazyInner />
    </LazyRouteBoundary>
  );
  return Wrapped;
};

const Login = lazyPage(() => import("../pages/auth/Login"));
const ForgotPassword = lazyPage(() => import("../pages/auth/ForgotPassword"));
const Dashboard = lazyPage(() => import("../pages/dashboard"));
const Profile = lazyPage(() => import("../pages/profile"));
const FranchiseManagement = lazyPage(
  () => import("../pages/franchiseManagement")
);
const ServiceManagement = lazyPage(() => import("../pages/serviceManagement"));
const UserManagement = lazyPage(() => import("../pages/userManagement"));
const OrderManagement = lazyPage(() => import("../pages/orderManagement"));
const Settings = lazyPage(() => import("../pages/settings"));
const Role = lazyPage(() => import("../pages/settings/role"));
const TaxOtherCharges = lazyPage(
  () => import("../pages/settings/taxOtherCharges")
);
const UserHomeCounts = lazyPage(
  () => import("../pages/settings/userHomeCounts")
);
const OffersManagement = lazyPage(() => import("../pages/settings/offers"));
const ExpenseCategoryManagement = lazyPage(
  () => import("../pages/settings/expenseCategory")
);
const Financials = lazyPage(() => import("../pages/financial"));
const OrderPayments = lazyPage(
  () => import("../pages/financial/orderPayments")
);
const PartnerPayments = lazyPage(
  () => import("../pages/financial/partnerPayments")
);
const PartnerPayout = lazyPage(
  () => import("../pages/financial/partnerPayout")
);
const PartnerPayoutShow = lazyPage(
  () => import("../pages/financial/partnerPayout/show")
);
const FinancialRefunds = lazyPage(() => import("../pages/financial/refunds"));
const TicketManagement = lazyPage(() => import("../pages/ticketManagement"));
const Error404 = lazyPage(() => import("../pages/public/Error404"));
const Error500 = lazyPage(() => import("../pages/public/Error500"));
const PrivacyPolicy = lazyPage(() => import("../pages/public/PrivacyPolicy"));
const TermsConditions = lazyPage(() => import("../pages/public/TermsConditions"));
const AboutUs = lazyPage(() => import("../pages/public/AboutUs"));
const PartnerPrivacyPolicy = lazyPage(
  () => import("../pages/public/PartnerPrivacyPolicy")
);
const PartnerTermsConditions = lazyPage(
  () => import("../pages/public/PartnerTermsConditions")
);
const CalendarPage = lazyPage(() => import("../pages/calendar"));
const QuoteManagement = lazyPage(() => import("../pages/quoteManagement"));
const Reports = lazyPage(() => import("../pages/reports"));
const NotificationsPage = lazyPage(() => import("../pages/notifications"));
const ExpensesManagement = lazyPage(() => import("../pages/expenses"));
const NormalChatListPage = React.lazy(
  () => import("../pages/ticketManagement/NormalChatListPage")
);
const NormalChatConversationPage = React.lazy(
  () => import("../pages/ticketManagement/NormalChatConversationPage")
);
const DisputeChatConversationPage = React.lazy(
  () => import("../pages/ticketManagement/DisputeChatConversationPage")
);
const DisputeChatListPage = React.lazy(
  () => import("../pages/ticketManagement/DisputeChatListPage")
);
const QuoteChatListPage = React.lazy(
  () => import("../pages/ticketManagement/QuoteChatListPage")
);
const QuoteChatConversationPage = React.lazy(
  () => import("../pages/ticketManagement/QuoteChatConversationPage")
);
const GroupChatConversationPage = React.lazy(
  () => import("../pages/ticketManagement/GroupChatConversationPage")
);
const PartnerManagement = React.lazy(
  () => import("../pages/partnerManagement")
);
const MyFranchise = lazyPage(() => import("../pages/myFranchise"));
const LocationManagement = lazyPage(() => import("../pages/locationManagement"));
const ContentManagement = React.lazy(
  () => import("../pages/contentManagement")
);
const AddEditContent = React.lazy(
  () => import("../pages/contentManagement/AddEditContent")
);
const GeneralSettings = React.lazy(
  () => import("../pages/settings/generalSettings")
);

export const ROUTES = {
  LOGIN: {
    path: "/auth/login",
    element: <Login />,
    isProtected: false,
  },
  FORGOT_PASSWORD: {
    path: "/auth/forgot-password",
    element: <ForgotPassword />,
    isProtected: false,
  },
  DASHBOARD: {
    path: "/dashboard",
    element: <Dashboard />,
    isProtected: true,
  },
  PROFILE: {
    path: "/profile",
    element: <Profile />,
    isProtected: true,
  },
  LOCATION_MANAGEMENT: {
    path: "/location-management",
    element: <LocationManagement />,
    isProtected: true,
  },
  FRANCHISE_MANAGEMENT: {
    path: "/franchise-management",
    element: <FranchiseManagement />,
    isProtected: true,
  },
  SERVICE_MANAGEMENT: {
    path: "/service-management",
    element: <ServiceManagement />,
    isProtected: true,
  },
  USER_MANAGEMENT: {
    path: "/user-management",
    element: <UserManagement />,
    isProtected: true,
  },
  ORDER_MANAGEMENT: {
    path: "/order-management",
    element: <OrderManagement />,
    isProtected: true,
  },
  FINANCIALS: {
    path: "/financial",
    element: <Financials />,
    isProtected: true,
  },
  ORDER_PAYMENTS: {
    path: "/financial-order-payments",
    element: <OrderPayments />,
    isProtected: true,
  },
  PARTNER_PAYMENTS: {
    path: "/financial-partner-payments",
    element: <PartnerPayments />,
    isProtected: true,
  },
  PARTNER_PAYOUT: {
    path: "/financial-partner-payout",
    element: <PartnerPayout />,
    isProtected: true,
  },
  PARTNER_PAYOUT_SHOW: {
    path: "/financial-partner-payout-show",
    element: <PartnerPayoutShow />,
    isProtected: true,
  },
  FINANCIAL_REFUNDS: {
    path: "/financial-refunds",
    element: <FinancialRefunds />,
    isProtected: true,
  },
  SETTINGS: {
    path: "/settings",
    element: <Settings />,
    isProtected: true,
  },
  ROLE: {
    path: "/settings-role",
    element: <Role />,
    isProtected: true,
  },
  TAX_OTHER_CHARGES: {
    path: "/settings-tax-other-charges",
    element: <TaxOtherCharges />,
    isProtected: true,
  },
  USER_HOME_COUNTS: {
    path: "/settings-user-home-counts",
    element: <UserHomeCounts />,
    isProtected: true,
  },
  OFFERS_MANAGEMENT: {
    path: "/settings-coupons",
    element: <OffersManagement />,
    isProtected: true,
  },
  GENERAL_SETTINGS: {
    path: "/settings-general",
    element: <GeneralSettings />,
    isProtected: true,
  },
  EXPENSE_CATEGORY_MANAGEMENT: {
    path: "/settings-expense-categories",
    element: <ExpenseCategoryManagement />,
    isProtected: true,
  },
  TICKET_MANAGEMENT: {
    path: "/ticket-management",
    element: <TicketManagement />,
    isProtected: true,
  },
  ERROR404: {
    path: "/404",
    element: <Error404 />,
    isProtected: false,
  },
  ERROR500: {
    path: "/500",
    element: <Error500 />,
    isProtected: false,
  },
  PRIVACY_POLICY: {
    path: "/privacy-policy",
    element: <PrivacyPolicy />,
    isProtected: false,
  },
  TERMS_CONDITIONS: {
    path: "/terms-conditions",
    element: <TermsConditions />,
    isProtected: false,
  },
  ABOUT_US: {
    path: "/about-us",
    element: <AboutUs />,
    isProtected: false,
  },
  PARTNER_PRIVACY_POLICY: {
    path: "/partner/privacy-policy",
    element: <PartnerPrivacyPolicy />,
    isProtected: false,
  },
  PARTNER_TERMS_CONDITIONS: {
    path: "/partner/terms-conditions",
    element: <PartnerTermsConditions />,
    isProtected: false,
  },
  PartnerManagement: {
    path: "/partner-management",
    element: <PartnerManagement />,
    isProtected: true,
  },
  MY_FRANCHISE: {
    path: "/my-franchise",
    element: <MyFranchise />,
    isProtected: true,
  },
  TICKET_MANAGEMENT_NORMAL_CHAT: {
    path: "/ticket-management/normal-chats",
    element: <NormalChatListPage />,
    isProtected: true,
  },
  TICKET_MANAGEMENT_NORMAL_CHAT_VIEW: {
    path: "/ticket-management/normal-chats/view",
    element: <NormalChatConversationPage />,
    isProtected: true,
  },
  TICKET_MANAGEMENT_DISPUTE_CHAT_VIEW: {
    path: "/ticket-management/dispute-chats/view",
    element: <DisputeChatConversationPage />,
    isProtected: true,
  },
  TICKET_MANAGEMENT_DISPUTE_CHAT: {
    path: "/ticket-management/dispute-chats",
    element: <DisputeChatListPage />,
    isProtected: true,
  },
  TICKET_MANAGEMENT_QUOTE_CHAT: {
    path: "/ticket-management/quote-chats",
    element: <QuoteChatListPage />,
    isProtected: true,
  },
  TICKET_MANAGEMENT_GROUP_CHAT: {
    path: "/ticket-management/group-chats",
    element: <QuoteChatListPage />,
    isProtected: true,
  },
  TICKET_MANAGEMENT_QUOTE_CHAT_VIEW: {
    path: "/ticket-management/quote-chats/view",
    element: <QuoteChatConversationPage />,
    isProtected: true,
  },
  TICKET_MANAGEMENT_GROUP_CHAT_VIEW: {
    path: "/ticket-management/quote-chats/group/view",
    element: <GroupChatConversationPage />,
    isProtected: true,
  },
  CALENDAR_PAGE: {
    path: "/calendar",
    element: <CalendarPage />,
    isProtected: true,
  },
  QUOTE_MANAGEMENT: {
    path: "/quote-management",
    element: <QuoteManagement />,
    isProtected: true,
  },
  REPORTS: {
    path: "/reports",
    element: <Reports />,
    isProtected: true,
  },
  NOTIFICATIONS: {
    path: "/notifications",
    element: <NotificationsPage />,
    isProtected: true,
  },
  CONTENT_MANAGEMENT: {
    path: "/content-management",
    element: <ContentManagement />,
    isProtected: true,
  },
  ADD_EDIT_CONTENT: {
    path: "/content-management/edit/:id",
    element: <AddEditContent />,
    isProtected: true,
  },
  EXPENSES_MANAGEMENT: {
    path: "/expenses",
    element: <ExpensesManagement />,
    isProtected: true,
  },
};

export const routes = Object.values(ROUTES);
