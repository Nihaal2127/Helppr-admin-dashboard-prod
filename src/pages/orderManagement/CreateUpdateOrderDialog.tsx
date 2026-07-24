import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useForm, UseFormUnregister, UseFormSetValue, UseFormRegister } from "react-hook-form";
import { Modal, Button, Row, Col, Form, Table, InputGroup } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { OrderModel, OrderItemModel, orderPaymentModeSelectOptions } from "../../lib/order/orders";
import type { ServiceAddressCard, AddressCityDropdownRow } from "../../lib/order/orders";
import { ShowDetailsRow } from "../../components/ShowDetailsRow";
import { fetchCategoryDropDown } from "../../services/categoryService";
import {
  applyOrderScheduleMetricsToBody,
  applyOrderTopLevelScheduleDates,
  buildCreateOrderPayload,
  canAddAnotherCustomerPayment,
  canAddAnotherPartnerPayment,
  createOrUpdateOrder,
  deriveOrderCustomerPaymentFields,
  isCustomerPaymentRowComplete,
  isPartnerPaymentRowComplete,
  normalizePaymentExtForSubmit,
  roundMoney,
} from "../../lib/order/orders";
import { fetchCityDropDown } from "../../services/cityService";
import { fetchTaxOtherChargesById } from "../../services/taxOtherChargesService";
import CustomTextField from "../../components/CustomTextField";
import CustomTextFieldIndiaMobile from "../../components/CustomTextFieldIndiaMobile";
import CustomTextFieldSelect from "../../components/CustomTextFieldSelect";
import CustomTextFieldDatePicket from "../../components/CustomTextFieldDatePicket";
import CustomTextFieldTimePicket from "../../components/CustomTextFieldTimePicket";
import { CustomFormInput } from "../../components/CustomFormInput";
import CustomDatePicker from "../../components/CustomDatePicker";
import CustomFormSelect from "../../components/CustomFormSelect";
import { FieldLabelText } from "../../components/RequiredFieldMark";
import { openConfirmDialog } from "../../components/CustomConfirmDialog";
import { APP_USER_TYPE, fetchUserDropDown } from "../../services/userService";
import { fetchActiveOffers } from "../../services/settingsService";
import type { OfferModel } from "../../lib/models/SettingsModel";
import { UserModel } from "../../lib/models/UserModel";
import { getLocalStorage } from "../../lib/global/localStorageHelper";
import {
  formatMoney2,
  parseMoneyInput,
  paymentAmountFieldValue,
  paymentRowEffectiveAmount,
  sanitizeMoneyInput,
  normalizePaymentMethod,
  paymentMethodSelectOptions,
} from "../../lib/global/paymentAndCurrency";
import { AppConstant, UserRole } from "../../lib/global/AppConstant";
import {
  franchiseIdForApiQuery,
  readHeaderFranchisePreference,
} from "../../lib/franchise/headerFranchisePreference";
import { showErrorAlert } from "../../lib/global/alertHelper";
import {
  nationalDigitsWithoutIndia91,
  sanitizeIndiaNationalPhoneInput,
  fullPhoneFromIndiaNational,
} from "../../lib/user/userFormValidation";
import { TaxOtherChargesModel } from "../../lib/models/TaxOtherChargesModel";
import { openDialog } from "../../lib/global/DialogManager";
import type {
  CustomerPaymentRow,
  PartnerPaymentRow,
} from "../../lib/order/orderPaymentRows";
import type { OrderPaymentExtV1 } from "../../lib/order/orders";
import {
  sumCustomerAmounts,
  sumPartnerAmounts,
  customerPaidBalanceForEdit,
  partnerPaidBalanceForEdit,
  validatePaymentExtAgainstCaps,
  hasRecordedOrderPayments,
} from "../../lib/order/orders";
import {
  computeQuotePriceBreakdown,
  applyCouponToQuotePriceBreakdown,
  mapOfferModelToCouponInput,
  validateCouponForPriceBreakdown,
} from "../../lib/quote/quoteHelpers";
import { sanitizeIndianPincodeInput } from "../../lib/user/pincodeValidation";
import type { CustomerSavedAddressPreview } from "../../lib/user/userAddressPreview";
import { fetchServiceDropDown } from "../../services/servicesService";
import { fetchPartnerDropDown } from "../../services/userService";
import addIcon from "../../assets/icons/add.svg";
import { fetchFranchiseDropDown } from "../../services/franchiseService";
import {
  fetchFranchiseRelatedCatalog,
  mapRelatedCatalogToQuoteOptions,
  buildQuoteCatalogServicesForPartner,
  buildQuoteCategoryOptionsForSelectedPartner,
  filterPartnerServicesForCategory,
  getPartnerActiveServiceProvidingRow,
  getQuoteScheduleModeForPartnerService,
  mergeQuoteServiceFeesForBreakdown,
  deriveQuoteScheduleMetrics,
  buildQuoteSchedulePricePreview,
  computeAutoQuotePriceFromPartner,
  resolveFranchiseIdForQuoteForm,
} from "../../services/quoteService";
import type { OptionType } from "../../services/quoteService";
import type { ServiceDropDownOption } from "../../services/servicesService";
import { normalizeServiceCategoryRef } from "../../services/servicesService";
import { partnerCatalogControlStyle } from "../../components/partnerCatalogBlockUi";
import QuoteAddressOptionsLoader from "../../components/quote/QuoteAddressOptionsLoader";
import { formatQuoteAddressRowAsServiceLine } from "../../lib/quote/quoteAddressCore";
import {
  buildFranchisePincodeSetFromRelatedCatalog,
  collectFranchiseAreaIds,
  compareIsoDateOnlyAsc,
  isCalendarDateNotBeforeToday,
  isScheduleEndAfterStartSameDay,
  parseIsoDateOnly,
  QUOTE_MODAL_LAYOUT,
  quoteScheduleTimePickerAllowAllHours,
  SCHEDULE_TIME_PICKER_INTERVAL_MINUTES,
  scheduleEndTimeMaxForDay,
  scheduleEndTimeMinAfterStart,
  setQuoteFranchiseCatalogSnapshot,
  startOfLocalDay,
  startOfTodayLocal,
  toIsoCalendarDate,
  useQuoteCustomerAddressPanel,
} from "../../lib/quote/quoteHelpers";
import OrderAmountSummaryPanel from "../../components/order/OrderAmountSummaryPanel";
import { deriveOrderScheduleMetrics } from "../../lib/order/orderScheduleMetrics";
import OrderCouponAction from "../../components/order/OrderCouponAction";
import { buildOrderAmountSummaryFromQuoteBreakdown } from "../../lib/order/orderAmountSummary";
import { datePickerTimeToScheduleStorage } from "../../lib/order/orderTimeUtils";

/** --- Service address cards --- */

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const sanId = (id: string) => String(id).replace(/[^a-zA-Z0-9_]/g, "_");
const fieldState = (cardId: string) => `addrCard_${sanId(cardId)}_state`;
const fieldCity = (cardId: string) => `addrCard_${sanId(cardId)}_city`;

/** Clear react-hook-form keys for removed/replaced address cards (dynamic `addrCard_*` fields). */
export function unregisterServiceAddressCardFields(
  unregister: UseFormUnregister<any> | undefined,
  cardIds: readonly string[]
) {
  if (!unregister) return;
  for (const id of cardIds) {
    unregister(fieldState(id));
    unregister(fieldCity(id));
  }
}

export function getServiceAddressCardFieldNames(cardId: string) {
  return { stateField: fieldState(cardId), cityField: fieldCity(cardId) };
}

const miniCardBase: React.CSSProperties = {
  borderRadius: "10px",
  padding: "12px 14px",
  backgroundColor: "var(--bg-color)",
  height: "100%",
};

const savedCardShell: React.CSSProperties = {
  ...miniCardBase,
  border: "1px dashed var(--primary-color)",
  boxShadow: "none",
};

const stackLabel: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  color: "var(--content-txt-color, #6c757d)",
  marginBottom: "4px",
};

const stackValue: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 500,
  fontFamily: "Inter, sans-serif",
  color: "var(--txt-color)",
  wordBreak: "break-word",
};

/** Primary / focus colors for “active address” checkbox — aligned with `CustomFormSwitch` theme. */
const SERVICE_ADDR_CHECKBOX_THEME_CSS = `
.service-addr-active-check .form-check-input {
  cursor: pointer;
  border-color: var(--primary-color) !important;
  background-color: var(--bg-color) !important;
}
.service-addr-active-check .form-check-input:checked {
  background-color: var(--primary-color) !important;
  border-color: var(--primary-color) !important;
}
.service-addr-active-check .form-check-input:focus {
  border-color: var(--primary-color) !important;
  box-shadow: 0 0 0 0.1rem rgba(155, 12, 12, 1) !important;
}
`;

export function serializeServiceAddressCards(
  cards: ServiceAddressCard[] | undefined
): string {
  if (!cards?.length) return "";
  const sorted = [...cards].sort((a, b) => {
    if (!!a.isActive === !!b.isActive) return 0;
    return a.isActive ? -1 : 1;
  });
  return sorted
    .map((c) => {
      const parts = [
        c.line?.trim(),
        c.postal?.trim(),
        c.cityLabel?.trim(),
        c.stateLabel?.trim(),
      ].filter(Boolean);
      return parts.join(", ");
    })
    .filter(Boolean)
    .join("\n---\n");
}

type ServiceAddressCardsPanelProps = {
  cards: ServiceAddressCard[];
  onChange: (next: ServiceAddressCard[]) => void;
  register: UseFormRegister<any>;
  setValue: UseFormSetValue<any>;
  unregister?: UseFormUnregister<any>;
  stateOptions: { value: string; label: string }[];
  cityRows: AddressCityDropdownRow[];
  /** Selected customer profile address(es) — read-only context above editable service cards. */
  customerSavedAddresses?: CustomerSavedAddressPreview[];
};

