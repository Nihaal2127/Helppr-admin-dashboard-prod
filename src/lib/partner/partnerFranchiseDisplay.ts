import type { UserModel } from "../models/UserModel";
import { fetchFranchiseById } from "../../services/franchiseService";

export function partnerFranchiseIdFromUser(
  user: UserModel | undefined | null
): string {
  if (!user) return "";
  const fid = user.franchise_id;
  if (typeof fid === "string") return fid.trim();
  if (fid && typeof fid === "object") {
    return String(fid._id ?? "").trim();
  }
  return "";
}

/** Sync fields from user row (flat or populated `franchise_id`). */
export function partnerFranchiseFieldsFromUser(
  user: UserModel | undefined | null
): { franchiseName: string; franchiseEmail: string } {
  if (!user) return { franchiseName: "—", franchiseEmail: "—" };
  const franchiseRef =
    user.franchise_id && typeof user.franchise_id === "object"
      ? user.franchise_id
      : null;
  const franchiseName =
    String(
      user.franchise_name ??
        franchiseRef?.name ??
        franchiseRef?.franchise_name ??
        ""
    ).trim() || "—";
  const franchiseEmail =
    String(user.franchise_email ?? franchiseRef?.email ?? "").trim() || "—";
  return { franchiseName, franchiseEmail };
}

/** Resolves franchise name/email; fetches `GET /franchise/get/:id` when only `franchise_id` is set. */
export async function resolvePartnerFranchiseFieldsFromUser(
  user: UserModel | undefined | null
): Promise<{ franchiseName: string; franchiseEmail: string }> {
  const sync = partnerFranchiseFieldsFromUser(user);
  const franchiseId = partnerFranchiseIdFromUser(user);
  const needsName = sync.franchiseName === "—";
  const needsEmail = sync.franchiseEmail === "—";
  if (!franchiseId || (!needsName && !needsEmail)) {
    return sync;
  }

  const franchise = await fetchFranchiseById(franchiseId, {
    skipAdminContactEnrichment: true,
  });
  if (!franchise) return sync;

  return {
    franchiseName: needsName
      ? String(franchise.name ?? "").trim() || "—"
      : sync.franchiseName,
    franchiseEmail: needsEmail
      ? String(franchise.email ?? "").trim() || "—"
      : sync.franchiseEmail,
  };
}
