import { apiRequest } from "../lib/global/remote/apiHelper";
import { ApiPaths } from "../lib/global/remote/apiPaths";
import { showLog } from "../helper/utility";
import { franchiseIdForApiQuery } from "../lib/franchise/headerFranchisePreference";
import type { AppointmentStatusApi } from "../lib/calendar/appointmentStatus";
import { normalizeCalendarYmd } from "../helper/dateFormat";

export type AppointmentSource = "auto" | "manual";

export type AppointmentModel = {
  _id: string;
  unique_id: string | null;
  title: string;
  order_id: string;
  order_mongo_id: string | null;
  order_unique_id: string;
  partner_name: string;
  service_name: string;
  service_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatusApi;
  source: AppointmentSource | null;
};

export type AppointmentListFilters = {
  from_date?: string;
  to_date?: string;
  franchise_id?: string | null;
  order_id?: string;
  status?: AppointmentStatusApi;
  keyword?: string;
};

export type AppointmentCreatePayload = {
  order_id: string;
  service_date: string;
  title?: string;
  status?: AppointmentStatusApi;
  start_time?: string;
  end_time?: string;
};

export type AppointmentUpdatePayload = {
  title?: string;
  service_date?: string;
  start_time?: string;
  end_time?: string;
  status?: AppointmentStatusApi;
};

function str(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "undefined" || s === "null" ? "" : s;
}

function normalizeStatus(raw: unknown): AppointmentStatusApi {
  const s = str(raw).toLowerCase().replace(/_/g, "-");
  if (s === "in-progress") return "in-progress";
  if (s === "completed") return "completed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  return "scheduled";
}

function normalizeTime(raw: unknown): string {
  const s = str(raw);
  if (!s) return "";
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) {
    return `${String(parseInt(m24[1], 10)).padStart(2, "0")}:${m24[2]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`;
    }
  }
  const isoPart = s.includes("T") ? s.split("T")[1] : s;
  return isoPart.slice(0, 5);
}

function normalizeServiceDate(raw: unknown): string {
  const s = str(raw);
  if (!s) return "";
  const ymd = normalizeCalendarYmd(s.split("T")[0]);
  return ymd ?? s.split("T")[0];
}

export function mapAppointmentRecord(
  raw: Record<string, unknown>
): AppointmentModel {
  const mongoId = str(raw._id);
  const orderMongo = str(
    raw.order_mongo_id ?? raw.orderMongoId ?? raw.order_id
  );
  const orderUnique = str(
    raw.order_unique_id ?? raw.orderUniqueId ?? raw.order_display_id
  );
  return {
    _id: mongoId,
    unique_id: str(raw.unique_id) || null,
    title: str(raw.title) || str(raw.service_name) || "Appointment",
    order_id: orderMongo || orderUnique,
    order_mongo_id: orderMongo || null,
    order_unique_id: orderUnique || orderMongo,
    partner_name: str(raw.partner_name) || "-",
    service_name: str(raw.service_name) || "-",
    service_date: normalizeServiceDate(raw.service_date),
    start_time: normalizeTime(
      raw.start_time ??
        raw.service_from_time ??
        raw.from_time ??
        raw.work_start_time
    ),
    end_time: normalizeTime(
      raw.end_time ?? raw.service_to_time ?? raw.to_time ?? raw.work_end_time
    ),
    status: normalizeStatus(raw.status),
    source:
      str(raw.source).toLowerCase() === "manual"
        ? "manual"
        : str(raw.source).toLowerCase() === "auto"
          ? "auto"
          : null,
  };
}

function parseListEnvelope(response: {
  success?: boolean;
  data?: Record<string, unknown>;
  message?: string;
}): {
  records: Record<string, unknown>[];
  totalPages: number;
} {
  if (!response.success) {
    return { records: [], totalPages: 0 };
  }
  const d = response.data ?? {};
  const inner =
    d.data != null && typeof d.data === "object" && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : null;
  const recordsRaw = (inner?.records ?? d.records ?? []) as unknown[];
  const records = Array.isArray(recordsRaw) ? recordsRaw : [];
  const totalPagesVal = Number(
    inner?.totalPages ?? d.totalPages ?? inner?.total_pages ?? d.total_pages ?? 0
  );
  const totalItems = Number(
    inner?.totalItems ?? d.totalItems ?? inner?.total_items ?? d.total_items ?? 0
  );
  const inferredPages =
    totalPagesVal > 0
      ? totalPagesVal
      : totalItems > 0 && records.length > 0
        ? Math.ceil(totalItems / records.length)
        : records.length > 0
          ? 1
          : 0;
  return {
    records: records.filter(
      (r) => r != null && typeof r === "object" && !Array.isArray(r)
    ) as Record<string, unknown>[],
    totalPages: inferredPages,
  };
}

function parseRecordEnvelope(response: {
  success?: boolean;
  data?: Record<string, unknown>;
}): Record<string, unknown> | null {
  if (!response.success) return null;
  const d = response.data ?? {};
  if (d.record != null && typeof d.record === "object" && !Array.isArray(d.record)) {
    return d.record as Record<string, unknown>;
  }
  const inner = d.data;
  if (
    inner != null &&
    typeof inner === "object" &&
    !Array.isArray(inner) &&
    (inner as Record<string, unknown>).record != null
  ) {
    const rec = (inner as Record<string, unknown>).record;
    if (rec != null && typeof rec === "object" && !Array.isArray(rec)) {
      return rec as Record<string, unknown>;
    }
  }
  if (d._id != null) return d;
  if (
    inner != null &&
    typeof inner === "object" &&
    !Array.isArray(inner) &&
    (inner as Record<string, unknown>)._id != null
  ) {
    return inner as Record<string, unknown>;
  }
  return null;
}

