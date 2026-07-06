import type { RoleSettingsModel } from "../lib/models/SettingsModel";

export const rolesMockSeed: Array<
  Omit<RoleSettingsModel, "id" | "createdDate">
> = [
  {
    roleId: "ROLE-001",
    roleName: "Senior Franchise Admin",
    roleType: "franchise_admin",
    assignedFranchise: "Franchise Alpha",
    email: "admin.alpha@example.com",
    phone_number: "9876543210",
    profile_url: "",
    status: "active",
    screenPermissions: ["dashboards", "settings"],
  },
  {
    roleId: "ROLE-002",
    roleName: "Service Executive",
    roleType: "employee",
    email: "exec.services@example.com",
    phone_number: "9123456789",
    profile_url: "",
    status: "active",
    screenPermissions: ["dashboards", "user-management", "quote-management"],
  },
];
