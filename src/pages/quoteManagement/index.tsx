import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Col, Form, InputGroup, Modal, Row } from "react-bootstrap";
import CustomHeader from "../../components/CustomHeader";
import CustomSummaryBox from "../../components/CustomSummaryBox";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import CustomTable from "../../components/CustomTable";
import CustomCloseButton from "../../components/CustomCloseButton";
import CustomActionColumn from "../../components/CustomActionColumn";
import CustomDatePicker from "../../components/CustomDatePicker";
import CustomTextFieldDatePicket from "../../components/CustomTextFieldDatePicket";
import CustomTextFieldSelect from "../../components/CustomTextFieldSelect";
import CustomTextFieldTimePicket from "../../components/CustomTextFieldTimePicket";
import { FieldLabelText } from "../../components/RequiredFieldMark";
import { useForm, UseFormRegister } from "react-hook-form";
import type { AddQuoteFormValues, QuoteRow, QuoteTabKey } from "../../lib/types/quoteTypes";
import { showErrorAlert, showSuccessAlert } from "../../lib/global/alertHelper";
import { openConfirmDialog } from "../../components/CustomConfirmDialog";
import {
  buildCreateQuotePayload,
  buildQuoteSchedulePricePreview,
  computeAutoQuotePriceFromPartner,
  createQuote,
  deleteQuote,
  deriveQuoteScheduleMetrics,
  fetchFranchiseRelatedCatalog,
  fetchQuoteCounts,
  fetchQuotes,
  mapQuoteTabCountsFromRecord,
  buildQuoteCatalogServicesForPartner,
  buildQuoteCategoryOptionsForSelectedPartner,
  filterPartnerServicesForCategory,
  getPartnerActiveServiceProvidingRow,
  getQuoteScheduleModeForPartnerService,
  mapRelatedCatalogToQuoteOptions,
  mergeQuoteServiceFeesForBreakdown,
  normalizeQuoteListSort,
  resolveFranchiseIdForQuoteForm,
  QuoteListSort,
} from "../../services/quoteService";
import type { OptionType, QuoteUserOption } from "../../services/quoteService";
import type { ServiceDropDownOption } from "../../services/servicesService";
import { partnerCatalogControlStyle } from "../../components/partnerCatalogBlockUi";
import { getLocalStorage } from "../../lib/global/localStorageHelper";
import {
  franchiseHeaderFormDefaults,
  franchiseIdForApiQuery,
} from "../../lib/franchise/headerFranchisePreference";
import { AppConstant, UserRole } from "../../lib/global/AppConstant";
import { fetchFranchiseDropDown } from "../../services/franchiseService";
import { getCount } from "../../services/getCountService";
import {
  buildAddressLocationLookupsFromCustomers,
  buildFranchisePincodeSetFromRelatedCatalog,
  collectFranchiseAreaIds,
  computeQuotePriceBreakdown,
  formatQuoteScheduleForTable,
  parseCatalogAddressRecord,
  QUOTE_MODAL_LAYOUT,
  SCHEDULE_TIME_PICKER_INTERVAL_MINUTES,
  scheduleEndTimeMaxForDay,
  scheduleEndTimeMinAfterStart,
  setQuoteFranchiseCatalogSnapshot,
  toQuoteViewData,
} from "../../lib/quote/quoteHelpers";
import QuotePriceBreakdownPanel from "../../components/quote/QuotePriceBreakdownPanel";
import QuoteAddressOptionsLoader from "../../components/quote/QuoteAddressOptionsLoader";

/** Time-only value for `CustomTimePicker` / stored fields (same pattern as quote schedule edit). */
const toTimeStorageFromDate = (date: Date | null): string =>
  date
    ? `2000-01-01T${String(date.getHours()).padStart(2, "0")}:${String(
        date.getMinutes()
      ).padStart(2, "0")}:00`
    : "";

const timeStorageOrNull = (v: string | undefined | null): string | null =>
  v && String(v).trim() ? v : null;