const ServiceAddressCardsPanel: React.FC<ServiceAddressCardsPanelProps> = ({
  cards,
  onChange,
  register,
  setValue,
  unregister,
  stateOptions,
  cityRows,
  customerSavedAddresses,
}) => {
  const patchCard = (id: string, patch: Partial<ServiceAddressCard>) => {
    onChange(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const setExclusiveActive = (id: string) => {
    onChange(cards.map((c) => ({ ...c, isActive: c.id === id })));
  };

  const clearActiveAndPickFirst = (exceptId: string) => {
    const others = cards.filter((c) => c.id !== exceptId);
    const pick = others[0]?.id;
    if (!pick) {
      onChange(cards.map((c) => ({ ...c, isActive: true })));
      return;
    }
    onChange(cards.map((c) => ({ ...c, isActive: c.id === pick })));
  };

  const addCard = () => {
    onChange([
      ...cards,
      {
        id: newId(),
        stateId: "",
        cityId: "",
        postal: "",
        line: "",
        stateLabel: "",
        cityLabel: "",
        isActive: false,
      },
    ]);
  };

  const removeCard = (id: string) => {
    if (cards.length <= 1) return;
    openConfirmDialog("Remove this address?", "Delete", "Cancel", () => {
      unregister?.(fieldState(id));
      unregister?.(fieldCity(id));
      const next = cards.filter((c) => c.id !== id);
      if (!next.some((c) => c.isActive)) {
        onChange(next.map((c, i) => ({ ...c, isActive: i === 0 })));
      } else {
        onChange(next);
      }
    });
  };

  const cityOptionsForCard = (
    stateId: string
  ): { value: string; label: string }[] => {
    if (!stateId?.trim()) {
      return [{ value: "", label: "Select state first" }];
    }
    const filtered = cityRows.filter((r) => r.state_id === stateId);
    if (!filtered.length) {
      return [{ value: "", label: "No cities for state" }];
    }
    return [
      { value: "", label: "Select city" },
      ...filtered.map((r) => ({ value: r.value, label: r.label })),
    ];
  };

  const rows: ServiceAddressCard[][] = [];
  for (let i = 0; i < cards.length; i += 4) {
    rows.push(cards.slice(i, i + 4));
  }

  return (
    <div className="mt-3 pt-3 border-top">
      <style>{SERVICE_ADDR_CHECKBOX_THEME_CSS}</style>
      {customerSavedAddresses?.length ? (
        <div className="mb-3">
          <div
            className="fw-semibold mb-2"
            style={{
              fontSize: "13px",
              color: "var(--content-txt-color, #6c757d)",
            }}
          >
            Customer address on file
          </div>
          <Row className="g-3 mb-1">
            {customerSavedAddresses.map((a, idx) => (
              <Col key={`saved-${idx}`} xs={12} md={6} lg={3}>
                <div style={savedCardShell}>
                  <div
                    className="fw-semibold mb-2"
                    style={{ fontSize: "14px", color: "var(--primary-color)" }}
                  >
                    Saved address
                  </div>
                  <div className="mb-2">
                    <div style={stackLabel}>State</div>
                    <div style={stackValue}>{a.stateLabel}</div>
                  </div>
                  <div className="mb-2">
                    <div style={stackLabel}>City</div>
                    <div style={stackValue}>{a.cityLabel}</div>
                  </div>
                  <div className="mb-2">
                    <div style={stackLabel}>Postal Code</div>
                    <div style={stackValue}>{a.postal}</div>
                  </div>
                  <div className="mb-0">
                    <div style={stackLabel}>Address</div>
                    <div style={stackValue}>{a.line}</div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      ) : null}
      <Row className="align-items-center mb-2">
        <Col>
          <span className="custom-profile-lable">
            <FieldLabelText label="Service addresses" required />
          </span>
        </Col>
        <Col xs="auto">
          <span
            style={{ color: "var(--primary-color)", cursor: "pointer" }}
            className="p-0 text-decoration-none"
            onClick={addCard}
          >
            + Add address
          </span>
        </Col>
      </Row>
      {rows.map((rowCards, rowIdx) => (
        <Row key={rowIdx} className="mb-2">
          {rowCards.map((card, colIdx) => {
            const globalIdx = rowIdx * 4 + colIdx + 1;
            const cityOpts = cityOptionsForCard(card.stateId);
            const active = !!card.isActive;
            const cardShell: React.CSSProperties = {
              ...miniCardBase,
              border: active
                ? "1px solid var(--primary-color)"
                : "1px solid var(--txtfld-border, rgba(0, 0, 0, 0.1))",
              boxShadow: active ? "0 0 0 1px var(--primary-color)" : undefined,
            };
            return (
              <Col key={card.id} xs={12} md={6} lg={3}>
                <div style={cardShell}>
                  <div className="d-flex justify-content-between align-items-center mb-2 gap-2">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span
                        className="fw-semibold"
                        style={{ color: "var(--primary-color)" }}
                      >
                        Address {globalIdx}
                      </span>
                    </div>
                    <div className="d-flex align-items-center gap-2 flex-shrink-0">
                      <Form.Check
                        type="checkbox"
                        id={`addr-active-${card.id}`}
                        className="service-addr-active-check"
                        checked={active}
                        onChange={(e) => {
                          const on = e.target.checked;
                          if (on) setExclusiveActive(card.id);
                          else if (cards.length <= 1) {
                            patchCard(card.id, { isActive: true });
                          } else if (active) {
                            clearActiveAndPickFirst(card.id);
                          }
                        }}
                        title="Primary address"
                        aria-label="Set as active address"
                      />

                      <i
                        className="bi bi-trash text-danger"
                        role="button"
                        title="Delete"
                        style={{ fontSize: "0.95rem" }}
                        onClick={() => removeCard(card.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            removeCard(card.id);
                          }
                        }}
                        tabIndex={0}
                        aria-label="Delete address"
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <CustomTextFieldSelect
                      label="State"
                      controlId={`addr-state-${card.id}`}
                      options={stateOptions}
                      register={register}
                      fieldName={fieldState(card.id)}
                      defaultValue={card.stateId}
                      setValue={setValue as (name: string, value: any) => void}
                      menuPortal
                      labelSize={12}
                      noRowBottomMargin
                      noBottomMargin
                      placeholder="Select state"
                      onChange={(e) => {
                        const v = e.target.value;
                        const label =
                          stateOptions
                            .find((o) => o.value === v)
                            ?.label?.trim() ?? "";
                        patchCard(card.id, {
                          stateId: v,
                          cityId: "",
                          cityLabel: "",
                          stateLabel: label,
                        });
                        setValue(fieldCity(card.id), "", {
                          shouldValidate: false,
                        });
                      }}
                    />
                  </div>
                  <div
                    className="mb-2"
                    key={`city-wrap-${card.id}-${card.stateId}`}
                  >
                    <CustomTextFieldSelect
                      label="City"
                      controlId={`addr-city-${card.id}`}
                      options={cityOpts}
                      register={register}
                      fieldName={fieldCity(card.id)}
                      defaultValue={card.cityId}
                      setValue={setValue as (name: string, value: any) => void}
                      menuPortal
                      labelSize={12}
                      noRowBottomMargin
                      noBottomMargin
                      placeholder="Select city"
                      onChange={(e) => {
                        const v = e.target.value;
                        const label =
                          cityOpts.find((o) => o.value === v)?.label?.trim() ??
                          "";
                        patchCard(card.id, { cityId: v, cityLabel: label });
                      }}
                    />
                  </div>
                  <div className="mb-2">
                    <div className="d-block" style={stackLabel}>
                      Postal Code
                    </div>
                    <Form.Control
                      className="custom-form-input"
                      type="tel"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit PIN"
                      value={card.postal}
                      onChange={(e) =>
                        patchCard(card.id, {
                          postal: sanitizeIndianPincodeInput(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="mb-0">
                    <div className="d-block" style={stackLabel}>
                      Address
                    </div>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      className="custom-form-input"
                      placeholder="Street, building, etc."
                      value={card.line}
                      onChange={(e) =>
                        patchCard(card.id, { line: e.target.value })
                      }
                    />
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      ))}
    </div>
  );
};

/** --- Service line item form --- */

const newAddressCardId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const defaultAddressCard = (isActive = true): ServiceAddressCard => ({
  id: newAddressCardId(),
  stateId: "",
  cityId: "",
  postal: "",
  line: "",
  stateLabel: "",
  cityLabel: "",
  isActive,
});

function customerHasAddressFields(user: UserModel): boolean {
  return !!(
    (user.state_id ?? "").trim() ||
    (user.city_id ?? "").trim() ||
    (user.pincode ?? "").trim() ||
    (user.address ?? "").trim()
  );
}

/** Primary card from profile + one blank card (create order / service locations). */
function buildAddressCardsFromCustomer(
  user: UserModel | undefined | null
): ServiceAddressCard[] {
  if (!user || !customerHasAddressFields(user)) {
    return [defaultAddressCard(true)];
  }
  return [
    {
      id: newAddressCardId(),
      stateId: (user.state_id ?? "").trim(),
      cityId: (user.city_id ?? "").trim(),
      postal: sanitizeIndianPincodeInput(String(user.pincode ?? "")),
      line: (user.address ?? "").trim(),
      stateLabel: (user.state_name ?? "").trim(),
      cityLabel: (user.city_name ?? "").trim(),
      isActive: true,
    },
    defaultAddressCard(false),
  ];
}

function syncAddrSelectFieldsToForm(
  setValue: (
    name: string,
    value: unknown,
    opts?: { shouldValidate?: boolean }
  ) => void,
  cards: ServiceAddressCard[]
) {
  queueMicrotask(() => {
    for (const c of cards) {
      const { stateField, cityField } = getServiceAddressCardFieldNames(c.id);
      setValue(stateField, c.stateId, { shouldValidate: false });
      setValue(cityField, c.cityId, { shouldValidate: false });
    }
  });
}

const servicePriceFieldValidation = {
  required: "Service price is required",
  validate: (v: unknown): string | true => {
    if (v === "" || v === null || v === undefined) {
      return "Service price is required";
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return "Enter a valid number";
      if (v <= 0) return "Enter an amount greater than 0";
      return true;
    }
    const raw = String(v).trim().replace(/,/g, "");
    if (raw === "" || raw === ".") return "Service price is required";
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return "Enter a valid number";
    if (n <= 0) return "Enter an amount greater than 0";
    return true;
  },
};

type ServiceItemFormProps = {
  taxDetails: TaxOtherChargesModel;
  categoryId: string;
  onChange: (items: OrderItemModel[]) => void;
  register: any;
  setValue: any;
  getValues: any;
  errors: any;
  /** Add Order: compact layout; fees still derived from entered service price. */
  compact?: boolean;
  /** Create order: only one line item, no add/remove controls. */
  singleServiceOnly?: boolean;
  /** Render rows inside a parent section (no inner "Service" card chrome). */
  embedded?: boolean;
  /** Hide service date / time row (parent renders “Scheduled Date/Time”). */
  omitSchedule?: boolean;
  /** Multi-address card grid instead of a single textarea. */
  useAddressCards?: boolean;
  /** When `omitSchedule`, parent-owned date/time is merged from here (create order). */
  scheduleMirror?: OrderItemModel[];
  /** Create flow: states/cities from parent `fetchCityDropDown` (no extra fetches). */
  addressStateOptions?: { value: string; label: string }[];
  addressCityRows?: AddressCityDropdownRow[];
  unregister?: UseFormUnregister<any>;
  /** Create order: pre-fill first service address card(s) when a customer is chosen. */
  serviceAddressSeedUser?: UserModel | null;
};

const ServiceItemForm: React.FC<ServiceItemFormProps> = ({
  taxDetails,
  categoryId,
  onChange,
  register,
  setValue,
  getValues,
  errors,
  compact = false,
  singleServiceOnly = false,
  embedded = false,
  omitSchedule = false,
  useAddressCards = false,
  scheduleMirror,
  addressStateOptions,
  addressCityRows,
  unregister,
  serviceAddressSeedUser,
}) => {
  const [services, setService] = useState<
    { value: string; label: string; price?: number }[]
  >([]);
  const [partners, setPartner] = useState<{ value: string; label: string }[]>(
    []
  );
  const prevCategoryRef = useRef<string | null>(null);
  const [serviceItems, setServiceItems] = useState<OrderItemModel[]>([
    {
      service_id: "",
      service_price: 0,
      partner_id: "",
      service_address: "",
      service_date: "",
      service_from_time: "",
      service_to_time: "",
      sub_total: 0,
      tax: 0,
      user_paltform_fee: 0,
      partner_commison_platform_fee: 0,
      partner_earning: 0,
      total_price: 0,
      admin_earning: 0,
      address_cards: [defaultAddressCard(true)],
    },
  ]);
  const fetchRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastSeededUserIdRef = useRef<string>("");

  useEffect(() => {
    onChangeRef.current(serviceItems);
  }, [serviceItems]);

  /* eslint-disable react-hooks/exhaustive-deps -- mirror row 0 schedule; granular deps avoid parent object churn */
  useEffect(() => {
    if (!omitSchedule || !scheduleMirror?.length) return;
    const m0 = scheduleMirror[0];
    setServiceItems((prev) => {
      if (!prev.length) return prev;
      const s0 = prev[0];
      const same =
        (m0.service_date || "") === (s0.service_date || "") &&
        (m0.service_from_time || "") === (s0.service_from_time || "") &&
        (m0.service_to_time || "") === (s0.service_to_time || "");
      if (same) return prev;
      return [
        {
          ...s0,
          service_date: m0.service_date ?? s0.service_date,
          service_from_time: m0.service_from_time ?? s0.service_from_time,
          service_to_time: m0.service_to_time ?? s0.service_to_time,
        },
        ...prev.slice(1),
      ];
    });
  }, [
    omitSchedule,
    scheduleMirror?.[0]?.service_date,
    scheduleMirror?.[0]?.service_from_time,
    scheduleMirror?.[0]?.service_to_time,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!singleServiceOnly || !useAddressCards) return;
    const uid = (serviceAddressSeedUser?._id ?? "").trim();
    if (!uid) {
      if (lastSeededUserIdRef.current !== "") {
        lastSeededUserIdRef.current = "";
        setServiceItems((prev) => {
          if (!prev.length) return prev;
          const old = prev[0].address_cards ?? [];
          unregisterServiceAddressCardFields(
            unregister,
            old.map((c) => c.id)
          );
          const next = [defaultAddressCard(true)];
          syncAddrSelectFieldsToForm(setValue, next);
          return [
            {
              ...prev[0],
              address_cards: next,
              service_address: serializeServiceAddressCards(next),
            },
            ...prev.slice(1),
          ];
        });
      }
      return;
    }
    if (lastSeededUserIdRef.current === uid) return;
    lastSeededUserIdRef.current = uid;
    const next = buildAddressCardsFromCustomer(serviceAddressSeedUser);
    setServiceItems((prev) => {
      if (!prev.length) return prev;
      const old = prev[0].address_cards ?? [];
      unregisterServiceAddressCardFields(
        unregister,
        old.map((c) => c.id)
      );
      return [
        {
          ...prev[0],
          address_cards: next,
          service_address: serializeServiceAddressCards(next),
        },
        ...prev.slice(1),
      ];
    });
    syncAddrSelectFieldsToForm(setValue, next);
  }, [
    singleServiceOnly,
    useAddressCards,
    serviceAddressSeedUser?._id,
    serviceAddressSeedUser,
    setValue,
    unregister,
  ]);

  useEffect(() => {
    if (!singleServiceOnly || serviceItems.length <= 1) return;
    setServiceItems((items) => [items[0]]);
  }, [singleServiceOnly, serviceItems.length]);

  useEffect(() => {
    const cid = (categoryId ?? "").trim();
    if (!cid) {
      setService([]);
      return;
    }
    void (async () => {
      if (fetchRef.current) return;
      fetchRef.current = true;
      try {
        const serviceOptions = await fetchServiceDropDown(cid);
        setService(serviceOptions);
      } finally {
        fetchRef.current = false;
      }
    })();
  }, [categoryId]);

  useEffect(() => {
    const next = categoryId ?? "";
    if (prevCategoryRef.current === null) {
      prevCategoryRef.current = next;
      return;
    }
    if (prevCategoryRef.current === next) return;
    if (prevCategoryRef.current === "" && next) {
      prevCategoryRef.current = next;
      return;
    }
    prevCategoryRef.current = next;

    const nextAddrCards =
      singleServiceOnly && useAddressCards
        ? buildAddressCardsFromCustomer(serviceAddressSeedUser ?? undefined)
        : [defaultAddressCard(true)];
    setServiceItems((prev) =>
      prev.map((item, idx) => {
        setValue(`serviceItems.${idx}.service_id`, "");
        setValue(`serviceItems.${idx}.partner_id`, "");
        setValue(`serviceItems.${idx}.service_price`, 0, {
          shouldValidate: true,
        });
        unregisterServiceAddressCardFields(
          unregister,
          item.address_cards?.map((c) => c.id) ?? []
        );
        const serialized = serializeServiceAddressCards(nextAddrCards);
        return {
          ...item,
          service_id: "",
          partner_id: "",
          service_price: 0,
          tax: 0,
          sub_total: 0,
          user_paltform_fee: 0,
          total_price: 0,
          partner_commison_platform_fee: 0,
          partner_earning: 0,
          admin_earning: 0,
          address_cards: nextAddrCards,
          service_address: serialized,
        };
      })
    );
    if (useAddressCards) {
      syncAddrSelectFieldsToForm(setValue, nextAddrCards);
    }
    setPartner([]);
  }, [
    categoryId,
    setValue,
    singleServiceOnly,
    useAddressCards,
    serviceAddressSeedUser,
    unregister,
  ]);

  const fetchPartnerFromApi = async (serviceId: string) => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const { partners } = await fetchPartnerDropDown(serviceId);
      setPartner(
        partners.map((partner: any) => ({
          value: partner.partner_id,
          label: partner.partner_name,
        }))
      );
    } finally {
      fetchRef.current = false;
    }
  };

  const addServiceItem = () => {
    setServiceItems((prevServiceItems) => [
      ...prevServiceItems,
      {
        service_id: "",
        service_price: 0,
        partner_id: "",
        service_address: "",
        service_date: "",
        service_from_time: "",
        service_to_time: "",
        sub_total: 0,
        tax: 0,
        user_paltform_fee: 0,
        partner_commison_platform_fee: 0,
        partner_earning: 0,
        total_price: 0,
        admin_earning: 0,
        address_cards: [defaultAddressCard(true)],
      },
    ]);
  };

  const removeServiceItem = (index: number) => {
    if (serviceItems.length > 1) {
      setServiceItems(serviceItems.filter((_, i) => i !== index));
    }
  };

  const handleInputChange = (
    index: number,
    field: keyof OrderItemModel,
    value: any
  ) => {
    setServiceItems((prevServiceItems) => {
      const updatedServices = [...prevServiceItems];

      if (field === "service_id") {
        const selectedService = services.find(
          (service) => service.value === value
        );
        const perHourPrice = selectedService?.price ?? 0;

        fetchPartnerFromApi(selectedService?.value!);

        updatedServices[index] = {
          ...updatedServices[index],
          service_id: value,
          per_hour_price: perHourPrice,
          service_price: 0,
          ...calculateServiceDetails(0),
        };
        setValue(`serviceItems.${index}.service_id`, value);
        setValue(`serviceItems.${index}.per_hour_price`, perHourPrice);
        setValue(`serviceItems.${index}.service_price`, 0, {
          shouldValidate: true,
        });
      } else if (field === "service_price") {
        const raw = String(value ?? "")
          .trim()
          .replace(/,/g, "");
        const n = raw === "" ? 0 : Number.parseFloat(raw);
        const price = Number.isFinite(n) ? n : 0;
        updatedServices[index] = {
          ...updatedServices[index],
          service_price: price,
          ...calculateServiceDetails(price),
        };
        setValue(`serviceItems.${index}.service_price`, price, {
          shouldValidate: true,
        });
      } else if (field === "service_from_time" || field === "service_to_time") {
        updatedServices[index] = {
          ...updatedServices[index],
          [field]: value,
        };
        setValue(`serviceItems.${index}.${field}` as any, value);
      } else if (field === "per_hour_price") {
        const n = Number.parseFloat(String(value ?? "").trim());
        const perHour = Number.isFinite(n) ? n : 0;
        updatedServices[index] = {
          ...updatedServices[index],
          per_hour_price: perHour,
        };
        setValue(`serviceItems.${index}.per_hour_price`, value);
      } else {
        updatedServices[index] = {
          ...updatedServices[index],
          [field]: value,
        };
        setValue(`serviceItems.${index}.${field}` as any, value);
      }
      return updatedServices;
    });
  };

  const calculateServiceDetails = (servicePrice: number) => {
    const tax = servicePrice * (taxDetails.tax_for_customer / 100);
    const subTotal = servicePrice - tax;
    const userPlatformFee = servicePrice * (taxDetails.user_platform_fee / 100);
    const totalPrice = servicePrice + userPlatformFee;
    const partnerCommissionPlatformFee =
      servicePrice *
      ((taxDetails.partner_commision_fee + taxDetails.partner_platform_fee) /
        100);
    const partnerEarning = subTotal - partnerCommissionPlatformFee;
    const adminEarning = userPlatformFee + partnerCommissionPlatformFee;

    return {
      tax: Math.round(tax),
      sub_total: Math.round(subTotal),
      user_paltform_fee: Math.round(userPlatformFee),
      total_price: Math.round(totalPrice),
      partner_commison_platform_fee: Math.round(partnerCommissionPlatformFee),
      partner_earning: Math.round(partnerEarning),
      admin_earning: Math.round(adminEarning),
    };
  };

  const showAddRemoveRow = !singleServiceOnly && !embedded;
  const categorySelected = !!(categoryId ?? "").trim();

  const renderServicePriceControl = (index: number) => {
    const priceFieldError = errors.serviceItems?.[index]?.service_price as
      | { message?: string }
      | undefined;
    const invalid = !!priceFieldError;
    const borderColor = invalid
      ? "var(--bs-form-invalid-border-color, #dc3545)"
      : "var(--primary-color)";
    return (
      <div className="d-flex flex-column">
        <div
          className="d-flex align-items-stretch"
          style={{
            border: `1px solid ${borderColor}`,
            borderRadius: "8px",
            overflow: "hidden",
            backgroundColor: "var(--bg-color)",
            minHeight: 35,
          }}
        >
          <span
            className="d-flex align-items-center justify-content-center flex-shrink-0"
            style={{
              borderRight: `1px solid ${borderColor}`,
              color: "var(--primary-txt-color)",
              fontWeight: 600,
              fontFamily: "Inter",
              fontSize: "14px",
              fontVariantNumeric: "tabular-nums",
              paddingLeft: "10px",
              paddingRight: "10px",
              minWidth: 40,
              alignSelf: "stretch",
            }}
          >
            {AppConstant.currencySymbol}
          </span>
          <div className="flex-grow-1 d-flex" style={{ minWidth: 0 }}>
            <CustomFormInput
              label=""
              controlId={`serviceItems.${index}.service_price`}
              placeholder="0.00"
              register={register}
              validation={servicePriceFieldValidation}
              error={undefined}
              asCol={false}
              inputType="text"
              value={
                serviceItems[index].service_price ??
                getValues(`serviceItems.${index}.service_price` as any)
              }
              onChange={(value) =>
                handleInputChange(
                  index,
                  "service_price",
                  sanitizeMoneyInput(value)
                )
              }
              inputStyle={{
                border: "none",
                borderRadius: 0,
                boxShadow: "none",
                marginBottom: 0,
                minHeight: 35,
                height: "100%",
                width: "100%",
              }}
              inputClassName="shadow-none"
            />
          </div>
        </div>
        {invalid && priceFieldError?.message ? (
          <div
            className="invalid-feedback d-block"
            style={{ marginTop: "0.25rem" }}
          >
            {priceFieldError.message}
          </div>
        ) : null}
      </div>
    );
  };

  const serviceFieldRows = (service: OrderItemModel, index: number) => (
    <>
      <Row className={embedded ? "mt-2" : "mt-3"}>
        <Col xs={4}>
          <CustomTextFieldSelect
            label="Service"
            controlId={`Service`}
            options={categorySelected ? services : []}
            register={register}
            fieldName={`serviceItems.${index}.service_id`}
            error={
              (errors as Record<string, any>)?.serviceItems?.[index]?.service_id
            }
            requiredMessage="Please select service"
            defaultValue={
              service?.service_id
                ? service?.service_id
                : getValues(`serviceItems.${index}.service_id` as any)
            }
            setValue={setValue as (name: string, value: any) => void}
            onChange={(e) => {
              handleInputChange(index, "service_id", e.target.value);
            }}
            placeholder={
              categorySelected ? "Select service" : "Select a category first"
            }
            menuPortal
          />
        </Col>
        <Col xs={4}>
          <CustomTextFieldSelect
            label="Partner"
            controlId={`Partner`}
            options={partners}
            register={register}
            fieldName={`serviceItems.${index}.partner_id`}
            error={
              (errors as Record<string, any>)?.serviceItems?.[index]?.partner_id
            }
            requiredMessage="Please select partner"
            defaultValue={
              service?.partner_id
                ? service?.partner_id
                : getValues(`serviceItems.${index}.partner_id` as any)
            }
            setValue={setValue as (name: string, value: any) => void}
            onChange={(e) => {
              handleInputChange(index, "partner_id", e.target.value);
            }}
            placeholder={
              serviceItems[index].service_id
                ? "Select partner"
                : "Select a service first"
            }
            menuPortal
          />
        </Col>
        <Col xs={4}>
          <Row className="align-items-start mx-0">
            <Col sm={4} className="d-flex align-items-start px-0">
              <label className="custom-profile-lable">
                <FieldLabelText label="Service Price" required />
              </label>
            </Col>
            <Col className="ps-1 pe-0">{renderServicePriceControl(index)}</Col>
          </Row>
        </Col>
      </Row>
      {!compact && (
        <Row className="mt-3">
          <Col xs={4}>
            <CustomTextField
              label="Hours Price"
              controlId={`serviceItems.${index}.per_hour_price`}
              placeholder="Reference hourly rate"
              register={register}
              error={errors.serviceItems?.[index]?.per_hour_price}
              inputType="number"
              value={serviceItems[index].per_hour_price ?? ""}
              onChange={(value) =>
                handleInputChange(index, "per_hour_price", value)
              }
            />
          </Col>
        </Row>
      )}
      {!omitSchedule && (
        <Row className="mt-3">
          <Col xs={4}>
            <CustomTextFieldDatePicket
              label="Service Date"
              controlId={`serviceItems.${index}.service_date`}
              selectedDate={
                serviceItems[index].service_date ??
                getValues(`serviceItems.${index}.service_date` as any)
              }
              onChange={(date) =>
                handleInputChange(
                  index,
                  "service_date",
                  toIsoCalendarDate(date) ?? ""
                )
              }
              placeholderText="Select Date"
              error={errors.serviceItems?.[index]?.service_date}
              register={register}
              validation={{ required: "Service date is required" }}
              setValue={setValue}
            />
          </Col>
          <Col xs={4}>
            <CustomTextFieldTimePicket
              label="From Time"
              controlId={`serviceItems.${index}.service_from_time`}
              selectedTime={
                serviceItems[index].service_from_time ??
                getValues(`serviceItems.${index}.service_from_time` as any)
              }
              onChange={(date) =>
                handleInputChange(
                  index,
                  "service_from_time",
                  datePickerTimeToScheduleStorage(date)
                )
              }
              placeholderText="Select Time"
              error={errors.serviceItems?.[index]?.service_from_time}
              register={register}
              validation={{ required: "From time is required" }}
              setValue={setValue}
              filterTime={(time) => {
                const hour = time.getHours();
                return hour >= 8 && hour <= 23;
              }}
            />
          </Col>
          <Col xs={4}>
            <CustomTextFieldTimePicket
              label="To Time"
              controlId={`serviceItems.${index}.service_to_time`}
              selectedTime={
                serviceItems[index].service_to_time ??
                getValues(`serviceItems.${index}.service_to_time` as any)
              }
              onChange={(date) =>
                handleInputChange(
                  index,
                  "service_to_time",
                  datePickerTimeToScheduleStorage(date)
                )
              }
              placeholderText="Select Time"
              error={errors.serviceItems?.[index]?.service_to_time}
              register={register}
              validation={{ required: "To time is required" }}
              setValue={setValue}
              filterTime={(time) => {
                const hour = time.getHours();
                return hour >= 8 && hour <= 23;
              }}
            />
          </Col>
        </Row>
      )}
      {useAddressCards && addressStateOptions && addressCityRows ? (
        <ServiceAddressCardsPanel
          cards={
            serviceItems[index].address_cards?.length
              ? serviceItems[index].address_cards!
              : [defaultAddressCard(true)]
          }
          onChange={(next) => {
            setServiceItems((prev) =>
              prev.map((it, i) =>
                i === index
                  ? {
                      ...it,
                      address_cards: next,
                      service_address: serializeServiceAddressCards(next),
                    }
                  : it
              )
            );
          }}
          register={register}
          setValue={setValue}
          unregister={unregister}
          stateOptions={addressStateOptions}
          cityRows={addressCityRows}
        />
      ) : null}
      {!useAddressCards && (
        <Row className="mt-3">
          <Col xs={12}>
            <CustomTextField
              label="Service address"
              controlId={`serviceItems.${index}.service_address`}
              placeholder="Enter service address"
              register={register}
              error={
                (errors as Record<string, any>)?.serviceItems?.[index]
                  ?.service_address
              }
              validation={{ required: "Service address is required" }}
              onChange={(value) =>
                handleInputChange(index, "service_address", value)
              }
              as="textarea"
              rows={4}
              labelSize={2}
            />
          </Col>
        </Row>
      )}
      <Row>
        {!compact && (
          <>
            <Col xs={3} className="mt-3">
              <CustomTextField
                label="Sub Total"
                controlId={`serviceItems.${index}.sub_total`}
                placeholder="Enter Sub Total"
                register={register}
                value={serviceItems[index].sub_total}
                error={
                  (errors as Record<string, any>)?.serviceItems?.[index]
                    ?.sub_total
                }
                validation={{ required: "Sub total is required" }}
                isEditable={false}
              />
            </Col>
            <Col xs={3} className="mt-3">
              <CustomTextField
                label="Tax"
                controlId={`serviceItems.${index}.tax`}
                placeholder="Enter Tax"
                register={register}
                value={serviceItems[index].tax}
                error={
                  (errors as Record<string, any>)?.serviceItems?.[index]?.tax
                }
                validation={{ required: "Tax is required" }}
                isEditable={false}
              />
            </Col>
            <Col xs={3} className="mt-3">
              <CustomTextField
                label="User Platform Fee"
                controlId={`serviceItems.${index}.user_paltform_fee`}
                placeholder="Enter User Platform Fee"
                register={register}
                value={serviceItems[index].user_paltform_fee}
                error={
                  (errors as Record<string, any>)?.serviceItems?.[index]
                    ?.user_paltform_fee
                }
                validation={{ required: "User platform fee is required" }}
                isEditable={false}
              />
            </Col>
            <Col xs={3} className="mt-3">
              <CustomTextField
                label="Partner Commison Platform Fee"
                controlId={`serviceItems.${index}.partner_commison_platform_fee`}
                placeholder="Enter Partner Commison Platform Fee"
                register={register}
                value={serviceItems[index].partner_commison_platform_fee}
                error={
                  (errors as Record<string, any>)?.serviceItems?.[index]
                    ?.partner_commison_platform_fee
                }
                validation={{
                  required: "Partner commison platform fee is required",
                }}
                isEditable={false}
              />
            </Col>
            <Col xs={3} className="mt-3">
              <CustomTextField
                label="Partner Earning"
                controlId={`serviceItems.${index}.partner_earning`}
                placeholder="Enter Partner Earning"
                register={register}
                value={serviceItems[index].partner_earning}
                error={
                  (errors as Record<string, any>)?.serviceItems?.[index]
                    ?.partner_earning
                }
                validation={{ required: "Partner earning is required" }}
                isEditable={false}
              />
            </Col>
            <Col xs={3} className="mt-3">
              <CustomTextField
                label="Total Price"
                controlId={`serviceItems.${index}.total_price`}
                placeholder="Enter Total Price"
                register={register}
                value={serviceItems[index].total_price}
                error={
                  (errors as Record<string, any>)?.serviceItems?.[index]
                    ?.total_price
                }
                validation={{ required: "Total price is required" }}
                isEditable={false}
              />
            </Col>
            <Col xs={3} className="mt-3">
              <CustomTextField
                label="Admin Earning"
                controlId={`serviceItems.${index}.admin_earning`}
                placeholder="Enter Admin Earning"
                register={register}
                value={serviceItems[index].admin_earning}
                error={
                  (errors as Record<string, any>)?.serviceItems?.[index]
                    ?.admin_earning
                }
                validation={{ required: "Admin earning is required" }}
                isEditable={false}
              />
            </Col>
          </>
        )}
      </Row>
    </>
  );

  return (
    <>
      {serviceItems.map((service, index) =>
        embedded ? (
          <React.Fragment key={index}>
            {serviceFieldRows(service, index)}
          </React.Fragment>
        ) : (
          <section
            key={index}
            className="custom-other-details mt-3"
            style={{ padding: "10px" }}
          >
            {showAddRemoveRow && (
              <Row className="d-flex justify-content-between align-items-center">
                <Col>
                  <h3 className="mb-0">Service</h3>
                </Col>
                <Col className="text-end">
                  {index > 0 && (
                    <label
                      onClick={(e) => {
                        e.preventDefault();
                        removeServiceItem(index);
                      }}
                      className="custom-document-delete"
                    >
                      Remove
                    </label>
                  )}
                  <Button
                    style={{
                      height: "26px",
                      borderRadius: "4px",
                      backgroundColor: "var(--bg-color)",
                      color: "var(--primary-color)",
                      fontFamily: "Inter",
                      fontSize: "14px",
                      fontWeight: "normal",
                      border: "1px solid var(--primary-txt-color)",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "0 10px",
                      margin: "0px 10px",
                    }}
                    onClick={() => addServiceItem()}
                  >
                    <img
                      src={addIcon}
                      alt="Add"
                      style={{ height: "14px", width: "14px" }}
                    />
                    Add
                  </Button>
                </Col>
              </Row>
            )}
            {serviceFieldRows(service, index)}
          </section>
        )
      )}
    </>
  );
};

/** --- Create / update order --- */

/** Align create-order payment UI with `OrderPaymentEditModal` tokens. */
const FONT_BODY = "0.9375rem";
const FONT_LABEL = "14px";
const FONT_TOTAL = "1.125rem";

const moneyTabular: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const sectionShell: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: "10px",
  border: "1px solid var(--txtfld-border, rgba(0, 0, 0, 0.08))",
  backgroundColor: "var(--bg-color)",
};

const paymentSubcard: React.CSSProperties = {
  backgroundColor: "var(--bg-color)",
};

const priceSummarySection: React.CSSProperties = {
  ...sectionShell,
  marginTop: "12px",
  padding: "14px 16px",
};

const PAYMENT_METHOD_OPTIONS = paymentMethodSelectOptions();

const newPayRowId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const tableThCreate: React.CSSProperties = {
  color: "var(--primary-txt-color)",
  fontSize: FONT_LABEL,
};

const tablePriceInputCreate: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  marginBottom: 0,
  fontSize: FONT_BODY,
  textAlign: "right",
};

type CreateUpdateOrderDialogProps = {
  isEditable: boolean;
  order: OrderModel | null;
  onClose: () => void;
  onRefreshData: () => void;
};

const CreateUpdateOrderDialog: React.FC<CreateUpdateOrderDialogProps> & {
  show: (
    isEditable: boolean,
    order: OrderModel | null,
    onRefreshData: () => void
  ) => void;
} = ({ isEditable, order, onClose, onRefreshData }) => {
  const {
    register,
    formState: { errors, isSubmitted: createFormSubmitted },
    setValue,
    getValues,
    handleSubmit,
    watch,
  } = useForm<any>();

  /** Payment table fields are controlled in state — avoid RHF register side effects. */
  const paymentFieldRegister = useCallback(
    (name: string) => ({
      onChange: async () => {},
      onBlur: async () => {},
      name: String(name),
      ref: () => {},
    }),
    []
  ) as UseFormRegister<any>;

  /** Avoid `useWatch` + `useForm<any>()` — TS2589 deep instantiation on `control`. */
  const offerIdWatch = watch("offer_id") as string | undefined;
  const createFranchiseIdWatch = watch("franchise_id") as string | undefined;
  const createCustomerIdWatch = watch("customer_user_id") as string | undefined;
  const createPartnerIdWatch = watch("requested_partner") as string | undefined;
  const createCategoryIdWatch = watch("category_id") as string | undefined;
  const createServiceIdWatch = watch("requested_services") as string | undefined;
  const createServicePriceWatch = watch("create_service_price") as
    | string
    | undefined;
  const createScheduleDateToWatch = watch("service_date_to") as
    | string
    | undefined;

  const currentUserRole = getLocalStorage(AppConstant.userRole);
  const isSuperAdminOrStaff =
    currentUserRole === UserRole.ADMIN ||
    currentUserRole === UserRole.STAFF;
  const sessionFranchiseIdForOrderCatalog = useMemo(() => {
    if (isSuperAdminOrStaff) return "";
    return String(getLocalStorage(AppConstant.partnerId) ?? "").trim();
  }, [isSuperAdminOrStaff]);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [showCustomerPaymentAddHint, setShowCustomerPaymentAddHint] =
    useState(false);
  const [showPartnerPaymentAddHint, setShowPartnerPaymentAddHint] =
    useState(false);
  const [couponModalError, setCouponModalError] = useState("");
  /** Coupon picked in modal only; `offer_id` commits on successful Apply. */
  const [modalCouponOfferId, setModalCouponOfferId] = useState("");
  const offerIdBeforeCouponModalRef = useRef("");
  /** Payment summary: long offer breakdown hidden until user expands (reset when offer changes). */
  const [, setShowOfferPaymentBreakdown] = useState(false);

  const [categories, setCategory] = useState<
    { value: string; label: string }[]
  >([]);
  const [cities, setCity] = useState<
    { value: string; label: string; state_id?: string; state_name?: string }[]
  >([]);

  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<UserModel>();
  const [taxDetails, setTaxDetails] = useState<TaxOtherChargesModel | null>();
  const [paymentDetails, setPaymentDetails] = useState({
    subTotal: 0,
    tax: 0,
    userPlatformFee: 0,
    totalPrice: 0,
    partnerCommissionPlatformFee: 0,
    adminEarning: 0,
  });
  const payments = orderPaymentModeSelectOptions;
  const [serviceItems, setServiceItems] = useState<OrderItemModel[]>([]);
  const [activeCoupons, setActiveCoupons] = useState<OfferModel[]>([]);
  const [couponOptions, setCouponOptions] = useState<
    { value: string; label: string }[]
  >([{ value: "", label: "Select" }]);
  const [employeeOptions, setEmployeeOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [franchiseOptionsForOrder, setFranchiseOptionsForOrder] = useState<
    OptionType[]
  >([]);
  const [quoteCatalogServices, setQuoteCatalogServices] = useState<
    ServiceDropDownOption[]
  >([]);
  const [quoteCategoryOptions, setQuoteCategoryOptions] = useState<
    OptionType[]
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
  const [quoteCustomerRecords, setQuoteCustomerRecords] = useState<
    Record<string, unknown>[]
  >([]);
  const [franchiseQuotePinSet, setFranchiseQuotePinSet] = useState<Set<string>>(
    new Set()
  );
  const [franchiseQuoteAreaIdSet, setFranchiseQuoteAreaIdSet] = useState<
    Set<string>
  >(new Set());
  const [franchisePinsLoadDone, setFranchisePinsLoadDone] = useState(false);
  const orderCatalogLoadSeqRef = useRef(0);
  const lastOrderCatalogFranchiseIdRef = useRef("");

  const createOrderFieldsLocked =
    isSuperAdminOrStaff &&
    !isEditable &&
    !String(createFranchiseIdWatch ?? "").trim();

  const [createPaymentExt, setCreatePaymentExt] = useState<OrderPaymentExtV1>(
    () => ({
      v: 1,
      serviceAmount: 0,
      taxPercent: 0,
      commissionPercent: 0,
      otherCharges: [],
      customerPayments: [],
      partnerPayments: [],
    })
  );
  /** Last service price accepted while payments still fit caps (revert target). */
  const lastAcceptedCreateServicePriceRef = useRef("");

  const fetchRef = useRef(false);

  const {
    addressUi: createOrderAddressUi,
    selectedAddressId: createOrderAddressId,
    setSelectedAddressId: setCreateOrderAddressId,
  } = useQuoteCustomerAddressPanel({
    userId: String(createCustomerIdWatch ?? ""),
    quoteCustomerRecords,
    franchiseQuotePinSet,
    franchiseQuoteAreaIdSet,
    franchisePinsLoadDone,
  });

  const loadOrderCatalogForFranchise = useCallback(
    async (franchiseId: string, opts?: { force?: boolean }) => {
      const id = String(franchiseId ?? "").trim();
      if (!id) {
        lastOrderCatalogFranchiseIdRef.current = "";
        orderCatalogLoadSeqRef.current += 1;
        setQuoteCatalogServices([]);
        setQuoteCategoryOptions([]);
        setQuoteEmployeeOptions([]);
        setCatalogPartnerRecords([]);
        setQuotePartnerOptions([]);
        setQuoteCustomerRecords([]);
        setFranchiseQuotePinSet(new Set());
        setFranchiseQuoteAreaIdSet(new Set());
        setFranchisePinsLoadDone(true);
        setQuoteFranchiseCatalogSnapshot(null);
        return;
      }
      if (!opts?.force && id === lastOrderCatalogFranchiseIdRef.current) {
        return;
      }
      lastOrderCatalogFranchiseIdRef.current = id;
      const seq = (orderCatalogLoadSeqRef.current += 1);
      setFranchisePinsLoadDone(false);
      const { success, record } = await fetchFranchiseRelatedCatalog(id);
      if (seq !== orderCatalogLoadSeqRef.current) return;
      if (!success || !record) {
        setQuoteCatalogServices([]);
        setQuoteCategoryOptions([]);
        setQuoteEmployeeOptions([]);
        setCatalogPartnerRecords([]);
        setQuotePartnerOptions([]);
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
      setQuoteCustomerRecords(mapped.quoteCustomerRecords);
      setCatalogPartnerRecords(mapped.quotePartnerRecords);
      setQuoteFranchiseCatalogSnapshot({
        partnerRecords: mapped.quotePartnerRecords,
        employeeRows: mapped.quoteEmployeeRecords,
      });
      const fr = record.franchise as Record<string, unknown> | undefined;
      const areaIds = collectFranchiseAreaIds(fr);
      const pinSet = buildFranchisePincodeSetFromRelatedCatalog(record);
      if (seq !== orderCatalogLoadSeqRef.current) return;
      setFranchiseQuoteAreaIdSet(new Set(areaIds));
      setFranchiseQuotePinSet(pinSet);
      setFranchisePinsLoadDone(true);
    },
    []
  );

  const resetCreateOrderCatalogSelections = useCallback(() => {
    setValue("customer_user_id", "", { shouldValidate: false });
    setValue("category_id", "", { shouldValidate: false });
    setValue("requested_services", "", { shouldValidate: false });
    setValue("requested_partner", "", { shouldValidate: false });
    setValue("created_by_id", "", { shouldValidate: false });
    setValue("create_service_price", "", { shouldValidate: false });
    setCreateOrderAddressId("");
    setSelectedUser(undefined);
    setSelectedCategory("");
  }, [setValue, setCreateOrderAddressId]);

  const createOrderPartnerSelected = Boolean(
    String(createPartnerIdWatch ?? "").trim()
  );
  const createOrderServiceId = String(createServiceIdWatch ?? "").trim();
  const hasCreateOrderServiceSelected = Boolean(createOrderServiceId);

  const selectedPartnerCatalogRecord = useMemo(() => {
    const pid = String(createPartnerIdWatch ?? "").trim();
    if (!pid) return null;
    return (
      catalogPartnerRecords.find(
        (p) =>
          String(p.partner_id ?? p._id ?? p.user_id ?? p.id ?? "").trim() ===
          pid
      ) ?? null
    );
  }, [createPartnerIdWatch, catalogPartnerRecords]);

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
    const cid = String(createCategoryIdWatch ?? "").trim();
    const quoteServiceOptionsForCategory = !cid
      ? []
      : filterPartnerServicesForCategory(
          quoteCatalogServicesForPartner,
          selectedPartnerCatalogRecord,
          cid
        );
    const sid = String(createServiceIdWatch ?? "").trim();
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
    createCategoryIdWatch,
    createServiceIdWatch,
    quoteCatalogServicesForPartner,
    selectedPartnerCatalogRecord,
  ]);

  const createCatalogUserOptions = useMemo<OptionType[]>(
    () =>
      quoteCustomerRecords.map((c) => {
        const value = String(c._id ?? c.id ?? "").trim();
        const name = String(
          c.name ?? c.user_name ?? c.phone_number ?? value
        ).trim();
        const email = String(c.email ?? "").trim();
        const label = email ? `${name} (${email})` : name;
        return { value, label: label || value };
      }),
    [quoteCustomerRecords]
  );

  const selectedCreateServiceOption = useMemo(
    () =>
      quoteServiceOptionsForCategory.find((o) => o.value === createOrderServiceId),
    [quoteServiceOptionsForCategory, createOrderServiceId]
  );

  const createOrderFeeOption = useMemo(
    () =>
      mergeQuoteServiceFeesForBreakdown(
        selectedCreateServiceOption,
        selectedPartnerCatalogRecord,
        createOrderServiceId
      ),
    [
      selectedCreateServiceOption,
      selectedPartnerCatalogRecord,
      createOrderServiceId,
    ]
  );

  const isCreateOrderScheduleComplete = useMemo(() => {
    if (!hasCreateOrderServiceSelected) return false;
    const d = String(serviceItems[0]?.service_date ?? "").trim();
    const dTo = String(createScheduleDateToWatch ?? "").trim();
    const tFrom = String(serviceItems[0]?.service_from_time ?? "").trim();
    const tTo = String(serviceItems[0]?.service_to_time ?? "").trim();
    if (scheduleMode === "range") {
      return Boolean(d && dTo && tFrom && tTo);
    }
    return Boolean(d && tFrom && tTo);
  }, [
    hasCreateOrderServiceSelected,
    scheduleMode,
    serviceItems,
    createScheduleDateToWatch,
  ]);

  const createOrderSchedulePricePreview = useMemo(() => {
    if (!isCreateOrderScheduleComplete || !createOrderPartnerSelected) {
      return null;
    }
    const sid = createOrderServiceId;
    if (!sid) return null;
    const row = getPartnerActiveServiceProvidingRow(
      selectedPartnerCatalogRecord,
      sid
    );
    const metrics = deriveQuoteScheduleMetrics({
      scheduleMode,
      requested_date: String(serviceItems[0]?.service_date ?? ""),
      requested_date_to: String(createScheduleDateToWatch ?? ""),
      requested_time: "",
      requested_time_from: String(serviceItems[0]?.service_from_time ?? ""),
      requested_time_to: String(serviceItems[0]?.service_to_time ?? ""),
    });
    if (!metrics || !row) return null;
    const catalogPaymentType = String(
      createOrderFeeOption?.payment_type ?? ""
    ).trim();
    return buildQuoteSchedulePricePreview(
      row,
      metrics,
      AppConstant.currencySymbol,
      catalogPaymentType
    );
  }, [
    isCreateOrderScheduleComplete,
    createOrderPartnerSelected,
    createOrderServiceId,
    serviceItems,
    createScheduleDateToWatch,
    scheduleMode,
    selectedPartnerCatalogRecord,
    createOrderFeeOption?.payment_type,
  ]);

  const createOrderEndMinTime = useMemo(
    () =>
      scheduleEndTimeMinAfterStart(
        String(serviceItems[0]?.service_from_time ?? "")
      ),
    [serviceItems]
  );

  const createOrderScheduleFromDateFilter = useCallback((date: Date) => {
    return startOfLocalDay(date) >= startOfTodayLocal();
  }, []);

  const createOrderScheduleToDateFilter = useCallback(
    (date: Date) => {
      if (startOfLocalDay(date) < startOfTodayLocal()) return false;
      const fromIso = String(serviceItems[0]?.service_date ?? "").trim();
      if (!fromIso) return true;
      const from = parseIsoDateOnly(fromIso);
      if (!from) return true;
      return startOfLocalDay(date) >= startOfLocalDay(from);
    },
    [serviceItems]
  );

  const fetchCategoryFromApi = async (cityId: string) => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const categoryOptions = await fetchCategoryDropDown(cityId);
      setCategory(categoryOptions);
    } finally {
      fetchRef.current = false;
    }
  };

  const fetchUserFromApi = async (nationalDigits: string) => {
    if (!isEditable) return;
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const { users } = await fetchUserDropDown(APP_USER_TYPE.CUSTOMER);
      const national = sanitizeIndiaNationalPhoneInput(nationalDigits);
      if (national.length !== 10) {
        setSelectedUser(undefined);
        return;
      }
      const full = fullPhoneFromIndiaNational(national);
      setSelectedUser(
        users.find(
          (user) =>
            fullPhoneFromIndiaNational(
              nationalDigitsWithoutIndia91(String(user.phone_number ?? ""))
            ) === full
        )
      );
    } finally {
      fetchRef.current = false;
    }
  };

  const fetchDataFromApi = async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const cityOptions = await fetchCityDropDown();
      setCity(cityOptions);
      const { response, taxOtherCharges } = await fetchTaxOtherChargesById();
      if (response) {
        setTaxDetails(taxOtherCharges);
      }
    } finally {
      fetchRef.current = false;
    }
  };

  useEffect(() => {
    if (!isEditable) return;
    void fetchDataFromApi();
  }, [isEditable]);

  useEffect(() => {
    if (isEditable) return;
    const prefillFranchiseId = franchiseIdForApiQuery(
      readHeaderFranchisePreference()
    );
    setValue("user_description", "");
    setValue("admin_description", "");
    setValue("offer_id", "");
    setValue("customer_user_id", "");
    setValue("city_id", "");
    setValue("franchise_id", prefillFranchiseId);
    setValue("requested_partner", "");
    setValue("requested_services", "");
    setValue("category_id", "");
    setValue("create_service_price", "");
    setSelectedCategory("");
    setSelectedUser(undefined);
    setServiceItems([
      {
        service_id: "",
        service_price: 0,
        partner_id: "",
        service_address: "",
        service_date: "",
        service_from_time: "",
        service_to_time: "",
        sub_total: 0,
        tax: 0,
        user_paltform_fee: 0,
        partner_commison_platform_fee: 0,
        partner_earning: 0,
        total_price: 0,
        admin_earning: 0,
      } as OrderItemModel,
    ]);
    if (isSuperAdminOrStaff) {
      void fetchFranchiseDropDown().then(setFranchiseOptionsForOrder);
      if (prefillFranchiseId) {
        lastOrderCatalogFranchiseIdRef.current = "";
        void loadOrderCatalogForFranchise(prefillFranchiseId, { force: true });
      }
    } else {
      const fid = String(sessionFranchiseIdForOrderCatalog ?? "").trim();
      if (fid) void loadOrderCatalogForFranchise(fid);
    }
    setCreatePaymentExt({
      v: 1,
      serviceAmount: 0,
      taxPercent: 0,
      commissionPercent: 0,
      otherCharges: [],
      customerPayments: [],
      partnerPayments: [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create-mode field reset; setValue is stable from react-hook-form
  }, [isEditable]);

  useEffect(() => {
    return () => {
      setQuoteFranchiseCatalogSnapshot(null);
    };
  }, []);

  useEffect(() => {
    if (isEditable) return;
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
  }, [catalogPartnerRecords, isEditable]);

  useEffect(() => {
    if (isEditable) return;
    const uid = String(createCustomerIdWatch ?? "").trim();
    if (!uid) {
      setSelectedUser(undefined);
      return;
    }
    const c =
      quoteCustomerRecords.find(
        (r) => String(r._id ?? r.id ?? "").trim() === uid
      ) ?? null;
    if (!c) {
      setSelectedUser(undefined);
      return;
    }
    setSelectedUser({
      _id: uid,
      user_id: String(c.user_id ?? c.user_unique_id ?? "").trim(),
      name: String(c.name ?? c.user_name ?? "").trim(),
      email: String(c.email ?? "").trim(),
      phone_number: String(c.phone_number ?? c.contact ?? "").trim(),
      city_id: String(c.city_id ?? "").trim(),
      address: String(c.address ?? "").trim(),
    } as UserModel);
  }, [createCustomerIdWatch, quoteCustomerRecords, isEditable]);

  const createCatalogServiceTax = useMemo(() => {
    const sid = String(createServiceIdWatch ?? "").trim();
    const svc = quoteCatalogServicesForPartner.find((o) => o.value === sid);
    return {
      taxPct: Number(svc?.tax ?? 0) || 0,
      commissionPct: Number(svc?.commission ?? 0) || 0,
    };
  }, [createServiceIdWatch, quoteCatalogServicesForPartner]);

  const selectedCouponOffer = useMemo(() => {
    const id = String(offerIdWatch ?? "").trim();
    if (!id) return null;
    return (
      activeCoupons.find((o) => o.id === id || String(o.offerId) === id) ??
      null
    );
  }, [offerIdWatch, activeCoupons]);

  const parsedCreateServicePrice = useMemo(() => {
    const raw = String(createServicePriceWatch ?? "")
      .trim()
      .replace(/,/g, "");
    if (raw === "" || raw === ".") return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [createServicePriceWatch]);

  const createOrderBasePriceBreakdown = useMemo(() => {
    if (isEditable || parsedCreateServicePrice == null) return null;
    return computeQuotePriceBreakdown(
      parsedCreateServicePrice,
      createOrderFeeOption
    );
  }, [isEditable, parsedCreateServicePrice, createOrderFeeOption]);

  const couponApplyValidation = useMemo(() => {
    if (isEditable || !selectedCouponOffer || !createOrderBasePriceBreakdown) {
      return null;
    }
    const couponVal = validateCouponForPriceBreakdown(
      createOrderBasePriceBreakdown,
      mapOfferModelToCouponInput(selectedCouponOffer)
    );
    if (!couponVal.valid) return couponVal;
    const withCoupon = applyCouponToQuotePriceBreakdown(
      createOrderBasePriceBreakdown,
      mapOfferModelToCouponInput(selectedCouponOffer),
      createOrderFeeOption
    );
    const customerCap = Number(withCoupon?.grandTotal ?? 0);
    const partnerCap = Math.max(
      0,
      Number(withCoupon?.serviceAfterCoupon ?? withCoupon?.base ?? 0)
    );
    return validatePaymentExtAgainstCaps(
      createPaymentExt,
      customerCap,
      partnerCap
    );
  }, [
    isEditable,
    selectedCouponOffer,
    createOrderBasePriceBreakdown,
    createOrderFeeOption,
    createPaymentExt,
  ]);

  const createOrderPriceBreakdown = useMemo(() => {
    if (!createOrderBasePriceBreakdown) return null;
    const couponOk =
      !selectedCouponOffer ||
      !couponApplyValidation ||
      couponApplyValidation.valid;
    const couponInput =
      selectedCouponOffer && couponOk
        ? mapOfferModelToCouponInput(selectedCouponOffer)
        : null;
    return applyCouponToQuotePriceBreakdown(
      createOrderBasePriceBreakdown,
      couponInput,
      createOrderFeeOption
    );
  }, [
    createOrderBasePriceBreakdown,
    createOrderFeeOption,
    selectedCouponOffer,
    couponApplyValidation,
  ]);

  useEffect(() => {
    if (isEditable || offerModalOpen) return;
    const id = String(offerIdWatch ?? "").trim();
    if (!id || !couponApplyValidation || couponApplyValidation.valid) return;
    setValue("offer_id", "", { shouldValidate: false });
  }, [couponApplyValidation, offerIdWatch, isEditable, offerModalOpen, setValue]);

  const modalSelectedCouponOffer = useMemo(() => {
    const id = String(modalCouponOfferId ?? "").trim();
    if (!id) return null;
    return (
      activeCoupons.find((o) => o.id === id || String(o.offerId) === id) ??
      null
    );
  }, [modalCouponOfferId, activeCoupons]);

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
    if (!createOrderBasePriceBreakdown) {
      const msg = "Enter a service price before applying a coupon.";
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
      createOrderBasePriceBreakdown,
      mapOfferModelToCouponInput(offer)
    );
    if (!validation.valid) {
      setCouponModalError(validation.reason ?? "Cannot apply this coupon.");
      return;
    }
    const withCoupon = applyCouponToQuotePriceBreakdown(
      createOrderBasePriceBreakdown,
      mapOfferModelToCouponInput(offer),
      createOrderFeeOption
    );
    const payCheck = validatePaymentExtAgainstCaps(
      createPaymentExt,
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
    setValue("offer_id", id, { shouldValidate: false });
    setCouponModalError("");
    setOfferModalOpen(false);
  }, [
    activeCoupons,
    closeCouponModal,
    createOrderBasePriceBreakdown,
    createOrderFeeOption,
    createPaymentExt,
    modalCouponOfferId,
    setValue,
  ]);

  const calculateCreateServiceDetails = useCallback(
    (servicePrice: number) => {
      if (!isEditable) {
        const base = computeQuotePriceBreakdown(
          servicePrice,
          createOrderFeeOption
        );
        if (!base) {
          return {
            tax: 0,
            sub_total: 0,
            user_paltform_fee: 0,
            total_price: 0,
            partner_commison_platform_fee: 0,
            partner_earning: 0,
            admin_earning: 0,
          };
        }
        const couponInput = selectedCouponOffer
          ? mapOfferModelToCouponInput(selectedCouponOffer)
          : null;
        const full = applyCouponToQuotePriceBreakdown(
          base,
          couponInput,
          createOrderFeeOption
        );
        return {
          tax: full.taxAmount,
          sub_total: full.serviceAfterCoupon,
          user_paltform_fee: 0,
          total_price: full.grandTotal,
          partner_commison_platform_fee: full.commissionAfterCoupon,
          partner_earning: Math.max(
            0,
            full.serviceAfterCoupon - full.commissionAfterCoupon
          ),
          admin_earning: full.commissionAfterCoupon,
        };
      }
      if (!taxDetails) {
        return {
          tax: 0,
          sub_total: 0,
          user_paltform_fee: 0,
          total_price: 0,
          partner_commison_platform_fee: 0,
          partner_earning: 0,
          admin_earning: 0,
        };
      }
      const tax = servicePrice * (taxDetails.tax_for_customer / 100);
      const subTotal = servicePrice - tax;
      const userPlatformFee =
        servicePrice * (taxDetails.user_platform_fee / 100);
      const totalPrice = servicePrice + userPlatformFee;
      const partnerCommissionPlatformFee =
        servicePrice *
        ((taxDetails.partner_commision_fee + taxDetails.partner_platform_fee) /
          100);
      const partnerEarning = subTotal - partnerCommissionPlatformFee;
      const adminEarning = userPlatformFee + partnerCommissionPlatformFee;
      return {
        tax: Math.round(tax),
        sub_total: Math.round(subTotal),
        user_paltform_fee: Math.round(userPlatformFee),
        total_price: Math.round(totalPrice),
        partner_commison_platform_fee: Math.round(partnerCommissionPlatformFee),
        partner_earning: Math.round(partnerEarning),
        admin_earning: Math.round(adminEarning),
      };
    },
    [isEditable, taxDetails, createOrderFeeOption, selectedCouponOffer]
  );

  useEffect(() => {
    if (isEditable) return;
    const partnerId = String(createPartnerIdWatch ?? "").trim();
    const serviceId = String(createServiceIdWatch ?? "").trim();
    const servicePrice = parsedCreateServicePrice ?? 0;
    const addrRow = createOrderAddressUi.rows.find(
      (r) => r.id === createOrderAddressId
    );
    const addrLine = addrRow
      ? formatQuoteAddressRowAsServiceLine(addrRow)
      : "";
    setSelectedCategory(String(createCategoryIdWatch ?? ""));
    setServiceItems((prev) => {
      const base: OrderItemModel =
        prev[0] ??
        ({
          service_id: "",
          service_price: 0,
          partner_id: "",
          service_address: "",
          service_date: "",
          service_from_time: "",
          service_to_time: "",
          sub_total: 0,
          tax: 0,
          user_paltform_fee: 0,
          partner_commison_platform_fee: 0,
          partner_earning: 0,
          total_price: 0,
          admin_earning: 0,
        } as OrderItemModel);
      const next0 = {
        ...base,
        partner_id: partnerId,
        service_id: serviceId,
        service_price: servicePrice,
        service_address: addrLine,
        ...calculateCreateServiceDetails(servicePrice),
      };
      return prev.length ? [next0, ...prev.slice(1)] : [next0];
    });
  }, [
    isEditable,
    taxDetails,
    createPartnerIdWatch,
    createServiceIdWatch,
    createCategoryIdWatch,
    parsedCreateServicePrice,
    createOrderAddressId,
    createOrderAddressUi.rows,
    calculateCreateServiceDetails,
    selectedCouponOffer,
  ]);

  const createScheduleDate = String(serviceItems[0]?.service_date ?? "");
  const createScheduleDateTo = String(createScheduleDateToWatch ?? "");
  const createScheduleTimeFrom = String(
    serviceItems[0]?.service_from_time ?? ""
  );
  const createScheduleTimeTo = String(serviceItems[0]?.service_to_time ?? "");

  /** Auto-fill price from partner rate × schedule — not when user edits price (avoid `serviceItems` in deps). */
  useEffect(() => {
    if (isEditable) return;
    if (!isCreateOrderScheduleComplete || !createOrderPartnerSelected) return;
    const sid = createOrderServiceId;
    if (!sid) return;
    const row = getPartnerActiveServiceProvidingRow(
      selectedPartnerCatalogRecord,
      sid
    );
    const metrics = deriveQuoteScheduleMetrics({
      scheduleMode,
      requested_date: createScheduleDate,
      requested_date_to: createScheduleDateTo,
      requested_time: "",
      requested_time_from: createScheduleTimeFrom,
      requested_time_to: createScheduleTimeTo,
    });
    if (!metrics) return;
    const catalogPaymentType = String(
      createOrderFeeOption?.payment_type ?? ""
    ).trim();
    const n = row
      ? computeAutoQuotePriceFromPartner(row, metrics, catalogPaymentType)
      : 0;
    setValue("create_service_price", String(n), { shouldValidate: false });
  }, [
    isEditable,
    isCreateOrderScheduleComplete,
    createOrderPartnerSelected,
    createOrderServiceId,
    createScheduleDate,
    createScheduleDateTo,
    createScheduleTimeFrom,
    createScheduleTimeTo,
    scheduleMode,
    selectedPartnerCatalogRecord,
    createOrderFeeOption?.payment_type,
    setValue,
  ]);

  useEffect(() => {
    if (isEditable) return;
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
  }, [isEditable]);

  useEffect(() => {
    if (!isEditable) return;
    const loadEmployees = async () => {
      const { users } = await fetchUserDropDown(APP_USER_TYPE.FRANCHISE_EMPLOYEE);
      setEmployeeOptions(
        users.map((u) => ({
          value: u._id,
          label: (u.name && String(u.name).trim()) || u.user_id || u._id,
        }))
      );
    };
    void loadEmployees();
  }, [isEditable]);

  useEffect(() => {
    if (!isEditable || !order) return;
    const init = async () => {
      setValue(
        "user_phone_number",
        nationalDigitsWithoutIndia91(order.user_phone_number ?? "")
      );
      setValue("city_id", order.city_id ?? "");
      setValue("category_id", order.category_id ?? "");
      setValue(
        "payment_mode_id",
        order.payment_mode_id != null ? String(order.payment_mode_id) : "2"
      );
      setValue(
        "user_description",
        String(order.customer_description ?? "").trim()
      );
      setValue(
        "admin_description",
        String(order.order_description ?? "").trim()
      );
      setValue("offer_id", order.offer_id ?? "");
      const defaultEmployee =
        order.created_by_id ?? getLocalStorage(AppConstant.createdById) ?? "";
      setValue("created_by_id", defaultEmployee);
      setSelectedCategory(order.category_id ?? "");
      if (order.city_id) {
        const categoryOptions = await fetchCategoryDropDown(order.city_id);
        setCategory(categoryOptions);
      }
      if (order.user_info) {
        setSelectedUser(order.user_info);
      } else if (order.user_phone_number) {
        await fetchUserFromApi(order.user_phone_number);
      }
      setServiceItems(
        order.service_items?.length
          ? order.service_items.map((s) => ({ ...s }))
          : []
      );
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- populate form when order identity changes; avoids re-running on every order field tick
  }, [isEditable, order?._id]);

  const calculatePrices = useCallback(() => {
    let subTotal = 0;
    let tax = 0;
    let userPlatformFee = 0;
    let totalPrice = 0;
    let partnerCommissionPlatformFee = 0;
    let adminEarning = 0;

    for (let i = 0; i < serviceItems.length; i++) {
      const serviceItem = serviceItems[i];
      subTotal += serviceItem.sub_total ?? 0;
      tax += serviceItem.tax ?? 0;
      userPlatformFee += serviceItem.user_paltform_fee ?? 0;
      totalPrice += serviceItem.total_price ?? 0;
      partnerCommissionPlatformFee +=
        serviceItem.partner_commison_platform_fee ?? 0;
      adminEarning += serviceItem.admin_earning ?? 0;
    }

    setPaymentDetails({
      subTotal: roundMoney(subTotal),
      tax: roundMoney(tax),
      userPlatformFee: roundMoney(userPlatformFee),
      totalPrice: roundMoney(totalPrice),
      partnerCommissionPlatformFee: roundMoney(partnerCommissionPlatformFee),
      adminEarning: roundMoney(adminEarning),
    });
  }, [serviceItems]);

  useEffect(() => {
    calculatePrices();
  }, [calculatePrices]);

  useEffect(() => {
    setShowOfferPaymentBreakdown(false);
  }, [offerIdWatch]);

  useEffect(() => {
    if (isEditable) return;
    setCreatePaymentExt((prev) => ({
      ...prev,
      serviceAmount: Math.max(0, parsedCreateServicePrice ?? 0),
      taxPercent: createCatalogServiceTax.taxPct,
      commissionPercent: createCatalogServiceTax.commissionPct,
    }));
  }, [isEditable, createCatalogServiceTax, parsedCreateServicePrice]);

  const previewCouponBreakdown = useMemo(() => {
    const id = (offerIdWatch ?? "").trim();
    const coupon = selectedCouponOffer;
    const partnerDisc =
      createOrderPriceBreakdown?.partnerDiscountOnService ?? 0;
    const adminDisc = createOrderPriceBreakdown?.adminDiscountOnCommission ?? 0;
    const appliedDiscount =
      createOrderPriceBreakdown?.totalCouponDiscount ??
      partnerDisc + adminDisc;
    const discountBaseForPercent =
      coupon?.offerType === "percentage" && createOrderPriceBreakdown
        ? createOrderPriceBreakdown.grandTotal + appliedDiscount
        : undefined;
    return {
      offerCode: coupon?.offerId,
      offerName: coupon?.offerName,
      appliedDiscount,
      adminContribution: adminDisc,
      partnerContribution: partnerDisc,
      percentOffOrder:
        coupon?.offerType === "percentage" ? coupon.totalOfferValue : null,
      discountBaseForPercent,
      offerId: id,
    };
  }, [
    offerIdWatch,
    selectedCouponOffer,
    createOrderPriceBreakdown,
  ]);

  const createFinalTotal = !isEditable
    ? Number(
        createOrderPriceBreakdown?.grandTotal ??
          paymentDetails.totalPrice ??
          0
      )
    : paymentDetails.totalPrice;

  const createPartnerCap = useMemo(() => {
    if (!isEditable && createOrderPriceBreakdown) {
      return Math.max(
        0,
        createOrderPriceBreakdown.serviceAfterCoupon ??
          createOrderPriceBreakdown.base ??
          0
      );
    }
    return Math.max(0, paymentDetails.subTotal);
  }, [
    isEditable,
    createOrderPriceBreakdown,
    paymentDetails.subTotal,
  ]);
  const createCustomerPaidBal = useMemo(
    () => customerPaidBalanceForEdit(createPaymentExt, createFinalTotal, false),
    [createPaymentExt, createFinalTotal]
  );
  const createPartnerPaidBal = useMemo(
    () =>
      partnerPaidBalanceForEdit(
        createPaymentExt,
        createPartnerCap,
        createPaymentExt.serviceAmount,
        false
      ),
    [createPaymentExt, createPartnerCap]
  );
  const customerAddPaymentState = useMemo(
    () =>
      canAddAnotherCustomerPayment(
        createPaymentExt.customerPayments,
        createCustomerPaidBal.balance
      ),
    [createPaymentExt.customerPayments, createCustomerPaidBal.balance]
  );
  const partnerAddPaymentState = useMemo(
    () =>
      canAddAnotherPartnerPayment(
        createPaymentExt.partnerPayments,
        createPartnerPaidBal.balance
      ),
    [createPaymentExt.partnerPayments, createPartnerPaidBal.balance]
  );
  const canAddCustomerByBalance = createCustomerPaidBal.balance > 0.009;
  const canAddPartnerByBalance = createPartnerPaidBal.balance > 0.009;

  const commitCreateServicePriceIfPaymentsAllow = useCallback(() => {
    if (isEditable) return;
    const raw = String(getValues("create_service_price") ?? "").trim();
    if (!hasRecordedOrderPayments(createPaymentExt)) {
      lastAcceptedCreateServicePriceRef.current = raw;
      return;
    }
    if (parsedCreateServicePrice == null) return;
    const base = computeQuotePriceBreakdown(
      parsedCreateServicePrice,
      createOrderFeeOption
    );
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
      createOrderFeeOption
    );
    const payCheck = validatePaymentExtAgainstCaps(
      createPaymentExt,
      Number(full.grandTotal ?? 0),
      Math.max(0, Number(full.serviceAfterCoupon ?? full.base ?? 0))
    );
    if (!payCheck.valid) {
      showErrorAlert(
        payCheck.reason ??
          "Payment amounts exceed the new total. Reduce or remove payments before lowering the service price."
      );
      setValue("create_service_price", lastAcceptedCreateServicePriceRef.current, {
        shouldValidate: false,
        shouldDirty: true,
      });
      return;
    }
    lastAcceptedCreateServicePriceRef.current = raw;
  }, [
    isEditable,
    getValues,
    createPaymentExt,
    parsedCreateServicePrice,
    createOrderFeeOption,
    selectedCouponOffer,
    setValue,
  ]);

  useEffect(() => {
    if (isEditable) return;
    const raw = String(createServicePriceWatch ?? "").trim();
    if (!hasRecordedOrderPayments(createPaymentExt)) {
      lastAcceptedCreateServicePriceRef.current = raw;
      return;
    }
    if (!lastAcceptedCreateServicePriceRef.current && raw) {
      lastAcceptedCreateServicePriceRef.current = raw;
    }
  }, [isEditable, createServicePriceWatch, createPaymentExt]);

  useEffect(() => {
    if (
      showCustomerPaymentAddHint &&
      createPaymentExt.customerPayments.every(isCustomerPaymentRowComplete)
    ) {
      setShowCustomerPaymentAddHint(false);
    }
  }, [createPaymentExt.customerPayments, showCustomerPaymentAddHint]);

  useEffect(() => {
    if (
      showPartnerPaymentAddHint &&
      createPaymentExt.partnerPayments.every(isPartnerPaymentRowComplete)
    ) {
      setShowPartnerPaymentAddHint(false);
    }
  }, [createPaymentExt.partnerPayments, showPartnerPaymentAddHint]);

  const tryAddCreateCustomerPayment = () => {
    if (!customerAddPaymentState.allowed) {
      if (customerAddPaymentState.reason) {
        setShowCustomerPaymentAddHint(true);
      }
      return;
    }
    setShowCustomerPaymentAddHint(false);
    setCreatePaymentExt((e) => ({
      ...e,
      customerPayments: [
        ...e.customerPayments,
        {
          id: newPayRowId(),
          date: "",
          amount: 0,
          type: "cash",
          description: "",
        },
      ],
    }));
  };

  const tryAddCreatePartnerPayment = () => {
    if (!partnerAddPaymentState.allowed) {
      if (partnerAddPaymentState.reason) {
        setShowPartnerPaymentAddHint(true);
      }
      return;
    }
    setShowPartnerPaymentAddHint(false);
    setCreatePaymentExt((e) => ({
      ...e,
      partnerPayments: [
        ...e.partnerPayments,
        {
          id: newPayRowId(),
          date: "",
          amount: 0,
          description: "",
        },
      ],
    }));
  };

  const updateCreateCustomer = (
    id: string,
    patch: Partial<CustomerPaymentRow>
  ) => {
    setCreatePaymentExt((e) => ({
      ...e,
      customerPayments: e.customerPayments.map((r) =>
        r.id === id ? { ...r, ...patch } : r
      ),
    }));
  };
  const updateCreatePartner = (
    id: string,
    patch: Partial<PartnerPaymentRow>
  ) => {
    setCreatePaymentExt((e) => ({
      ...e,
      partnerPayments: e.partnerPayments.map((r) =>
        r.id === id ? { ...r, ...patch } : r
      ),
    }));
  };

  const patchCreateScheduleField = useCallback(
    (
      field:
        | "service_date"
        | "service_date_to"
        | "service_from_time"
        | "service_to_time",
      value: string
    ) => {
      if (field === "service_date_to") {
        setValue("service_date_to", value, { shouldValidate: true });
        return;
      }
      setServiceItems((prev) => {
        const base: OrderItemModel =
          prev[0] ??
          ({
            service_id: "",
            service_price: 0,
            partner_id: "",
            service_address: "",
            service_date: "",
            service_from_time: "",
            service_to_time: "",
            sub_total: 0,
            tax: 0,
            user_paltform_fee: 0,
            partner_commison_platform_fee: 0,
            partner_earning: 0,
            total_price: 0,
            admin_earning: 0,
          } as OrderItemModel);
        const next0 = { ...base, [field]: value };
        const next = prev.length ? [next0, ...prev.slice(1)] : [next0];
        setValue(`serviceItems.0.${field}` as any, value, {
          shouldValidate: true,
        });
        return next;
      });
    },
    [setValue]
  );

  /** Same as Add Quote — drop stale category when partner-scoped list changes. */
  useEffect(() => {
    if (isEditable || !createOrderPartnerSelected) return;
    const cid = String(createCategoryIdWatch ?? "").trim();
    if (!cid) return;
    const ok = quoteCategoryOptionsForPartner.some(
      (c) => String(c.value) === cid
    );
    if (ok) return;
    setValue("category_id", "", { shouldValidate: false });
    setValue("requested_services", "", { shouldValidate: false });
    setValue("create_service_price", "", { shouldValidate: false });
    patchCreateScheduleField("service_date", "");
    patchCreateScheduleField("service_date_to", "");
    patchCreateScheduleField("service_from_time", "");
    patchCreateScheduleField("service_to_time", "");
  }, [
    isEditable,
    createOrderPartnerSelected,
    createCategoryIdWatch,
    quoteCategoryOptionsForPartner,
    setValue,
    patchCreateScheduleField,
  ]);

  const handleCreateOrderFranchiseChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const nextId = String(e.target.value ?? "").trim();
      setValue("franchise_id", e.target.value, {
        shouldValidate: createFormSubmitted,
      });
      resetCreateOrderCatalogSelections();
      lastOrderCatalogFranchiseIdRef.current = "";
      if (isSuperAdminOrStaff && nextId) {
        void loadOrderCatalogForFranchise(nextId, { force: true });
      }
    },
    [
      isSuperAdminOrStaff,
      loadOrderCatalogForFranchise,
      resetCreateOrderCatalogSelections,
      setValue,
      createFormSubmitted,
    ]
  );

  const onSubmitEvent = async (data: any) => {
    if (!isEditable) {
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
      if (String(data.customer_user_id ?? "").trim() && !createOrderAddressUi.ready) {
        showErrorAlert(
          "Still loading address options for this franchise. Please wait a moment."
        );
        return;
      }
      if (createOrderAddressUi.error) {
        showErrorAlert(createOrderAddressUi.error);
        return;
      }
      if (!createOrderAddressId.trim()) {
        if (!createOrderAddressUi.rows.length) {
          showErrorAlert(
            "No saved address on file for this customer. Add an address to the user profile before creating an order."
          );
        } else {
          showErrorAlert(
            "Select a customer address for this order. Addresses outside this franchise's service area cannot be used."
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
      const price = Number.parseFloat(
        String(data.create_service_price ?? "").trim()
      );
      if (Number.isNaN(price) || price <= 0) {
        showErrorAlert("Enter a valid service price.");
        return;
      }
      if (
        String(data.offer_id ?? "").trim() &&
        selectedCouponOffer &&
        createOrderBasePriceBreakdown
      ) {
        const couponCheck = validateCouponForPriceBreakdown(
          createOrderBasePriceBreakdown,
          mapOfferModelToCouponInput(selectedCouponOffer)
        );
        if (!couponCheck.valid) {
          showErrorAlert(couponCheck.reason ?? "Cannot apply this coupon.");
          return;
        }
      }
      const payCaps = validatePaymentExtAgainstCaps(
        createPaymentExt,
        createFinalTotal,
        createPartnerCap
      );
      if (!payCaps.valid) {
        showErrorAlert(payCaps.reason ?? "Payment amounts exceed allowed totals.");
        return;
      }
      const schedDate = String(serviceItems[0]?.service_date ?? "").trim();
      const schedTo = String(data.service_date_to ?? "").trim();
      const tFrom = String(serviceItems[0]?.service_from_time ?? "").trim();
      const tTo = String(serviceItems[0]?.service_to_time ?? "").trim();
      if (scheduleMode === "range") {
        if (!schedDate || !schedTo || !tFrom || !tTo) {
          showErrorAlert("Please complete the schedule (dates and times).");
          return;
        }
      } else if (!schedDate || !tFrom || !tTo) {
        showErrorAlert("Please complete the schedule (date and times).");
        return;
      }
      if (!isCalendarDateNotBeforeToday(schedDate)) {
        showErrorAlert("Schedule date must be today or a future date.");
        return;
      }
      if (scheduleMode === "range" && !isCalendarDateNotBeforeToday(schedTo)) {
        showErrorAlert("End date must be today or a future date.");
        return;
      }
      if (scheduleMode === "range") {
        const cmp = compareIsoDateOnlyAsc(schedDate, schedTo);
        if (cmp != null && cmp > 0) {
          showErrorAlert("End date must be on or after the start date.");
          return;
        }
      }
      if (!isScheduleEndAfterStartSameDay(tFrom, tTo)) {
        showErrorAlert(
          "End time must be after start time on the same day (use a later time, not earlier in the morning than the start)."
        );
        return;
      }
    }

    const updatedServiceItems = serviceItems.map((item) => ({
      ...item,
      user_id: selectedUser?._id,
      category_id: data.category_id,
    }));

    const payloadServiceItems = updatedServiceItems.map((item) => {
      const { address_cards, ...rest } = item;
      const serialized = address_cards?.length
        ? serializeServiceAddressCards(address_cards).trim()
        : "";
      return {
        ...rest,
        service_address: serialized || (rest.service_address ?? ""),
      };
    });

    const firstAddr = payloadServiceItems
      .find((s) => s.service_address?.trim())
      ?.service_address?.trim();
    const resolvedCityId =
      data.city_id ||
      selectedUser?.city_id ||
      (cities.length > 0 ? cities[0].value : "");

    let response;
    if (isEditable) {
      if (!order?._id) {
        showErrorAlert("Unable to update. ID is missing.");
        return;
      }
      const editPayMeta = deriveOrderCustomerPaymentFields(
        createPaymentExt,
        Number(order?.total_price ?? paymentDetails.totalPrice ?? 0)
      );
      const schedDate = String(payloadServiceItems[0]?.service_date ?? "").trim();
      const schedTo = String(data.service_date_to ?? "").trim();
      const tFrom = String(payloadServiceItems[0]?.service_from_time ?? "").trim();
      const tTo = String(payloadServiceItems[0]?.service_to_time ?? "").trim();
      const editMetrics = deriveOrderScheduleMetrics({
        scheduleMode,
        requested_date: schedDate,
        requested_date_to: schedTo || schedDate,
        requested_time: "",
        requested_time_from: tFrom,
        requested_time_to: tTo,
      });
      const payload: Record<string, unknown> = {
        user_id: selectedUser?._id,
        user_unique_id: selectedUser?.user_id,
        city_id: resolvedCityId,
        category_id: data.category_id,
        payment_mode_id: String(data.payment_mode_id ?? order?.payment_mode_id ?? "2"),
        transaction_id:
          order?.transaction_id != null ? String(order.transaction_id) : "",
        created_by_id:
          data.created_by_id || getLocalStorage(AppConstant.createdById),
        address: firstAddr || selectedUser?.address,
        service_items: payloadServiceItems,
        customer_description:
          String(data.user_description ?? "").trim() || undefined,
        order_description:
          String(data.admin_description ?? "").trim() || undefined,
        name: selectedUser?.name,
        email: selectedUser?.email,
        contact: selectedUser?.phone_number,
        is_paid: editPayMeta.is_paid,
        customer_payment_method: editPayMeta.customer_payment_method,
      };
      if (editMetrics) {
        applyOrderScheduleMetricsToBody(payload, editMetrics);
      } else if (schedDate) {
        applyOrderTopLevelScheduleDates(payload, {
          from_date: schedDate,
          to_date: schedTo || schedDate,
        });
      }
      response = await createOrUpdateOrder(payload, true, order?._id);
    } else {
      const price = Number.parseFloat(
        String(data.create_service_price ?? "").trim()
      );
      const baseServiceCharge = Math.max(0, parsedCreateServicePrice ?? price);
      const extForSave: OrderPaymentExtV1 = normalizePaymentExtForSubmit({
        ...createPaymentExt,
        serviceAmount: baseServiceCharge,
        taxPercent: createCatalogServiceTax.taxPct,
        commissionPercent: createCatalogServiceTax.commissionPct,
      });
      const serviceId = String(data.requested_services ?? "").trim();
      const serviceOpt = quoteCatalogServicesForPartner.find(
        (o) => o.value === serviceId
      );
      const categoryId =
        String(data.category_id ?? "").trim() ||
        normalizeServiceCategoryRef(serviceOpt?.category_id) ||
        "";
      const primaryLine = payloadServiceItems[0];
      const createMetrics = deriveOrderScheduleMetrics({
        scheduleMode,
        requested_date: String(primaryLine?.service_date ?? "").trim(),
        requested_date_to: String(data.service_date_to ?? "").trim(),
        requested_time: "",
        requested_time_from: String(primaryLine?.service_from_time ?? "").trim(),
        requested_time_to: String(primaryLine?.service_to_time ?? "").trim(),
      });
      const payload = buildCreateOrderPayload({
        userId: selectedUser!._id,
        userUniqueId: selectedUser?.user_id
          ? String(selectedUser.user_id)
          : undefined,
        cityId: resolvedCityId,
        categoryId,
        partnerId: String(data.requested_partner ?? "").trim(),
        serviceId: String(data.requested_services ?? "").trim(),
        createdById:
          data.created_by_id || getLocalStorage(AppConstant.createdById) || "",
        address: firstAddr || selectedUser?.address || "",
        addressId: createOrderAddressId.trim() || undefined,
        scheduleMetrics: createMetrics,
        totalServiceCharge: baseServiceCharge,
        invoiceTotal: Math.max(0, createFinalTotal),
        customerDescription: String(data.user_description ?? "").trim() || undefined,
        orderDescription: String(data.admin_description ?? "").trim() || undefined,
        offerId: data.offer_id ? String(data.offer_id) : undefined,
        serviceItem: {
          service_date: primaryLine?.service_date ?? "",
          service_from_time: primaryLine?.service_from_time ?? "",
          service_to_time: primaryLine?.service_to_time ?? "",
          service_address: primaryLine?.service_address ?? "",
        },
        paymentExt: extForSave,
      });
      response = await createOrUpdateOrder(payload, false);
    }

    if (response) {
      onClose && onClose();
      onRefreshData();
    }
  };

  return (
    <>
      <Modal
        show={true}
        onHide={onClose}
        {...QUOTE_MODAL_LAYOUT}
        enforceFocus={false}
      >
          <Modal.Header className="py-3 px-4 border-bottom-0">
            <Modal.Title as="h5" className="custom-modal-title">
              {isEditable ? "Update" : "Create"} Order
            </Modal.Title>
            <CustomCloseButton onClose={onClose} />
          </Modal.Header>
          <Modal.Body className="add-quote-modal-body pt-0">
            <form
              noValidate
              name="order-form"
              id="order-form"
              onSubmit={handleSubmit(onSubmitEvent)}
            >
              {!isEditable ? (
                <>
                  <section className="custom-other-details add-quote-form-section">
                    <div>
                      <Row className="gy-3 gx-md-4 align-items-start">
                        {isSuperAdminOrStaff ? (
                          <Col xs={12} md={6}>
                            <Row className="align-items-start">
                              <Col sm={4} className="d-flex align-items-start">
                                <label
                                  htmlFor="create-order-franchise"
                                  className="custom-profile-lable"
                                >
                                  <FieldLabelText label="Franchise" required />
                                </label>
                              </Col>
                      <Col>
                                <Form.Select
                                  id="create-order-franchise"
                                  className="form-select custom-form-input"
                                  value={String(createFranchiseIdWatch ?? "")}
                                  onChange={handleCreateOrderFranchiseChange}
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
                                  {franchiseOptionsForOrder.map((o) => (
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
                            controlId="create-order-user"
                            asCol={false}
                            options={createCatalogUserOptions}
                          register={register}
                          fieldName="customer_user_id"
                          error={errors.customer_user_id}
                            requiredMessage="Please select a user"
                          defaultValue={getValues("customer_user_id")}
                          setValue={
                            setValue as (name: string, value: any) => void
                          }
                            placeholder="Search user"
                            menuPortal
                            isClearable
                            isDisabled={createOrderFieldsLocked}
                          />
                        </Col>
                        {!isSuperAdminOrStaff ? (
                          <Col xs={12} md={6}>
                            <CustomTextFieldSelect
                              label="Employee"
                              controlId="create-order-employee"
                              asCol={false}
                              options={quoteEmployeeOptions}
                              register={register}
                              fieldName="created_by_id"
                              error={errors.created_by_id}
                              defaultValue={getValues("created_by_id")}
                              setValue={
                                setValue as (name: string, value: any) => void
                              }
                              placeholder="Select employee"
                              menuPortal
                              isClearable
                              isDisabled={createOrderFieldsLocked}
                            />
                          </Col>
                        ) : null}
                      </Row>

                      {String(createCustomerIdWatch ?? "").trim() ? (
                        <Row className="mt-4">
                          <Col xs={12}>
                            <label
                              className="custom-profile-lable d-block"
                              style={{ fontWeight: 600, marginBottom: "1.125rem" }}
                            >
                              <FieldLabelText label="Customer addresses" required />
                            </label>
                            {!createOrderAddressUi.ready ? (
                              <QuoteAddressOptionsLoader />
                            ) : (
                              <>
                                {createOrderAddressUi.error ? (
                                  <div className="small text-danger mb-2">
                                    {createOrderAddressUi.error}
                                  </div>
                                ) : null}
                                {createOrderAddressUi.rows.length ? (
                                  <div className="add-quote-address-cards-grid mb-5">
                                    {createOrderAddressUi.rows.map((row) => {
                                      const selected =
                                        createOrderAddressId === row.id &&
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
                                      const pairCandidates: [string, string][] =
                                        [
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
                                            name="create-order-address"
                                            id={`create-order-addr-${row.id}`}
                                            disabled={!row.selectable}
                                            checked={
                                              createOrderAddressId === row.id &&
                                              row.selectable
                                            }
                                            onChange={() => {
                                              if (row.selectable) {
                                                setCreateOrderAddressId(row.id);
                                              }
                                            }}
                                            className="add-quote-address-card-check"
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
                                                      : areaMode
                                                      ? "Outside area"
                                                      : "Not in service list"}
                                                  </span>
                                                </div>
                                                <div className="add-quote-address-card-grid">
                                                  {pairs.map(([lbl, val]) => (
                                                    <div key={lbl}>
                                                      <span className="add-quote-address-card-grid-label">
                                                        {lbl}
                                                      </span>
                                                      <span className="add-quote-address-card-grid-value">
                                                        {val}
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                                {!row.selectable ? (
                                                  <div className="add-quote-address-card-footnote">
                                                    {areaMode
                                                      ? "Outside this franchise's service areas."
                                                      : "Postcode not in this franchise's service list."}
                                                  </div>
                                                ) : null}
                                              </div>
                                            }
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="small text-warning">
                                    No saved address on file for this customer.
                                    Add an address to the user profile before
                                    creating an order.
                                  </div>
                                )}
                              </>
                            )}
                          </Col>
                        </Row>
                      ) : null}

                      <Row className="gy-3 gx-md-4 align-items-start">
                        {isSuperAdminOrStaff ? (
                          <Col xs={12} md={6}>
                            <CustomTextFieldSelect
                              label="Employee"
                              controlId="create-order-employee-sa"
                              asCol={false}
                              options={quoteEmployeeOptions}
                              register={register}
                              fieldName="created_by_id"
                              error={errors.created_by_id}
                              defaultValue={getValues("created_by_id")}
                              setValue={
                                setValue as (name: string, value: any) => void
                              }
                              placeholder="Select employee"
                          menuPortal
                              isClearable
                              isDisabled={createOrderFieldsLocked}
                        />
                      </Col>
                        ) : null}
                        <Col xs={12} md={6}>
                          <CustomTextFieldSelect
                            label="Requested Partner"
                            controlId="create-order-partner"
                            asCol={false}
                            options={quotePartnerOptions}
                            register={register}
                            fieldName="requested_partner"
                            error={errors.requested_partner}
                            requiredMessage="Please select a partner"
                            defaultValue={getValues("requested_partner")}
                            setValue={(name: string, value: any) => {
                              setValue(name, value, {
                                shouldValidate: createFormSubmitted,
                              });
                              if (name === "requested_partner") {
                                setValue("category_id", "", {
                                  shouldValidate: false,
                                });
                                setValue("requested_services", "", {
                                  shouldValidate: false,
                                });
                                patchCreateScheduleField("service_date", "");
                                patchCreateScheduleField("service_date_to", "");
                                patchCreateScheduleField("service_from_time", "");
                                patchCreateScheduleField("service_to_time", "");
                                setValue("create_service_price", "", {
                                  shouldValidate: false,
                                });
                              }
                            }}
                            placeholder="Select partner"
                            menuPortal
                            isClearable
                            isDisabled={createOrderFieldsLocked}
                          />
                        </Col>
                        <Col xs={12} md={6}>
                        <CustomTextFieldSelect
                          label="Requested Category"
                            controlId="create-order-category"
                            asCol={false}
                            options={quoteCategoryOptionsForPartner}
                          register={register}
                          fieldName="category_id"
                          error={errors.category_id}
                            requiredMessage="Please select a category"
                          defaultValue={getValues("category_id")}
                            isClearable
                            setValue={(name: string, value: any) => {
                              setValue(name, value, {
                                shouldValidate: createFormSubmitted,
                              });
                              if (name === "category_id") {
                                setValue("requested_services", "", {
                                  shouldValidate: false,
                                });
                                patchCreateScheduleField("service_date", "");
                                patchCreateScheduleField("service_date_to", "");
                                patchCreateScheduleField("service_from_time", "");
                                patchCreateScheduleField("service_to_time", "");
                                setValue("create_service_price", "", {
                                  shouldValidate: false,
                                });
                              }
                            }}
                            placeholder={
                              createOrderPartnerSelected
                                ? "Select category"
                                : "Select partner first"
                            }
                          menuPortal
                            isDisabled={
                              createOrderFieldsLocked ||
                              !createOrderPartnerSelected
                            }
                        />
                      </Col>
                        <Col xs={12} md={6}>
                        <CustomTextFieldSelect
                            key={`create-order-svc-${createCategoryIdWatch || "none"}`}
                            label="Requested Services"
                            controlId="create-order-service"
                            asCol={false}
                            options={quoteServiceOptionsForCategory}
                          register={register}
                            fieldName="requested_services"
                            error={errors.requested_services}
                          requiredMessage="Please select a service"
                            defaultValue={getValues("requested_services")}
                            setValue={(name: string, value: any) => {
                              setValue(name, value, {
                                shouldValidate: createFormSubmitted,
                              });
                              if (name === "requested_services") {
                                const sid = String(value ?? "").trim();
                                if (sid) {
                                  const opt = quoteCatalogServicesForPartner.find(
                                    (o) => o.value === sid
                                  );
                                  const catRef = normalizeServiceCategoryRef(
                                    opt?.category_id
                                  );
                                  if (catRef) {
                                    setValue("category_id", catRef, {
                                      shouldValidate: false,
                                    });
                                  }
                                }
                                patchCreateScheduleField("service_date", "");
                                patchCreateScheduleField("service_date_to", "");
                                patchCreateScheduleField("service_from_time", "");
                                patchCreateScheduleField("service_to_time", "");
                                setValue("create_service_price", "", {
                                  shouldValidate: false,
                                });
                              }
                            }}
                            placeholder={
                              !createOrderPartnerSelected
                                ? "Select partner first"
                                : !String(createCategoryIdWatch ?? "").trim()
                                ? "Select category first"
                                : "Select service"
                          }
                          menuPortal
                            isClearable
                            isDisabled={
                              createOrderFieldsLocked ||
                              !createOrderPartnerSelected ||
                              !String(createCategoryIdWatch ?? "").trim()
                            }
                        />
                      </Col>
                    </Row>

                      {hasCreateOrderServiceSelected ? (
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
                                      controlId="create-order-from-date"
                            selectedDate={
                                        serviceItems[0]?.service_date || null
                            }
                                      onChange={(date) => {
                              patchCreateScheduleField(
                                "service_date",
                                          toIsoCalendarDate(date) ?? ""
                                        );
                                      }}
                                      register={register}
                                      setValue={setValue}
                                      asCol={false}
                                      labelSize={12}
                                      placeholderText="From date"
                                      filterDate={createOrderScheduleFromDateFilter}
                                      required
                                    />
                                  </Col>
                                  <Col xs={12} md={3}>
                                    <CustomTextFieldDatePicket
                                      label="To date"
                                      controlId="create-order-to-date"
                                      selectedDate={
                                        createScheduleDateToWatch || null
                                      }
                                      onChange={(date) => {
                                        patchCreateScheduleField(
                                          "service_date_to",
                                          toIsoCalendarDate(date) ?? ""
                                        );
                                      }}
                            register={register}
                                      setValue={setValue}
                                      asCol={false}
                                      labelSize={12}
                                      placeholderText="To date"
                                      filterDate={createOrderScheduleToDateFilter}
                                      required
                                    />
                                  </Col>
                                </>
                              ) : (
                                <Col xs={12} md={3}>
                                  <CustomTextFieldDatePicket
                                    label="Date"
                                    controlId="create-order-date"
                                    selectedDate={
                                      serviceItems[0]?.service_date || null
                                    }
                                    onChange={(date) => {
                                      patchCreateScheduleField(
                                        "service_date",
                                        toIsoCalendarDate(date) ?? ""
                                      );
                                    }}
                                    register={register}
                            setValue={setValue}
                                    asCol={false}
                                    labelSize={12}
                                    placeholderText="Date"
                                    filterDate={createOrderScheduleFromDateFilter}
                                    required
                          />
                        </Col>
                              )}
                              <Col xs={12} md={3}>
                          <CustomTextFieldTimePicket
                                  label="Start time"
                                  controlId="create-order-time-from"
                            selectedTime={
                                    serviceItems[0]?.service_from_time || null
                            }
                                  onChange={(date) => {
                              patchCreateScheduleField(
                                "service_from_time",
                                      datePickerTimeToScheduleStorage(date)
                                    );
                                  }}
                            register={register}
                            setValue={setValue}
                                  asCol={false}
                                  labelSize={12}
                                  placeholderText="Start time"
                                  filterTime={quoteScheduleTimePickerAllowAllHours}
                                  timeIntervals={SCHEDULE_TIME_PICKER_INTERVAL_MINUTES}
                                  suppressHiddenRegister
                                  required
                          />
                        </Col>
                              <Col xs={12} md={3}>
                          <CustomTextFieldTimePicket
                                  label="End time"
                                  controlId="create-order-time-to"
                            selectedTime={
                                    serviceItems[0]?.service_to_time || null
                            }
                                  onChange={(date) => {
                              patchCreateScheduleField(
                                "service_to_time",
                                      datePickerTimeToScheduleStorage(date)
                                    );
                                  }}
                            register={register}
                            setValue={setValue}
                                  asCol={false}
                                  labelSize={12}
                                  placeholderText="After start time"
                                  minTime={createOrderEndMinTime}
                                  maxTime={scheduleEndTimeMaxForDay()}
                                  timeIntervals={SCHEDULE_TIME_PICKER_INTERVAL_MINUTES}
                                  suppressHiddenRegister
                                  required
                                />
                              </Col>
                            </Row>
                            {createOrderSchedulePricePreview ? (
                              <div className="add-quote-schedule-preview">
                                <span className="add-quote-schedule-preview-badge">
                                  {createOrderSchedulePricePreview.billingLabel}
                                </span>
                                <div className="add-quote-schedule-preview-line">
                                  {createOrderSchedulePricePreview.primaryLine}
                                </div>
                                {createOrderSchedulePricePreview.secondaryLine ? (
                                  <div className="add-quote-schedule-preview-sub">
                                    {
                                      createOrderSchedulePricePreview.secondaryLine
                                    }
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          {isCreateOrderScheduleComplete ? (
                            <div className="add-quote-price-section mt-4 pt-3 border-top">
                              <Row className="g-3 align-items-start mb-0">
                                <Col xs={12} md={6} lg={5}>
                                  <Form.Group controlId="create_service_price">
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
                                        disabled={createOrderFieldsLocked}
                                        className="custom-form-input border-start-0"
                                        style={{
                                          ...partnerCatalogControlStyle,
                                          borderLeft: 0,
                                          borderTopLeftRadius: 0,
                                          borderBottomLeftRadius: 0,
                                        }}
                                        placeholder="e.g. 499"
                                        {...register("create_service_price", {
                                          onChange: (e) => {
                                            setValue(
                                              "create_service_price",
                                              e.target.value,
                                              {
                                                shouldValidate: false,
                                                shouldDirty: true,
                                              }
                                            );
                                          },
                                          onBlur: () => {
                                            commitCreateServicePriceIfPaymentsAllow();
                                          },
                                        })}
                                      />
                                    </InputGroup>
                                  </Form.Group>
                        </Col>
                      </Row>
                            </div>
                  ) : null}
                        </>
                      ) : null}
                    </div>
                  </section>

                  {hasCreateOrderServiceSelected &&
                  isCreateOrderScheduleComplete ? (
                  <section
                    className="custom-other-details mt-3"
                    style={sectionShell}
                  >
                    <Row className="g-3">
                      <Col xs={12}>
                        <CustomFormInput
                          label="User description"
                          controlId="user_description"
                          placeholder="Optional notes from the customer"
                          register={register}
                          as="textarea"
                          asCol={false}
                          rows={3}
                        />
                      </Col>
                      <Col xs={12}>
                        <CustomFormInput
                          label="Admin description"
                          controlId="admin_description"
                          placeholder="Optional internal notes for this order"
                          register={register}
                          as="textarea"
                          asCol={false}
                          rows={3}
                        />
                      </Col>
                    </Row>
                  </section>
                  ) : null}

                  {hasCreateOrderServiceSelected &&
                  isCreateOrderScheduleComplete ? (
                  <>
                  <section
                    className="custom-other-details mt-3"
                    style={sectionShell}
                  >
                    <div
                      className="order-payment-info-section"
                      style={priceSummarySection}
                    >
                      <Row className="align-items-center mb-3 pb-2 border-bottom">
                        <Col>
                          <h3 className="mb-0">Payment information</h3>
                        </Col>
                      </Row>
                      {createOrderPriceBreakdown ? (
                        <OrderAmountSummaryPanel
                          display={buildOrderAmountSummaryFromQuoteBreakdown(
                            createOrderPriceBreakdown,
                            {
                              offer: {
                                totalOfferValue:
                                  Number(
                                    selectedCouponOffer?.totalOfferValue
                                  ) ||
                                  previewCouponBreakdown.appliedDiscount,
                                adminContribution:
                                  previewCouponBreakdown.adminContribution,
                                partnerContribution:
                                  previewCouponBreakdown.partnerContribution,
                                appliedDiscount:
                                  previewCouponBreakdown.appliedDiscount,
                                offerName: previewCouponBreakdown.offerName,
                                offerCode: previewCouponBreakdown.offerCode
                                  ? String(
                                      previewCouponBreakdown.offerCode
                                    )
                                  : undefined,
                              },
                              finalTotal: createFinalTotal,
                            }
                          )}
                          style={{
                            marginTop: 0,
                            padding: 0,
                            border: "none",
                            background: "transparent",
                          }}
                        >
                          <OrderCouponAction
                            hasCoupon={Boolean((offerIdWatch ?? "").trim())}
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
                              setValue("offer_id", "", {
                                shouldValidate: true,
                                shouldDirty: true,
                              })
                            }
                          />
                        </OrderAmountSummaryPanel>
                      ) : null}
                    </div>
                  </section>

                  <section
                    className="custom-other-details mt-3"
                    style={sectionShell}
                  >
                      <Row className="align-items-center justify-content-between mb-3 pb-2 border-bottom flex-wrap g-2">
                        <Col
                          xs="auto"
                          className="me-auto d-flex flex-wrap align-items-baseline gap-2 gap-md-3"
                        >
                          <h3 className="mb-0">User payments</h3>
                          <span
                            className="text-secondary"
                            style={{ fontSize: FONT_LABEL }}
                          >
                            Final total
                          </span>
                          <span
                            className="fw-semibold"
                            style={{ ...moneyTabular, fontSize: FONT_BODY }}
                          >
                            {AppConstant.currencySymbol}
                            {formatMoney2(createFinalTotal || 0)}
                          </span>
                        </Col>
                        <Col xs="auto">
                          <Button
                            type="button"
                            className="custom-btn-secondary w-auto"
                            disabled={!canAddCustomerByBalance}
                            onClick={tryAddCreateCustomerPayment}
                          >
                            Add User payment
                          </Button>
                        </Col>
                      </Row>
                      <div style={paymentSubcard}>
                        {createPaymentExt.customerPayments.length > 0 ? (
                        <Table
                          bordered
                          size="sm"
                          className="mb-0 align-middle order-payment-table"
                          style={{
                            color: "var(--content-txt-color)",
                            width: "100%",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: 44 }} />
                            <col style={{ width: 170 }} />
                            <col style={{ width: 120 }} />
                            <col style={{ width: 150 }} />
                            <col />
                            <col style={{ width: 44 }} />
                          </colgroup>
                          <thead className="table-light">
                            <tr
                              style={{
                                borderColor:
                                  "var(--lb1-border, var(--txtfld-border))",
                              }}
                            >
                              <th
                                className="text-center fw-semibold"
                                style={tableThCreate}
                              >
                                S.No
                              </th>
                              <th
                                className="text-start fw-semibold"
                                style={tableThCreate}
                              >
                                Date
                              </th>
                              <th
                                className="text-end fw-semibold"
                                style={tableThCreate}
                              >
                                Paid amount
                              </th>
                              <th
                                className="text-start fw-semibold"
                                style={tableThCreate}
                              >
                                Payment Method
                              </th>
                              <th
                                className="text-start fw-semibold"
                                style={tableThCreate}
                              >
                                Description
                              </th>
                              <th
                                className="text-center fw-semibold"
                                style={tableThCreate}
                                aria-label="Remove row"
                              />
                            </tr>
                          </thead>
                          <tbody>
                            {createPaymentExt.customerPayments.map(
                              (row, idx) => {
                                const customerRowHighlight =
                                  showCustomerPaymentAddHint &&
                                  !isCustomerPaymentRowComplete(row);
                                return (
                                <tr
                                  key={row.id}
                                  className={
                                    customerRowHighlight
                                      ? "payment-row--invalid"
                                      : undefined
                                  }
                                >
                                  <td className="align-middle text-center fw-medium">
                                    {idx + 1}
                                  </td>
                                  <td className="align-middle">
                                    <CustomDatePicker
                                      label=""
                                      controlId={`create-cust-date-${row.id}`}
                                      selectedDate={row.date || null}
                                      onChange={(d: Date | null) => {
                                        if (!d) return;
                                        const y = d.getFullYear();
                                        const m = `${
                                          d.getMonth() + 1
                                        }`.padStart(2, "0");
                                        const day = `${d.getDate()}`.padStart(
                                          2,
                                          "0"
                                        );
                                        updateCreateCustomer(row.id, {
                                          date: `${y}-${m}-${day}`,
                                        });
                                      }}
                                      register={paymentFieldRegister}
                                      setValue={setValue}
                                      asCol={false}
                                      groupClassName="mb-0"
                                      filterDate={() => true}
                                      suppressHiddenRegister
                                    />
                                  </td>
                                  <td className="align-middle">
                                    <CustomFormInput
                                      label=""
                                      controlId={`create-cust-amt-${row.id}`}
                                      placeholder="0.00"
                                      register={paymentFieldRegister}
                                      asCol={false}
                                      inputType="text"
                                      inputClassName="text-end"
                                      inputStyle={tablePriceInputCreate}
                                      value={paymentAmountFieldValue(row)}
                                      onChange={(val) => {
                                        setCreatePaymentExt((e) => {
                                          const cap = Math.max(
                                            0,
                                            createFinalTotal
                                          );
                                          const otherSum = sumCustomerAmounts(
                                            e.customerPayments.filter(
                                              (r) => r.id !== row.id
                                            )
                                          );
                                          const maxForRow = Math.max(
                                            0,
                                            cap - otherSum
                                          );
                                          const amountInput =
                                            sanitizeMoneyInput(val);
                                          const parsed = parseMoneyInput(
                                            amountInput
                                          );
                                          const nextAmount =
                                            maxForRow >= 0
                                              ? roundMoney(
                                                  Math.min(parsed, maxForRow)
                                                )
                                              : parsed;
                                          const displayInput =
                                            parsed > nextAmount + 0.0001
                                              ? formatMoney2(nextAmount)
                                              : amountInput;
                                          return {
                                            ...e,
                                            customerPayments:
                                              e.customerPayments.map((r) =>
                                                r.id === row.id
                                                  ? {
                                                      ...r,
                                                      amount: nextAmount,
                                                      amountInput: displayInput,
                                                    }
                                                  : r
                                              ),
                                          };
                                        });
                                      }}
                                      onBlur={() => {
                                        setCreatePaymentExt((e) => {
                                          const cap = Math.max(
                                            0,
                                            createFinalTotal
                                          );
                                          const otherSum = sumCustomerAmounts(
                                            e.customerPayments.filter(
                                              (r) => r.id !== row.id
                                            )
                                          );
                                          const maxForRow = Math.max(
                                            0,
                                            cap - otherSum
                                          );
                                          return {
                                            ...e,
                                            customerPayments:
                                              e.customerPayments.map((r) => {
                                                if (r.id !== row.id) return r;
                                                const amount = roundMoney(
                                                  Math.min(
                                                    paymentRowEffectiveAmount(r),
                                                    maxForRow
                                                  )
                                                );
                                                return {
                                                  ...r,
                                                  amount,
                                                  amountInput: undefined,
                                                };
                                              }),
                                          };
                                        });
                                      }}
                                    />
                                  </td>
                                  <td className="align-middle">
                                    <CustomFormSelect
                                      label=""
                                      controlId={`create-cust-type-${row.id}`}
                                      register={paymentFieldRegister}
                                      fieldName={`createCustPayType_${row.id}`}
                                      options={PAYMENT_METHOD_OPTIONS}
                                      defaultValue={
                                        normalizePaymentMethod(row.type) ||
                                        "cash"
                                      }
                                      setValue={setValue}
                                      asCol={false}
                                      noBottomMargin
                                      menuPortal
                                      onChange={(
                                        ev: React.ChangeEvent<HTMLSelectElement>
                                      ) =>
                                        updateCreateCustomer(row.id, {
                                          type: ev.target.value,
                                        })
                                      }
                                    />
                                  </td>
                                  <td
                                    className="align-middle text-wrap"
                                    style={{ wordBreak: "break-word" }}
                                  >
                                    <Form.Control
                                      size="sm"
                                      className="custom-form-input"
                                      style={{
                                        fontSize: FONT_BODY,
                                        marginBottom: 0,
                                      }}
                                      value={row.description}
                                      onChange={(
                                        ev: React.ChangeEvent<HTMLInputElement>
                                      ) =>
                                        updateCreateCustomer(row.id, {
                                          description: ev.target.value,
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="text-center align-middle">
                                    <i
                                      className="bi bi-trash text-danger fs-6"
                                      role="button"
                                      tabIndex={0}
                                      title="Remove row"
                                      aria-label="Remove user payment row"
                                      onClick={() => {
                                        openConfirmDialog(
                                          "Are you sure you want to delete this user payment entry?",
                                          "Delete",
                                          "Cancel",
                                          () =>
                                            setCreatePaymentExt((e) => ({
                                              ...e,
                                              customerPayments:
                                                e.customerPayments.filter(
                                                  (r) => r.id !== row.id
                                                ),
                                            }))
                                        );
                                      }}
                                      onKeyDown={(ev) => {
                                        if (
                                          ev.key !== "Enter" &&
                                          ev.key !== " "
                                        )
                                          return;
                                        ev.preventDefault();
                                        (ev.target as HTMLElement).click();
                                      }}
                                    />
                                  </td>
                                </tr>
                              );
                              }
                            )}
                          </tbody>
                        </Table>
                        ) : null}
                      </div>
                      <div
                        className={
                          createPaymentExt.customerPayments.length > 0
                            ? "mt-3 pt-3 border-top"
                            : ""
                        }
                      >
                        <div className="d-flex justify-content-between align-items-center py-1">
                          <span className="text-secondary">Total Paid</span>
                          <span className="fw-semibold" style={moneyTabular}>
                            {AppConstant.currencySymbol}
                            {formatMoney2(createCustomerPaidBal.totalPaid)}
                          </span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center py-1">
                          <span className="text-secondary">Balance</span>
                          <span className="fw-semibold" style={moneyTabular}>
                            {AppConstant.currencySymbol}
                            {formatMoney2(createCustomerPaidBal.balance)}
                          </span>
                        </div>
                      </div>
                  </section>

                  <section
                    className="custom-other-details mt-3 mb-0"
                    style={sectionShell}
                  >
                      <Row className="align-items-center justify-content-between mb-3 pb-2 border-bottom flex-wrap g-2">
                        <Col
                          xs="auto"
                          className="me-auto d-flex flex-wrap align-items-baseline gap-2 gap-md-3"
                        >
                          <h3 className="mb-0">Partner payments</h3>
                          <span
                            className="text-secondary"
                            style={{ fontSize: FONT_LABEL }}
                          >
                            Partner total
                          </span>
                          <span
                            className="fw-semibold"
                            style={{ ...moneyTabular, fontSize: FONT_BODY }}
                          >
                            {AppConstant.currencySymbol}
                            {formatMoney2(createPartnerCap || 0)}
                          </span>
                        </Col>
                        <Col xs="auto">
                          <Button
                            type="button"
                            className="custom-btn-secondary w-auto"
                            disabled={!canAddPartnerByBalance}
                            onClick={tryAddCreatePartnerPayment}
                          >
                            Add partner payment
                          </Button>
                        </Col>
                      </Row>
                      <div style={paymentSubcard}>
                        {createPaymentExt.partnerPayments.length > 0 ? (
                        <Table
                          bordered
                          size="sm"
                          className="mb-0 align-middle order-payment-table"
                          style={{
                            color: "var(--content-txt-color)",
                            width: "100%",
                          }}
                        >
                          <colgroup>
                            <col style={{ width: 44 }} />
                            <col style={{ width: 170 }} />
                            <col style={{ width: 120 }} />
                            <col />
                            <col style={{ width: 44 }} />
                          </colgroup>
                          <thead className="table-light">
                            <tr
                              style={{
                                borderColor:
                                  "var(--lb1-border, var(--txtfld-border))",
                              }}
                            >
                              <th
                                className="text-center fw-semibold"
                                style={tableThCreate}
                              >
                                S.No
                              </th>
                              <th
                                className="text-start fw-semibold"
                                style={tableThCreate}
                              >
                                Date
                              </th>
                              <th
                                className="text-end fw-semibold"
                                style={tableThCreate}
                              >
                                Paid amount
                              </th>
                              <th
                                className="text-start fw-semibold"
                                style={tableThCreate}
                              >
                                Description
                              </th>
                              <th
                                className="text-center fw-semibold"
                                style={tableThCreate}
                                aria-label="Remove row"
                              />
                            </tr>
                          </thead>
                          <tbody>
                            {createPaymentExt.partnerPayments.map(
                              (row, idx) => {
                                const partnerRowHighlight =
                                  showPartnerPaymentAddHint &&
                                  !isPartnerPaymentRowComplete(row);
                                return (
                                <tr
                                  key={row.id}
                                  className={
                                    partnerRowHighlight
                                      ? "payment-row--invalid"
                                      : undefined
                                  }
                                >
                                  <td className="align-middle text-center fw-medium">
                                    {idx + 1}
                                  </td>
                                  <td className="align-middle">
                                    <CustomDatePicker
                                      label=""
                                      controlId={`create-part-date-${row.id}`}
                                      selectedDate={row.date || null}
                                      onChange={(d: Date | null) => {
                                        if (!d) return;
                                        const y = d.getFullYear();
                                        const m = `${
                                          d.getMonth() + 1
                                        }`.padStart(2, "0");
                                        const day = `${d.getDate()}`.padStart(
                                          2,
                                          "0"
                                        );
                                        updateCreatePartner(row.id, {
                                          date: `${y}-${m}-${day}`,
                                        });
                                      }}
                                      register={paymentFieldRegister}
                                      setValue={setValue}
                                      asCol={false}
                                      groupClassName="mb-0"
                                      filterDate={() => true}
                                      suppressHiddenRegister
                                    />
                                  </td>
                                  <td className="align-middle">
                                    <CustomFormInput
                                      label=""
                                      controlId={`create-part-amt-${row.id}`}
                                      placeholder="0.00"
                                      register={paymentFieldRegister}
                                      asCol={false}
                                      inputType="text"
                                      inputClassName="text-end"
                                      inputStyle={tablePriceInputCreate}
                                      value={paymentAmountFieldValue(row)}
                                      onChange={(val) => {
                                        setCreatePaymentExt((e) => {
                                          const cap = Math.max(
                                            0,
                                            createPartnerCap
                                          );
                                          const otherSum = sumPartnerAmounts(
                                            e.partnerPayments.filter(
                                              (r) => r.id !== row.id
                                            )
                                          );
                                          const maxForRow = Math.max(
                                            0,
                                            cap - otherSum
                                          );
                                          const amountInput =
                                            sanitizeMoneyInput(val);
                                          const parsed = parseMoneyInput(
                                            amountInput
                                          );
                                          const nextAmount =
                                            maxForRow >= 0
                                              ? roundMoney(
                                                  Math.min(parsed, maxForRow)
                                                )
                                              : parsed;
                                          const displayInput =
                                            parsed > nextAmount + 0.0001
                                              ? formatMoney2(nextAmount)
                                              : amountInput;
                                          return {
                                            ...e,
                                            partnerPayments:
                                              e.partnerPayments.map((r) =>
                                                r.id === row.id
                                                  ? {
                                                      ...r,
                                                      amount: nextAmount,
                                                      amountInput: displayInput,
                                                    }
                                                  : r
                                              ),
                                          };
                                        });
                                      }}
                                      onBlur={() => {
                                        setCreatePaymentExt((e) => {
                                          const cap = Math.max(
                                            0,
                                            createPartnerCap
                                          );
                                          const otherSum = sumPartnerAmounts(
                                            e.partnerPayments.filter(
                                              (r) => r.id !== row.id
                                            )
                                          );
                                          const maxForRow = Math.max(
                                            0,
                                            cap - otherSum
                                          );
                                          return {
                                            ...e,
                                            partnerPayments:
                                              e.partnerPayments.map((r) => {
                                                if (r.id !== row.id) return r;
                                                const amount = roundMoney(
                                                  Math.min(
                                                    paymentRowEffectiveAmount(r),
                                                    maxForRow
                                                  )
                                                );
                                                return {
                                                  ...r,
                                                  amount,
                                                  amountInput: undefined,
                                                };
                                              }),
                                          };
                                        });
                                      }}
                                    />
                                  </td>
                                  <td
                                    className="align-middle text-wrap"
                                    style={{ wordBreak: "break-word" }}
                                  >
                                    <Form.Control
                                      size="sm"
                                      className="custom-form-input"
                                      style={{
                                        fontSize: FONT_BODY,
                                        marginBottom: 0,
                                      }}
                                      value={row.description}
                                      onChange={(
                                        ev: React.ChangeEvent<HTMLInputElement>
                                      ) =>
                                        updateCreatePartner(row.id, {
                                          description: ev.target.value,
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="text-center align-middle">
                                    <i
                                      className="bi bi-trash text-danger fs-6"
                                      role="button"
                                      tabIndex={0}
                                      title="Remove row"
                                      aria-label="Remove partner payment row"
                                      onClick={() => {
                                        openConfirmDialog(
                                          "Are you sure you want to delete this partner payment entry?",
                                          "Delete",
                                          "Cancel",
                                          () =>
                                            setCreatePaymentExt((e) => ({
                                              ...e,
                                              partnerPayments:
                                                e.partnerPayments.filter(
                                                  (r) => r.id !== row.id
                                                ),
                                            }))
                                        );
                                      }}
                                      onKeyDown={(ev) => {
                                        if (
                                          ev.key !== "Enter" &&
                                          ev.key !== " "
                                        )
                                          return;
                                        ev.preventDefault();
                                        (ev.target as HTMLElement).click();
                                      }}
                                    />
                                  </td>
                                </tr>
                              );
                              }
                            )}
                          </tbody>
                        </Table>
                        ) : null}
                      </div>
                      <div
                        className={
                          createPaymentExt.partnerPayments.length > 0
                            ? "mt-3 pt-3 border-top"
                            : ""
                        }
                      >
                        <div className="d-flex justify-content-between align-items-center py-1">
                          <span className="text-secondary">Total Paid</span>
                          <span className="fw-semibold" style={moneyTabular}>
                            {AppConstant.currencySymbol}
                            {formatMoney2(createPartnerPaidBal.totalPaid)}
                          </span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center py-1">
                          <span className="text-secondary">Balance</span>
                          <span className="fw-semibold" style={moneyTabular}>
                            {AppConstant.currencySymbol}
                            {formatMoney2(createPartnerPaidBal.balance)}
                          </span>
                        </div>
                      </div>
                  </section>
                  </>
                  ) : null}
                </>
              ) : (
                <>
                  <section
                    className="custom-other-details"
                    style={{ padding: "10px" }}
                  >
                    <h3>User</h3>
                    <Row>
                      <Col xs={4}>
                        <CustomTextFieldIndiaMobile
                          label="Phone No"
                          controlId="user_phone_number"
                          placeholder="Mobile number"
                          register={register}
                          error={errors.user_phone_number}
                          validation={{ required: "Phone number is required" }}
                          onChange={async (value) =>
                            await fetchUserFromApi(value)
                          }
                        />
                      </Col>
                      <ShowDetailsRow
                        title="User ID"
                        value={selectedUser?.user_id}
                      />
                      <ShowDetailsRow
                        title="User Name"
                        value={selectedUser?.name}
                      />
                    </Row>
                    <Row>
                      <ShowDetailsRow
                        title="Address"
                        value={
                          selectedUser?.address ??
                          selectedUser?.city_name ??
                          "-"
                        }
                      />
                    </Row>
                  </section>
                  <section
                    className="custom-other-details mt-3"
                    style={{ padding: "10px" }}
                  >
                    <Row>
                      <Col xs={4} className="mt-2">
                        <CustomTextFieldSelect
                          label="City"
                          controlId="City"
                          options={cities}
                          register={register}
                          fieldName="city_id"
                          error={errors.city_id}
                          requiredMessage="Please select city"
                          defaultValue={
                            order?.city_id
                              ? order?.city_id
                              : getValues("city_id")
                          }
                          setValue={
                            setValue as (name: string, value: any) => void
                          }
                          onChange={async (e) =>
                            await fetchCategoryFromApi(e.target.value)
                          }
                        />
                      </Col>
                      <Col xs={4} className="mt-2">
                        <CustomTextFieldSelect
                          label="Category"
                          controlId="Category"
                          options={categories}
                          register={register}
                          fieldName="category_id"
                          error={errors.category_id}
                          requiredMessage="Please select category"
                          defaultValue={
                            order?.category_id
                              ? order?.category_id
                              : getValues("category_id")
                          }
                          setValue={
                            setValue as (name: string, value: any) => void
                          }
                          onChange={(e) => setSelectedCategory(e.target.value)}
                        />
                      </Col>
                      <Col xs={4} className="mt-2">
                        <CustomTextFieldSelect
                          label="Payment Mode"
                          controlId="Payment"
                          options={payments}
                          register={register}
                          fieldName="payment_mode_id"
                          error={errors.payment_mode_id}
                          requiredMessage="Please select payment"
                          defaultValue={
                            order?.payment_mode_id
                              ? order?.payment_mode_id
                              : getValues("payment_mode_id")
                          }
                          setValue={
                            setValue as (name: string, value: any) => void
                          }
                        />
                      </Col>
                      <Col xs={4} className="mt-2">
                        <CustomTextFieldSelect
                          label="Offer"
                          controlId="offer_id"
                          options={couponOptions}
                          register={register}
                          fieldName="offer_id"
                          error={errors.offer_id}
                          defaultValue={order?.offer_id ?? ""}
                          setValue={
                            setValue as (name: string, value: any) => void
                          }
                        />
                      </Col>
                      <Col xs={4} className="mt-2">
                        <CustomTextFieldSelect
                          label="Employee"
                          controlId="created_by_id"
                          options={employeeOptions}
                          register={register}
                          fieldName="created_by_id"
                          error={errors.created_by_id}
                          requiredMessage={
                            employeeOptions.length > 0
                              ? "Please select employee"
                              : undefined
                          }
                          defaultValue={
                            order?.created_by_id ??
                            getLocalStorage(AppConstant.createdById) ??
                            ""
                          }
                          setValue={
                            setValue as (name: string, value: any) => void
                          }
                        />
                      </Col>
                    </Row>
                  </section>
                </>
              )}
              {isEditable && taxDetails && (
                <ServiceItemForm
                  taxDetails={taxDetails}
                  categoryId={selectedCategory}
                  onChange={setServiceItems}
                  register={register}
                  setValue={setValue}
                  getValues={getValues}
                  errors={errors}
                  compact={false}
                />
              )}
              {isEditable && (
                <>
                  <section
                    className="custom-other-details mt-3"
                    style={{ padding: "10px" }}
                  >
                    <CustomFormInput
                      label="User description"
                      controlId="user_description"
                      placeholder="Optional notes from the customer"
                      register={register}
                      as="textarea"
                      asCol={false}
                      rows={3}
                    />
                    <CustomFormInput
                      label="Admin description"
                      controlId="admin_description"
                      placeholder="Optional internal notes for this order"
                      register={register}
                      as="textarea"
                      asCol={false}
                      rows={3}
                    />
                  </section>

                  <section
                    className="custom-other-details mt-3"
                    style={{ padding: "10px" }}
                  >
                    <h3>Payment</h3>
                    <Row>
                      <Col xs={12} className="text-end">
                        <label
                          className="col custom-personal-row-title"
                          style={{ fontSize: 18 }}
                        >
                          Service Amount:{" "}
                        </label>
                        <label
                          className="col custom-personal-row-value"
                          style={{ fontSize: 18 }}
                        >{`${AppConstant.currencySymbol}${
                          paymentDetails.subTotal ? paymentDetails.subTotal : 0
                        }`}</label>
                      </Col>
                      <Col xs={12} className="text-end">
                        <label
                          className="col custom-personal-row-title"
                          style={{ fontSize: 18 }}
                        >
                          User Platform Fee:{" "}
                        </label>
                        <label
                          className="col custom-personal-row-value"
                          style={{ fontSize: 18 }}
                        >{`${AppConstant.currencySymbol}${
                          paymentDetails.userPlatformFee
                            ? paymentDetails.userPlatformFee
                            : 0
                        }`}</label>
                      </Col>
                      <Col xs={12} className="text-end">
                        <label
                          className="col custom-personal-row-title"
                          style={{ fontSize: 18 }}
                        >
                          Tax:{" "}
                        </label>
                        <label
                          className="col custom-personal-row-value"
                          style={{ fontSize: 18 }}
                        >{`${AppConstant.currencySymbol}${
                          paymentDetails.tax ? paymentDetails.tax : 0
                        }`}</label>
                      </Col>
                      <Col xs={12} className="text-end">
                        <label
                          className="col custom-personal-row-title"
                          style={{
                            fontSize: 25,
                            color: "var(--primary-txt-color)",
                          }}
                        >
                          Total Price:{" "}
                        </label>
                        <label
                          className="col custom-personal-row-value"
                          style={{
                            fontSize: 25,
                            color: "var(--primary-txt-color)",
                          }}
                        >{`${AppConstant.currencySymbol}${
                          paymentDetails.totalPrice
                            ? paymentDetails.totalPrice
                            : 0
                        }`}</label>
                      </Col>

                      <Col xs={12} className="text-end">
                        <label
                          className="col custom-personal-row-title"
                          style={{ fontSize: 18 }}
                        >
                          Partner Commission Platform Fee:{" "}
                        </label>
                        <label
                          className="col custom-personal-row-value"
                          style={{ fontSize: 18 }}
                        >{`${AppConstant.currencySymbol}${
                          paymentDetails.partnerCommissionPlatformFee
                            ? paymentDetails.partnerCommissionPlatformFee
                            : 0
                        }`}</label>
                      </Col>
                      <Col xs={12} className="text-end">
                        <label
                          className="col custom-personal-row-title"
                          style={{ fontSize: 18 }}
                        >
                          Admin Earning:{" "}
                        </label>
                        <label
                          className="col custom-personal-row-value"
                          style={{ fontSize: 18 }}
                        >{`${AppConstant.currencySymbol}${
                          paymentDetails.adminEarning
                            ? paymentDetails.adminEarning
                            : 0
                        }`}</label>
                      </Col>
                    </Row>
                  </section>
                </>
              )}
              <Row className="mt-4">
                <Col
                  xs={12}
                  className="text-center d-flex justify-content-end gap-3"
                >
                  <Button type="submit" className="custom-btn-primary">
                    {isEditable ? "Update" : "Create"}
                  </Button>
                  <Button
                    type="button"
                    className="custom-btn-secondary"
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                </Col>
              </Row>
            </form>
          </Modal.Body>
      </Modal>
      {!isEditable && (
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
              key={`create-coupon-modal-${modalCouponOfferId}`}
              label="Coupon"
              controlId="Coupon_modal"
              options={couponOptions}
              placeholder="Select coupon"
              register={register}
              fieldName="offer_id"
              error={errors.offer_id}
              defaultValue={modalCouponOfferId}
              setValue={(name: string, value: unknown) => {
                if (name === "offer_id") {
                  setModalCouponOfferId(String(value ?? "").trim());
                  setCouponModalError("");
                }
              }}
              menuPortal
              onChange={() => setCouponModalError("")}
            />
            {couponModalError ? (
              <p className="small text-danger mb-0 mt-2" role="alert">
                {couponModalError}
              </p>
            ) : null}
            {!couponModalError &&
            modalCouponOfferId.trim() &&
            createOrderBasePriceBreakdown &&
            modalSelectedCouponOffer ? (
              <p className="small text-muted mb-0 mt-2">
                {modalSelectedCouponOffer.offerType === "fixed"
                  ? `Fixed coupon: partner ${AppConstant.currencySymbol}${modalSelectedCouponOffer.partnerContribution}, admin ${AppConstant.currencySymbol}${modalSelectedCouponOffer.adminContribution}`
                  : `Percentage coupon: ${modalSelectedCouponOffer.partnerContribution}% on service, ${modalSelectedCouponOffer.adminContribution}% on commission`}
              </p>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="border-top-0 pt-0">
            <Button
              type="button"
              className="custom-btn-secondary me-2"
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
      )}
    </>
  );
};

CreateUpdateOrderDialog.show = (
  isEditable: boolean,
  order: OrderModel | null,
  onRefreshData: () => void
) => {
  openDialog("order-modal", (close) => (
    <CreateUpdateOrderDialog
      isEditable={isEditable}
      order={order}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default CreateUpdateOrderDialog;
