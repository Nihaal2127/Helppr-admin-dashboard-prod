/**
 * Pure address helpers (no React, no quoteService).
 * Kept separate so quoteService can import without circular dependency on quoteHelpers.
 */

/** Normalize to digits only (Indian PIN is 6 digits). */
export function normalizePincodeDigits(raw: unknown): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length >= 6) return d.slice(0, 6);
  return d;
}

function strTrim(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "undefined" || s === "null" ? "" : s;
}

/** Expand very short state tokens when the API sends abbreviations (e.g. AP). */
export function displayStateName(raw: string): string {
  const t = strTrim(raw);
  if (!t) return "";
  if (t.length > 3) return t;
  const abbr: Record<string, string> = {
    AP: "Andhra Pradesh",
    TG: "Telangana",
    TS: "Telangana",
    TN: "Tamil Nadu",
    KA: "Karnataka",
    KL: "Kerala",
    MH: "Maharashtra",
    DL: "Delhi",
    UP: "Uttar Pradesh",
    GJ: "Gujarat",
    WB: "West Bengal",
    BR: "Bihar",
    MP: "Madhya Pradesh",
    RJ: "Rajasthan",
    OD: "Odisha",
    OR: "Odisha",
    PB: "Punjab",
    HR: "Haryana",
  };
  const key = t.toUpperCase();
  return abbr[key] ?? t;
}

function nestedObj(v: unknown): Record<string, unknown> | undefined {
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}

/** Object id or plain string/number id from API refs (`city_id`, `state_id`, …). */
export function refIdFromField(field: unknown): string {
  if (field == null) return "";
  if (typeof field === "string" || typeof field === "number") {
    return strTrim(field);
  }
  const o = nestedObj(field);
  return strTrim(o?._id ?? o?.id);
}

export type AddressLocationLookups = {
  cityById: Map<string, string>;
  stateById: Map<string, string>;
  areaById: Map<string, string>;
};

/**
 * Build city/state/area name maps from all franchise-catalog customers.
 * Related-catalog often sends `city: ""` / `state: ""` with only `city_id` / `state_id`.
 */
export function buildAddressLocationLookupsFromCustomers(
  customers: Record<string, unknown>[]
): AddressLocationLookups {
  const cityById = new Map<string, string>();
  const stateById = new Map<string, string>();
  const areaById = new Map<string, string>();

  const ingest = (rec: Record<string, unknown>) => {
    const cityId = refIdFromField(rec.city_id);
    const cityName = strTrim(
      rec.city_name ?? rec.city ?? nestedObj(rec.city_id)?.name
    );
    if (cityId && cityName) cityById.set(cityId, cityName);

    const stateId = refIdFromField(rec.state_id);
    const stateName = displayStateName(
      strTrim(rec.state_name ?? rec.state ?? nestedObj(rec.state_id)?.name)
    );
    if (stateId && stateName) stateById.set(stateId, stateName);

    const areaId = strTrim(rec.area_id);
    const areaName = strTrim(rec.area_name ?? rec.area);
    if (areaId && areaName) areaById.set(areaId, areaName);
  };

  for (const customer of customers) {
    ingest(customer);
    const addrs = (customer.addresses ?? customer.user_addresses) as
      | unknown[]
      | undefined;
    if (!Array.isArray(addrs)) continue;
    for (const a of addrs) {
      if (a != null && typeof a === "object") {
        ingest(a as Record<string, unknown>);
      }
    }
  }

  return { cityById, stateById, areaById };
}

export type QuoteAddressFieldFallback = {
  addressId?: string;
  state?: string;
  city?: string;
  area?: string;
  street?: string;
  landmark?: string;
  pincode?: string;
};

export type ParsedCatalogAddressRow = {
  id: string;
  summary: string;
  pinNorm: string;
  areaId: string;
  contactName: string;
  stateName: string;
  cityName: string;
  areaName: string;
  streetAddress: string;
  landmark: string;
  pincode: string;
};

