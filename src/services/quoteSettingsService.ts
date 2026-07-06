import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { showErrorAlert } from "../lib/global/alertHelper";
import { QuoteSettingsModel } from "../lib/models/QuoteSettingsModel";

export type QuoteSettingsPayload = {
  free_quotes_per_user: number;
  no_of_quotes: number;
  quotes_price: number;
};

function pickQuoteSettingsRecord(data: unknown): QuoteSettingsModel | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;

  const candidates: unknown[] = [
    root.record,
    nested?.record,
    nested,
    root._id ? root : null,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const rec = candidate as Record<string, unknown>;
    if (rec._id != null || rec.free_quotes_per_user != null) {
      return candidate as QuoteSettingsModel;
    }
  }
  return null;
}

function isQuoteSettingsAlreadyExistsMessage(message: unknown): boolean {
  const msg = String(message ?? "").trim().toLowerCase();
  return msg.includes("already exist") || msg.includes("use update");
}

export const fetchQuoteSettings = async (): Promise<{
  response: boolean;
  quoteSettings: QuoteSettingsModel | null;
}> => {
  const response = await apiRequest(
    `${ApiPaths.GET_QUOTE_SETTINGS()}`,
    "GET",
    undefined,
    false,
    false,
    true
  );
  if (response.success) {
    const record = pickQuoteSettingsRecord(response.data);
    return {
      response: Boolean(record),
      quoteSettings: record,
    };
  }
  if (response.status === 404) {
    return {
      response: false,
      quoteSettings: null,
    };
  }
  if (response.message && !isQuoteSettingsAlreadyExistsMessage(response.message)) {
    showErrorAlert(response.message);
  }
  return {
    response: false,
    quoteSettings: null,
  };
};

export const createOrUpdateQuoteSettings = async (
  payload: QuoteSettingsPayload,
  isEditable: boolean,
  id?: string
): Promise<boolean> => {
  const path = isEditable
    ? ApiPaths.UPDATE_QUOTE_SETTINGS(id!)
    : ApiPaths.CREATE_QUOTE_SETTINGS;
  const method = isEditable ? "PUT" : "POST";

  const response = await apiRequest(path, method, payload);
  if (response.success) {
    return true;
  }
  return false;
};

/** Create or update singleton quote settings (retries as update when create conflicts). */
export const saveQuoteSettings = async (
  payload: QuoteSettingsPayload,
  quoteSettings: QuoteSettingsModel | null
): Promise<boolean> => {
  if (quoteSettings?._id) {
    return createOrUpdateQuoteSettings(payload, true, quoteSettings._id);
  }

  const createResponse = await apiRequest(
    ApiPaths.CREATE_QUOTE_SETTINGS,
    "POST",
    payload,
    false,
    false,
    true
  );
  if (createResponse.success) {
    return true;
  }

  if (isQuoteSettingsAlreadyExistsMessage(createResponse.message)) {
    const { quoteSettings: existing } = await fetchQuoteSettings();
    if (existing?._id) {
      return createOrUpdateQuoteSettings(payload, true, existing._id);
    }
  }

  showErrorAlert(createResponse.message || "Request failed");
  return false;
};
