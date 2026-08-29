import { fetchAreaById } from "../../services/areaService";
import { fetchFranchise } from "../../services/franchiseService";
import type { FranchiseModel } from "../models/FranchiseModels";
import { collectFranchiseAreaIds } from "../quote/quoteHelpers";

export type ResolvedFranchiseForArea = {
  franchiseId: string;
  franchiseName: string;
};

export type ResolveFranchiseForAreaOptions = {
  cityId?: string;
  /** Area display name from the form dropdown (needed when franchise stores names, not ids). */
  areaName?: string;
};

function isMongoObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(String(value ?? "").trim());
}

function toIdList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const x of raw) {
      if (x && typeof x === "object") {
        const id = String(
          (x as Record<string, unknown>)._id ??
            (x as Record<string, unknown>).id ??
            ""
        ).trim();
        if (id) out.push(id);
        continue;
      }
      const id = String(x ?? "").trim();
      if (id) out.push(id);
    }
    return Array.from(new Set(out));
  }
  if (raw && typeof raw === "object") {
    const id = String(
      (raw as Record<string, unknown>)._id ??
        (raw as Record<string, unknown>).id ??
        ""
    ).trim();
    return id ? [id] : [];
  }
  const s = String(raw ?? "").trim();
  return s ? [s] : [];
}

function toNameList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const names: string[] = [];
    for (const x of raw) {
      if (x == null) continue;
      if (typeof x === "string" || typeof x === "number") {
        const s = String(x).trim();
        if (s && !isMongoObjectId(s)) names.push(s);
        continue;
      }
      if (typeof x === "object") {
        const name = String(
          (x as Record<string, unknown>).name ??
            (x as Record<string, unknown>).area_name ??
            (x as Record<string, unknown>).label ??
            ""
        ).trim();
        if (name) names.push(name);
      }
    }
    return Array.from(new Set(names));
  }
  if (raw && typeof raw === "object") {
    const name = String(
      (raw as Record<string, unknown>).name ??
        (raw as Record<string, unknown>).area_name ??
        ""
    ).trim();
    return name ? [name] : [];
  }
  const s = String(raw ?? "").trim();
  return s && !isMongoObjectId(s) ? [s] : [];
}

function franchiseIdsFromAreaRecord(
  area: Record<string, unknown> | null
): string[] {
  if (!area) return [];
  if (area.franchise_id && typeof area.franchise_id === "object") {
    const id = String(
      (area.franchise_id as Record<string, unknown>)._id ??
        (area.franchise_id as Record<string, unknown>).id ??
        ""
    ).trim();
    if (id) return [id];
  }
  const single = String(area.franchise_id ?? "").trim();
  if (single) return [single];
  return toIdList(area.franchise_ids ?? area.franchises);
}

function franchiseAreaNames(franchise: FranchiseModel): string[] {
  const record = franchise as unknown as Record<string, unknown>;
  const fromField = toNameList(record.area_name ?? record.areaname);
  const fromIds = collectFranchiseAreaIds(record).filter(
    (x) => !isMongoObjectId(x)
  );
  const fromAreas = toNameList(record.areas);
  return Array.from(new Set([...fromField, ...fromIds, ...fromAreas]));
}

function franchiseMatchesArea(
  franchise: FranchiseModel,
  areaId: string,
  areaName?: string
): boolean {
  const record = franchise as unknown as Record<string, unknown>;
  const ids = collectFranchiseAreaIds(record);
  if (areaId && ids.includes(areaId)) return true;

  const name = String(areaName ?? "").trim().toLowerCase();
  if (!name) return false;
  return franchiseAreaNames(franchise).some(
    (n) => n.trim().toLowerCase() === name
  );
}

function franchiseContainsCity(
  franchise: FranchiseModel,
  cityId: string
): boolean {
  if (!cityId) return false;
  const cities = toIdList(franchise.city_id);
  return cities.includes(cityId);
}

function pickBestFranchise(
  matches: FranchiseModel[],
  cityId?: string
): FranchiseModel | null {
  if (matches.length === 0) return null;
  const city = String(cityId ?? "").trim();
  const active = matches.filter((f) => f.is_active !== false);
  const pool = active.length > 0 ? active : matches;
  if (city) {
    const withCity = pool.filter((f) => franchiseContainsCity(f, city));
    if (withCity.length > 0) return withCity[0];
  }
  return pool[0];
}