/** Parse one saved address from related-catalog (same rules as GET /quote/get `address_id`). */
export function parseCatalogAddressRecord(
  rec: Record<string, unknown>,
  lookups?: AddressLocationLookups,
  fallback?: QuoteAddressFieldFallback
): ParsedCatalogAddressRow | null {
  const id = strTrim(rec._id);
  if (!id) return null;

  const useFallback =
    fallback?.addressId && id === String(fallback.addressId).trim();

  let stateName = displayStateName(
    strTrim(rec.state_name ?? rec.state ?? nestedObj(rec.state_id)?.name)
  );
  let cityName = strTrim(
    rec.city_name ?? rec.city ?? nestedObj(rec.city_id)?.name
  );
  let areaName = strTrim(rec.area_name ?? rec.area);

  if (lookups) {
    if (!stateName) {
      const sid = refIdFromField(rec.state_id);
      if (sid) stateName = lookups.stateById.get(sid) ?? "";
    }
    if (!cityName) {
      const cid = refIdFromField(rec.city_id);
      if (cid) cityName = lookups.cityById.get(cid) ?? "";
    }
    if (!areaName) {
      const aid = strTrim(rec.area_id);
      if (aid) areaName = lookups.areaById.get(aid) ?? "";
    }
  }

  if (useFallback && fallback) {
    if (!stateName) stateName = displayStateName(strTrim(fallback.state));
    if (!cityName) cityName = strTrim(fallback.city);
    if (!areaName) areaName = strTrim(fallback.area);
  }

  const landmark = strTrim(rec.landmark) || (useFallback ? strTrim(fallback?.landmark) : "");
  const door = strTrim(rec.door_no);
  const street = strTrim(rec.street ?? rec.address_line);
  const freeform = strTrim(rec.address);
  let streetAddress = [door, street].filter(Boolean).join(", ");
  if (!streetAddress) {
    streetAddress = freeform;
    if (streetAddress) {
      streetAddress = stripKnownAddressParts(streetAddress, [
        stateName,
        cityName,
        areaName,
      ]);
    }
  }
  if (!streetAddress && useFallback) {
    streetAddress = strTrim(fallback?.street);
  }

  const pincode =
    strTrim(rec.pincode ?? rec.postal_code ?? rec.postcode) ||
    (useFallback ? strTrim(fallback?.pincode) : "");

  return {
    id,
    summary: formatAddressLineFromRecord({
      ...rec,
      state: stateName || rec.state,
      city: cityName || rec.city,
      area: areaName || rec.area,
    }),
    pinNorm: normalizePincodeDigits(
      rec.pincode ?? rec.postal_code ?? rec.postcode ?? fallback?.pincode
    ),
    areaId: strTrim(rec.area_id),
    contactName: strTrim(rec.contact_name ?? rec.contactName) || "Address",
    stateName,
    cityName,
    areaName,
    streetAddress,
    landmark,
    pincode,
  };
}

export function formatAddressLineFromRecord(rec: Record<string, unknown>): string {
  const state = displayStateName(
    strTrim(rec.state_name ?? rec.state ?? nestedObj(rec.state_id)?.name)
  );
  const city = strTrim(rec.city_name ?? rec.city ?? nestedObj(rec.city_id)?.name);
  const parts = [
    strTrim(rec.door_no),
    strTrim(rec.street ?? rec.address_line ?? rec.address),
    strTrim(rec.area_name ?? rec.area),
    city,
    state,
    strTrim(rec.landmark),
    strTrim(rec.pincode),
  ].filter(Boolean);
  return parts.join(", ");
}

/** Removes state / city / area tokens already shown on other lines (API `address` is often a composite). */
export type ParsedCompositeAddressParts = {
  addressLine: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
};

