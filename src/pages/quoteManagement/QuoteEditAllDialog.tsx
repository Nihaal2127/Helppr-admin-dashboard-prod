import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, UseFormRegister } from "react-hook-form";
import { Button, Col, Form, InputGroup, Modal, Row } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import CustomTextFieldDatePicket from "../../components/CustomTextFieldDatePicket";
import CustomTextFieldSelect from "../../components/CustomTextFieldSelect";
import CustomTextFieldTimePicket from "../../components/CustomTextFieldTimePicket";
import { openDialog } from "../../lib/global/DialogManager";
import { showErrorAlert, showSuccessAlert } from "../../lib/global/alertHelper";
import { AppConstant, UserRole } from "../../lib/global/AppConstant";
import { getLocalStorage } from "../../lib/global/localStorageHelper";
import type { OptionType, QuoteUserOption } from "../../services/quoteService";
import {
  applyQuoteHeaderPatch,
  buildQuoteSchedulePricePreview,
  computeAutoQuotePriceFromPartner,
  convertQuoteToOrder,
  deriveQuoteScheduleMetrics,
  fetchFranchiseRelatedCatalog,
  fetchQuoteDetailById,
  buildQuoteCatalogServicesForPartner,
  buildQuoteCategoryOptionsForSelectedPartner,
  buildQuotePartnerOptionsForPrefilledService,
  buildQuotePrefilledCategoryOptions,
  buildQuotePrefilledServiceOptions,
  filterPartnerServicesForCategory,
  getPartnerActiveServiceProvidingRow,
  getQuoteScheduleModeForPartnerService,
  mapRelatedCatalogToQuoteOptions,
  mergeQuoteServiceFeesForBreakdown,
  normalizeQuoteApiStatus,
  resolveFranchiseIdForQuoteForm,
  updateQuote,
} from "../../services/quoteService";
import type { ServiceDropDownOption } from "../../services/servicesService";
import type { AddQuoteFormValues, QuoteRow } from "../../lib/types/quoteTypes";
import {
  buildFranchisePincodeSetFromRelatedCatalog,
  collectFranchiseAreaIds,
  computeQuotePriceBreakdown,
  QUOTE_MODAL_LAYOUT,
  QUOTE_SECTION_TITLE_CLASS,
  SCHEDULE_TIME_PICKER_INTERVAL_MINUTES,
  scheduleEndTimeMaxForDay,
  scheduleEndTimeMinAfterStart,
  seedEditQuoteFormFromRow,
  setQuoteFranchiseCatalogSnapshot,
  useQuoteCustomerAddressPanel,
} from "../../lib/quote/quoteHelpers";
import type { EditQuoteFormValues, QuoteAddressRowUi } from "../../lib/quote/quoteHelpers";
import QuotePriceBreakdownPanel from "../../components/quote/QuotePriceBreakdownPanel";
import QuoteAddressOptionsLoader from "../../components/quote/QuoteAddressOptionsLoader";
import { partnerCatalogControlStyle } from "../../components/partnerCatalogBlockUi";
import { FieldLabelText } from "../../components/RequiredFieldMark";
import {
  applyMissingRequiredFieldErrors,
  formatMissingRequiredFieldsAlert,
} from "../../lib/form/missingRequiredFields";
import type { MissingRequiredField } from "../../lib/form/missingRequiredFields";

const toTimeStorageFromDate = (date: Date | null): string =>
  date
    ? `2000-01-01T${String(date.getHours()).padStart(2, "0")}:${String(
        date.getMinutes()
      ).padStart(2, "0")}:00`
    : "";

const timeStorageOrNull = (v: string | undefined | null): string | null =>
  v && String(v).trim() ? v : null;

