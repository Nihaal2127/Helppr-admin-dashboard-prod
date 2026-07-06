import type { StaffSettingsModel } from "../lib/models/SettingsModel";

export const staffMockSeed: Array<
  Omit<StaffSettingsModel, "id" | "createdDate">
> = [
  {
    staffId: "STAFF-001",
    name: "Operations Lead",
    email: "ops.lead@example.com",
    phone_number: "9988776655",
    profile_url: "",
    status: "active",
    screenPermissions: ["dashboards", "order-management", "reports"],
    allFranchises: false,
    franchisePermissions: ["Sunria Agro Agro", "Green Valley"],
  },
  {
    staffId: "STAFF-002",
    name: "Support Associate",
    email: "support@example.com",
    phone_number: "8877665544",
    profile_url: "",
    status: "active",
    screenPermissions: ["support-center", "notifications"],
    allFranchises: true,
    franchisePermissions: [],
  },
];