function buildListQueryParams(
  page: number,
  pageSize: number,
  filters: AppointmentListFilters
): URLSearchParams {
  const fid = franchiseIdForApiQuery(filters.franchise_id);
  const keyword = filters.keyword?.trim();
  return new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(filters.from_date?.trim() && { from_date: filters.from_date.trim() }),
    ...(filters.to_date?.trim() && { to_date: filters.to_date.trim() }),
    ...(filters.order_id?.trim() && { order_id: filters.order_id.trim() }),
    ...(filters.status && { status: filters.status }),
    ...(keyword && { keyword }),
    ...(fid ? { franchise_id: fid } : {}),
  });
}

/** `GET /api/appointment/getAll` — one page. */
export async function fetchAppointments(
  page: number,
  pageSize: number,
  filters: AppointmentListFilters,
  requestOpts?: { skipLoader?: boolean }
): Promise<{
  response: boolean;
  appointments: AppointmentModel[];
  totalPages: number;
}> {
  const params = buildListQueryParams(page, pageSize, filters);
  const response = await apiRequest(
    `${ApiPaths.APPOINTMENT_GET_ALL()}?${params.toString()}`,
    "GET",
    undefined,
    false,
    requestOpts?.skipLoader ?? false
  );
  const { records: raw, totalPages } = parseListEnvelope(response);
  if (!response.success) {
    showLog(response.message || "Failed to fetch appointments");
    return { response: false, appointments: [], totalPages: 0 };
  }
  return {
    response: true,
    appointments: raw.map(mapAppointmentRecord),
    totalPages: Math.max(0, totalPages),
  };
}

/** All appointment rows matching filters (paginated fetch). */
export async function fetchAllAppointmentsMatching(
  filters: AppointmentListFilters,
  batchSize = 100,
  requestOpts?: { skipLoader?: boolean }
): Promise<AppointmentModel[] | null> {
  const first = await fetchAppointments(
    1,
    batchSize,
    filters,
    requestOpts
  );
  if (!first.response) return null;
  let all = [...first.appointments];
  const totalPages = Math.max(1, first.totalPages);
  for (let p = 2; p <= totalPages; p++) {
    const next = await fetchAppointments(p, batchSize, filters, {
      skipLoader: true,
    });
    if (!next.response) break;
    all = all.concat(next.appointments);
  }
  return all;
}

/** `GET /api/appointment/get/:id` */
export async function fetchAppointmentById(
  id: string,
  requestOpts?: { skipLoader?: boolean }
): Promise<{ response: boolean; appointment: AppointmentModel | null }> {
  const mongoId = str(id);
  if (!mongoId) return { response: false, appointment: null };
  const response = await apiRequest(
    ApiPaths.APPOINTMENT_GET_BY_ID(mongoId),
    "GET",
    undefined,
    false,
    requestOpts?.skipLoader ?? true
  );
  const row = parseRecordEnvelope(response);
  if (!row) {
    if (!response.success) {
      showLog(response.message || "Failed to load appointment");
    }
    return { response: false, appointment: null };
  }
  return { response: true, appointment: mapAppointmentRecord(row) };
}

/** `POST /api/appointment/create` */
export async function createAppointment(
  payload: AppointmentCreatePayload
): Promise<{ response: boolean; appointment: AppointmentModel | null }> {
  const response = await apiRequest(
    ApiPaths.APPOINTMENT_CREATE,
    "POST",
    payload
  );
  const row = parseRecordEnvelope(response);
  if (!row) {
    if (!response.success) {
      showLog(response.message || "Failed to create appointment");
    }
    return { response: false, appointment: null };
  }
  return { response: true, appointment: mapAppointmentRecord(row) };
}

/** `PUT /api/appointment/update/:id` */
export async function updateAppointment(
  id: string,
  payload: AppointmentUpdatePayload
): Promise<{ response: boolean; appointment: AppointmentModel | null }> {
  const mongoId = str(id);
  if (!mongoId) return { response: false, appointment: null };
  const response = await apiRequest(
    ApiPaths.APPOINTMENT_UPDATE(mongoId),
    "PUT",
    payload,
    false,
    false,
    false,
    true
  );
  const row = parseRecordEnvelope(response);
  if (!row) {
    if (!response.success) {
      showLog(response.message || "Failed to update appointment");
    }
    return { response: false, appointment: null };
  }
  return { response: true, appointment: mapAppointmentRecord(row) };
}

/** `DELETE /api/appointment/delete/:id` — soft delete. */
export async function deleteAppointment(id: string): Promise<boolean> {
  const mongoId = str(id);
  if (!mongoId) return false;
  const response = await apiRequest(
    ApiPaths.APPOINTMENT_DELETE(mongoId),
    "DELETE",
    undefined,
    false,
    false,
    false,
    true
  );
  if (!response.success) {
    showLog(response.message || "Failed to void appointment");
    return false;
  }
  return true;
}