/**
 * Split API composite `order.address` (e.g. "2-33, Sivapuram, 564543, Guntur, Andhra Pradesh")
 * when `address_info` has street/pincode but empty city/state/area strings.
 */
export function parseCompositeServiceAddressLine(
  flat: string,
  pincodeHint?: string
): ParsedCompositeAddressParts {
  const empty: ParsedCompositeAddressParts = {
    addressLine: "",
    area: "",
    city: "",
    state: "",
    pincode: "",
  };
  const raw = strTrim(flat);
  if (!raw) return empty;

  const parts = raw
    .split(",")
    .map((p) => strTrim(p))
    .filter(Boolean);
  if (!parts.length) return empty;

  let pincode = strTrim(pincodeHint);
  const pinIdx = parts.findIndex((p) => /^\d{6}$/.test(p));
  if (pinIdx >= 0) {
    if (!pincode) pincode = parts[pinIdx];
    parts.splice(pinIdx, 1);
  }

  if (parts.length === 1) {
    return { ...empty, addressLine: parts[0], pincode };
  }

  const state =
    parts.length >= 1 ? displayStateName(parts[parts.length - 1]) : "";
  const city = parts.length >= 2 ? parts[parts.length - 2] : "";
  const area = parts.length >= 3 ? parts[parts.length - 3] : "";
  const addressLine = parts.slice(0, Math.max(0, parts.length - 3)).join(", ");

  return {
    addressLine: addressLine || raw,
    area,
    city,
    state,
    pincode,
  };
}

export function stripKnownAddressParts(
  phrase: string,
  parts: Array<string | undefined | null>
): string {
  let s = strTrim(phrase);
  if (!s) return "";
  for (const raw of parts) {
    const token = strTrim(raw);
    if (!token || token.length < 2) continue;
    const re = new RegExp(
      `\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "gi"
    );
    s = s.replace(re, "");
  }
  return s
    .replace(/\s*,\s*,/g, ", ")
    .replace(/^\s*,\s*|\s*,\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type QuoteServiceAddressInput = {
  door_no?: string;
  street?: string;
  area?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

/**
 * Multi-line service address for quote view / table (structured `address_id` from GET /quote/get/:id).
 */
export function formatQuoteServiceAddressLines(
  q: QuoteServiceAddressInput
): string {
  const state = displayStateName(strTrim(q.state));
  const city = strTrim(q.city);
  const area = strTrim(q.area);
  const landmark = strTrim(q.landmark);
  const pincode = strTrim(q.pincode);
  const door = strTrim(q.door_no);

  let street = strTrim(q.street);
  if (street) {
    street = stripKnownAddressParts(street, [state, city, area]);
  }

  const line1 = [door, street].filter(Boolean).join(", ");
  let line2Parts = [area, landmark].filter(Boolean);
  if (
    street &&
    area &&
    street.toLowerCase() === area.toLowerCase()
  ) {
    line2Parts = landmark ? [landmark] : [];
  }
  const line2 = line2Parts.join(", ");
  const locality = [city, state].filter(Boolean).join(", ");
  const line3 = [locality, pincode].filter(Boolean).join(pincode ? " - " : "");

  const lines = [line1, line2, line3].filter(Boolean);
  if (lines.length) return lines.join("\n");

  const fallback = [street, area, city, state, pincode].filter(Boolean).join(", ");
  return fallback || "-";
}

export type QuoteAddressRowUi = {
  id: string;
  summary: string;
  selectable: boolean;
  contactName: string;
  stateName: string;
  cityName: string;
  areaName: string;
  streetAddress: string;
  landmark: string;
  pincode: string;
};

/** Single-line service address for order/quote payloads. */
export function formatQuoteAddressRowAsServiceLine(
  row: QuoteAddressRowUi
): string {
  const parts = [
    row.streetAddress,
    row.landmark,
    row.areaName,
    row.pincode,
    row.cityName,
    row.stateName,
  ]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  return parts.join(", ");
}
