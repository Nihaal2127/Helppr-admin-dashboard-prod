import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, UseFormRegister } from "react-hook-form";
import { Button, Col, Form, InputGroup, Modal, Row } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import CustomTextFieldDatePicket from "../../components/CustomTextFieldDatePicket";
import CustomTextFieldSelect from "../../components/CustomTextFieldSelect";
import CustomTextFieldTimePicket from "../../components/CustomTextFieldTimePicket";
import { openDialog } from "../../lib/global/DialogManager";
import { showErrorAlert } from "../../lib/global/alertHelper";
import { AppConstant, UserRole } from "../../lib/global/AppConstant";
import { getLocalStorage } from "../../lib/global/localStorageHelper";
import type { OptionType, QuoteUserOption } from "../../services/quoteService";
import {
  fetchFranchiseRelatedCatalog,
  buildQuoteCatalogServicesForPartner,
  buildQuoteCategoryOptionsForSelectedPartner,
  filterPartnerServicesForCategory,
  getQuoteScheduleModeForPartnerService,
  mapRelatedCatalogToQuoteOptions,
  mergeQuoteServiceFeesForBreakdown,
} from "../../services/quoteService";
import { fetchOrderById } from "../../services/orderService";
import { createOrUpdateOrder } from "../../lib/order/orders";
import type { OrderModel } from "../../lib/order/orders";
import { OrderStatusEnum } from "../../lib/order/orders";
import type { ServiceDropDownOption } from "../../services/servicesService";
import type { AddQuoteFormValues } from "../../lib/types/quoteTypes";
import {
  applyCouponToQuotePriceBreakdown,
  buildFranchisePincodeSetFromRelatedCatalog,
  collectFranchiseAreaIds,
  computeQuotePriceBreakdown,
  mapOfferModelToCouponInput,
  QUOTE_MODAL_LAYOUT,
  SCHEDULE_TIME_PICKER_INTERVAL_MINUTES,
  scheduleEndTimeMaxForDay,
  scheduleEndTimeMinAfterStart,
  setQuoteFranchiseCatalogSnapshot,
  useQuoteCustomerAddressPanel,
  validateCouponForPriceBreakdown,
} from "../../lib/quote/quoteHelpers";
import { fetchActiveOffers } from "../../services/settingsService";
import type { OfferModel } from "../../lib/models/SettingsModel";
import type { QuoteAddressRowUi } from "../../lib/quote/quoteHelpers";
import {
  buildOrderEditAllUpdatePayload,
  getOrderCategoryName,
  getOrderPartnerDisplayName,
  getPrimaryServiceItem,
  orderEditAllAddressLine,
  orderPaymentExtensionChanged,
  orderPaymentInvoiceTotal,
  pickChangedOrderEditAllUpdatePayload,
  resolveOrderEditFranchiseId,
  isCompletedOrderLimitedPaymentEdit,
  isCompletedOrderWithPartialCustomerPayment,
  isCompletedOrderWithUnpaidPartnerPayment,
  partnerPaymentsEditLocked,
  resolvePaymentExtension,
  seedEditOrderFormFromRow,
  serviceNamesJoined,
  validatePaymentExtAgainstCaps,
  hasRecordedOrderPayments,
} from "../../lib/order/orders";
import type { EditOrderFormValues, OrderPaymentExtV1 } from "../../lib/order/orders";
import OrderAmountSummaryPanel from "../../components/order/OrderAmountSummaryPanel";
import OrderCouponAction from "../../components/order/OrderCouponAction";
import { buildOrderAmountSummaryFromOrder } from "../../lib/order/orderAmountSummary";
import { partnerCatalogControlStyle } from "../../components/partnerCatalogBlockUi";
import { FieldLabelText } from "../../components/RequiredFieldMark";
import QuoteAddressOptionsLoader from "../../components/quote/QuoteAddressOptionsLoader";
import { OrderPaymentEditModal } from "./orderInfoModals";
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

const isMissingOrderEditValue = (value: unknown): boolean =>
  !String(value ?? "").trim();

/** Completed-tab edit: filled fields stay read-only; missing fields can be set. */
const completedOrderFieldReadOnly = (
  completedLimited: boolean,
  locked: boolean,
  value: unknown
): boolean =>
  locked || (completedLimited && !isMissingOrderEditValue(value));

const orderEditFieldShellStyle = (
  readOnly: boolean
): React.CSSProperties | undefined =>
  readOnly ? { pointerEvents: "none", opacity: 0.65 } : undefined;

/** Partner / category / service — always locked unless completed edit + value missing. */
const completedCatalogSelectReadOnly = (
  completedLimited: boolean,
  locked: boolean,
  value: unknown
): boolean =>
  locked || !completedLimited || !isMissingOrderEditValue(value);

