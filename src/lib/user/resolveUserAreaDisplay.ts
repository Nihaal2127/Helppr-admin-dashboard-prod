import { fetchAreaById, fetchAreaDropDown } from "../../services/areaService";
import type { UserModel } from "../models/UserModel";

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** Read area label from API shapes: `area_name`, populated `area`, or populated `area_id`. */
export function extractAreaNameFromRecord(
  record: Record<string, unknown> | null | undefined
): string {
  if (!record) return "";
  const direct = str(record.area_name ?? record.areaname);
  if (direct) return direct;

  const areaRef = record.area;
  if (areaRef && typeof areaRef === "object" && !Array.isArray(areaRef)) {
    const name = str(
      (areaRef as Record<string, unknown>).name ??
        (areaRef as Record<string, unknown>).area_name
    );
    if (name) return name;
  }

  const areaIdRaw = record.area_id;
  if (
    areaIdRaw &&
    typeof areaIdRaw === "object" &&
    !Array.isArray(areaIdRaw)
  ) {
    const name = str(
      (areaIdRaw as Record<string, unknown>).name ??
        (areaIdRaw as Record<string, unknown>).area_name
    );
    if (name) return name;
  }

  return "";
}

export function extractAreaIdFromRecord(
  record: Record<string, unknown> | null | undefined
): string {
  if (!record) return "";
  const raw = record.area_id;
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string" || typeof raw === "number") return str(raw);
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return str(
      (raw as Record<string, unknown>)._id ?? (raw as Record<string, unknown>).id
    );
  }
  return "";
}

/** Resolve partner/user area label; fetches `GET /area/get/:id` when only `area_id` is present. */
export async function resolveUserAreaDisplayName(
  user: UserModel | null | undefined
): Promise<string> {
  if (!user) return "";
  const rec = user as unknown as Record<string, unknown>;
  const sync = extractAreaNameFromRecord(rec);
  if (sync) return sync;

  const areaId = extractAreaIdFromRecord(rec);
  if (!areaId) return "";

  const { response, area } = await fetchAreaById(areaId);
  if (response && area) {
    const fromGet = str(area.name ?? area.area_name);
    if (fromGet) return fromGet;
  }

  const cityId = str(rec.city_id);
  const stateId = str(rec.state_id);
  if (cityId) {
    const opts = await fetchAreaDropDown(cityId, stateId || undefined);
    const match = opts.find((o) => o.value === areaId);
    if (match?.label) return match.label;
  }

  return areaId;
}

/** Ensures `user.area_name` is set when the API only returns `area_id`. */
export async function enrichUserWithAreaName(
  user: UserModel | null
): Promise<UserModel | null> {
  if (!user) return null;
  if (str(user.area_name)) return user;
  const display = await resolveUserAreaDisplayName(user);
  if (!display) return user;
  return { ...user, area_name: display };
}
