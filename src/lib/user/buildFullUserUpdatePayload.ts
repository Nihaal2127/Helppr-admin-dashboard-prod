import { UserModel } from "../models/UserModel";
import { AppConstant } from "../global/AppConstant";
import { getLocalStorage } from "../global/localStorageHelper";
import { normalizeCalendarYmd } from "../../helper/dateFormat";
import { genderForApiPayload } from "./genderOptions";
import { sanitizeIndianPincodeInput } from "./pincodeValidation";
import { normalizePartnerServicesForUpdate } from "../../components/partnerCatalogBlockUi";
import { partnerSubscriptionPayloadFromUser } from "../partner/partnerSubscriptionView";

const USER_TYPE = {
  FRANCHISE_ADMIN: 1,
  PARTNER: 2,
  FRANCHISE_EMPLOYEE: 3,
  CUSTOMER: 4,
  STAFF: 6,
} as const;

function formatDobForApi(value: unknown): string {
  return normalizeCalendarYmd(String(value ?? "")) ?? "";
}

function isAddressActive(value: unknown): boolean {
  return value === true || String(value ?? "").toLowerCase() === "true";
}

function getAddressPayloadFromUser(user: UserModel): Record<string, unknown> {
  const raw = (user as unknown as { address?: unknown }).address;

  if (Array.isArray(raw) && raw.length > 0) {
    return {
      add_new_address: "false",
      address: raw.map((item) => {
        const row = { ...(item as Record<string, unknown>) };
        return {
          ...row,
          address_status: isAddressActive(row.address_status),
          contact_name: String(row.contact_name ?? user.name ?? "").trim(),
          contact_number: String(
            row.contact_number ?? user.phone_number ?? ""
          ).trim(),
          landmark: String(row.landmark ?? "").trim(),
        };
      }),
      extra_addresses: [],
    };
  }

  const rootStatus = (user as { address_status?: unknown }).address_status;
  const addressLine =
    typeof raw === "string" ? raw : String(user.address ?? "").trim();

  return {
    add_new_address: "false",
    address_status: isAddressActive(rootStatus),
    address: addressLine,
    state_id: String(user.state_id ?? "").trim(),
    city_id: String(user.city_id ?? "").trim(),
    area_id: String(user.area_id ?? "").trim(),
    pincode: sanitizeIndianPincodeInput(String(user.pincode ?? "").trim()),
    extra_addresses: (user.extra_addresses ?? []).map((row) => ({
      ...(row._id ? { _id: row._id } : {}),
      state_id: String(row.state_id ?? "").trim(),
      city_id: String(row.city_id ?? "").trim(),
      area_id: String(row.area_id ?? "").trim(),
      pincode: sanitizeIndianPincodeInput(String(row.pincode ?? "").trim()),
      address: String(row.address ?? "").trim(),
      address_status: isAddressActive(row.address_status),
    })),
  };
}

function getPartnerFieldsFromUser(
  user: UserModel,
  record: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    experience: String(user.experience ?? "").trim(),
    area_id: String(user.area_id ?? "").trim(),
  };

  if (user.category_ids?.length) out.category_ids = user.category_ids;
  if (user.service_ids?.length) out.service_ids = user.service_ids;
  if (user.service_names?.length) out.service_names = user.service_names;
  if (user.service_descriptions?.length) {
    out.service_descriptions = user.service_descriptions;
  }
  if (user.service_prices?.length) out.service_prices = user.service_prices;

  const rawPartnerServices =
    record["partner-services"] ?? user.partner_services ?? record.partner_services;
  const partnerServices = normalizePartnerServicesForUpdate(rawPartnerServices);
  if (partnerServices?.length) {
    out["partner-services"] = partnerServices;
  }
  if (record.category_is_active != null) {
    out.category_is_active = record.category_is_active;
  }
  if (record.service_is_active != null) {
    out.service_is_active = record.service_is_active;
  }
  if (user.is_verified != null && user.is_verified !== "") {
    out.is_verified = user.is_verified;
  }
  if (user.bank_account) out.bank_account = user.bank_account;
  if (user.verification_rejection_reason != null) {
    out.verification_rejection_reason = user.verification_rejection_reason;
  }

  Object.assign(out, partnerSubscriptionPayloadFromUser(user));

  return out;
}

function getWebManagementFieldsFromUser(
  record: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const franchiseId = String(record.franchise_id ?? "").trim();
  if (franchiseId) out.franchise_id = franchiseId;
  const stateId = String(record.state_id ?? "").trim();
  if (stateId) out.state_id = stateId;
  const cityId = String(record.city_id ?? "").trim();
  if (cityId) out.city_id = cityId;
  if (record.available_pages != null) {
    out.available_pages = record.available_pages;
  }
  if (record.accessible_screens != null) {
    out.accessible_screens = record.accessible_screens;
  }
  if (record.chat != null) out.chat = record.chat;
  return out;
}

/**
 * Builds a complete `PUT /user/update/:id` body from the loaded user record,
 * then applies caller `overrides` (form edits, address changes, password, etc.).
 */
export function buildFullUserUpdatePayload(
  user: UserModel,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const record = user as unknown as Record<string, unknown>;
  const userType = Number(user.type);
  const isBlocked = Boolean(user.is_blocked);
  const createdById =
    String(getLocalStorage(AppConstant.createdById) ?? "").trim() ||
    String(user.created_by_id ?? "").trim();

  const base: Record<string, unknown> = {
    type: userType,
    is_from_web: user.is_from_web !== false,
    registration_type: user.registration_type ?? 1,
    created_by_id: createdById,
    name: String(user.name ?? "").trim(),
    email: String(user.email ?? "").trim(),
    phone_number: String(user.phone_number ?? "").trim(),
    gender: genderForApiPayload(user.gender) ?? "male",
    date_of_birth: formatDobForApi(user.date_of_birth),
    is_active: isBlocked ? false : Boolean(user.is_active ?? true),
    is_blocked: isBlocked,
    contact_name: String(user.name ?? "").trim(),
    contact_number: String(user.phone_number ?? "").trim(),
    landmark: String(user.landmark ?? "").trim(),
    ...getAddressPayloadFromUser(user),
    ...(user.profile_url ? { profile_url: user.profile_url } : {}),
  };

  if (userType === USER_TYPE.PARTNER) {
    Object.assign(base, getPartnerFieldsFromUser(user, record));
  }

  if (
    userType === USER_TYPE.FRANCHISE_ADMIN ||
    userType === USER_TYPE.FRANCHISE_EMPLOYEE ||
    userType === USER_TYPE.STAFF
  ) {
    Object.assign(base, getWebManagementFieldsFromUser(record));
  }

  return { ...base, ...overrides };
}