function collectMissingOrderEditRequiredFields(
  data: EditOrderFormValues,
  scheduleMode: string,
  opts: {
    addressUiReady: boolean;
    addressRowsCount: number;
    selectedAddressId: string;
    orderAddress: string;
    hasServiceSelected: boolean;
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

  if (opts.hasServiceSelected) {
    if (!String(data.requested_date ?? "").trim()) {
      missing.push({
        field: "requested_date",
        label: scheduleMode === "range" ? "From date" : "Date",
      });
    }
    if (scheduleMode === "range" && !String(data.requested_date_to ?? "").trim()) {
      missing.push({
        field: "requested_date_to",
        label: "To date",
      });
    }
    if (!String(data.requested_time_from ?? "").trim()) {
      missing.push({
        field: "requested_time_from",
        label: "Start time",
      });
    }
    if (!String(data.requested_time_to ?? "").trim()) {
      missing.push({
        field: "requested_time_to",
        label: "End time",
      });
    }
    const priceRaw = String(data.service_price ?? "").trim();
    const price = Number.parseFloat(priceRaw);
    if (!priceRaw || Number.isNaN(price) || price < 0) {
      missing.push({ field: "service_price", label: "Service price" });
    }
  }

  if (String(data.user_id ?? "").trim() && opts.addressUiReady) {
    if (opts.addressRowsCount > 0 && !opts.selectedAddressId.trim()) {
      missing.push({ label: "Customer address" });
    }
    if (opts.addressRowsCount === 0 && !opts.orderAddress.trim()) {
      missing.push({ label: "Customer address" });
    }
  }

  return missing;
}

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

type OrderEditAllDialogProps = {
  orderMongoId: string;
  onClose: () => void;
  onSaved?: () => void;
};

const ORDER_STATUS_OPTIONS: OptionType[] = Array.from(
  OrderStatusEnum.entries()
).map(([id, v]) => ({ value: String(id), label: v.label }));

/** Edit order: refunded status is not selectable. */
const ORDER_STATUS_OPTIONS_EDIT: OptionType[] = ORDER_STATUS_OPTIONS.filter(
  (o) => o.value !== "5"
);

function QuoteAddressPanelError({ message }: { message: string }) {
  return <p className="small text-danger mb-2">{message}</p>;
}

function mergeSelectOption(
  options: OptionType[],
  value: string | undefined | null,
  label: string | undefined | null
): OptionType[] {
  const v = String(value ?? "").trim();
  if (!v) return options;
  if (options.some((o) => o.value === v)) return options;
  const lab = String(label ?? "").trim() || v;
  return [{ value: v, label: lab }, ...options];
}

const OrderEditAllDialog: React.FC<OrderEditAllDialogProps> & {
  show: (orderMongoId: string, onSaved?: () => void) => void;
} = ({ orderMongoId, onClose, onSaved }) => {
  const currentUserRole = String(getLocalStorage(AppConstant.userRole) ?? "");
  const isSuperAdminOrStaff =
    currentUserRole === UserRole.ADMIN ||
    currentUserRole === UserRole.STAFF;

  const [orderRow, setOrderRow] = useState<OrderModel | null>(null);
  const [loadError, setLoadError] = useState("");
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [formHydrated, setFormHydrated] = useState(false);
  const [baselineReady, setBaselineReady] = useState(false);
  const paymentValidateRef = useRef<(() => boolean) | null>(null);
  const editAllBaselineRef = useRef<{
    payload: Record<string, unknown>;
    paymentExt?: OrderPaymentExtV1;
  } | null>(null);
  const lastAcceptedEditServicePriceRef = useRef("");
  const [paymentExtLive, setPaymentExtLive] = useState<OrderPaymentExtV1 | null>(
    null
  );
  const [activeCoupons, setActiveCoupons] = useState<OfferModel[]>([]);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [couponModalError, setCouponModalError] = useState("");
  const [modalCouponOfferId, setModalCouponOfferId] = useState("");
  const offerIdBeforeCouponModalRef = useRef("");
  const [couponOptions, setCouponOptions] = useState<OptionType[]>([
    { value: "", label: "Select" },
  ]);

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

  const catalogSeqRef = useRef(0);
  const orderLoadSeqRef = useRef(0);
  const initialOrderStatusRef = useRef(0);
  const [apiServiceFees, setApiServiceFees] = useState<
    ServiceDropDownOption | undefined
  >(undefined);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitted },
  } = useForm<EditOrderFormValues>({
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
      order_status: "1",
      customer_payment_status: "Unpaid",
      partner_payment_status: "Unpaid",
      offer_id: "",
    },
  });

  const form = watch();
  const offerIdWatch = String(form.offer_id ?? "").trim();
  const serviceId = String(form.requested_services ?? "").trim();
  const hasServiceSelected = Boolean(serviceId);
  useEffect(() => {
    setFormHydrated(false);
    setBaselineReady(false);
    editAllBaselineRef.current = null;
  }, [orderMongoId]);

  useEffect(() => {
    const seq = ++orderLoadSeqRef.current;
    (async () => {
      setLoadError("");
      setFormHydrated(false);
      const { order: row } = await fetchOrderById(orderMongoId);
      if (seq !== orderLoadSeqRef.current) return;
      if (!row) {
        setLoadError("Could not load this order.");
        setOrderRow(null);
        setApiServiceFees(undefined);
        return;
      }
      setOrderRow(row);
      setApiServiceFees(undefined);
      initialOrderStatusRef.current = row.order_status;
    })();
  }, [orderMongoId]);

  const franchiseIdForCatalog = useMemo(
    () => (orderRow ? resolveOrderEditFranchiseId(orderRow) : ""),
    [orderRow]
  );

  useEffect(() => {
    if (!franchiseIdForCatalog) {
      if (!orderRow) {
        setQuoteCategoryOptions([]);
        setQuoteCatalogServices([]);
        setQuoteEmployeeOptions([]);
        setCatalogPartnerRecords([]);
        setQuotePartnerOptions([]);
        setQuoteUserOptions([]);
        setQuoteCustomerRecords([]);
        setFranchiseQuotePinSet(new Set());
        setFranchiseQuoteAreaIdSet(new Set());
        setQuoteFranchiseCatalogSnapshot(null);
      }
      setFranchisePinsLoadDone(true);
      setCatalogBusy(false);
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
      setFranchiseQuoteAreaIdSet(new Set(collectFranchiseAreaIds(fr)));
      setFranchiseQuotePinSet(buildFranchisePincodeSetFromRelatedCatalog(record));
      setFranchisePinsLoadDone(true);
      setCatalogBusy(false);
    })();
  }, [franchiseIdForCatalog, orderRow]);

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
    if (!orderRow || catalogBusy || !franchisePinsLoadDone) return;
    reset(seedEditOrderFormFromRow(orderRow));
    setFormHydrated(true);
  }, [orderRow, catalogBusy, franchisePinsLoadDone, reset]);

  const orderStatusNum = orderRow?.order_status ?? 0;
  const isTerminalOrderStatus =
    orderStatusNum === 3 || orderStatusNum === 4 || orderStatusNum === 5;
  const completedLimitedPaymentEdit =
    isCompletedOrderLimitedPaymentEdit(orderRow);
  const canEditPayments =
    !isTerminalOrderStatus || completedLimitedPaymentEdit;
  const customerPaymentsReadOnly = Boolean(
    orderRow &&
      completedLimitedPaymentEdit &&
      !isCompletedOrderWithPartialCustomerPayment(orderRow)
  );
  const partnerPaymentsReadOnly =
    (orderRow != null && partnerPaymentsEditLocked(orderRow)) ||
    Boolean(
      orderRow &&
        completedLimitedPaymentEdit &&
        !isCompletedOrderWithUnpaidPartnerPayment(orderRow)
    );
  const servicesReadOnly = Boolean(orderRow && completedLimitedPaymentEdit);

  const orderAddressFallback = useMemo(() => {
    const order = orderRow;
    if (!order) return undefined;
    const rec = order as unknown as Record<string, unknown>;
    const addrInfo =
      rec.address_info &&
      typeof rec.address_info === "object" &&
      !Array.isArray(rec.address_info)
        ? (rec.address_info as Record<string, unknown>)
        : undefined;
    const addressId =
      typeof rec.address_id === "string"
        ? String(rec.address_id).trim()
        : String(addrInfo?._id ?? "").trim();
    const pick = (v: unknown) => String(v ?? "").trim();
    const state = pick(addrInfo?.state);
    const city = pick(addrInfo?.city);
    const area = pick(addrInfo?.area);
    const pincode = pick(addrInfo?.pincode);
    const street = pick(addrInfo?.address) || pick(order.address);

    if (!addressId && !addrInfo) {
      if (order.address?.trim()) {
        return { addressId: "", street: order.address.trim() };
      }
      return undefined;
    }

    return {
      addressId,
      state: state || undefined,
      city: city || undefined,
      area: area || undefined,
      street: street || undefined,
      landmark: pick(addrInfo?.landmark) || undefined,
      pincode: pincode || undefined,
    };
  }, [orderRow]);

  const preferredOrderAddressId = useMemo(() => {
    if (!orderRow) return "";
    const rec = orderRow as unknown as Record<string, unknown>;
    if (typeof rec.address_id === "string") return String(rec.address_id).trim();
    const info = rec.address_info;
    if (info && typeof info === "object" && !Array.isArray(info)) {
      const id = (info as { _id?: unknown })._id;
      return id != null ? String(id).trim() : "";
    }
    return "";
  }, [orderRow]);

  const { addressUi, selectedAddressId, setSelectedAddressId } =
    useQuoteCustomerAddressPanel({
      userId: String(form.user_id ?? "").trim(),
      quoteCustomerRecords,
      franchiseQuotePinSet,
      franchiseQuoteAreaIdSet,
      franchisePinsLoadDone,
      preferredAddressId: preferredOrderAddressId,
      quoteAddressFallback: orderAddressFallback,
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

  useEffect(() => {
    if (!orderRow || !formHydrated || catalogBusy || !franchisePinsLoadDone) {
      return;
    }
    if (editAllBaselineRef.current) return;

    const seed = seedEditOrderFormFromRow(orderRow);
    const primaryItem = getPrimaryServiceItem(orderRow);
    const baselinePaymentExt =
      canEditPayments && primaryItem
        ? resolvePaymentExtension(orderRow, primaryItem)
        : undefined;
    const baselinePrice = Number.parseFloat(String(seed.service_price ?? "").trim());
    const baselineServicePrice =
      Number.isFinite(baselinePrice) && baselinePrice >= 0 ? baselinePrice : 0;
    const baselineAddressLine = orderEditAllAddressLine(
      addressUi.rows,
      selectedAddressId,
      orderRow.address ?? ""
    );
    const baselinePayload = buildOrderEditAllUpdatePayload({
      order: orderRow,
      form: seed,
      scheduleMode,
      servicePrice: baselinePaymentExt?.serviceAmount ?? baselineServicePrice,
      addressLine: baselineAddressLine,
      selectedAddressId,
      paymentExt: baselinePaymentExt,
      invoiceTotal: baselinePaymentExt
        ? orderPaymentInvoiceTotal(
            baselinePaymentExt,
            orderRow,
            primaryItem
          )
        : baselineServicePrice,
    });
    if (baselinePayload) {
      editAllBaselineRef.current = {
        payload: baselinePayload,
        paymentExt: baselinePaymentExt,
      };
    }
    setBaselineReady(true);
  }, [
    orderRow,
    formHydrated,
    catalogBusy,
    franchisePinsLoadDone,
    addressUi.ready,
    addressUi.rows,
    selectedAddressId,
    scheduleMode,
    form.user_id,
    canEditPayments,
  ]);

  const selectedServiceOption = useMemo(() => {
    if (!serviceId) return undefined;
    return quoteServiceOptionsForCategory.find((o) => o.value === serviceId);
  }, [serviceId, quoteServiceOptionsForCategory]);

  const feeOptionForPreview = useMemo(() => {
    const merged = mergeQuoteServiceFeesForBreakdown(
      selectedServiceOption,
      selectedPartnerCatalogRecord,
      serviceId
    );
    return merged ?? apiServiceFees;
  }, [selectedServiceOption, selectedPartnerCatalogRecord, serviceId, apiServiceFees]);

  const editEndMinTime = useMemo(
    () =>
      scheduleEndTimeMinAfterStart(String(form.requested_time_from ?? "")),
    [form.requested_time_from]
  );

  const editPriceBreakdown = useMemo(
    () => computeQuotePriceBreakdown(form.service_price, feeOptionForPreview),
    [form.service_price, feeOptionForPreview]
  );

  useEffect(() => {
    void fetchActiveOffers().then((coupons) => {
      setActiveCoupons(coupons);
      setCouponOptions([
        { value: "", label: "Select" },
        ...coupons.map((o) => ({
          value: o.id,
          label: `${o.offerName} (${o.offerId})`,
        })),
      ]);
    });
  }, []);

  const selectedCouponOffer = useMemo(() => {
    if (!offerIdWatch) return null;
    return (
      activeCoupons.find(
        (o) => o.id === offerIdWatch || String(o.offerId) === offerIdWatch
      ) ?? null
    );
  }, [offerIdWatch, activeCoupons]);

  const editPaymentExtForCaps = useMemo(() => {
    if (!orderRow) return null;
    const primary = getPrimaryServiceItem(orderRow);
    return paymentExtLive ?? resolvePaymentExtension(orderRow, primary);
  }, [orderRow, paymentExtLive]);

  const couponApplyValidation = useMemo(() => {
    if (!selectedCouponOffer || !editPriceBreakdown) return null;
    const couponVal = validateCouponForPriceBreakdown(
      editPriceBreakdown,
      mapOfferModelToCouponInput(selectedCouponOffer)
    );
    if (!couponVal.valid) return couponVal;
    if (!editPaymentExtForCaps) return couponVal;
    const withCoupon = applyCouponToQuotePriceBreakdown(
      editPriceBreakdown,
      mapOfferModelToCouponInput(selectedCouponOffer),
      feeOptionForPreview
    );
    const customerCap = Number(withCoupon?.grandTotal ?? 0);
    const partnerCap = Math.max(
      0,
      Number(withCoupon?.serviceAfterCoupon ?? withCoupon?.base ?? 0)
    );
    return validatePaymentExtAgainstCaps(
      editPaymentExtForCaps,
      customerCap,
      partnerCap
    );
  }, [
    selectedCouponOffer,
    editPriceBreakdown,
    editPaymentExtForCaps,
    feeOptionForPreview,
  ]);

  const editPriceBreakdownWithCoupon = useMemo(() => {
    if (!editPriceBreakdown) return null;
    const couponOk =
      !selectedCouponOffer ||
      !couponApplyValidation ||
      couponApplyValidation.valid;
    const couponInput =
      selectedCouponOffer && couponOk
        ? mapOfferModelToCouponInput(selectedCouponOffer)
        : null;
    return applyCouponToQuotePriceBreakdown(
      editPriceBreakdown,
      couponInput,
      feeOptionForPreview
    );
  }, [
    editPriceBreakdown,
    selectedCouponOffer,
    couponApplyValidation,
    feeOptionForPreview,
  ]);

  const endAmountSummaryDisplay = useMemo(() => {
    if (!orderRow) return null;
    const primary = getPrimaryServiceItem(orderRow);
    const ext =
      paymentExtLive ?? resolvePaymentExtension(orderRow, primary);
    const finalTotal = orderPaymentInvoiceTotal(ext, orderRow, primary);
    return buildOrderAmountSummaryFromOrder(orderRow, {
      primary,
      paymentExt: ext,
      finalTotal,
    });
  }, [orderRow, paymentExtLive]);

  useEffect(() => {
    setPaymentExtLive(null);
  }, [orderRow?._id]);

  const closeCouponModal = useCallback(
    (revertOfferId: boolean) => {
      if (revertOfferId) {
        setValue("offer_id", offerIdBeforeCouponModalRef.current, {
          shouldValidate: false,
        });
      }
      setCouponModalError("");
      setOfferModalOpen(false);
    },
    [setValue]
  );

  const confirmApplyCouponFromModal = useCallback(() => {
    const id = String(modalCouponOfferId ?? "").trim();
    if (!id) {
      setValue("offer_id", "", { shouldValidate: false });
      closeCouponModal(false);
      return;
    }
    if (!editPriceBreakdown) {
      const msg = "Enter a valid service price before applying a coupon.";
      setCouponModalError(msg);
      return;
    }
    const offer =
      activeCoupons.find((o) => o.id === id || String(o.offerId) === id) ??
      null;
    if (!offer) {
      const msg = "Selected coupon is no longer available.";
      setCouponModalError(msg);
      return;
    }
    const validation = validateCouponForPriceBreakdown(
      editPriceBreakdown,
      mapOfferModelToCouponInput(offer)
    );
    if (!validation.valid) {
      setCouponModalError(validation.reason ?? "Cannot apply this coupon.");
      return;
    }
    const withCoupon = applyCouponToQuotePriceBreakdown(
      editPriceBreakdown,
      mapOfferModelToCouponInput(offer),
      feeOptionForPreview
    );
    const ext =
      editPaymentExtForCaps ??
      (orderRow
        ? resolvePaymentExtension(orderRow, getPrimaryServiceItem(orderRow))
        : null);
    if (ext) {
      const payCheck = validatePaymentExtAgainstCaps(
        ext,
        Number(withCoupon?.grandTotal ?? 0),
        Math.max(
          0,
          Number(withCoupon?.serviceAfterCoupon ?? withCoupon?.base ?? 0)
        )
      );
      if (!payCheck.valid) {
        setCouponModalError(payCheck.reason ?? "Cannot apply this coupon.");
        return;
      }
    }
    setValue("offer_id", id, { shouldValidate: false });
    setCouponModalError("");
    setOfferModalOpen(false);
  }, [
    activeCoupons,
    closeCouponModal,
    editPriceBreakdown,
    editPaymentExtForCaps,
    feeOptionForPreview,
    modalCouponOfferId,
    orderRow,
    setValue,
  ]);

  const commitEditServicePriceIfPaymentsAllow = useCallback(() => {
    if (!orderRow) return;
    const raw = String(form.service_price ?? "").trim();
    const price = Number.parseFloat(raw);
    if (Number.isNaN(price) || price < 0) return;
    const ext =
      editPaymentExtForCaps ??
      resolvePaymentExtension(orderRow, getPrimaryServiceItem(orderRow));
    if (!hasRecordedOrderPayments(ext)) {
      lastAcceptedEditServicePriceRef.current = raw;
      return;
    }
    const base = computeQuotePriceBreakdown(price, feeOptionForPreview);
    if (!base) return;
    const couponInput =
      selectedCouponOffer &&
      validateCouponForPriceBreakdown(
        base,
        mapOfferModelToCouponInput(selectedCouponOffer)
      ).valid
        ? mapOfferModelToCouponInput(selectedCouponOffer)
        : null;
    const full = applyCouponToQuotePriceBreakdown(
      base,
      couponInput,
      feeOptionForPreview
    );
    const payCheck = validatePaymentExtAgainstCaps(
      ext,
      Number(full.grandTotal ?? 0),
      Math.max(0, Number(full.serviceAfterCoupon ?? full.base ?? 0))
    );
    if (!payCheck.valid) {
      showErrorAlert(
        payCheck.reason ??
          "Payment amounts exceed the new total. Reduce or remove payments before lowering the service price."
      );
      setValue("service_price", lastAcceptedEditServicePriceRef.current, {
        shouldValidate: false,
        shouldDirty: true,
      });
      return;
    }
    lastAcceptedEditServicePriceRef.current = raw;
  }, [
    orderRow,
    form.service_price,
    editPaymentExtForCaps,
    feeOptionForPreview,
    selectedCouponOffer,
    setValue,
  ]);

  useEffect(() => {
    if (!formHydrated) return;
    const raw = String(form.service_price ?? "").trim();
    const ext =
      editPaymentExtForCaps ??
      (orderRow
        ? resolvePaymentExtension(orderRow, getPrimaryServiceItem(orderRow))
        : null);
    if (!ext || !hasRecordedOrderPayments(ext)) {
      lastAcceptedEditServicePriceRef.current = raw;
    }
  }, [formHydrated, form.service_price, editPaymentExtForCaps, orderRow]);

  useEffect(() => {
    const from = String(form.requested_time_from ?? "").trim();
    const to = String(form.requested_time_to ?? "").trim();
    if (!from || !to) return;
    if (!isScheduleEndAfterStartSameDay(from, to)) {
      setValue("requested_time_to", "", { shouldValidate: false });
    }
  }, [form.requested_time_from, form.requested_time_to, setValue]);

  /** Edit: allow any calendar date (existing quotes may be in the past). Create keeps today+. */
  const scheduleDateAllowAll = useCallback(() => true, []);

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

  const userSelectOptions = useMemo<OptionType[]>(() => {
    const base = quoteUserOptions.map((u) => ({ value: u.value, label: u.label }));
    if (!orderRow) return base;
    return mergeSelectOption(
      base,
      orderRow.user_id,
      orderRow.user_name ?? orderRow.user_info?.name
    );
  }, [quoteUserOptions, orderRow]);

  const partnerSelectOptions = useMemo(
    () =>
      orderRow
        ? mergeSelectOption(
            quotePartnerOptions,
            String(orderRow.partner_id ?? "").trim(),
            getOrderPartnerDisplayName(orderRow)
          )
        : quotePartnerOptions,
    [quotePartnerOptions, orderRow]
  );

  const categorySelectOptions = useMemo(
    () =>
      orderRow
        ? mergeSelectOption(
            quoteCategoryOptionsForPartner,
            String(orderRow.category_id ?? "").trim(),
            getOrderCategoryName(orderRow)
          )
        : quoteCategoryOptionsForPartner,
    [quoteCategoryOptionsForPartner, orderRow]
  );

  const serviceSelectOptions = useMemo(() => {
    const base = quoteServiceOptionsForCategory;
    if (!orderRow) return base;
    const primary = orderRow.service_items?.[0];
    const sid = String(
      primary?.service_id ??
        (orderRow as OrderModel & { service_id?: string }).service_id ??
        ""
    ).trim();
    return mergeSelectOption(base, sid, serviceNamesJoined(orderRow));
  }, [quoteServiceOptionsForCategory, orderRow]);

  const onSubmit = async (data: EditOrderFormValues) => {
    const id = String(orderMongoId ?? "").trim();
    if (!id) {
      showErrorAlert("Missing order id.");
      return;
    }
    if (!orderRow) {
      showErrorAlert("Order is not loaded.");
      return;
    }

    if (
      String(data.user_id ?? "").trim() &&
      !addressUi.ready &&
      !franchisePinsLoadDone
    ) {
      showErrorAlert(
        "Still loading address options for this franchise. Please wait a moment."
      );
      return;
    }
    if (addressUi.error) {
      showErrorAlert(addressUi.error);
      return;
    }

    const missingRequired = collectMissingOrderEditRequiredFields(
      data,
      scheduleMode,
      {
        addressUiReady: addressUi.ready,
        addressRowsCount: addressUi.rows.length,
        selectedAddressId,
        orderAddress: String(orderRow.address ?? "").trim(),
        hasServiceSelected,
      }
    );
    if (missingRequired.length > 0) {
      applyMissingRequiredFieldErrors(missingRequired, (field, error) => {
        setError(field as never, error);
      });
      showErrorAlert(formatMissingRequiredFieldsAlert(missingRequired));
      return;
    }

    const price = Number.parseFloat(String(data.service_price).trim());

    if (
      offerIdWatch &&
      couponApplyValidation &&
      !couponApplyValidation.valid
    ) {
      showErrorAlert(
        couponApplyValidation.reason ?? "Selected coupon cannot be applied."
      );
      return;
    }

    if (scheduleMode === "range") {
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

    const addressLine = orderEditAllAddressLine(
      addressUi.rows,
      selectedAddressId,
      orderRow.address ?? ""
    );

    const primaryItem = getPrimaryServiceItem(orderRow);
    if (!primaryItem) {
      showErrorAlert(
        "This order has no service line item. Cannot update until the order has at least one service."
      );
      return;
    }

    const baseline = editAllBaselineRef.current;
    if (!baseline?.payload) {
      showErrorAlert("Order form is still loading. Please wait and try again.");
      return;
    }

    const baselinePaymentExt = baseline.paymentExt;
    const paymentDirty = Boolean(
      paymentExtLive &&
        (!baselinePaymentExt ||
          orderPaymentExtensionChanged(
            paymentExtLive,
            baselinePaymentExt
          ))
    );
    const paymentExt =
      paymentDirty && paymentExtLive
        ? paymentExtLive
        : undefined;

    if (
      paymentDirty &&
      paymentExt &&
      paymentValidateRef.current &&
      !paymentValidateRef.current()
    ) {
      return;
    }

    const fullPayload = buildOrderEditAllUpdatePayload({
      order: orderRow,
      form: data,
      scheduleMode,
      servicePrice: paymentExt?.serviceAmount ?? price,
      addressLine,
      selectedAddressId,
      paymentExt,
      invoiceTotal: editPriceBreakdownWithCoupon?.grandTotal ?? price,
    });
    if (!fullPayload) {
      showErrorAlert(
        "Invalid schedule. Check the service date and start/end times."
      );
      return;
    }

    const payload = pickChangedOrderEditAllUpdatePayload(
      fullPayload,
      baseline.payload
    );
    if (Object.keys(payload).length === 0) {
      showErrorAlert("No changes to save.");
      return;
    }

    const ok = await createOrUpdateOrder(payload, true, id);
    if (!ok) {
      showErrorAlert("Could not update order.");
      return;
    }

    onSaved?.();
    onClose();
  };

  const lockedFields = catalogBusy || !orderRow;
  const employeeReadOnly = completedOrderFieldReadOnly(
    completedLimitedPaymentEdit,
    lockedFields,
    form.employee_id
  );
  const addressReadOnly = completedOrderFieldReadOnly(
    completedLimitedPaymentEdit,
    lockedFields,
    selectedAddressId
  );
  const partnerReadOnly = completedCatalogSelectReadOnly(
    completedLimitedPaymentEdit,
    lockedFields,
    form.requested_partner
  );
  const categoryReadOnly = completedCatalogSelectReadOnly(
    completedLimitedPaymentEdit,
    lockedFields,
    form.category_id
  );
  const serviceReadOnly = completedCatalogSelectReadOnly(
    completedLimitedPaymentEdit,
    lockedFields,
    form.requested_services
  );
  const fromDateReadOnly = completedOrderFieldReadOnly(
    completedLimitedPaymentEdit,
    lockedFields,
    form.requested_date
  );
  const toDateReadOnly = completedOrderFieldReadOnly(
    completedLimitedPaymentEdit,
    lockedFields,
    form.requested_date_to
  );
  const startTimeReadOnly = completedOrderFieldReadOnly(
    completedLimitedPaymentEdit,
    lockedFields,
    form.requested_time_from
  );
  const endTimeReadOnly = completedOrderFieldReadOnly(
    completedLimitedPaymentEdit,
    lockedFields,
    form.requested_time_to
  );
  const servicePriceReadOnly = completedOrderFieldReadOnly(
    completedLimitedPaymentEdit,
    lockedFields,
    form.service_price
  );
  const userDescriptionReadOnly = lockedFields;
  const adminDescriptionReadOnly = lockedFields;
  const orderStatusReadOnly =
    isTerminalOrderStatus ||
    completedOrderFieldReadOnly(
      completedLimitedPaymentEdit,
      lockedFields,
      form.order_status
    );

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
            name="edit-order-address"
            id={`edit-order-addr-${row.id}`}
            disabled={!row.selectable || addressReadOnly}
            checked={selectedAddressId === row.id && row.selectable}
            onChange={() => {
              if (row.selectable && !addressReadOnly) setSelectedAddressId(row.id);
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

  return (
    <Modal
      show
      onHide={onClose}
      {...QUOTE_MODAL_LAYOUT}
      enforceFocus={false}
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Edit order
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="add-quote-modal-body pt-0">
        {loadError ? (
          <div className="text-danger py-3">{loadError}</div>
        ) : !orderRow || !formHydrated ? (
          <div className="text-muted py-3">Loading order…</div>
        ) : (
          <form
            key={`order-edit-all-${orderMongoId}`}
            id="order-edit-all-form"
            className="order-edit-all-form"
            noValidate
            onSubmit={handleSubmit(onSubmit)}
          >
            <section className="custom-other-details add-quote-form-section">
              <Row className="gy-3 gx-md-4 align-items-start">
                <Col xs={12} md={6}>
                  <div className="order-edit-locked-select">
                    <CustomTextFieldSelect
                      label="User"
                      controlId="edit-order-user"
                      asCol={false}
                      options={userSelectOptions}
                      register={
                        register as unknown as UseFormRegister<AddQuoteFormValues>
                      }
                      fieldName="user_id"
                      error={errors.user_id}
                      requiredMessage="Please select a user"
                      defaultValue={form.user_id}
                      setValue={
                        setValue as (name: string, value: unknown) => void
                      }
                      placeholder="Search user"
                      menuPortal
                      isClearable={false}
                      isDisabled
                    />
                  </div>
                </Col>
                <Col xs={12} md={6}>
                  <CustomTextFieldSelect
                    label="Employee"
                    controlId={
                      isSuperAdminOrStaff
                        ? "edit-order-employee"
                        : "edit-order-employee-super"
                    }
                    asCol={false}
                    options={quoteEmployeeOptions}
                    register={
                      register as unknown as UseFormRegister<AddQuoteFormValues>
                    }
                    fieldName="employee_id"
                    error={errors.employee_id}
                    defaultValue={form.employee_id}
                    setValue={
                      setValue as (name: string, value: unknown) => void
                    }
                    placeholder="Select employee"
                    menuPortal
                    isClearable
                    isDisabled={employeeReadOnly}
                  />
                </Col>
              </Row>

              {String(form.user_id ?? "").trim() ? (
                <Row className="mt-4">
                  <Col xs={12}>
                    <label
                      className="custom-profile-lable d-block"
                      style={{ fontWeight: 600, marginBottom: "1.125rem" }}
                    >
                      <FieldLabelText label="Customer addresses" required />
                    </label>
                    {!addressUi.ready ? (
                      <QuoteAddressOptionsLoader />
                    ) : (
                      <>
                        {addressUi.error ? (
                          <QuoteAddressPanelError message={addressUi.error} />
                        ) : null}
                        {addressUi.rows.length ? (
                          <div className="add-quote-address-cards-grid mb-4">
                            {renderAddressCards(addressUi.rows)}
                          </div>
                        ) : !addressUi.error ? (
                          <div className="small text-warning">
                            No saved address on file for this customer.
                          </div>
                        ) : null}
                        {isSubmitted &&
                        !addressReadOnly &&
                        addressUi.ready &&
                        addressUi.rows.length > 0 &&
                        !selectedAddressId.trim() ? (
                          <div className="text-danger small mt-2">
                            Please select a customer address.
                          </div>
                        ) : null}
                        {isSubmitted &&
                        !addressReadOnly &&
                        addressUi.ready &&
                        addressUi.rows.length === 0 &&
                        !String(orderRow.address ?? "").trim() ? (
                          <div className="text-danger small mt-2">
                            Customer address is required.
                          </div>
                        ) : null}
                      </>
                    )}
                  </Col>
                </Row>
              ) : null}

              {orderRow ? (
                <Row className="gy-3 gx-md-4 align-items-start mt-2 order-edit-catalog-row">
                  <Col xs={12} md={6}>
                    <div
                      className={
                        partnerReadOnly ? "order-edit-locked-select" : undefined
                      }
                    >
                      <CustomTextFieldSelect
                        label="Partner"
                        controlId="edit-order-partner"
                        asCol={false}
                        options={partnerSelectOptions}
                        register={
                          register as unknown as UseFormRegister<AddQuoteFormValues>
                        }
                        fieldName="requested_partner"
                        defaultValue={form.requested_partner}
                        setValue={
                          setValue as (name: string, value: unknown) => void
                        }
                        placeholder="Partner"
                        menuPortal
                        isClearable={false}
                        isDisabled={partnerReadOnly}
                      />
                    </div>
                  </Col>
                  <Col xs={12} md={6}>
                    <div
                      className={
                        categoryReadOnly ? "order-edit-locked-select" : undefined
                      }
                    >
                      <CustomTextFieldSelect
                        label="Category"
                        controlId="edit-order-category"
                        asCol={false}
                        options={categorySelectOptions}
                        register={
                          register as unknown as UseFormRegister<AddQuoteFormValues>
                        }
                        fieldName="category_id"
                        defaultValue={form.category_id}
                        setValue={
                          setValue as (name: string, value: unknown) => void
                        }
                        placeholder="Category"
                        menuPortal
                        isClearable={false}
                        isDisabled={categoryReadOnly}
                      />
                    </div>
                  </Col>
                  <Col xs={12} md={6}>
                    <div
                      className={
                        serviceReadOnly ? "order-edit-locked-select" : undefined
                      }
                    >
                      <CustomTextFieldSelect
                        label="Service"
                        controlId="edit-order-service"
                        asCol={false}
                        options={serviceSelectOptions}
                        register={
                          register as unknown as UseFormRegister<AddQuoteFormValues>
                        }
                        fieldName="requested_services"
                        defaultValue={form.requested_services}
                        setValue={
                          setValue as (name: string, value: unknown) => void
                        }
                        placeholder="Service"
                        menuPortal
                        isClearable={false}
                        isDisabled={serviceReadOnly}
                      />
                    </div>
                  </Col>
                </Row>
              ) : null}

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
                      {scheduleMode === "range" ? (
                        <>
                          <Col
                            xs={12}
                            md={3}
                            style={orderEditFieldShellStyle(fromDateReadOnly)}
                          >
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
                              error={errors.requested_date}
                              validation={{ required: "From date is required" }}
                            />
                          </Col>
                          <Col
                            xs={12}
                            md={3}
                            style={orderEditFieldShellStyle(toDateReadOnly)}
                          >
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
                              error={errors.requested_date_to}
                              validation={{ required: "To date is required" }}
                            />
                          </Col>
                          <Col
                            xs={12}
                            md={3}
                            style={orderEditFieldShellStyle(startTimeReadOnly)}
                          >
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
                          <Col
                            xs={12}
                            md={3}
                            style={orderEditFieldShellStyle(endTimeReadOnly)}
                          >
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
                          <Col
                            xs={12}
                            md={4}
                            style={orderEditFieldShellStyle(fromDateReadOnly)}
                          >
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
                              error={errors.requested_date}
                              validation={{ required: "Date is required" }}
                            />
                          </Col>
                          <Col
                            xs={12}
                            md={4}
                            style={orderEditFieldShellStyle(startTimeReadOnly)}
                          >
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
                          <Col
                            xs={12}
                            md={4}
                            style={orderEditFieldShellStyle(endTimeReadOnly)}
                          >
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
                            disabled={servicePriceReadOnly}
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
                              onBlur: () => {
                                commitEditServicePriceIfPaymentsAllow();
                              },
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
                      <Form.Group controlId="edit-order-status" className="mb-0">
                        <Form.Label
                          htmlFor="edit-order-status"
                          className="fw-medium mb-1"
                        >
                          Order status
                        </Form.Label>
                        <Form.Select
                          id="edit-order-status"
                          className="form-select custom-form-input"
                          style={{
                            borderRadius: "8px",
                            borderColor: "var(--primary-color)",
                            height: "35px",
                            fontSize: "14px",
                          }}
                          disabled={orderStatusReadOnly}
                          {...register("order_status")}
                        >
                          {ORDER_STATUS_OPTIONS_EDIT.map((o) => (
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
                      disabled={userDescriptionReadOnly}
                      className={`custom-form-input${
                        errors.user_description ? " is-invalid" : ""
                      }`}
                      style={{
                        ...partnerCatalogControlStyle,
                        minHeight: "96px",
                        resize: "vertical",
                      }}
                      placeholder="Optional notes from the customer"
                      {...register("user_description")}
                    />
                    {errors.user_description?.message ? (
                      <div className="text-danger small mt-1">
                        {String(errors.user_description.message)}
                      </div>
                    ) : null}
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group controlId="admin_description" className="mb-0">
                    <Form.Label className="fw-medium mb-1">
                      Admin description
                    </Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      maxLength={2000}
                      disabled={adminDescriptionReadOnly}
                      className={`custom-form-input${
                        errors.admin_description ? " is-invalid" : ""
                      }`}
                      style={{
                        ...partnerCatalogControlStyle,
                        minHeight: "96px",
                        resize: "vertical",
                      }}
                      placeholder="Optional internal notes for this order"
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

            </section>

            {endAmountSummaryDisplay && hasServiceSelected ? (
              <section
                className="custom-other-details mt-4 mb-3"
                style={{
                  padding: "14px 16px",
                  borderRadius: "10px",
                  border: "1px solid var(--txtfld-border, rgba(0, 0, 0, 0.08))",
                  backgroundColor: "var(--bg-color)",
                }}
              >
                <h3 className="mb-3 pb-2 border-bottom">Payment information</h3>
                <OrderAmountSummaryPanel
                  display={endAmountSummaryDisplay}
                  variant="view"
                  style={{
                    marginTop: 0,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                  }}
                >
                  {!lockedFields && !isTerminalOrderStatus ? (
                    <OrderCouponAction
                      hasCoupon={Boolean(offerIdWatch)}
                      onApply={() => {
                        offerIdBeforeCouponModalRef.current = String(
                          offerIdWatch ?? ""
                        ).trim();
                        setModalCouponOfferId(
                          offerIdBeforeCouponModalRef.current
                        );
                        setCouponModalError("");
                        setOfferModalOpen(true);
                      }}
                      onRemove={() =>
                        setValue("offer_id", "", { shouldValidate: false })
                      }
                    />
                  ) : null}
                </OrderAmountSummaryPanel>
              </section>
            ) : null}

            {canEditPayments ? (
              <section className="custom-other-details add-quote-form-section mt-3 mb-2">
                <h6
                  className="mb-1 pb-2 border-bottom"
                  style={{ fontWeight: 600 }}
                >
                  Payments & charges
                </h6>
                <p className="text-muted small mb-3">
                  Services — Here you can add additional service charges as extra
                  line items. Changes are saved when you click Update.
                </p>
                <OrderPaymentEditModal
                  key={`order-pay-edit-${orderMongoId}`}
                  embedded
                  order={orderRow}
                  validateRef={paymentValidateRef}
                  onExtChange={setPaymentExtLive}
                  onClose={() => {}}
                  onSaved={() => {}}
                  customerPaymentsReadOnly={customerPaymentsReadOnly}
                  partnerPaymentsReadOnly={partnerPaymentsReadOnly}
                  servicesReadOnly={servicesReadOnly}
                />
              </section>
            ) : null}
          </form>
        )}
      </Modal.Body>
      {!loadError && orderRow && formHydrated ? (
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
            form="order-edit-all-form"
            className="custom-btn-primary"
            disabled={lockedFields || !baselineReady}
          >
            Update
          </Button>
        </Modal.Footer>
      ) : null}
      <Modal
        show={offerModalOpen}
        onHide={() => closeCouponModal(true)}
        centered
        enforceFocus={false}
      >
        <Modal.Header closeButton className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            Apply coupon
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="px-4 pb-4 pt-0">
          <CustomTextFieldSelect
            label="Coupon"
            controlId="edit-order-coupon-modal"
            options={couponOptions}
            placeholder="Select coupon"
            register={register as unknown as UseFormRegister<AddQuoteFormValues>}
            fieldName="offer_id"
            defaultValue={form.offer_id}
            setValue={setValue as (name: string, value: unknown) => void}
            menuPortal
            onChange={() => setCouponModalError("")}
          />
          {couponModalError ? (
            <p className="small text-danger mb-0 mt-2" role="alert">
              {couponModalError}
            </p>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="border-top-0">
          <Button
            type="button"
            variant="secondary"
            onClick={() => closeCouponModal(true)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="custom-btn-primary"
            onClick={confirmApplyCouponFromModal}
          >
            Apply
          </Button>
        </Modal.Footer>
      </Modal>
    </Modal>
  );
};

OrderEditAllDialog.show = (orderMongoId: string, onSaved?: () => void) => {
  openDialog("order-edit-all-modal", (close) => (
    <OrderEditAllDialog
      orderMongoId={orderMongoId}
      onClose={close}
      onSaved={onSaved}
    />
  ));
};

export default OrderEditAllDialog;