type AddQuoteAddressRowUi = {
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

type AddQuoteAddressUiState = {
  ready: boolean;
  rows: AddQuoteAddressRowUi[];
  error: string;
};

const emptyAddQuoteAddressUi = (): AddQuoteAddressUiState => ({
  ready: false,
  rows: [],
  error: "",
});

const quoteTabs: { key: QuoteTabKey; label: string }[] = [
  { key: "new", label: "New" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "success", label: "Success" },
  { key: "failed", label: "Failed" },
];

const QUOTE_TABLE_STATUS_CLASS: Record<string, string> = {
  new: "text-secondary",
  pending: "text-warning",
  accepted: "text-success",
  success: "text-success",
  failed: "text-danger",
};

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

function startOfTodayLocal(): Date {
  return startOfLocalDay(new Date());
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

function isCalendarDateNotBeforeToday(iso: string): boolean {
  const d = parseIsoDateOnly(iso);
  if (!d) return false;
  return startOfLocalDay(d) >= startOfTodayLocal();
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

/** Same calendar day: end clock must be strictly after start (rejects e.g. 08:00 start / 06:00 end). */
function isScheduleEndAfterStartSameDay(start: string, end: string): boolean {
  const a = minutesFromScheduleTimeStorage(start);
  const b = minutesFromScheduleTimeStorage(end);
  if (a == null || b == null) return false;
  return b > a;
}

const addQuoteTimePickerAllowAllHours = (): boolean => true;

const QuoteManagement = () => {
  const [selectedTab, setSelectedTab] = useState<QuoteTabKey>("new");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showAddQuote, setShowAddQuote] = useState(false);
  const { register: quoteFilterRegister, setValue: setQuoteFilterValue } =
    useForm<{
      from_date: string;
      to_date: string;
    }>({
      defaultValues: { from_date: "", to_date: "" },
    });
  const { register, setValue, watch } = useForm<any>({
    defaultValues: franchiseHeaderFormDefaults(),
  });
  const headerFranchiseScope = watch("franchise_id") as string | undefined;
  const {
    register: addQuoteRegister,
    handleSubmit: handleAddQuoteSubmit,
    setValue: setAddQuoteValue,
    watch: watchAddQuote,
    reset: resetAddQuote,
    formState: { errors: addQuoteErrors, isSubmitted: addQuoteFormSubmitted },
  } = useForm<AddQuoteFormValues>({
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
    },
  });
  const addQuote = watchAddQuote();
  const [quoteCatalogServices, setQuoteCatalogServices] = useState<
    ServiceDropDownOption[]
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
  const [franchiseQuotePinSet, setFranchiseQuotePinSet] = useState<
    Set<string>
  >(() => new Set());
  /** Franchise `area_id` list from `related-catalog` — customer address must match one to be selectable. */
  const [franchiseQuoteAreaIdSet, setFranchiseQuoteAreaIdSet] = useState<
    Set<string>
  >(() => new Set());
  const [franchisePinsLoadDone, setFranchisePinsLoadDone] = useState(false);
  const [quoteEmployeeOptions, setQuoteEmployeeOptions] = useState<
    OptionType[]
  >([]);
  const [quoteCategoryOptions, setQuoteCategoryOptions] = useState<
    OptionType[]
  >([]);
  const addQuoteServiceId = String(addQuote.requested_services ?? "").trim();
  const hasAddQuoteServiceSelected = Boolean(addQuoteServiceId);
  const currentUserRole = getLocalStorage(AppConstant.userRole);
  const isSuperAdminOrStaff =
    currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.STAFF;
  const [franchiseOptionsForQuote, setFranchiseOptionsForQuote] = useState<
    OptionType[]
  >([]);
  /** Franchise portal: related-catalog path + create body; lists/counts use auth token only. */
  const sessionFranchiseIdForQuoteCatalog = useMemo(() => {
    if (isSuperAdminOrStaff) return "";
    return String(getLocalStorage(AppConstant.partnerId) ?? "").trim();
  }, [isSuperAdminOrStaff]);
  const quoteCatalogBlocked =
    !isSuperAdminOrStaff && !String(sessionFranchiseIdForQuoteCatalog).trim();
  const addQuoteFieldsLocked =
    isSuperAdminOrStaff &&
    showAddQuote &&
    !String(addQuote.franchise_id ?? "").trim();
  const addQuoteSaveDisabled =
    isSuperAdminOrStaff && showAddQuote
      ? !String(addQuote.franchise_id ?? "").trim()
      : quoteCatalogBlocked;
  const resetAddQuoteCatalogSelections = useCallback(() => {
    setAddQuoteValue("user_id", "", { shouldValidate: false });
    setAddQuoteValue("user_name", "", { shouldValidate: false });
    setAddQuoteValue("category_id", "", { shouldValidate: false });
    setAddQuoteValue("requested_services", "", { shouldValidate: false });
    setAddQuoteValue("requested_partner", "", { shouldValidate: false });
    setAddQuoteValue("employee_id", "", { shouldValidate: false });
    setAddQuoteValue("requested_date", "", { shouldValidate: false });
    setAddQuoteValue("requested_date_to", "", { shouldValidate: false });
    setAddQuoteValue("requested_time", "", { shouldValidate: false });
    setAddQuoteValue("requested_time_from", "", { shouldValidate: false });
    setAddQuoteValue("requested_time_to", "", { shouldValidate: false });
    setAddQuoteValue("service_price", "", { shouldValidate: false });
    setAddQuoteValue("user_description", "", { shouldValidate: false });
    setAddQuoteValue("admin_description", "", { shouldValidate: false });
    setCreateQuoteAddressId("");
    setAddQuoteAddressUi(emptyAddQuoteAddressUi());
  }, [setAddQuoteValue]);

  /** Avoid applying stale `related-catalog` if the user switches franchise quickly. */
  const quoteCatalogLoadSeqRef = useRef(0);
  /** Add-quote: load related-catalog once per franchise selection, not on every modal open. */
  const lastQuoteCatalogFranchiseIdRef = useRef("");

  const loadQuoteCatalogForFranchise = useCallback(
    async (franchiseId: string, opts?: { force?: boolean }) => {
      const id = String(franchiseId ?? "").trim();
      if (!id) {
        lastQuoteCatalogFranchiseIdRef.current = "";
        quoteCatalogLoadSeqRef.current += 1;
        setQuoteCatalogServices([]);
        setQuoteCategoryOptions([]);
        setQuoteEmployeeOptions([]);
        setCatalogPartnerRecords([]);
        setQuotePartnerOptions([]);
        setQuoteUserOptions([]);
        setQuoteCustomerRecords([]);
        setFranchiseQuotePinSet(new Set());
        setFranchiseQuoteAreaIdSet(new Set());
        setFranchisePinsLoadDone(true);
        setQuoteFranchiseCatalogSnapshot(null);
        return;
      }
      if (!opts?.force && id === lastQuoteCatalogFranchiseIdRef.current) {
        return;
      }
      lastQuoteCatalogFranchiseIdRef.current = id;
      const seq = (quoteCatalogLoadSeqRef.current += 1);
      setFranchisePinsLoadDone(false);
      const { success, record } = await fetchFranchiseRelatedCatalog(id);
      if (seq !== quoteCatalogLoadSeqRef.current) return;
      if (!success || !record) {
        setQuoteCatalogServices([]);
        setQuoteCategoryOptions([]);
        setQuoteEmployeeOptions([]);
        setCatalogPartnerRecords([]);
        setQuotePartnerOptions([]);
        setQuoteUserOptions([]);
        setQuoteCustomerRecords([]);
        setFranchiseQuotePinSet(new Set());
        setFranchiseQuoteAreaIdSet(new Set());
        setFranchisePinsLoadDone(true);
        setQuoteFranchiseCatalogSnapshot(null);
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
      const areaIds = collectFranchiseAreaIds(fr);
      const pinSet = buildFranchisePincodeSetFromRelatedCatalog(record);
      if (seq !== quoteCatalogLoadSeqRef.current) return;
      setFranchiseQuoteAreaIdSet(new Set(areaIds));
      setFranchiseQuotePinSet(pinSet);
      setFranchisePinsLoadDone(true);
    },
    []
  );

  const handleAddQuoteFranchiseChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const nextId = String(e.target.value ?? "").trim();
      setAddQuoteValue("franchise_id", e.target.value, { shouldValidate: true });
      resetAddQuoteCatalogSelections();
      lastQuoteCatalogFranchiseIdRef.current = "";
      if (isSuperAdminOrStaff && nextId) {
        void loadQuoteCatalogForFranchise(nextId, { force: true });
      }
    },
    [
      isSuperAdminOrStaff,
      loadQuoteCatalogForFranchise,
      resetAddQuoteCatalogSelections,
      setAddQuoteValue,
    ]
  );
  const [createQuoteAddressId, setCreateQuoteAddressId] = useState("");
  const [addQuoteAddressUi, setAddQuoteAddressUi] =
    useState<AddQuoteAddressUiState>(emptyAddQuoteAddressUi);

  const addQuoteLocationLookups = useMemo(
    () => buildAddressLocationLookupsFromCustomers(quoteCustomerRecords),
    [quoteCustomerRecords]
  );

  const addQuotePartnerSelected = Boolean(
    String(addQuote.requested_partner ?? "").trim()
  );

  const selectedPartnerCatalogRecord = useMemo(() => {
    const pid = String(addQuote.requested_partner ?? "").trim();
    if (!pid) return null;
    return (
      catalogPartnerRecords.find(
        (p) =>
          String(p.partner_id ?? p._id ?? p.user_id ?? p.id ?? "").trim() ===
          pid
      ) ?? null
    );
  }, [addQuote.requested_partner, catalogPartnerRecords]);

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

  const { quoteServiceOptionsForCategory, scheduleMode } = useMemo(() => {
    const cid = String(addQuote.category_id ?? "").trim();
    const quoteServiceOptionsForCategory = !cid
      ? []
      : filterPartnerServicesForCategory(
          quoteCatalogServicesForPartner,
          selectedPartnerCatalogRecord,
          cid
        );
    const sid = String(addQuote.requested_services ?? "").trim();
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
    addQuote.category_id,
    addQuote.requested_services,
    quoteCatalogServicesForPartner,
    selectedPartnerCatalogRecord,
  ]);

  const isAddQuoteScheduleComplete = useMemo(() => {
    if (!hasAddQuoteServiceSelected) return false;
    const d = String(addQuote.requested_date ?? "").trim();
    const dTo = String(addQuote.requested_date_to ?? "").trim();
    const tFrom = String(addQuote.requested_time_from ?? "").trim();
    const tTo = String(addQuote.requested_time_to ?? "").trim();
    if (scheduleMode === "range") {
      return Boolean(d && dTo && tFrom && tTo);
    }
    return Boolean(d && tFrom && tTo);
  }, [
    hasAddQuoteServiceSelected,
    scheduleMode,
    addQuote.requested_date,
    addQuote.requested_date_to,
    addQuote.requested_time_from,
    addQuote.requested_time_to,
  ]);

  const selectedAddQuoteServiceOption = useMemo(() => {
    const sid = addQuoteServiceId;
    if (!sid) return undefined;
    return quoteServiceOptionsForCategory.find((o) => o.value === sid);
  }, [addQuoteServiceId, quoteServiceOptionsForCategory]);

  const addQuoteFeeOptionForBreakdown = useMemo(
    () =>
      mergeQuoteServiceFeesForBreakdown(
        selectedAddQuoteServiceOption,
        selectedPartnerCatalogRecord,
        addQuoteServiceId
      ),
    [
      selectedAddQuoteServiceOption,
      selectedPartnerCatalogRecord,
      addQuoteServiceId,
    ]
  );

  const addQuotePriceBreakdown = useMemo(
    () =>
      computeQuotePriceBreakdown(
        addQuote.service_price,
        addQuoteFeeOptionForBreakdown
      ),
    [addQuote.service_price, addQuoteFeeOptionForBreakdown]
  );

  const addQuoteEndMinTime = useMemo(
    () =>
      scheduleEndTimeMinAfterStart(String(addQuote.requested_time_from ?? "")),
    [addQuote.requested_time_from]
  );

  const addQuoteSchedulePricePreview = useMemo(() => {
    if (!isAddQuoteScheduleComplete || !addQuotePartnerSelected) return null;
    const sid = String(addQuote.requested_services ?? "").trim();
    if (!sid) return null;
    const row = getPartnerActiveServiceProvidingRow(
      selectedPartnerCatalogRecord,
      sid
    );
    const metrics = deriveQuoteScheduleMetrics({
      scheduleMode,
      requested_date: String(addQuote.requested_date ?? ""),
      requested_date_to: String(addQuote.requested_date_to ?? ""),
      requested_time: String(addQuote.requested_time ?? ""),
      requested_time_from: String(addQuote.requested_time_from ?? ""),
      requested_time_to: String(addQuote.requested_time_to ?? ""),
    });
    if (!metrics || !row) return null;
    const catalogPaymentType = String(
      addQuoteFeeOptionForBreakdown?.payment_type ?? ""
    ).trim();
    return buildQuoteSchedulePricePreview(
      row,
      metrics,
      AppConstant.currencySymbol,
      catalogPaymentType
    );
  }, [
    isAddQuoteScheduleComplete,
    addQuotePartnerSelected,
    addQuote.requested_services,
    addQuote.requested_date,
    addQuote.requested_date_to,
    addQuote.requested_time,
    addQuote.requested_time_from,
    addQuote.requested_time_to,
    scheduleMode,
    selectedPartnerCatalogRecord,
    addQuoteFeeOptionForBreakdown?.payment_type,
  ]);

  useEffect(() => {
    const from = String(addQuote.requested_time_from ?? "").trim();
    const to = String(addQuote.requested_time_to ?? "").trim();
    if (!from || !to) return;
    if (!isScheduleEndAfterStartSameDay(from, to)) {
      setAddQuoteValue("requested_time_to", "", { shouldValidate: false });
    }
  }, [addQuote.requested_time_from, addQuote.requested_time_to, setAddQuoteValue]);

  const addQuoteScheduleFromDateFilter = useCallback((date: Date) => {
    return startOfLocalDay(date) >= startOfTodayLocal();
  }, []);

  const addQuoteScheduleToDateFilter = useCallback(
    (date: Date) => {
      if (startOfLocalDay(date) < startOfTodayLocal()) return false;
      const fromIso = String(addQuote.requested_date ?? "").trim();
      if (!fromIso) return true;
      const from = parseIsoDateOnly(fromIso);
      if (!from) return true;
      return startOfLocalDay(date) >= startOfLocalDay(from);
    },
    [addQuote.requested_date]
  );

  const userSelectOptions = useMemo<OptionType[]>(
    () => quoteUserOptions.map((u) => ({ value: u.value, label: u.label })),
    [quoteUserOptions]
  );

  const [quoteRows, setQuoteRows] = useState<QuoteRow[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [quoteCountsByTab, setQuoteCountsByTab] = useState<
    Partial<Record<QuoteTabKey, number>>
  >({});
  const [sortBy, setSortBy] = useState<QuoteListSort>([]);

  /** Ignore stale `fetchQuotes` responses when inputs change quickly (avoids `fetchRef` skipping in-flight work). */
  const quoteListFetchSeqRef = useRef(0);

  const quoteListFilters = useMemo(
    () => ({
      keyword: searchKeyword,
      from_date: fromDate,
      to_date: toDate,
      franchise_id:
        franchiseIdForApiQuery(headerFranchiseScope) || undefined,
    }),
    [searchKeyword, fromDate, toDate, headerFranchiseScope]
  );

  /** Refetch the paginated list for the active tab (not tab totals — those use `refreshQuoteSummaryFromGetCount`). */
  const fetchData = useCallback(async () => {
    const seq = (quoteListFetchSeqRef.current += 1);
    const res = await fetchQuotes(
      selectedTab,
      currentPage,
      pageSize,
      quoteListFilters,
      sortBy
    );
    if (seq !== quoteListFetchSeqRef.current) return;
    if (res.response) {
      setQuoteRows(res.quotes);
      setTotalPages(res.totalPages);
    } else {
      setQuoteRows([]);
      setTotalPages(0);
    }
  }, [currentPage, pageSize, quoteListFilters, selectedTab, sortBy]);

  /** Ignore stale `getCount` responses when the header franchise filter changes quickly. */
  const quoteCountsReqSeqRef = useRef(0);

  /** Tab badges: `GET /quote/getCounts` (Postman), with `POST /getCount` fallback. */
  const refreshQuoteSummaryFromGetCount = useCallback(async () => {
    const seq = (quoteCountsReqSeqRef.current += 1);
    const franchiseFilter =
      franchiseIdForApiQuery(headerFranchiseScope) || undefined;

    const fromQuoteApi = await fetchQuoteCounts(franchiseFilter);
    if (seq !== quoteCountsReqSeqRef.current) return;
    if (fromQuoteApi) {
      setQuoteCountsByTab(fromQuoteApi);
      return;
    }

    const scope =
      franchiseFilter ? { franchise_id: franchiseFilter } : undefined;
    const { responseCount, countModel } = await getCount(
      "quote-management",
      scope
    );
    if (seq !== quoteCountsReqSeqRef.current) return;
    const rec =
      countModel != null
        ? (countModel as unknown as Record<string, unknown>)
        : null;
    const mapped =
      responseCount && rec ? mapQuoteTabCountsFromRecord(rec) : null;
    if (mapped) {
      setQuoteCountsByTab(mapped);
      return;
    }
    setQuoteCountsByTab({});
  }, [headerFranchiseScope]);

  const refreshCountsThenFetchQuotes = useCallback(() => {
    return Promise.all([
      refreshQuoteSummaryFromGetCount(),
      fetchData(),
    ]).then(() => undefined);
  }, [fetchData, refreshQuoteSummaryFromGetCount]);

  const handleServerSortChange = useCallback(
    (next: { id: string; desc: boolean }[]) => {
      setSortBy(normalizeQuoteListSort(next as QuoteListSort));
      setCurrentPage(1);
    },
    []
  );

  /**
   * Franchise options for Create Quote only (super admin / staff).
   * Loads when the modal opens so we do not duplicate the header’s same `fetchFranchiseDropDown` on every page visit.
   */
  useEffect(() => {
    if (!isSuperAdminOrStaff || !showAddQuote) return;
    let cancelled = false;
    (async () => {
      const rows = await fetchFranchiseDropDown();
      if (cancelled) return;
      setFranchiseOptionsForQuote(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdminOrStaff, showAddQuote]);

  useEffect(() => {
    if (showAddQuote) return;
    lastQuoteCatalogFranchiseIdRef.current = "";
  }, [showAddQuote]);

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

  /** Clear category/service if partner-scoped options no longer include the current category. */
  useEffect(() => {
    if (!addQuotePartnerSelected) return;
    const cid = String(addQuote.category_id ?? "").trim();
    if (!cid) return;
    const ok = quoteCategoryOptionsForPartner.some(
      (c) => String(c.value) === cid
    );
    if (ok) return;
    setAddQuoteValue("category_id", "", { shouldValidate: false });
    setAddQuoteValue("requested_services", "", { shouldValidate: false });
    setAddQuoteValue("requested_date", "", { shouldValidate: false });
    setAddQuoteValue("requested_date_to", "", { shouldValidate: false });
    setAddQuoteValue("requested_time", "", { shouldValidate: false });
    setAddQuoteValue("requested_time_from", "", { shouldValidate: false });
    setAddQuoteValue("requested_time_to", "", { shouldValidate: false });
    setAddQuoteValue("service_price", "", { shouldValidate: false });
  }, [
    addQuotePartnerSelected,
    addQuote.category_id,
    quoteCategoryOptionsForPartner,
    setAddQuoteValue,
  ]);

  useEffect(() => {
    const uid = String(addQuote.user_id ?? "").trim();
    if (!uid) {
      setCreateQuoteAddressId("");
      setAddQuoteAddressUi(emptyAddQuoteAddressUi());
      return;
    }
    if (!franchisePinsLoadDone) {
      setCreateQuoteAddressId("");
      setAddQuoteAddressUi({
        ready: false,
        rows: [],
        error: "",
      });
      return;
    }

    const customer =
      quoteCustomerRecords.find(
        (c) => String(c._id ?? c.id ?? "").trim() === uid
      ) ?? null;
    if (!customer) {
      setCreateQuoteAddressId("");
      if (!franchisePinsLoadDone || quoteCustomerRecords.length === 0) {
        setAddQuoteAddressUi({
          ready: false,
          rows: [],
          error: "",
        });
        return;
      }
      setAddQuoteAddressUi({
        ready: true,
        rows: [],
        error:
          "This customer is not in the franchise list from the catalog. Pick another user or refresh.",
      });
      return;
    }

    const addrs = (customer.addresses ?? customer.user_addresses) as
      | unknown[]
      | undefined;
    const parsed = Array.isArray(addrs)
      ? addrs
          .filter((a) => a != null && typeof a === "object")
          .map((a) =>
            parseCatalogAddressRecord(
              a as Record<string, unknown>,
              addQuoteLocationLookups
            )
          )
          .filter((r): r is NonNullable<typeof r> => r != null)
      : [];

    if (!parsed.length) {
      setCreateQuoteAddressId("");
      setAddQuoteAddressUi({
        ready: true,
        rows: [],
        error: "",
      });
      return;
    }

    const areaRules = franchiseQuoteAreaIdSet;
    const hasAreaRules = areaRules.size > 0;
    const pinRules = franchiseQuotePinSet;
    const hasPinRules = pinRules.size > 0;

    const rows: AddQuoteAddressRowUi[] = parsed.map((r) => {
      let selectable = true;
      if (hasAreaRules) {
        selectable = Boolean(r.areaId && areaRules.has(r.areaId));
      } else if (hasPinRules) {
        selectable = Boolean(
          r.pinNorm.length === 6 && pinRules.has(r.pinNorm)
        );
      }
      return {
        id: r.id,
        summary: r.summary,
        selectable,
        contactName: r.contactName,
        stateName: r.stateName,
        cityName: r.cityName,
        areaName: r.areaName,
        streetAddress: r.streetAddress,
        landmark: r.landmark,
        pincode: r.pincode,
      };
    });

    if (!hasAreaRules && !hasPinRules) {
      setCreateQuoteAddressId(parsed[0].id);
      setAddQuoteAddressUi({
        ready: true,
        rows,
        error: "",
      });
      return;
    }

    const firstSelectable = rows.find((r) => r.selectable);
    if (!firstSelectable) {
      setCreateQuoteAddressId("");
      setAddQuoteAddressUi({
        ready: true,
        rows,
        error: hasAreaRules
          ? "This customer does not have an address in this franchise's service areas (no matching area)."
          : "This customer does not have an address in this franchise's service area (no matching postcode).",
      });
      return;
    }

    setCreateQuoteAddressId(firstSelectable.id);
    setAddQuoteAddressUi({
      ready: true,
      rows,
      error: "",
    });
  }, [
    addQuote.user_id,
    quoteCustomerRecords,
    franchiseQuotePinSet,
    franchiseQuoteAreaIdSet,
    franchisePinsLoadDone,
    addQuoteLocationLookups,
  ]);

  useEffect(() => {
    if (!isAddQuoteScheduleComplete || !addQuotePartnerSelected) return;
    const sid = String(addQuote.requested_services ?? "").trim();
    if (!sid) return;
    const row = getPartnerActiveServiceProvidingRow(
      selectedPartnerCatalogRecord,
      sid
    );
    const metrics = deriveQuoteScheduleMetrics({
      scheduleMode,
      requested_date: String(addQuote.requested_date ?? ""),
      requested_date_to: String(addQuote.requested_date_to ?? ""),
      requested_time: String(addQuote.requested_time ?? ""),
      requested_time_from: String(addQuote.requested_time_from ?? ""),
      requested_time_to: String(addQuote.requested_time_to ?? ""),
    });
    if (!metrics) return;
    const catalogPaymentType = String(
      addQuoteFeeOptionForBreakdown?.payment_type ?? ""
    ).trim();
    const n = row
      ? computeAutoQuotePriceFromPartner(row, metrics, catalogPaymentType)
      : 0;
    setAddQuoteValue("service_price", String(n), { shouldValidate: false });
  }, [
    isAddQuoteScheduleComplete,
    addQuotePartnerSelected,
    addQuote.requested_services,
    addQuote.requested_date,
    addQuote.requested_date_to,
    addQuote.requested_time,
    addQuote.requested_time_from,
    addQuote.requested_time_to,
    scheduleMode,
    selectedPartnerCatalogRecord,
    addQuoteFeeOptionForBreakdown?.payment_type,
    setAddQuoteValue,
  ]);

  /** Tab badges + table list load in parallel (same deps — avoids serial API waterfall). */
  useEffect(() => {
    void Promise.all([
      refreshQuoteSummaryFromGetCount(),
      fetchData(),
    ]);
  }, [refreshQuoteSummaryFromGetCount, fetchData]);

  useEffect(
    () => () => {
      setQuoteFranchiseCatalogSnapshot(null);
    },
    []
  );

  const handleTabClick = (tabKey: QuoteTabKey) => {
    setSelectedTab(tabKey);
    setCurrentPage(1);
    setSortBy([]);
  };

  const handleVoidQuote = useCallback((quote: QuoteRow) => {
    const qid = String(quote._id ?? "").trim();
    openConfirmDialog(
      `Delete quote ${quote.quote_id}? This cannot be undone.`,
      "Delete",
      "Cancel",
      async () => {
        if (!qid) {
          showErrorAlert("Missing quote id.");
          return;
        }
        const ok = await deleteQuote(qid);
        if (ok) {
          showSuccessAlert("Quote deleted.");
          void refreshCountsThenFetchQuotes();
        }
      }
    );
  }, [refreshCountsThenFetchQuotes]);

  const handleOpenCreateQuoteModal = useCallback(() => {
    setShowAddQuote(true);
    if (isSuperAdminOrStaff) return;
    const fid = String(sessionFranchiseIdForQuoteCatalog ?? "").trim();
    if (fid) void loadQuoteCatalogForFranchise(fid);
  }, [
    isSuperAdminOrStaff,
    sessionFranchiseIdForQuoteCatalog,
    loadQuoteCatalogForFranchise,
  ]);

  const handleQuoteView = useCallback(
    (row: QuoteRow) => {
      void import("./QuoteInfoDialog").then(({ default: QuoteInfoDialog }) => {
        QuoteInfoDialog.show(toQuoteViewData(row), () => {
          void refreshCountsThenFetchQuotes();
        });
      });
    },
    [refreshCountsThenFetchQuotes]
  );

  const quoteColumns = useMemo(() => {
    const actionColumn = {
      Header: "Action",
      accessor: "action",
      Cell: ({ row }: { row: any }) => (
        <CustomActionColumn
          row={row}
          onView={() => handleQuoteView(row.original as QuoteRow)}
          onDelete={() => handleVoidQuote(row.original as QuoteRow)}
        />
      ),
    };

    const dateSortAccessor = "from_date";

    const cols: any[] = [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      {
        Header: "Quote ID",
        accessor: "quote_id",
        sort: true,
        Cell: ({ row }: { row: any }) => row.original.quote_id ?? "-",
      },
    ];

    if (selectedTab === "success") {
      cols.push({
        Header: "Order ID",
        accessor: "order_id",
        Cell: ({ row }: { row: any }) => row.original.order_id ?? "-",
      });
    }

    cols.push(
      {
        Header: "Service",
        accessor: selectedTab === "success" ? "services" : "requested_services",
        sort: true,
        Cell: ({ row }: { row: any }) =>
          selectedTab === "success"
            ? row.original.services ?? row.original.requested_services ?? "-"
            : row.original.requested_services,
      }
    );

    if (selectedTab !== "new") {
      cols.push({
        Header: "Partner",
        accessor:
          selectedTab === "success" ? "partner_name" : "requested_partner",
        sort: true,
        Cell: ({ row }: { row: any }) =>
          selectedTab === "success"
            ? row.original.partner_name ?? "-"
            : row.original.requested_partner,
      });
    }

    cols.push(
      { Header: "User Name", accessor: "user_name", sort: true },
      {
        Header: "Total price",
        accessor: "total_price",
        Cell: ({ row }: { row: any }) => {
          const n =
            row.original.total_price ??
            row.original.service_price ??
            0;
          return `₹${Number(n).toFixed(2)}`;
        },
      },
      {
        Header: "Date",
        accessor: dateSortAccessor,
        sort: true,
        Cell: ({ row }: { row: any }) => (
          <span style={{ whiteSpace: "pre-line" }}>
            {formatQuoteScheduleForTable(row.original as QuoteRow, selectedTab)}
          </span>
        ),
      },
      {
        Header: "Status",
        accessor: "status",
        sort: true,
        Cell: ({ row }: { row: any }) => {
          const status = String(row.original.status ?? "-");
          const statusKey = status.toLowerCase();
          const statusClass =
            QUOTE_TABLE_STATUS_CLASS[statusKey] ?? "text-body-secondary";
          return (
            <span className={`fw-semibold ${statusClass}`}>{status}</span>
          );
        },
      },
      actionColumn
    );

    return cols;
  }, [currentPage, pageSize, selectedTab, handleQuoteView, handleVoidQuote]);

  useEffect(() => {
    if (!showAddQuote) return;
    const prefillFranchiseId = franchiseIdForApiQuery(headerFranchiseScope);
    resetAddQuote({
      franchise_id: prefillFranchiseId,
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
    });
    if (isSuperAdminOrStaff && prefillFranchiseId) {
      lastQuoteCatalogFranchiseIdRef.current = "";
      void loadQuoteCatalogForFranchise(prefillFranchiseId, { force: true });
    }
  }, [
    showAddQuote,
    resetAddQuote,
    headerFranchiseScope,
    isSuperAdminOrStaff,
    loadQuoteCatalogForFranchise,
  ]);

  const onSubmitAddQuote = async (data: AddQuoteFormValues) => {
    const price = Number.parseFloat(String(data.service_price).trim());
    if (Number.isNaN(price) || price < 0) {
      showErrorAlert("Enter a valid service price.");
      return;
    }

    const franchiseId = resolveFranchiseIdForQuoteForm(data.franchise_id);
    if (
      !franchiseId &&
      (currentUserRole === UserRole.FRANCHISE_ADMIN ||
        currentUserRole === UserRole.EMPLOYEE)
    ) {
      showErrorAlert("Franchise is not set for this session.");
      return;
    }
    if (!franchiseId && isSuperAdminOrStaff) {
      showErrorAlert("Please select a franchise.");
      return;
    }

    if (String(data.user_id ?? "").trim() && !addQuoteAddressUi.ready) {
      showErrorAlert(
        "Still loading address options for this franchise. Please wait a moment."
      );
      return;
    }

    if (addQuoteAddressUi.error) {
      showErrorAlert(addQuoteAddressUi.error);
      return;
    }

    if (!createQuoteAddressId.trim()) {
      if (!addQuoteAddressUi.rows.length) {
        showErrorAlert(
          "No saved address on file for this customer. Add an address to the user profile before creating a quote."
        );
      } else {
        showErrorAlert(
          "Select a customer address for this quote. Addresses outside this franchise's service area cannot be used."
        );
      }
      return;
    }

    if (!String(data.requested_partner ?? "").trim()) {
      showErrorAlert("Please select a partner before category and service.");
      return;
    }

    if (!String(data.requested_services ?? "").trim()) {
      showErrorAlert("Please select a service.");
      return;
    }

    if (scheduleMode === "range") {
      if (!String(data.requested_date ?? "").trim()) {
        showErrorAlert("Please select from date.");
        return;
      }
      if (!String(data.requested_date_to ?? "").trim()) {
        showErrorAlert("Please select to date.");
        return;
      }
      if (!String(data.requested_time_from ?? "").trim()) {
        showErrorAlert("Please select start time.");
        return;
      }
      if (!String(data.requested_time_to ?? "").trim()) {
        showErrorAlert("Please select end time.");
        return;
      }
    } else {
      if (!String(data.requested_date ?? "").trim()) {
        showErrorAlert("Please select a date.");
        return;
      }
      if (!String(data.requested_time_from ?? "").trim()) {
        showErrorAlert("Please select start time.");
        return;
      }
      if (!String(data.requested_time_to ?? "").trim()) {
        showErrorAlert("Please select end time.");
        return;
      }
    }

    if (!isCalendarDateNotBeforeToday(String(data.requested_date ?? "").trim())) {
      showErrorAlert("Schedule date must be today or a future date.");
      return;
    }
    if (scheduleMode === "range") {
      if (
        !isCalendarDateNotBeforeToday(
          String(data.requested_date_to ?? "").trim()
        )
      ) {
        showErrorAlert("End date must be today or a future date.");
        return;
      }
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

    // POST .../quote/create — only service_price is sent as price; tax / commission / min. deposit are UI-only.
    const body = buildCreateQuotePayload({
      user_id: data.user_id,
      category_id: data.category_id,
      service_id: data.requested_services,
      partner_id: data.requested_partner || undefined,
      employee_id: data.employee_id || undefined,
      service_price: price,
      franchise_id: franchiseId,
      address_id: createQuoteAddressId.trim(),
      scheduleMode,
      requested_date: data.requested_date,
      requested_date_to: data.requested_date_to,
      requested_time: data.requested_time,
      requested_time_from: data.requested_time_from,
      requested_time_to: data.requested_time_to,
      user_description: String(data.user_description ?? "").trim() || undefined,
      admin_description:
        String(data.admin_description ?? "").trim() || undefined,
    });

    if (!body) {
      showErrorAlert("Missing required fields.");
      return;
    }

    const ok = await createQuote(body);
    if (ok) {
      setShowAddQuote(false);
      setCreateQuoteAddressId("");
      setAddQuoteAddressUi(emptyAddQuoteAddressUi());
      showSuccessAlert("Quote created.");
      void refreshCountsThenFetchQuotes();
    }
  };

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Quote Management"
        rightActions={
          <button
            type="button"
            className="custom-btn-secondary custom-header-action-btn"
            disabled={!isSuperAdminOrStaff && quoteCatalogBlocked}
            onClick={handleOpenCreateQuoteModal}
          >
            Create Quote
          </button>
        }
        register={register}
        setValue={setValue}
      />

      {!isSuperAdminOrStaff && quoteCatalogBlocked ? (
        <div className="mt-3 px-2 text-muted small">
          Franchise is not available for this session. Create quote stays
          disabled until it is configured.
        </div>
      ) : null}

      <div className="d-flex mt-4 gap-2">
        {quoteTabs.map((tab) => (
          <CustomSummaryBox
            key={tab.key}
            divId={`quote-tab-${tab.key}`}
            title={tab.label}
            data={{ Total: quoteCountsByTab[tab.key] ?? 0 }}
            onSelect={() => handleTabClick(tab.key)}
            isSelected={selectedTab === tab.key}
            onFilterChange={() => {}}
            isAddShow={false}
          />
        ))}
      </div>

      <CustomUtilityBox
        key={utilitySearchKey}
        title="Quotes"
        searchHint={"Search service name, partner name, user name"}
        toolsInlineRow
        toolsInlineClassName="custom-utilty-tools-inline--quotes-wide-search"
        hideMoreIcon
        controlSlot={
          <>
            <div style={{ minWidth: "220px" }}>
              <Form.Label className="mb-1 fw-medium">From date</Form.Label>
              <CustomDatePicker
                label=""
                controlId="from_date"
                selectedDate={fromDate}
                onChange={(date) => {
                  const next = toIsoCalendarDate(date);
                  setFromDate(next);
                  if (next && toDate) {
                    const cmp = compareIsoDateOnlyAsc(next, toDate);
                    if (cmp != null && cmp > 0) {
                      setToDate(null);
                      setQuoteFilterValue("to_date", "");
                    }
                  }
                  setCurrentPage(1);
                }}
                register={
                  quoteFilterRegister as unknown as UseFormRegister<any>
                }
                setValue={
                  setQuoteFilterValue as (name: string, value: any) => void
                }
                asCol={false}
                groupClassName="mb-0 w-100"
                placeholderText="From date"
                filterDate={() => true}
              />
            </div>
            <div style={{ minWidth: "220px" }}>
              <Form.Label className="mb-1 fw-medium">To date</Form.Label>
              <CustomDatePicker
                label=""
                controlId="to_date"
                selectedDate={toDate}
                onChange={(date) => {
                  const next = toIsoCalendarDate(date);
                  setToDate(next);
                  setCurrentPage(1);
                }}
                register={
                  quoteFilterRegister as unknown as UseFormRegister<any>
                }
                setValue={
                  setQuoteFilterValue as (name: string, value: any) => void
                }
                asCol={false}
                groupClassName="mb-0 w-100"
                placeholderText="To date"
                filterDate={(date) => {
                  if (!fromDate) return true;
                  const from = parseIsoDateOnly(fromDate);
                  if (!from) return true;
                  return startOfLocalDay(date) >= startOfLocalDay(from);
                }}
              />
            </div>
          </>
        }
        afterSearchSlot={
          <Button
            variant="outline-secondary"
            size="sm"
            className="custom-btn-secondary partner-payout-clear-btn px-3"
            type="button"
            disabled={!fromDate && !toDate && !searchKeyword.trim()}
            onClick={() => {
              setFromDate(null);
              setToDate(null);
              setSearchKeyword("");
              setQuoteFilterValue("from_date", "");
              setQuoteFilterValue("to_date", "");
              setUtilitySearchKey((k) => k + 1);
              setCurrentPage(1);
              setSortBy([]);
            }}
          >
            Clear
          </Button>
        }
        hideUtilityActions
        onSearch={(value) => {
          setSearchKeyword(value);
          setCurrentPage(1);
        }}
        syncKeyword={searchKeyword}
      />

      <CustomTable
        columns={quoteColumns}
        data={quoteRows}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page: number) => setCurrentPage(page)}
        onLimitChange={(updatedPageSize: number) => {
          setPageSize(updatedPageSize);
          setCurrentPage(1);
        }}
        manualSortBy
        sortBy={sortBy}
        onSortChange={handleServerSortChange}
        theadClass="table-light"
      />

      <Modal
        show={showAddQuote}
        onHide={() => setShowAddQuote(false)}
        {...QUOTE_MODAL_LAYOUT}
        enforceFocus={false}
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            Add Quote
          </Modal.Title>
          <CustomCloseButton onClose={() => setShowAddQuote(false)} />
        </Modal.Header>
        <Modal.Body className="add-quote-modal-body pt-0">
          <form
            id="quote-add-form"
            noValidate
            onSubmit={handleAddQuoteSubmit(onSubmitAddQuote)}
          >
            <section className="custom-other-details add-quote-form-section">
              <div>
                <Row className="gy-3 gx-md-4 align-items-start">
                  {isSuperAdminOrStaff ? (
                    <Col xs={12} md={6}>
                      <Row className="align-items-start">
                        <Col sm={4} className="d-flex align-items-start">
                          <label
                            htmlFor="add-quote-franchise"
                            className="custom-profile-lable"
                          >
                            <FieldLabelText label="Franchise" required />
                          </label>
                        </Col>
                        <Col>
                          <Form.Select
                            id="add-quote-franchise"
                            className="form-select custom-form-input"
                            value={String(addQuote.franchise_id ?? "")}
                            onChange={handleAddQuoteFranchiseChange}
                            style={{
                              boxShadow: "none",
                              borderRadius: "8px",
                              borderColor: "var(--primary-color)",
                              fontSize: "14px",
                              fontWeight: "normal",
                              width: "100%",
                              height: "35px",
                              lineHeight: "18px",
                              backgroundColor: "var(--bg-color)",
                              fontFamily: "'Inter'",
                              color: "var(--content-txt-color)",
                            }}
                          >
                            <option value="">Select franchise…</option>
                            {franchiseOptionsForQuote.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </Form.Select>
                        </Col>
                      </Row>
                    </Col>
                  ) : null}
                  <Col xs={12} md={6}>
                    <CustomTextFieldSelect
                      label="User Name"
                      controlId="add-quote-user"
                      asCol={false}
                      options={userSelectOptions}
                      register={
                        addQuoteRegister as unknown as UseFormRegister<any>
                      }
                      fieldName="user_id"
                      error={addQuoteErrors.user_id}
                      requiredMessage="Please select a user"
                      defaultValue={addQuote.user_id}
                      setValue={
                        setAddQuoteValue as (name: string, value: any) => void
                      }
                      placeholder="Search user name or mobile"
                      menuPortal
                      isClearable
                      onChange={(e) => {
                        const uid = String(e.target.value || "");
                        const row = quoteUserOptions.find(
                          (u) => u.value === uid
                        );
                        setAddQuoteValue("user_name", row?.user_name ?? "", {
                          shouldValidate: addQuoteFormSubmitted,
                        });
                      }}
                      isDisabled={addQuoteFieldsLocked}
                    />
                  </Col>
                  {!isSuperAdminOrStaff ? (
                    <Col xs={12} md={6}>
                      <CustomTextFieldSelect
                        label="Employee"
                        controlId="add-quote-employee"
                        asCol={false}
                        options={quoteEmployeeOptions}
                        register={
                          addQuoteRegister as unknown as UseFormRegister<any>
                        }
                        fieldName="employee_id"
                        error={addQuoteErrors.employee_id}
                        defaultValue={addQuote.employee_id}
                        setValue={
                          setAddQuoteValue as (name: string, value: any) => void
                        }
                        placeholder="Select employee"
                        menuPortal
                        isClearable
                        isDisabled={addQuoteFieldsLocked}
                      />
                    </Col>
                  ) : null}
                </Row>

                {String(addQuote.user_id ?? "").trim() ? (
                  <Row className="mt-4">
                    <Col xs={12}>
                      <label
                        className="custom-profile-lable d-block"
                        style={{ fontWeight: 600, marginBottom: "1.125rem" }}
                      >
                        <FieldLabelText label="Customer addresses" required />
                      </label>
                      {!addQuoteAddressUi.ready ? (
                        <QuoteAddressOptionsLoader />
                      ) : (
                        <>
                          {addQuoteAddressUi.error ? (
                            <div className="small text-danger mb-2">
                              {addQuoteAddressUi.error}
                            </div>
                          ) : null}
                          {addQuoteAddressUi.rows.length ? (
                        <div className="add-quote-address-cards-grid mb-5">
                          {addQuoteAddressUi.rows.map((row) => {
                            const selected =
                              createQuoteAddressId === row.id &&
                              row.selectable;
                            const areaMode =
                              franchiseQuoteAreaIdSet.size > 0;
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
                              [
                                "Address",
                                row.streetAddress || addressFallback,
                              ],
                              ["Landmark", row.landmark],
                              ["Pin code", row.pincode],
                            ];
                            const pairs = pairCandidates.filter(
                              (p): p is [string, string] =>
                                Boolean(String(p[1] ?? "").trim())
                            );

                            return (
                              <div
                                key={row.id}
                                className={`add-quote-address-card-wrap p-2 ${
                                  !row.selectable
                                    ? "add-quote-address-card-wrap--muted"
                                    : ""
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
                                  transform: selected
                                    ? "translateY(-2px)"
                                    : undefined,
                                }}
                              >
                                <Form.Check
                                  type="radio"
                                  name="add-quote-address"
                                  id={`add-quote-addr-${row.id}`}
                                  disabled={!row.selectable}
                                  checked={
                                    createQuoteAddressId === row.id &&
                                    row.selectable
                                  }
                                  onChange={() => {
                                    if (row.selectable) {
                                      setCreateQuoteAddressId(row.id);
                                    }
                                  }}
                                  className="add-quote-address-card-check"
                                  style={{
                                    cursor: row.selectable
                                      ? "pointer"
                                      : "not-allowed",
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
                                          {row.selectable
                                            ? "Available"
                                            : "Unavailable"}
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
                          })}
                        </div>
                          ) : !addQuoteAddressUi.error ? (
                        <div className="small text-warning">
                          No saved address on file for this customer. Add an address
                          to the user profile before creating a quote.
                        </div>
                          ) : null}
                        </>
                      )}
                    </Col>
                  </Row>
                ) : null}

                {isSuperAdminOrStaff ? (
                  <>
                    <Row className="gy-3 gx-md-4 align-items-start">
                      <Col xs={12} md={6}>
                        <CustomTextFieldSelect
                          label="Employee"
                          controlId="add-quote-employee"
                          asCol={false}
                          options={quoteEmployeeOptions}
                          register={
                            addQuoteRegister as unknown as UseFormRegister<any>
                          }
                          fieldName="employee_id"
                          error={addQuoteErrors.employee_id}
                          defaultValue={addQuote.employee_id}
                          setValue={
                            setAddQuoteValue as (name: string, value: any) => void
                          }
                          placeholder="Select employee"
                          menuPortal
                          isClearable
                          isDisabled={addQuoteFieldsLocked}
                        />
                      </Col>
                      <Col xs={12} md={6}>
                        <CustomTextFieldSelect
                          label="Requested Partner"
                          controlId="add-quote-partner"
                          asCol={false}
                          options={quotePartnerOptions}
                          register={
                            addQuoteRegister as unknown as UseFormRegister<any>
                          }
                          fieldName="requested_partner"
                          error={addQuoteErrors.requested_partner}
                          requiredMessage="Please select a partner"
                          defaultValue={addQuote.requested_partner}
                          setValue={(name: string, value: any) => {
                            setAddQuoteValue(
                              name as keyof AddQuoteFormValues,
                              value,
                              { shouldValidate: addQuoteFormSubmitted }
                            );
                            if (name === "requested_partner") {
                              setAddQuoteValue("category_id", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_services", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_date", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_date_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_from", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("service_price", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("user_description", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("admin_description", "", {
                                shouldValidate: false,
                              });
                            }
                          }}
                          placeholder="Search partner name"
                          menuPortal
                          isClearable
                          isDisabled={addQuoteFieldsLocked}
                        />
                      </Col>
                    </Row>
                    <Row className="gy-3 gx-md-4 align-items-start">
                      <Col xs={12} md={6}>
                        <CustomTextFieldSelect
                          label="Category"
                          controlId="add-quote-category"
                          asCol={false}
                          options={quoteCategoryOptionsForPartner}
                          register={
                            addQuoteRegister as unknown as UseFormRegister<any>
                          }
                          fieldName="category_id"
                          error={addQuoteErrors.category_id}
                          requiredMessage="Please select a category"
                          defaultValue={addQuote.category_id}
                          isClearable
                          setValue={(name: string, value: any) => {
                            setAddQuoteValue(
                              name as keyof AddQuoteFormValues,
                              value,
                              { shouldValidate: addQuoteFormSubmitted }
                            );
                            if (name === "category_id") {
                              setAddQuoteValue("requested_services", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_date", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_date_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_from", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("service_price", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("user_description", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("admin_description", "", {
                                shouldValidate: false,
                              });
                            }
                          }}
                          placeholder={
                            addQuotePartnerSelected
                              ? "Select category"
                              : "Select partner first"
                          }
                          menuPortal
                          isDisabled={
                            addQuoteFieldsLocked || !addQuotePartnerSelected
                          }
                        />
                      </Col>
                      <Col xs={12} md={6}>
                        <CustomTextFieldSelect
                          key={`add-quote-svc-${addQuote.category_id || "none"}`}
                          label="Requested Services"
                          controlId="add-quote-service"
                          asCol={false}
                          options={quoteServiceOptionsForCategory}
                          register={
                            addQuoteRegister as unknown as UseFormRegister<any>
                          }
                          fieldName="requested_services"
                          error={addQuoteErrors.requested_services}
                          requiredMessage={
                            addQuote.category_id && addQuotePartnerSelected
                              ? "Please select a service"
                              : undefined
                          }
                          defaultValue={addQuote.requested_services}
                          setValue={(name: string, value: any) => {
                            setAddQuoteValue(
                              name as keyof AddQuoteFormValues,
                              value,
                              { shouldValidate: addQuoteFormSubmitted }
                            );
                            if (name === "requested_services") {
                              setAddQuoteValue("requested_date", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_date_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_from", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("service_price", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("user_description", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("admin_description", "", {
                                shouldValidate: false,
                              });
                            }
                          }}
                          placeholder={
                            !addQuotePartnerSelected
                              ? "Select partner first"
                              : !addQuote.category_id
                              ? "Select category first"
                              : "Search service name"
                          }
                          menuPortal
                          isClearable
                          isDisabled={
                            addQuoteFieldsLocked ||
                            !addQuotePartnerSelected ||
                            !String(addQuote.category_id ?? "").trim()
                          }
                        />
                      </Col>
                    </Row>
                  </>
                ) : (
                  <>
                    <Row className="gy-3 gx-md-4 align-items-start">
                      <Col xs={12} md={6}>
                        <CustomTextFieldSelect
                          label="Requested Partner"
                          controlId="add-quote-partner"
                          asCol={false}
                          options={quotePartnerOptions}
                          register={
                            addQuoteRegister as unknown as UseFormRegister<any>
                          }
                          fieldName="requested_partner"
                          error={addQuoteErrors.requested_partner}
                          requiredMessage="Please select a partner"
                          defaultValue={addQuote.requested_partner}
                          setValue={(name: string, value: any) => {
                            setAddQuoteValue(
                              name as keyof AddQuoteFormValues,
                              value,
                              { shouldValidate: addQuoteFormSubmitted }
                            );
                            if (name === "requested_partner") {
                              setAddQuoteValue("category_id", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_services", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_date", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_date_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_from", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("service_price", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("user_description", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("admin_description", "", {
                                shouldValidate: false,
                              });
                            }
                          }}
                          placeholder="Search partner name"
                          menuPortal
                          isClearable
                          isDisabled={addQuoteFieldsLocked}
                        />
                      </Col>
                      <Col xs={12} md={6}>
                        <CustomTextFieldSelect
                          label="Category"
                          controlId="add-quote-category"
                          asCol={false}
                          options={quoteCategoryOptionsForPartner}
                          register={
                            addQuoteRegister as unknown as UseFormRegister<any>
                          }
                          fieldName="category_id"
                          error={addQuoteErrors.category_id}
                          requiredMessage="Please select a category"
                          defaultValue={addQuote.category_id}
                          isClearable
                          setValue={(name: string, value: any) => {
                            setAddQuoteValue(
                              name as keyof AddQuoteFormValues,
                              value,
                              { shouldValidate: addQuoteFormSubmitted }
                            );
                            if (name === "category_id") {
                              setAddQuoteValue("requested_services", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_date", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_date_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_from", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("service_price", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("user_description", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("admin_description", "", {
                                shouldValidate: false,
                              });
                            }
                          }}
                          placeholder={
                            addQuotePartnerSelected
                              ? "Select category"
                              : "Select partner first"
                          }
                          menuPortal
                          isDisabled={
                            addQuoteFieldsLocked || !addQuotePartnerSelected
                          }
                        />
                      </Col>
                    </Row>
                    <Row className="gy-3 gx-md-4 align-items-start">
                      <Col xs={12} md={6}>
                        <CustomTextFieldSelect
                          key={`add-quote-svc-${addQuote.category_id || "none"}`}
                          label="Requested Services"
                          controlId="add-quote-service"
                          asCol={false}
                          options={quoteServiceOptionsForCategory}
                          register={
                            addQuoteRegister as unknown as UseFormRegister<any>
                          }
                          fieldName="requested_services"
                          error={addQuoteErrors.requested_services}
                          requiredMessage={
                            addQuote.category_id && addQuotePartnerSelected
                              ? "Please select a service"
                              : undefined
                          }
                          defaultValue={addQuote.requested_services}
                          setValue={(name: string, value: any) => {
                            setAddQuoteValue(
                              name as keyof AddQuoteFormValues,
                              value,
                              { shouldValidate: addQuoteFormSubmitted }
                            );
                            if (name === "requested_services") {
                              setAddQuoteValue("requested_date", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_date_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_from", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("requested_time_to", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("service_price", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("user_description", "", {
                                shouldValidate: false,
                              });
                              setAddQuoteValue("admin_description", "", {
                                shouldValidate: false,
                              });
                            }
                          }}
                          placeholder={
                            !addQuotePartnerSelected
                              ? "Select partner first"
                              : !addQuote.category_id
                              ? "Select category first"
                              : "Search service name"
                          }
                          menuPortal
                          isClearable
                          isDisabled={
                            addQuoteFieldsLocked ||
                            !addQuotePartnerSelected ||
                            !String(addQuote.category_id ?? "").trim()
                          }
                        />
                      </Col>
                    </Row>
                  </>
                )}

              {hasAddQuoteServiceSelected ? (
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
                    <Row className="gy-3 gx-md-4">
                      {scheduleMode === "range" ? (
                        <>
                          <Col xs={12} md={3}>
                            <CustomTextFieldDatePicket
                              label="From date"
                              controlId="requested_date"
                              selectedDate={addQuote.requested_date || null}
                              onChange={(date) => {
                                const next = toIsoCalendarDate(date) ?? "";
                                setAddQuoteValue("requested_date", next, {
                                  shouldValidate: true,
                                });
                              }}
                              register={
                                addQuoteRegister as unknown as UseFormRegister<any>
                              }
                              setValue={
                                setAddQuoteValue as (
                                  name: string,
                                  value: any
                                ) => void
                              }
                              asCol={false}
                              labelSize={12}
                              placeholderText="From date"
                              filterDate={addQuoteScheduleFromDateFilter}
                              required
                            />
                          </Col>
                          <Col xs={12} md={3}>
                            <CustomTextFieldDatePicket
                              label="To date"
                              controlId="requested_date_to"
                              selectedDate={addQuote.requested_date_to || null}
                              onChange={(date) => {
                                const next = toIsoCalendarDate(date) ?? "";
                                setAddQuoteValue("requested_date_to", next, {
                                  shouldValidate: true,
                                });
                              }}
                              register={
                                addQuoteRegister as unknown as UseFormRegister<any>
                              }
                              setValue={
                                setAddQuoteValue as (
                                  name: string,
                                  value: any
                                ) => void
                              }
                              asCol={false}
                              labelSize={12}
                              placeholderText="To date"
                              filterDate={addQuoteScheduleToDateFilter}
                              required
                            />
                          </Col>
                          <Col xs={12} md={3}>
                            <CustomTextFieldTimePicket
                              label="Start time"
                              controlId="requested_time_from"
                              selectedTime={timeStorageOrNull(
                                addQuote.requested_time_from
                              )}
                              onChange={(date) =>
                                setAddQuoteValue(
                                  "requested_time_from",
                                  toTimeStorageFromDate(date),
                                  { shouldValidate: true }
                                )
                              }
                              placeholderText="Select start time"
                              error={addQuoteErrors.requested_time_from}
                              register={addQuoteRegister}
                              validation={{
                                required: "Start time is required",
                              }}
                              setValue={setAddQuoteValue}
                              asCol={false}
                              labelSize={12}
                              timeIntervals={SCHEDULE_TIME_PICKER_INTERVAL_MINUTES}
                              filterTime={addQuoteTimePickerAllowAllHours}
                            />
                          </Col>
                          <Col xs={12} md={3}>
                            <CustomTextFieldTimePicket
                              label="End time"
                              controlId="requested_time_to"
                              selectedTime={timeStorageOrNull(
                                addQuote.requested_time_to
                              )}
                              onChange={(date) =>
                                setAddQuoteValue(
                                  "requested_time_to",
                                  toTimeStorageFromDate(date),
                                  { shouldValidate: true }
                                )
                              }
                              placeholderText="After start time"
                              error={addQuoteErrors.requested_time_to}
                              register={addQuoteRegister}
                              validation={{
                                required: "End time is required",
                              }}
                              setValue={setAddQuoteValue}
                              asCol={false}
                              labelSize={12}
                              minTime={addQuoteEndMinTime}
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
                              controlId="requested_date"
                              selectedDate={addQuote.requested_date || null}
                              onChange={(date) => {
                                const next = toIsoCalendarDate(date) ?? "";
                                setAddQuoteValue("requested_date", next, {
                                  shouldValidate: true,
                                });
                              }}
                              register={
                                addQuoteRegister as unknown as UseFormRegister<any>
                              }
                              setValue={
                                setAddQuoteValue as (
                                  name: string,
                                  value: any
                                ) => void
                              }
                              asCol={false}
                              labelSize={12}
                              placeholderText="Select date"
                              filterDate={addQuoteScheduleFromDateFilter}
                              required
                            />
                          </Col>
                          <Col xs={12} md={4}>
                            <CustomTextFieldTimePicket
                              label="Start time"
                              controlId="requested_time_from"
                              selectedTime={timeStorageOrNull(
                                addQuote.requested_time_from
                              )}
                              onChange={(date) =>
                                setAddQuoteValue(
                                  "requested_time_from",
                                  toTimeStorageFromDate(date),
                                  { shouldValidate: true }
                                )
                              }
                              placeholderText="Select start time"
                              error={addQuoteErrors.requested_time_from}
                              register={addQuoteRegister}
                              validation={{
                                required: "Start time is required",
                              }}
                              setValue={setAddQuoteValue}
                              asCol={false}
                              labelSize={12}
                              timeIntervals={SCHEDULE_TIME_PICKER_INTERVAL_MINUTES}
                              filterTime={addQuoteTimePickerAllowAllHours}
                            />
                          </Col>
                          <Col xs={12} md={4}>
                            <CustomTextFieldTimePicket
                              label="End time"
                              controlId="requested_time_to"
                              selectedTime={timeStorageOrNull(
                                addQuote.requested_time_to
                              )}
                              onChange={(date) =>
                                setAddQuoteValue(
                                  "requested_time_to",
                                  toTimeStorageFromDate(date),
                                  { shouldValidate: true }
                                )
                              }
                              placeholderText="After start time"
                              error={addQuoteErrors.requested_time_to}
                              register={addQuoteRegister}
                              validation={{
                                required: "End time is required",
                              }}
                              setValue={setAddQuoteValue}
                              asCol={false}
                              labelSize={12}
                              minTime={addQuoteEndMinTime}
                              maxTime={scheduleEndTimeMaxForDay()}
                              timeIntervals={SCHEDULE_TIME_PICKER_INTERVAL_MINUTES}
                            />
                          </Col>
                        </>
                      )}
                    </Row>

                    {addQuoteSchedulePricePreview ? (
                      <div className="add-quote-schedule-preview">
                        <span className="add-quote-schedule-preview-badge">
                          {addQuoteSchedulePricePreview.billingLabel}
                        </span>
                        <div className="add-quote-schedule-preview-line">
                          {addQuoteSchedulePricePreview.primaryLine}
                        </div>
                        {addQuoteSchedulePricePreview.secondaryLine ? (
                          <div className="add-quote-schedule-preview-sub">
                            {addQuoteSchedulePricePreview.secondaryLine}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
              {hasAddQuoteServiceSelected && isAddQuoteScheduleComplete ? (
                <div className="add-quote-price-section mt-4 pt-3 border-top">
                  <Row className="g-3 align-items-start mb-3">
                    <Col xs={12}>
                      <h6 className="add-quote-price-section-heading mb-0">
                        Service price
                      </h6>
                    </Col>
                    <Col xs={12} md={6} lg={5}>
                      <Form.Group controlId="service_price">
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
                            disabled={addQuoteFieldsLocked}
                            className={`custom-form-input border-start-0${
                              addQuoteErrors.service_price ? " is-invalid" : ""
                            }`}
                            style={{
                              ...partnerCatalogControlStyle,
                              borderLeft: 0,
                              borderTopLeftRadius: 0,
                              borderBottomLeftRadius: 0,
                            }}
                            placeholder="e.g. 499"
                            {...addQuoteRegister("service_price")}
                          />
                        </InputGroup>
                        {addQuoteErrors.service_price ? (
                          <div className="text-danger small mt-1">
                            {String(
                              (addQuoteErrors.service_price as { message?: string })
                                ?.message ?? ""
                            )}
                          </div>
                        ) : null}
                      </Form.Group>
                    </Col>
                  </Row>
                  <Row className="g-3">
                    <Col xs={12}>
                      <Form.Group controlId="user_description">
                        <Form.Label className="fw-medium mb-1">
                          User description
                        </Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          maxLength={2000}
                          disabled={addQuoteFieldsLocked}
                          className={`custom-form-input${
                            addQuoteErrors.user_description ? " is-invalid" : ""
                          }`}
                          style={{
                            ...partnerCatalogControlStyle,
                            minHeight: "96px",
                            resize: "vertical",
                          }}
                          placeholder="Optional notes for this quote"
                          {...addQuoteRegister("user_description")}
                        />
                        {addQuoteErrors.user_description ? (
                          <div className="text-danger small mt-1">
                            {String(
                              (addQuoteErrors.user_description as { message?: string })
                                ?.message ?? ""
                            )}
                          </div>
                        ) : null}
                      </Form.Group>
                    </Col>
                  </Row>
                  <Row className="g-3">
                    <Col xs={12}>
                      <Form.Group controlId="admin_description">
                        <Form.Label className="fw-medium mb-1">
                          Admin description
                        </Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          maxLength={2000}
                          disabled={addQuoteFieldsLocked}
                          className={`custom-form-input${
                            addQuoteErrors.admin_description ? " is-invalid" : ""
                          }`}
                          style={{
                            ...partnerCatalogControlStyle,
                            minHeight: "96px",
                            resize: "vertical",
                          }}
                          placeholder="Optional admin notes"
                          {...addQuoteRegister("admin_description")}
                        />
                        {addQuoteErrors.admin_description ? (
                          <div className="text-danger small mt-1">
                            {String(
                              (addQuoteErrors.admin_description as { message?: string })
                                ?.message ?? ""
                            )}
                          </div>
                        ) : null}
                      </Form.Group>
                    </Col>
                  </Row>
                </div>
              ) : null}
              </div>
            </section>
            {addQuotePriceBreakdown &&
            hasAddQuoteServiceSelected &&
            isAddQuoteScheduleComplete ? (
              <div className="add-quote-breakdown-end mt-3">
                <QuotePriceBreakdownPanel breakdown={addQuotePriceBreakdown} />
              </div>
            ) : null}
          </form>
        </Modal.Body>
        <Modal.Footer className="add-quote-modal-footer border-top-0">
          <Button
            type="submit"
            form="quote-add-form"
            className="custom-btn-primary"
            disabled={addQuoteSaveDisabled}
          >
            Create
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowAddQuote(false)}
          >
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default QuoteManagement;