const toIsoCalendarDate = (date: Date | null): string | null => {
  if (!date) return null;
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseIsoDateOnly(iso: string): Date | null {
  const t = String(iso ?? "").trim();
  if (!t) return null;
  const parts = t.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const day = Number(parts[2]);
  if (!y || !m || !day) return null;
  const d = new Date(y, m - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function compareIsoDateOnlyAsc(aIso: string, bIso: string): number | null {
  const a = parseIsoDateOnly(aIso);
  const b = parseIsoDateOnly(bIso);
  if (!a || !b) return null;
  return startOfLocalDay(a).getTime() - startOfLocalDay(b).getTime();
}

function minutesFromScheduleTimeStorage(st: string): number | null {
  const t = String(st ?? "").trim();
  if (!t) return null;
  const m = t.match(/T(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function isScheduleEndAfterStartSameDay(start: string, end: string): boolean {
  const a = minutesFromScheduleTimeStorage(start);
  const b = minutesFromScheduleTimeStorage(end);
  if (a == null || b == null) return false;
  return b > a;
}

const scheduleTimeAllowAll = (): boolean => true;

function collectMissingQuoteEditRequiredFields(
  data: EditQuoteFormValues,
  scheduleMode: string,
  opts: {
    addressUiReady: boolean;
    addressRowsCount: number;
    selectedAddressId: string;
  }
): MissingRequiredField[] {
  const missing: MissingRequiredField[] = [];

  if (!String(data.requested_partner ?? "").trim()) {
    missing.push({ field: "requested_partner", label: "Partner" });
  }
  if (!String(data.category_id ?? "").trim()) {
    missing.push({ field: "category_id", label: "Category" });
  }
  if (!String(data.requested_services ?? "").trim()) {
    missing.push({ field: "requested_services", label: "Service" });
  }

  if (String(data.user_id ?? "").trim() && opts.addressUiReady) {
    if (!opts.selectedAddressId.trim()) {
      missing.push({ label: "Customer address" });
    }
  }

  const hasServiceSelected = Boolean(
    String(data.requested_services ?? "").trim()
  );
  if (hasServiceSelected) {
    if (!String(data.requested_date ?? "").trim()) {
      missing.push({
        field: "requested_date",
        label: scheduleMode === "range" ? "From date" : "Date",
      });
    }
    if (
      scheduleMode === "range" &&
      !String(data.requested_date_to ?? "").trim()
    ) {
      missing.push({ field: "requested_date_to", label: "To date" });
    }
    if (!String(data.requested_time_from ?? "").trim()) {
      missing.push({ field: "requested_time_from", label: "Start time" });
    }
    if (!String(data.requested_time_to ?? "").trim()) {
      missing.push({ field: "requested_time_to", label: "End time" });
    }
    const priceRaw = String(data.service_price ?? "").trim();
    const price = Number.parseFloat(priceRaw);
    if (!priceRaw || Number.isNaN(price) || price < 0) {
      missing.push({ field: "service_price", label: "Service price" });
    }
  }

  return missing;
}

type QuoteEditAllDialogProps = {
  quoteMongoId: string;
  onClose: () => void;
  onSaved?: () => void;
};

const STATUS_OPTIONS: OptionType[] = [
  { value: "new", label: "New" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
];

function QuoteAddressPanelError({ message }: { message: string }) {
  return <p className="small text-danger mb-2">{message}</p>;
}

const QuoteEditAllDialog: React.FC<QuoteEditAllDialogProps> & {
  show: (quoteMongoId: string, onSaved?: () => void) => void;
} = ({ quoteMongoId, onClose, onSaved }) => {
  const currentUserRole = String(getLocalStorage(AppConstant.userRole) ?? "");
  const isSuperAdminOrStaff =
    currentUserRole === UserRole.ADMIN ||
    currentUserRole === UserRole.STAFF;

  const [quoteRow, setQuoteRow] = useState<QuoteRow | null>(null);
  const [loadError, setLoadError] = useState("");
  const [catalogBusy, setCatalogBusy] = useState(false);

  const [quoteCategoryOptions, setQuoteCategoryOptions] = useState<
    OptionType[]
  >([]);
  const [quoteCatalogServices, setQuoteCatalogServices] = useState<
    ServiceDropDownOption[]
  >([]);
  const [quoteEmployeeOptions, setQuoteEmployeeOptions] = useState<
    OptionType[]
  >([]);
  const [catalogPartnerRecords, setCatalogPartnerRecords] = useState<
    Record<string, unknown>[]
  >([]);
  const [quotePartnerOptions, setQuotePartnerOptions] = useState<OptionType[]>(
    []
  );
  const [quoteUserOptions, setQuoteUserOptions] = useState<QuoteUserOption[]>(
    []
  );
  const [quoteCustomerRecords, setQuoteCustomerRecords] = useState<
    Record<string, unknown>[]
  >([]);
  const [franchiseQuotePinSet, setFranchiseQuotePinSet] = useState<Set<string>>(
    () => new Set()
  );
  const [franchiseQuoteAreaIdSet, setFranchiseQuoteAreaIdSet] = useState<
    Set<string>
  >(() => new Set());
  const [franchisePinsLoadDone, setFranchisePinsLoadDone] = useState(false);
  const [franchiseCatalogName, setFranchiseCatalogName] = useState("");

  const catalogSeqRef = useRef(0);
  const initialStatusKeyRef = useRef("");
  const skipAutoPriceRef = useRef(true);
  const skipScheduleRevalidateRef = useRef(true);
  const [apiServiceFees, setApiServiceFees] = useState<
    ServiceDropDownOption | undefined
  >(undefined);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    getValues,
    setError,
    formState: { errors, isSubmitted },
  } = useForm<EditQuoteFormValues>({
    defaultValues: {
      franchise_id: "",
      user_id: "",
      user_name: "",
      requested_services: "",
      requested_partner: "",
      employee_id: "",
      category_id: "",
      requested_date: "",
      requested_date_to: "",
      requested_time: "",
      requested_time_from: "",
      requested_time_to: "",
      service_price: "",
      user_description: "",
      admin_description: "",
      quote_status: "new",
    },
  });

  const form = watch();
  const isNewTabQuoteEdit = useMemo(
    () => normalizeQuoteApiStatus(quoteRow?.status) === "new",
    [quoteRow?.status]
  );
  const serviceId = String(form.requested_services ?? "").trim();
  const hasServiceSelected = Boolean(serviceId);
  const partnerSelected = Boolean(String(form.requested_partner ?? "").trim());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      const { quote: row, serviceFees } = await fetchQuoteDetailById(
        quoteMongoId
      );
      if (cancelled) return;
      if (!row) {
        setLoadError("Could not load this quote.");
        setQuoteRow(null);
        setApiServiceFees(undefined);
        return;
      }
      setQuoteRow(row);
      setApiServiceFees(serviceFees);
      initialStatusKeyRef.current =
        normalizeQuoteApiStatus(row.status) || "new";
    })();
    return () => {
      cancelled = true;
    };
  }, [quoteMongoId]);

  const franchiseIdForCatalog = useMemo(() => {
    if (!quoteRow) return "";
    const fromRow = String(quoteRow.franchise_id ?? "").trim();
    if (fromRow) return fromRow;
    return resolveFranchiseIdForQuoteForm("");
  }, [quoteRow]);

  useEffect(() => {
    if (!franchiseIdForCatalog) {
      setQuoteCategoryOptions([]);
      setQuoteCatalogServices([]);
      setQuoteEmployeeOptions([]);
      setCatalogPartnerRecords([]);
      setQuotePartnerOptions([]);
      setQuoteUserOptions([]);
      setQuoteCustomerRecords([]);
      setFranchiseQuotePinSet(new Set());
      setFranchiseQuoteAreaIdSet(new Set());
      setFranchisePinsLoadDone(true);
      setFranchiseCatalogName("");
      setQuoteFranchiseCatalogSnapshot(null);
      return;
    }
    const seq = (catalogSeqRef.current += 1);
    setFranchisePinsLoadDone(false);
    setCatalogBusy(true);
    void (async () => {
      const { success, record } = await fetchFranchiseRelatedCatalog(
        franchiseIdForCatalog
      );
      if (seq !== catalogSeqRef.current) return;
      if (!success || !record) {
        setQuoteCategoryOptions([]);
        setQuoteCatalogServices([]);
        setQuoteEmployeeOptions([]);
        setCatalogPartnerRecords([]);
        setQuotePartnerOptions([]);
        setQuoteUserOptions([]);
        setQuoteCustomerRecords([]);
        setFranchiseQuotePinSet(new Set());
        setFranchiseQuoteAreaIdSet(new Set());
        setFranchisePinsLoadDone(true);
        setFranchiseCatalogName("");
        setQuoteFranchiseCatalogSnapshot(null);
        setCatalogBusy(false);
        return;
      }
      const mapped = mapRelatedCatalogToQuoteOptions(record);
      setQuoteCategoryOptions(mapped.quoteCategoryOptions);
      setQuoteCatalogServices(mapped.quoteCatalogServices);
      setQuoteEmployeeOptions(mapped.quoteEmployeeOptions);
      setQuoteUserOptions(mapped.quoteUserOptions);
      setQuoteCustomerRecords(mapped.quoteCustomerRecords);
      setCatalogPartnerRecords(mapped.quotePartnerRecords);
      setQuoteFranchiseCatalogSnapshot({
        partnerRecords: mapped.quotePartnerRecords,
        employeeRows: mapped.quoteEmployeeRecords,
      });
      const fr = record.franchise as Record<string, unknown> | undefined;
      setFranchiseCatalogName(String(fr?.name ?? "").trim());
      setFranchiseQuoteAreaIdSet(new Set(collectFranchiseAreaIds(fr)));
      setFranchiseQuotePinSet(buildFranchisePincodeSetFromRelatedCatalog(record));
      setFranchisePinsLoadDone(true);
      setCatalogBusy(false);
    })();
  }, [franchiseIdForCatalog]);

  useEffect(() => {
    const opts = catalogPartnerRecords.map((p) => {
      const value = String(
        p.partner_id ?? p._id ?? p.user_id ?? p.id ?? ""
      ).trim();
      const label = String(
        p.partner_name ?? p.name ?? p.user_name ?? value
      ).trim();
      return { value, label: label || value };
    });
    setQuotePartnerOptions(opts.filter((o) => o.value));
  }, [catalogPartnerRecords]);

  useEffect(() => {
    if (!quoteRow || catalogBusy || !franchisePinsLoadDone) return;
    skipAutoPriceRef.current = true;
    skipScheduleRevalidateRef.current = true;
    reset(seedEditQuoteFormFromRow(quoteRow));
    const t = window.setTimeout(() => {
      skipAutoPriceRef.current = false;
      skipScheduleRevalidateRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [quoteRow, catalogBusy, franchisePinsLoadDone, reset]);

  const clearScheduleAndPriceFields = useCallback(() => {
    setValue("requested_date", "", { shouldValidate: false });
    setValue("requested_date_to", "", { shouldValidate: false });
    setValue("requested_time_from", "", { shouldValidate: false });
    setValue("requested_time_to", "", { shouldValidate: false });
    setValue("service_price", "", { shouldValidate: false });
  }, [setValue]);

  const applySelectFieldValue = useCallback(
    (name: keyof EditQuoteFormValues, value: unknown) => {
      setValue(name, value as EditQuoteFormValues[typeof name], {
        shouldValidate: isSubmitted,
      });
    },
    [isSubmitted, setValue]
  );

  const quoteAddressFallback = useMemo(
    () =>
      quoteRow?.address_id
        ? {
            addressId: quoteRow.address_id,
            state: quoteRow.state,
            city: quoteRow.city,
            area: quoteRow.area,
            street: quoteRow.street ?? quoteRow.address_line,
            landmark: quoteRow.landmark,
            pincode: quoteRow.pincode,
          }
        : undefined,
    [quoteRow]
  );

  const { addressUi, selectedAddressId, setSelectedAddressId } =
    useQuoteCustomerAddressPanel({
      userId: String(form.user_id ?? "").trim(),
      quoteCustomerRecords,
      franchiseQuotePinSet,
      franchiseQuoteAreaIdSet,
      franchisePinsLoadDone,
      preferredAddressId: quoteRow?.address_id,
      quoteAddressFallback,
    });

  const selectedPartnerCatalogRecord = useMemo(() => {
    const pid = String(form.requested_partner ?? "").trim();
    if (!pid) return null;
    return (
      catalogPartnerRecords.find(
        (p) =>
          String(p.partner_id ?? p._id ?? p.user_id ?? p.id ?? "").trim() ===
          pid
      ) ?? null
    );
  }, [form.requested_partner, catalogPartnerRecords]);

  const quoteCatalogServicesForPartner = useMemo(
    () =>
      buildQuoteCatalogServicesForPartner(
        quoteCatalogServices,
        selectedPartnerCatalogRecord
      ),
    [quoteCatalogServices, selectedPartnerCatalogRecord]
  );

  const quoteCategoryOptionsForPartner = useMemo(
    () =>
      buildQuoteCategoryOptionsForSelectedPartner(
        quoteCategoryOptions,
        quoteCatalogServices,
        selectedPartnerCatalogRecord
      ),
    [quoteCategoryOptions, quoteCatalogServices, selectedPartnerCatalogRecord]
  );

  const editCategoryOptions = useMemo(() => {
    if (!isNewTabQuoteEdit) return quoteCategoryOptionsForPartner;
    return buildQuotePrefilledCategoryOptions(
      quoteCategoryOptions,
      String(form.category_id ?? quoteRow?.category_id ?? ""),
      quoteRow?.category_name
    );
  }, [
    isNewTabQuoteEdit,
    quoteCategoryOptionsForPartner,
    quoteCategoryOptions,
    form.category_id,
    quoteRow?.category_id,
    quoteRow?.category_name,
  ]);

  const { quoteServiceOptionsForCategory, scheduleMode } = useMemo(() => {
    const cid = String(form.category_id ?? "").trim();
    const quoteServiceOptionsForCategory = !cid
      ? []
      : filterPartnerServicesForCategory(
          quoteCatalogServicesForPartner,
          selectedPartnerCatalogRecord,
          cid
        );
    const sid = String(form.requested_services ?? "").trim();
    const opt = quoteServiceOptionsForCategory.find((o) => o.value === sid);
    return {
      quoteServiceOptionsForCategory,
      scheduleMode: getQuoteScheduleModeForPartnerService(
        opt,
        selectedPartnerCatalogRecord,
        sid
      ),
    };
  }, [
    form.category_id,
    form.requested_services,
    quoteCatalogServicesForPartner,
    selectedPartnerCatalogRecord,
  ]);

  const editServiceOptions = useMemo(() => {
    if (!isNewTabQuoteEdit) return quoteServiceOptionsForCategory;
    return buildQuotePrefilledServiceOptions(
      quoteCatalogServices,
      String(form.requested_services ?? quoteRow?.service_id ?? ""),
      quoteRow?.requested_services,
      String(form.category_id ?? quoteRow?.category_id ?? "")
    );
  }, [
    isNewTabQuoteEdit,
    quoteServiceOptionsForCategory,
    quoteCatalogServices,
    form.requested_services,
    form.category_id,
    quoteRow?.service_id,
    quoteRow?.requested_services,
    quoteRow?.category_id,
  ]);

  const editPartnerOptions = useMemo(() => {
    if (!isNewTabQuoteEdit) return quotePartnerOptions;
    const sid = String(form.requested_services ?? quoteRow?.service_id ?? "").trim();
    if (!sid) return quotePartnerOptions;
    return buildQuotePartnerOptionsForPrefilledService(
      catalogPartnerRecords,
      quoteCatalogServices,
      sid,
      String(form.category_id ?? quoteRow?.category_id ?? "")
    );
  }, [
    isNewTabQuoteEdit,
    quotePartnerOptions,
    catalogPartnerRecords,
    quoteCatalogServices,
    form.requested_services,
    form.category_id,
    quoteRow?.service_id,
    quoteRow?.category_id,
  ]);

  const editScheduleMode = useMemo(() => {
    if (!isNewTabQuoteEdit) return scheduleMode;
    const sid = String(form.requested_services ?? "").trim();
    const opt = editServiceOptions.find((o) => o.value === sid);
    return getQuoteScheduleModeForPartnerService(
      opt,
      selectedPartnerCatalogRecord,
      sid
    );
  }, [
    isNewTabQuoteEdit,
    scheduleMode,
    form.requested_services,
    editServiceOptions,
    selectedPartnerCatalogRecord,
  ]);

  const activeScheduleMode = isNewTabQuoteEdit ? editScheduleMode : scheduleMode;

  const isScheduleComplete = useMemo(() => {
    if (!hasServiceSelected) return false;
    const d = String(form.requested_date ?? "").trim();
    const dTo = String(form.requested_date_to ?? "").trim();
    const tFrom = String(form.requested_time_from ?? "").trim();
    const tTo = String(form.requested_time_to ?? "").trim();
    if (activeScheduleMode === "range") {
      return Boolean(d && dTo && tFrom && tTo);
    }
    return Boolean(d && tFrom && tTo);
  }, [
    hasServiceSelected,
    activeScheduleMode,
    form.requested_date,
    form.requested_date_to,
    form.requested_time_from,
    form.requested_time_to,
  ]);

  const selectedServiceOption = useMemo(() => {
    if (!serviceId) return undefined;
    const pool = isNewTabQuoteEdit
      ? editServiceOptions
      : quoteServiceOptionsForCategory;
    return pool.find((o) => o.value === serviceId);
  }, [
    serviceId,
    isNewTabQuoteEdit,
    editServiceOptions,
    quoteServiceOptionsForCategory,
  ]);

  const feeOptionForPreview = useMemo(() => {
    const merged = mergeQuoteServiceFeesForBreakdown(
      selectedServiceOption,
      selectedPartnerCatalogRecord,
      serviceId
    );
    return merged ?? apiServiceFees;
  }, [selectedServiceOption, selectedPartnerCatalogRecord, serviceId, apiServiceFees]);

  const editEndMinTime = useMemo(() => {
    const from = String(form.requested_time_from ?? "").trim();
    const to = String(form.requested_time_to ?? "").trim();
    if (from && to && !isScheduleEndAfterStartSameDay(from, to)) {
      return undefined;
    }
    return scheduleEndTimeMinAfterStart(from);
  }, [form.requested_time_from, form.requested_time_to]);

  const editPriceBreakdown = useMemo(
    () => computeQuotePriceBreakdown(form.service_price, feeOptionForPreview),
    [form.service_price, feeOptionForPreview]
  );

  const schedulePricePreview = useMemo(() => {
    if (!isScheduleComplete || !partnerSelected) return null;
    const metrics = deriveQuoteScheduleMetrics({
      scheduleMode: activeScheduleMode,
      requested_date: String(form.requested_date ?? ""),
      requested_date_to: String(form.requested_date_to ?? ""),
      requested_time: String(form.requested_time ?? ""),
      requested_time_from: String(form.requested_time_from ?? ""),
      requested_time_to: String(form.requested_time_to ?? ""),
    });
    if (!metrics) return null;
    const row = getPartnerActiveServiceProvidingRow(
      selectedPartnerCatalogRecord,
      serviceId
    );
    const catalogPaymentType = String(
      feeOptionForPreview?.payment_type ?? ""
    ).trim();
    return buildQuoteSchedulePricePreview(
      row,
      metrics,
      AppConstant.currencySymbol,
      catalogPaymentType
    );
  }, [
    isScheduleComplete,
    partnerSelected,
    activeScheduleMode,
    form.requested_date,
    form.requested_date_to,
    form.requested_time,
    form.requested_time_from,
    form.requested_time_to,
    selectedPartnerCatalogRecord,
    serviceId,
    feeOptionForPreview?.payment_type,
  ]);

  useEffect(() => {
    if (skipScheduleRevalidateRef.current) return;
    const from = String(form.requested_time_from ?? "").trim();
    const to = String(form.requested_time_to ?? "").trim();
    if (!from || !to) return;
    if (!isScheduleEndAfterStartSameDay(from, to)) {
      setValue("requested_time_to", "", { shouldValidate: false });
    }
  }, [form.requested_time_from, form.requested_time_to, setValue]);

  /** Edit: allow any calendar date (existing quotes may be in the past). Create keeps today+. */
  const scheduleDateAllowAll = useCallback(() => true, []);

  useEffect(() => {
    if (skipAutoPriceRef.current) return;
    if (!isScheduleComplete || !partnerSelected) return;
    const sid = serviceId;
    if (!sid) return;
    const row = getPartnerActiveServiceProvidingRow(
      selectedPartnerCatalogRecord,
      sid
    );
    const metrics = deriveQuoteScheduleMetrics({
      scheduleMode: activeScheduleMode,
      requested_date: String(form.requested_date ?? ""),
      requested_date_to: String(form.requested_date_to ?? ""),
      requested_time: String(form.requested_time ?? ""),
      requested_time_from: String(form.requested_time_from ?? ""),
      requested_time_to: String(form.requested_time_to ?? ""),
    });
    if (!metrics) return;
    const catalogPaymentType = String(
      feeOptionForPreview?.payment_type ?? ""
    ).trim();
    const n = row
      ? computeAutoQuotePriceFromPartner(row, metrics, catalogPaymentType)
      : 0;
    setValue("service_price", String(n), { shouldValidate: false });
  }, [
    isScheduleComplete,
    partnerSelected,
    serviceId,
    activeScheduleMode,
    form.requested_date,
    form.requested_date_to,
    form.requested_time,
    form.requested_time_from,
    form.requested_time_to,
    selectedPartnerCatalogRecord,
    feeOptionForPreview?.payment_type,
    setValue,
  ]);

  const scheduleToDateFilter = useCallback(
    (date: Date) => {
      const fromIso = String(form.requested_date ?? "").trim();
      if (!fromIso) return true;
      const from = parseIsoDateOnly(fromIso);
      if (!from) return true;
      return startOfLocalDay(date) >= startOfLocalDay(from);
    },
    [form.requested_date]
  );

  const userSelectOptions = useMemo<OptionType[]>(
    () => quoteUserOptions.map((u) => ({ value: u.value, label: u.label })),
    [quoteUserOptions]
  );

  const franchiseSelectOptions = useMemo<OptionType[]>(() => {
    const id = String(form.franchise_id ?? quoteRow?.franchise_id ?? "").trim();
    const label =
      String(quoteRow?.franchise_name ?? "").trim() ||
      franchiseCatalogName ||
      id ||
      "-";
    if (!id && label === "-") return [{ value: "", label: "-" }];
    return [{ value: id || label, label }];
  }, [
    form.franchise_id,
    quoteRow?.franchise_id,
    quoteRow?.franchise_name,
    franchiseCatalogName,
  ]);

  const handlePartnerSelectChange = useCallback(
    (value: unknown) => {
      const prev = getValues("requested_partner");
      applySelectFieldValue("requested_partner", value);
      if (String(value ?? "") === String(prev ?? "")) return;
      if (!isNewTabQuoteEdit) {
        setValue("category_id", "", { shouldValidate: false });
        setValue("requested_services", "", { shouldValidate: false });
      }
      clearScheduleAndPriceFields();
    },
    [
      applySelectFieldValue,
      clearScheduleAndPriceFields,
      getValues,
      isNewTabQuoteEdit,
      setValue,
    ]
  );

  const onSubmit = async (data: EditQuoteFormValues) => {
    const id = String(quoteMongoId ?? "").trim();
    if (!id) {
      showErrorAlert("Missing quote id.");
      return;
    }

    const nextStatus = normalizeQuoteApiStatus(data.quote_status);
    const prev = initialStatusKeyRef.current;
    const isConvertToOrder = nextStatus === "success" && prev !== "success";

    if (isConvertToOrder) {
      if (prev !== "accepted") {
        showErrorAlert("Quote must be accepted before converting to an order.");
        return;
      }
      const result = await convertQuoteToOrder(id);
      if (!result.ok) {
        showErrorAlert("Could not convert quote to order.");
        return;
      }
      const orderLabel = result.orderUniqueId
        ? ` Order ${result.orderUniqueId}.`
        : "";
      showSuccessAlert(
        result.alreadyLinked
          ? `Quote is already linked to an order.${orderLabel}`
          : `Order created successfully.${orderLabel}`
      );
      onSaved?.();
      onClose();
      return;
    }

    const price = Number.parseFloat(String(data.service_price).trim());

    if (String(data.user_id ?? "").trim() && !addressUi.ready) {
      showErrorAlert(
        "Still loading address options for this franchise. Please wait a moment."
      );
      return;
    }
    if (addressUi.error) {
      showErrorAlert(addressUi.error);
      return;
    }

    const missingRequired = collectMissingQuoteEditRequiredFields(
      data,
      activeScheduleMode,
      {
        addressUiReady: addressUi.ready,
        addressRowsCount: addressUi.rows.length,
        selectedAddressId,
      }
    );
    if (missingRequired.length > 0) {
      applyMissingRequiredFieldErrors(missingRequired, (field, error) => {
        setError(field as never, error);
      });
      showErrorAlert(formatMissingRequiredFieldsAlert(missingRequired));
      return;
    }

    if (activeScheduleMode === "range") {
      const cmp = compareIsoDateOnlyAsc(
        String(data.requested_date ?? "").trim(),
        String(data.requested_date_to ?? "").trim()
      );
      if (cmp != null && cmp > 0) {
        showErrorAlert("End date must be on or after the start date.");
        return;
      }
    }
    if (
      !isScheduleEndAfterStartSameDay(
        String(data.requested_time_from ?? "").trim(),
        String(data.requested_time_to ?? "").trim()
      )
    ) {
      showErrorAlert(
        "End time must be after start time on the same day (use a later time, not earlier in the morning than the start)."
      );
      return;
    }

    const metrics = deriveQuoteScheduleMetrics({
      scheduleMode: activeScheduleMode,
      requested_date: data.requested_date,
      requested_date_to: data.requested_date_to,
      requested_time: data.requested_time,
      requested_time_from: data.requested_time_from,
      requested_time_to: data.requested_time_to,
    });
    if (!metrics) {
      showErrorAlert("Invalid schedule.");
      return;
    }

    const patch: Record<string, unknown> = {
      category_id: String(data.category_id ?? "").trim(),
      service_id: String(data.requested_services ?? "").trim(),
      partner_id: String(data.requested_partner ?? "").trim() || undefined,
      employee_id: String(data.employee_id ?? "").trim() || undefined,
      address_id: selectedAddressId.trim(),
      service_price: price,
      from_date: metrics.from_date,
      to_date: metrics.to_date,
      work_start_time: metrics.work_start_time,
      work_end_time: metrics.work_end_time,
      work_hours_per_day: metrics.work_hours_per_day,
      total_work_hours: metrics.total_work_hours,
      quote_description:
        String(data.user_description ?? "").trim() || undefined,
      admin_description:
        String(data.admin_description ?? "").trim() || undefined,
    };

    let ok = await updateQuote(id, patch);
    if (!ok) {
      showErrorAlert("Could not update quote.");
      return;
    }

    if (nextStatus && nextStatus !== prev) {
      ok = await applyQuoteHeaderPatch(id, { status: nextStatus });
      if (!ok) {
        const statusMsg =
          nextStatus === "accepted"
            ? "Quote was updated, but could not be accepted."
            : nextStatus === "failed"
            ? "Quote was updated, but status could not be changed."
            : "Quote was updated, but status could not be changed.";
        showErrorAlert(statusMsg);
        onSaved?.();
        onClose();
        return;
      }
    }

    const statusChangedToAccepted =
      nextStatus === "accepted" && nextStatus !== prev;
    showSuccessAlert(
      statusChangedToAccepted ? "Quote accepted." : "Quote updated."
    );
    onSaved?.();
    onClose();
  };

  const renderAddressCards = (rows: QuoteAddressRowUi[]) =>
    rows.map((row) => {
      const selected = selectedAddressId === row.id && row.selectable;
      const areaMode = franchiseQuoteAreaIdSet.size > 0;
      const addressFallback =
        !row.stateName &&
        !row.cityName &&
        !row.areaName &&
        !row.streetAddress
          ? row.summary
          : "";
      const pairCandidates: [string, string][] = [
        ["State", row.stateName],
        ["City", row.cityName],
        ["Area", row.areaName],
        ["Address", row.streetAddress || addressFallback],
        ["Landmark", row.landmark],
        ["Pin code", row.pincode],
      ];
      const pairs = pairCandidates.filter((p): p is [string, string] =>
        Boolean(String(p[1] ?? "").trim())
      );

      return (
        <div
          key={row.id}
          className={`add-quote-address-card-wrap p-2 ${
            !row.selectable ? "add-quote-address-card-wrap--muted" : ""
          }`}
          style={{
            border: selected
              ? "2px solid var(--primary-color)"
              : `1px solid ${
                  row.selectable
                    ? "rgba(0, 0, 0, 0.1)"
                    : "rgba(0, 0, 0, 0.08)"
                }`,
            backgroundColor: row.selectable
              ? "var(--bg-color)"
              : "rgba(0, 0, 0, 0.02)",
            boxShadow: selected
              ? "0 10px 28px rgba(0, 0, 0, 0.09)"
              : "0 2px 12px rgba(0, 0, 0, 0.05)",
            transform: selected ? "translateY(-2px)" : undefined,
          }}
        > 
          <Form.Check
            type="radio"
            name="edit-quote-address"
            id={`edit-quote-addr-${row.id}`}
            disabled={!row.selectable}
            checked={selectedAddressId === row.id && row.selectable}
            onChange={() => {
              if (row.selectable) setSelectedAddressId(row.id);
            }}
            className="add-quote-address-card-check"
            style={{
              cursor: row.selectable ? "pointer" : "not-allowed",
            }}
            label={
              <div className="add-quote-address-card-inner">
                <div className="add-quote-address-card-header">
                  <span className="add-quote-address-card-name">
                    {row.contactName}
                  </span>
                  <span
                    className={`add-quote-address-card-badge ${
                      row.selectable
                        ? "add-quote-address-card-badge--ok"
                        : "add-quote-address-card-badge--no"
                    }`}
                  >
                    {row.selectable ? "Available" : "Unavailable"}
                  </span>
                </div>
                <div className="add-quote-address-card-grid">
                  {pairs.map(([label, value]) => (
                    <React.Fragment key={`${row.id}-${label}`}>
                      <span className="add-quote-address-card-grid-label">
                        {label}
                      </span>
                      <span className="add-quote-address-card-grid-value">
                        {value}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
                {!row.selectable ? (
                  <div className="add-quote-address-card-footnote">
                    {areaMode
                      ? "Outside this franchise’s service areas."
                      : "Postcode not in this franchise’s service list."}
                  </div>
                ) : null}
              </div>
            }
          />
        </div>
      );
    });

  const lockedFields = catalogBusy || !quoteRow;
  const quoteStatusKey = normalizeQuoteApiStatus(quoteRow?.status) || "new";
  const isTerminalQuoteStatus =
    quoteStatusKey === "success" || quoteStatusKey === "failed";
  const categoryFieldDisabled =
    lockedFields || (!isNewTabQuoteEdit && !partnerSelected);
  const serviceFieldDisabled =
    lockedFields ||
    (!isNewTabQuoteEdit &&
      (!partnerSelected || !String(form.category_id ?? "").trim()));

  return (
    <Modal
      show
      onHide={onClose}
      {...QUOTE_MODAL_LAYOUT}
      enforceFocus={false}
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Edit quote
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="add-quote-modal-body pt-0">
        {loadError ? (
          <div className="text-danger py-3">{loadError}</div>
        ) : !quoteRow ? (
          <div className="text-muted py-3">Loading quote…</div>
        ) : (
          <form
            id="quote-edit-all-form"
            noValidate
            onSubmit={handleSubmit(onSubmit)}
          >
            <section className="custom-other-details add-quote-form-section">
              <Row className="gy-3 gx-md-4 align-items-start">
                <Col xs={12} md={6}>
                  <div className="order-edit-locked-select">
                    <CustomTextFieldSelect
                      label="User"
                      controlId="edit-quote-user"
                      asCol={false}
                      options={userSelectOptions}
                      register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                      fieldName="user_id"
                      error={errors.user_id}
                      requiredMessage="Please select a user"
                      defaultValue={form.user_id}
                      setValue={setValue as (name: string, value: unknown) => void}
                      placeholder="Search user name or mobile"
                      menuPortal
                      isClearable={false}
                      isDisabled
                    />
                  </div>
                </Col>
                <Col xs={12} md={6}>
                  <div className="order-edit-locked-select">
                    <CustomTextFieldSelect
                      label="Franchise"
                      controlId="edit-quote-franchise"
                      asCol={false}
                      options={franchiseSelectOptions}
                      register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                      fieldName="franchise_id"
                      defaultValue={form.franchise_id}
                      setValue={setValue as (name: string, value: unknown) => void}
                      placeholder="Franchise"
                      menuPortal
                      isClearable={false}
                      includeEmptyOption={false}
                      isDisabled
                    />
                  </div>
                </Col>
              </Row>
              {!isSuperAdminOrStaff ? (
                <Row className="gy-3 gx-md-4 align-items-start">
                  <Col xs={12} md={6}>
                    <CustomTextFieldSelect
                      label="Employee"
                      controlId="edit-quote-employee-super"
                      asCol={false}
                      options={quoteEmployeeOptions}
                      register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                      fieldName="employee_id"
                      error={errors.employee_id}
                      defaultValue={form.employee_id}
                      setValue={setValue as (name: string, value: unknown) => void}
                      placeholder="Select employee"
                      menuPortal
                      isClearable
                      isDisabled={lockedFields}
                    />
                  </Col>
                </Row>
              ) : null}

              {String(form.user_id ?? "").trim() ? (
                <section className="border rounded p-3 mt-4 mb-0">
                  <h6 className={QUOTE_SECTION_TITLE_CLASS}>Service address</h6>
                  <label
                    className="custom-profile-lable d-block"
                    style={{ fontWeight: 600, marginBottom: "1.125rem" }}
                  >
                    <FieldLabelText label="Service address" required />
                  </label>
                  {!addressUi.ready ? (
                    <QuoteAddressOptionsLoader />
                  ) : (
                    <>
                      {addressUi.error ? (
                        <QuoteAddressPanelError message={addressUi.error} />
                      ) : null}
                      {addressUi.rows.length ? (
                        <div className="add-quote-address-cards-grid">
                          {renderAddressCards(addressUi.rows)}
                        </div>
                      ) : !addressUi.error ? (
                        <div className="small text-warning">
                          No saved address on file for this customer.
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}

              {isSuperAdminOrStaff ? (
                <>
                  <Row className="gy-4 gx-md-5 align-items-start mt-2">
                    <Col xs={12} md={6}>
                      <CustomTextFieldSelect
                        label="Employee"
                        controlId="edit-quote-employee"
                        asCol={false}
                        options={quoteEmployeeOptions}
                        register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                        fieldName="employee_id"
                        error={errors.employee_id}
                        defaultValue={form.employee_id}
                        setValue={setValue as (name: string, value: unknown) => void}
                        placeholder="Select employee"
                        menuPortal
                        isClearable
                        isDisabled={lockedFields}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <CustomTextFieldSelect
                        label="Partner"
                        controlId="edit-quote-partner"
                        asCol={false}
                        options={editPartnerOptions}
                        register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                        fieldName="requested_partner"
                        error={errors.requested_partner}
                        requiredMessage="Please select a partner"
                        defaultValue={form.requested_partner}
                        setValue={(name, value) => {
                          if (name === "requested_partner") {
                            handlePartnerSelectChange(value);
                            return;
                          }
                          applySelectFieldValue(
                            name as keyof EditQuoteFormValues,
                            value
                          );
                        }}
                        placeholder={
                          isNewTabQuoteEdit
                            ? "Select partner for this service"
                            : "Search partner name"
                        }
                        menuPortal
                        isClearable
                        isDisabled={lockedFields}
                      />
                    </Col>
                  </Row>
                  <Row className="gy-4 gx-md-5 align-items-start">
                    <Col xs={12} md={6}>
                      <CustomTextFieldSelect
                        label="Category"
                        controlId="edit-quote-category"
                        asCol={false}
                        options={editCategoryOptions}
                        register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                        fieldName="category_id"
                        error={errors.category_id}
                        requiredMessage="Please select a category"
                        defaultValue={form.category_id}
                        isClearable={!isNewTabQuoteEdit}
                        setValue={(name, value) => {
                          if (name === "category_id") {
                            const prev = getValues("category_id");
                            applySelectFieldValue("category_id", value);
                            if (
                              !isNewTabQuoteEdit &&
                              String(value ?? "") !== String(prev ?? "")
                            ) {
                              setValue("requested_services", "", {
                                shouldValidate: false,
                              });
                              clearScheduleAndPriceFields();
                            }
                            return;
                          }
                          applySelectFieldValue(
                            name as keyof EditQuoteFormValues,
                            value
                          );
                        }}
                        placeholder={
                          isNewTabQuoteEdit
                            ? "Category from customer request"
                            : partnerSelected
                              ? "Select category"
                              : "Select partner first"
                        }
                        menuPortal
                        isDisabled={categoryFieldDisabled || isNewTabQuoteEdit}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <CustomTextFieldSelect
                        key={`edit-quote-svc-${form.category_id || "none"}`}
                        label="Service"
                        controlId="edit-quote-service"
                        asCol={false}
                        options={editServiceOptions}
                        register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                        fieldName="requested_services"
                        error={errors.requested_services}
                        requiredMessage={
                          isNewTabQuoteEdit || (form.category_id && partnerSelected)
                            ? "Please select a service"
                            : undefined
                        }
                        defaultValue={form.requested_services}
                        setValue={(name, value) => {
                          if (name === "requested_services") {
                            const prev = getValues("requested_services");
                            applySelectFieldValue("requested_services", value);
                            if (
                              !isNewTabQuoteEdit &&
                              String(value ?? "") !== String(prev ?? "")
                            ) {
                              clearScheduleAndPriceFields();
                            }
                            return;
                          }
                          applySelectFieldValue(
                            name as keyof EditQuoteFormValues,
                            value
                          );
                        }}
                        placeholder={
                          isNewTabQuoteEdit
                            ? "Service from customer request"
                            : !partnerSelected
                              ? "Select partner first"
                              : !form.category_id
                                ? "Select category first"
                                : "Search service name"
                        }
                        menuPortal
                        isClearable={!isNewTabQuoteEdit}
                        isDisabled={serviceFieldDisabled || isNewTabQuoteEdit}
                      />
                    </Col>
                  </Row>
                </>
              ) : (
                <Row className="gy-4 gx-md-5 align-items-start mt-2">
                  <Col xs={12} md={6}>
                    <CustomTextFieldSelect
                      label="Partner"
                      controlId="edit-quote-partner"
                      asCol={false}
                      options={editPartnerOptions}
                      register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                      fieldName="requested_partner"
                      error={errors.requested_partner}
                      requiredMessage="Please select a partner"
                      defaultValue={form.requested_partner}
                      setValue={(name, value) => {
                        if (name === "requested_partner") {
                          handlePartnerSelectChange(value);
                          return;
                        }
                        applySelectFieldValue(
                          name as keyof EditQuoteFormValues,
                          value
                        );
                      }}
                      placeholder={
                        isNewTabQuoteEdit
                          ? "Select partner for this service"
                          : "Search partner name"
                      }
                      menuPortal
                      isClearable
                      isDisabled={lockedFields}
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <CustomTextFieldSelect
                      label="Category"
                      controlId="edit-quote-category"
                      asCol={false}
                      options={editCategoryOptions}
                      register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                      fieldName="category_id"
                      error={errors.category_id}
                      requiredMessage="Please select a category"
                      defaultValue={form.category_id}
                      isClearable={!isNewTabQuoteEdit}
                      setValue={(name, value) => {
                        if (name === "category_id") {
                          const prev = getValues("category_id");
                          applySelectFieldValue("category_id", value);
                          if (
                            !isNewTabQuoteEdit &&
                            String(value ?? "") !== String(prev ?? "")
                          ) {
                            setValue("requested_services", "", {
                              shouldValidate: false,
                            });
                            clearScheduleAndPriceFields();
                          }
                          return;
                        }
                        applySelectFieldValue(
                          name as keyof EditQuoteFormValues,
                          value
                        );
                      }}
                      placeholder={
                        isNewTabQuoteEdit
                          ? "Category from customer request"
                          : partnerSelected
                            ? "Select category"
                            : "Select partner first"
                      }
                      menuPortal
                      isDisabled={categoryFieldDisabled || isNewTabQuoteEdit}
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <CustomTextFieldSelect
                      key={`edit-quote-svc-${form.category_id || "none"}`}
                      label="Service"
                      controlId="edit-quote-service"
                      asCol={false}
                      options={editServiceOptions}
                      register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                      fieldName="requested_services"
                      error={errors.requested_services}
                      requiredMessage={
                        isNewTabQuoteEdit || (form.category_id && partnerSelected)
                          ? "Please select a service"
                          : undefined
                      }
                      defaultValue={form.requested_services}
                      setValue={(name, value) => {
                        if (name === "requested_services") {
                          const prev = getValues("requested_services");
                          applySelectFieldValue("requested_services", value);
                          if (
                            !isNewTabQuoteEdit &&
                            String(value ?? "") !== String(prev ?? "")
                          ) {
                            clearScheduleAndPriceFields();
                          }
                          return;
                        }
                        applySelectFieldValue(
                          name as keyof EditQuoteFormValues,
                          value
                        );
                      }}
                      placeholder={
                        isNewTabQuoteEdit
                          ? "Service from customer request"
                          : !partnerSelected
                            ? "Select partner first"
                            : !form.category_id
                              ? "Select category first"
                              : "Search service name"
                      }
                      menuPortal
                      isClearable={!isNewTabQuoteEdit}
                      isDisabled={serviceFieldDisabled || isNewTabQuoteEdit}
                    />
                  </Col>
                </Row>
              )}

              {hasServiceSelected ? (
                <>
                  <Row className="mt-4 mb-2">
                    <Col xs={12}>
                      <label
                        style={{
                          fontSize: "17px",
                          fontWeight: "600",
                          color: "var(--primary-color)",
                        }}
                        className="d-block mb-0"
                      >
                        Schedule
                      </label>
                    </Col>
                  </Row>
                  <div className="add-quote-schedule-panel">
                    <Row className="gy-4 gx-md-5">
                      {activeScheduleMode === "range" ? (
                        <>
                          <Col xs={12} md={3}>
                            <CustomTextFieldDatePicket
                              label="From date"
                              controlId="edit_requested_date"
                              selectedDate={form.requested_date || null}
                              onChange={(date) => {
                                const next = toIsoCalendarDate(date) ?? "";
                                setValue("requested_date", next, {
                                  shouldValidate: true,
                                });
                              }}
                              register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                              setValue={setValue as (n: string, v: unknown) => void}
                              asCol={false}
                              labelSize={12}
                              placeholderText="From date"
                              filterDate={scheduleDateAllowAll}
                              required
                            />
                          </Col>
                          <Col xs={12} md={3}>
                            <CustomTextFieldDatePicket
                              label="To date"
                              controlId="edit_requested_date_to"
                              selectedDate={form.requested_date_to || null}
                              onChange={(date) => {
                                const next = toIsoCalendarDate(date) ?? "";
                                setValue("requested_date_to", next, {
                                  shouldValidate: true,
                                });
                              }}
                              register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                              setValue={setValue as (n: string, v: unknown) => void}
                              asCol={false}
                              labelSize={12}
                              placeholderText="To date"
                              filterDate={scheduleToDateFilter}
                              required
                            />
                          </Col>
                          <Col xs={12} md={3}>
                            <CustomTextFieldTimePicket
                              label="Start time"
                              controlId="edit_requested_time_from"
                              selectedTime={timeStorageOrNull(form.requested_time_from)}
                              onChange={(date) =>
                                setValue(
                                  "requested_time_from",
                                  toTimeStorageFromDate(date),
                                  { shouldValidate: true }
                                )
                              }
                              placeholderText="Select start time"
                              error={errors.requested_time_from}
                              register={register}
                              validation={{ required: "Start time is required" }}
                              setValue={setValue}
                              asCol={false}
                              labelSize={12}
                              timeIntervals={SCHEDULE_TIME_PICKER_INTERVAL_MINUTES}
                              filterTime={scheduleTimeAllowAll}
                            />
                          </Col>
                          <Col xs={12} md={3}>
                            <CustomTextFieldTimePicket
                              label="End time"
                              controlId="edit_requested_time_to"
                              selectedTime={timeStorageOrNull(form.requested_time_to)}
                              onChange={(date) =>
                                setValue(
                                  "requested_time_to",
                                  toTimeStorageFromDate(date),
                                  { shouldValidate: true }
                                )
                              }
                              placeholderText="After start time"
                              error={errors.requested_time_to}
                              register={register}
                              validation={{ required: "End time is required" }}
                              setValue={setValue}
                              asCol={false}
                              labelSize={12}
                              minTime={editEndMinTime}
                              maxTime={scheduleEndTimeMaxForDay()}
                              timeIntervals={SCHEDULE_TIME_PICKER_INTERVAL_MINUTES}
                            />
                          </Col>
                        </>
                      ) : (
                        <>
                          <Col xs={12} md={4}>
                            <CustomTextFieldDatePicket
                              label="Date"
                              controlId="edit_requested_date"
                              selectedDate={form.requested_date || null}
                              onChange={(date) => {
                                const next = toIsoCalendarDate(date) ?? "";
                                setValue("requested_date", next, {
                                  shouldValidate: true,
                                });
                              }}
                              register={register as unknown as UseFormRegister<AddQuoteFormValues>}
                              setValue={setValue as (n: string, v: unknown) => void}
                              asCol={false}
                              labelSize={12}
                              placeholderText="Select date"
                              filterDate={scheduleDateAllowAll}
                              required
                            />
                          </Col>
                          <Col xs={12} md={4}>
                            <CustomTextFieldTimePicket
                              label="Start time"
                              controlId="edit_requested_time_from"
                              selectedTime={timeStorageOrNull(form.requested_time_from)}
                              onChange={(date) =>
                                setValue(
                                  "requested_time_from",
                                  toTimeStorageFromDate(date),
                                  { shouldValidate: true }
                                )
                              }
                              placeholderText="Select start time"
                              error={errors.requested_time_from}
                              register={register}
                              validation={{ required: "Start time is required" }}
                              setValue={setValue}
                              asCol={false}
                              labelSize={12}
                              timeIntervals={SCHEDULE_TIME_PICKER_INTERVAL_MINUTES}
                              filterTime={scheduleTimeAllowAll}
                            />
                          </Col>
                          <Col xs={12} md={4}>
                            <CustomTextFieldTimePicket
                              label="End time"
                              controlId="edit_requested_time_to"
                              selectedTime={timeStorageOrNull(form.requested_time_to)}
                              onChange={(date) =>
                                setValue(
                                  "requested_time_to",
                                  toTimeStorageFromDate(date),
                                  { shouldValidate: true }
                                )
                              }
                              placeholderText="After start time"
                              error={errors.requested_time_to}
                              register={register}
                              validation={{ required: "End time is required" }}
                              setValue={setValue}
                              asCol={false}
                              labelSize={12}
                              minTime={editEndMinTime}
                              maxTime={scheduleEndTimeMaxForDay()}
                              timeIntervals={SCHEDULE_TIME_PICKER_INTERVAL_MINUTES}
                            />
                          </Col>
                        </>
                      )}
                    </Row>
                    {schedulePricePreview ? (
                      <div className="add-quote-schedule-preview">
                        <span className="add-quote-schedule-preview-badge">
                          {schedulePricePreview.billingLabel}
                        </span>
                        <div className="add-quote-schedule-preview-line">
                          {schedulePricePreview.primaryLine}
                        </div>
                        {schedulePricePreview.secondaryLine ? (
                          <div className="add-quote-schedule-preview-sub">
                            {schedulePricePreview.secondaryLine}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}

              {hasServiceSelected ? (
                <div className="add-quote-price-section mt-4 pt-3 border-top">
                  <h6 className="add-quote-price-section-heading mb-3">
                    Service price
                  </h6>
                  <Row className="gy-3 gx-md-4 align-items-start">
                    <Col xs={12} md={6}>
                      <Form.Group controlId="service_price" className="mb-0">
                        <Form.Label className="fw-medium mb-1">
                          <FieldLabelText label="Service Price" required />
                        </Form.Label>
                        <InputGroup>
                          <InputGroup.Text
                            className="custom-form-input text-muted"
                            style={{
                              ...partnerCatalogControlStyle,
                              borderTopRightRadius: 0,
                              borderBottomRightRadius: 0,
                              fontWeight: 600,
                            }}
                          >
                            {AppConstant.currencySymbol}
                          </InputGroup.Text>
                          <Form.Control
                            type="text"
                            inputMode="decimal"
                            disabled={lockedFields}
                            className={`custom-form-input border-start-0${
                              errors.service_price ? " is-invalid" : ""
                            }`}
                            style={{
                              ...partnerCatalogControlStyle,
                              borderLeft: 0,
                              borderTopLeftRadius: 0,
                              borderBottomLeftRadius: 0,
                            }}
                            placeholder="e.g. 1200"
                            {...register("service_price", {
                              required: "Service price is required",
                            })}
                          />
                        </InputGroup>
                        {errors.service_price?.message ? (
                          <div className="text-danger small mt-1">
                            {String(errors.service_price.message)}
                          </div>
                        ) : null}
                      </Form.Group>
                    </Col>
                    <Col xs={12} md={6}>
                      <Form.Group controlId="edit-quote-status" className="mb-0">
                        <Form.Label
                          htmlFor="edit-quote-status"
                          className="fw-medium mb-1"
                        >
                          Quote status
                        </Form.Label>
                        <Form.Select
                          id="edit-quote-status"
                          className="form-select custom-form-input"
                          style={{
                            borderRadius: "8px",
                            borderColor: "var(--primary-color)",
                            height: "35px",
                            fontSize: "14px",
                          }}
                          disabled={lockedFields || isTerminalQuoteStatus}
                          {...register("quote_status")}
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  </Row>
                </div>
              ) : null}

              <Row className="mt-3 g-3">
                <Col xs={12}>
                  <Form.Group controlId="user_description" className="mb-0">
                    <Form.Label className="fw-medium mb-1">
                      User description
                    </Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      maxLength={2000}
                      disabled={lockedFields}
                      className={`custom-form-input${
                        errors.user_description ? " is-invalid" : ""
                      }`}
                      style={{
                        ...partnerCatalogControlStyle,
                        minHeight: "96px",
                        resize: "vertical",
                      }}
                      placeholder="Optional notes for this quote"
                      {...register("user_description")}
                    />
                    {errors.user_description?.message ? (
                      <div className="text-danger small mt-1">
                        {String(errors.user_description.message)}
                      </div>
                    ) : null}
                  </Form.Group>
                </Col>
              </Row>

              <Row className="mt-3 g-3">
                <Col xs={12}>
                  <Form.Group controlId="admin_description" className="mb-0">
                    <Form.Label className="fw-medium mb-1">
                      Admin description
                    </Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      maxLength={2000}
                      disabled={lockedFields}
                      className={`custom-form-input${
                        errors.admin_description ? " is-invalid" : ""
                      }`}
                      style={{
                        ...partnerCatalogControlStyle,
                        minHeight: "96px",
                        resize: "vertical",
                      }}
                      placeholder="Optional admin notes"
                      {...register("admin_description")}
                    />
                    {errors.admin_description?.message ? (
                      <div className="text-danger small mt-1">
                        {String(errors.admin_description.message)}
                      </div>
                    ) : null}
                  </Form.Group>
                </Col>
              </Row>

              {editPriceBreakdown && hasServiceSelected ? (
                <div className="add-quote-breakdown-end mt-3">
                  <QuotePriceBreakdownPanel breakdown={editPriceBreakdown} />
                </div>
              ) : null}
            </section>
          </form>
        )}
      </Modal.Body>
      {!loadError && quoteRow ? (
        <Modal.Footer className="add-quote-modal-footer border-top-0 justify-content-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="quote-edit-all-form"
            className="custom-btn-primary"
            disabled={lockedFields}
          >
            Update
          </Button>
        </Modal.Footer>
      ) : null}
    </Modal>
  );
};

QuoteEditAllDialog.show = (quoteMongoId: string, onSaved?: () => void) => {
  openDialog("quote-edit-all-modal", (close) => (
    <QuoteEditAllDialog
      quoteMongoId={quoteMongoId}
      onClose={close}
      onSaved={onSaved}
    />
  ));
};

export default QuoteEditAllDialog;
