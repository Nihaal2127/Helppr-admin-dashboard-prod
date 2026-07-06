import type { UserModel } from "../models/UserModel";

/** Read-only rows shown on create order (from selected customer) and styled like service address cards. */
export type CustomerSavedAddressPreview = {
  stateLabel: string;
  cityLabel: string;
  postal: string;
  line: string;
};

export function buildCustomerSavedAddressPreview(
  user?: UserModel
): CustomerSavedAddressPreview[] | undefined {
  if (!user) return undefined;
  const stateLabel = (user.state_name ?? "").trim() || "—";
  const cityLabel = (user.city_name ?? "").trim() || "—";
  const postal = (user.pincode ?? "").trim() || "—";
  const line = (user.address ?? "").trim() || "—";
  const meaningful =
    (user.state_name ?? "").trim() ||
    (user.city_name ?? "").trim() ||
    (user.pincode ?? "").trim() ||
    (user.address ?? "").trim();
  if (!meaningful) return undefined;
  return [{ stateLabel, cityLabel, postal, line }];
}
