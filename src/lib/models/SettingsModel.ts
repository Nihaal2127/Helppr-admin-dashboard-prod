export type OfferType = "percentage" | "fixed";
export type OfferApplicableOn = "quotes" | "orders";
export type ActiveStatus = "active" | "inactive";

export interface OfferModel {
  id: string;
  offerId: string;
  offerName: string;
  offerType: OfferType;
  totalOfferValue: number;
  adminContribution: number;
  partnerContribution: number;
  applicableOn: OfferApplicableOn;
  startDate: string;
  endDate: string;
  status: ActiveStatus;
  createdAt: string;
}

export interface RoleSettingsModel {
  id: string;
  roleId: string;
  roleName: string;
  roleType: "franchise_admin" | "employee";
  assignedFranchise?: string;
  franchise_id?: string;
  state_id?: string;
  city_id?: string;
  /** Contact (settings / mock; optional for backward compatibility). */
  email?: string;
  phone_number?: string;
  gender?: string;
  date_of_birth?: string;
  /** Profile image path or URL after upload (mock). */
  profile_url?: string;
  status: ActiveStatus;
  createdDate: string;
  /** Menu keys from `mainMenuItems` granted to franchise admins and employees */
  screenPermissions?: string[];
}

export interface StaffSettingsModel {
  id: string;
  staffId: string;
  name: string;
  email?: string;
  phone_number?: string;
  gender?: string;
  date_of_birth?: string;
  profile_url?: string;
  status: ActiveStatus;
  createdDate: string;
  screenPermissions: string[];
  /** When true, staff may access all franchises; `franchisePermissions` is ignored */
  allFranchises: boolean;
  /** Franchise display names when `allFranchises` is false */
  franchisePermissions: string[];
}

export type ExpenseCategorySubcategory = {
  subcategoryId?: string;
  subCategoryName: string;
};

export interface ExpenseCategoryModel {
  id: string;
  /** Optional backend category table id (when returned separately from row id). */
  categoryId?: string;
  /** Optional backend sub-category / service id used by expense create payload. */
  subCategoryId?: string;
  franchiseId?: string;
  franchiseName?: string;
  categoryName: string;
  subCategoryName: string;
  /** Nested sub categories from list/detail API (`subcategories`). */
  subcategories?: ExpenseCategorySubcategory[];
  description?: string;
  createdDate: string;
}
