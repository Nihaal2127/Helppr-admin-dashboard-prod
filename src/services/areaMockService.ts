import type { AreaModel } from "../lib/models/AreaModel";
import { locationAreaSeeds } from "../mockData/locationAreaMockData";
import { fetchStateDropDown } from "./stateService";
import { fetchCityDropDown } from "./cityService";

type AreaFilters = {
  name?: string;
  status?: string;
  sort?: string;
  state_id?: string;
  city_id?: string;
  franchise_id?: string;
};

type LocationAreaMockRow = AreaModel & {
  state_id: string;
  state_name: string;
  city_name: string;
  pincodes: string[];
};

function normalize(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

function paginate<T>(
  rows: T[],
  page: number,
  limit: number
): { records: T[]; totalPages: number } {
  const totalPages = rows.length ? Math.ceil(rows.length / limit) : 0;
  const start = Math.max(0, (page - 1) * limit);
  return { records: rows.slice(start, start + limit), totalPages };
}

function sortByName<T extends { name?: string | null }>(
  rows: T[],
  sort?: string
): T[] {
  const s = String(sort ?? "");
  if (s !== "1" && s !== "-1") return rows;
  const asc = s === "1";
  return [...rows].sort((a, b) => {
    const an = normalize(String(a.name ?? ""));
    const bn = normalize(String(b.name ?? ""));
    return asc ? an.localeCompare(bn) : bn.localeCompare(an);
  });
}

async function buildMockAreasFromDropdowns(): Promise<LocationAreaMockRow[]> {
  const stateOptions = await fetchStateDropDown();
  if (!stateOptions.length) return [];

  const stateBySeed = locationAreaSeeds
    .map((seed) => {
      const seedState = normalize(seed.state_label);
      const state = stateOptions.find((s) => normalize(s.label) === seedState);
      if (!state) return null;
      return { seed, stateId: state.value, stateLabel: state.label };
    })
    .filter(Boolean) as {
    seed: (typeof locationAreaSeeds)[number];
    stateId: string;
    stateLabel: string;
  }[];

  if (!stateBySeed.length) return [];

  const uniqueStateIds = Array.from(new Set(stateBySeed.map((x) => x.stateId)));
  const cityOptions = await fetchCityDropDown(uniqueStateIds);
  if (!cityOptions.length) return [];

  const rows: LocationAreaMockRow[] = [];

  for (const entry of stateBySeed) {
    const { seed, stateId, stateLabel } = entry;
    const seedCity = normalize(seed.city_label);
    const city = cityOptions.find(
      (c) => c.state_id === stateId && normalize(c.label) === seedCity
    );
    if (!city) continue;

    rows.push({
      _id:
        seed._id ||
        `dummy-${city.value}-${
          normalize(seed.name).replace(/\\s+/g, "") || "area"
        }`,
      name: seed.name,
      state_id: stateId,
      state_name: stateLabel,
      city_id: city.value,
      city_name: city.label,
      pincodes: [...seed.pincodes],
      is_active: seed.is_active,
      deleted_at: seed.deleted_at,
      created_at: seed.created_at,
      updated_at: seed.updated_at,
    });
  }

  return rows;
}

function applyFilters(
  list: LocationAreaMockRow[],
  filters: AreaFilters
): LocationAreaMockRow[] {
  return list.filter((item) => {
    const nameMatch = filters.name
      ? normalize(item.name).includes(normalize(filters.name))
      : true;
    const stateMatch = filters.state_id
      ? item.state_id === filters.state_id
      : true;
    const cityMatch = filters.city_id ? item.city_id === filters.city_id : true;

    const statusMatch =
      filters.status && filters.status !== "All"
        ? String(Boolean(item.is_active)) === normalize(filters.status)
        : true;

    // Franchise filter is accepted but not applied here because
    // mock areas are not coupled directly to franchise ids.
    return nameMatch && stateMatch && cityMatch && statusMatch;
  });
}

export async function fetchMockAreas(
  page: number,
  pageSize: number,
  filters: AreaFilters
): Promise<{ response: boolean; areas: AreaModel[]; totalPages: number }> {
  const baseRows = await buildMockAreasFromDropdowns();
  if (!baseRows.length) {
    return {
      response: true,
      areas: [],
      totalPages: 0,
    };
  }

  let filtered = applyFilters(baseRows, filters);
  filtered = sortByName(filtered, filters.sort);

  const { records, totalPages } = paginate(filtered, page, pageSize);
  return {
    response: true,
    areas: records as AreaModel[],
    totalPages,
  };
}