async function findFranchiseViaList(
  areaId: string,
  cityId?: string,
  areaName?: string
): Promise<ResolvedFranchiseForArea | null> {
  const city = String(cityId ?? "").trim();
  const byId = new Map<string, FranchiseModel>();

  const collectPage = async (page: number, withCity: boolean) => {
    // Franchise getAll expects is_active=true|false (not "active").
    const res = await fetchFranchise(
      page,
      100,
      {
        ...(withCity && city ? { city_id: city } : {}),
        status: "true",
      },
      []
    );
    if (!res.response) return { totalPages: 0, count: 0 };
    for (const row of res.franchises ?? []) {
      const id = String(row._id ?? "").trim();
      if (id) byId.set(id, row);
    }
    return {
      totalPages: Number(res.totalPages) || 0,
      count: (res.franchises ?? []).length,
    };
  };

  const findInCollected = (): ResolvedFranchiseForArea | null => {
    const matches = Array.from(byId.values()).filter((f) =>
      franchiseMatchesArea(f, areaId, areaName)
    );
    const best = pickBestFranchise(matches, city);
    if (!best?._id) return null;
    return {
      franchiseId: String(best._id).trim(),
      franchiseName: String(best.name ?? "").trim() || String(best._id).trim(),
    };
  };

  // Prefer city-scoped list first, then fall back to unscoped pages.
  for (const withCity of city ? [true, false] : [false]) {
    for (let page = 1; page <= 10; page += 1) {
      const { totalPages, count } = await collectPage(page, withCity);
      if (count === 0) break;
      if (page >= totalPages) break;
    }
    const found = findInCollected();
    if (found) return found;
    if (withCity) byId.clear();
  }

  // Last resort: include inactive franchises (still linked to the area).
  byId.clear();
  for (let page = 1; page <= 10; page += 1) {
    const res = await fetchFranchise(
      page,
      100,
      {
        ...(city ? { city_id: city } : {}),
      },
      []
    );
    if (!res.response) break;
    for (const row of res.franchises ?? []) {
      const id = String(row._id ?? "").trim();
      if (id) byId.set(id, row);
    }
    const totalPages = Number(res.totalPages) || 0;
    const count = (res.franchises ?? []).length;
    if (count === 0 || page >= totalPages) break;
  }
  if (!city) {
    // already unscoped above
  } else {
    // Also scan without city filter if city-scoped miss.
    for (let page = 1; page <= 10; page += 1) {
      const res = await fetchFranchise(page, 100, {}, []);
      if (!res.response) break;
      for (const row of res.franchises ?? []) {
        const id = String(row._id ?? "").trim();
        if (id) byId.set(id, row);
      }
      const totalPages = Number(res.totalPages) || 0;
      const count = (res.franchises ?? []).length;
      if (count === 0 || page >= totalPages) break;
    }
  }

  return findInCollected();
}

/**
 * Resolve which franchise owns a partner service area.
 * Prefer area record franchise refs; else match franchise area_id / area_name lists.
 */
export async function resolveFranchiseForArea(
  areaId: string,
  cityIdOrOptions?: string | ResolveFranchiseForAreaOptions
): Promise<ResolvedFranchiseForArea | null> {
  const aid = String(areaId ?? "").trim();
  if (!aid) return null;

  const opts: ResolveFranchiseForAreaOptions =
    typeof cityIdOrOptions === "string" || cityIdOrOptions == null
      ? { cityId: cityIdOrOptions }
      : cityIdOrOptions;
  const cityId = String(opts.cityId ?? "").trim();
  let areaName = String(opts.areaName ?? "").trim();

  const areaRes = await fetchAreaById(aid);
  if (!areaName && areaRes.area) {
    areaName = String(
      areaRes.area.name ?? areaRes.area.area_name ?? ""
    ).trim();
  }

  const fromArea = franchiseIdsFromAreaRecord(areaRes.area);
  if (fromArea.length === 1) {
    const franchiseId = fromArea[0];
    const nameFromPopulated =
      areaRes.area &&
      typeof areaRes.area.franchise_id === "object" &&
      areaRes.area.franchise_id
        ? String(
            (areaRes.area.franchise_id as Record<string, unknown>).name ??
              (areaRes.area.franchise_id as Record<string, unknown>)
                .franchise_name ??
              ""
          ).trim()
        : "";
    if (nameFromPopulated) {
      return { franchiseId, franchiseName: nameFromPopulated };
    }
    const viaList = await findFranchiseViaList(aid, cityId, areaName);
    if (viaList && viaList.franchiseId === franchiseId) return viaList;
    return {
      franchiseId,
      franchiseName: nameFromPopulated || franchiseId,
    };
  }

  return findFranchiseViaList(aid, cityId, areaName);
}
