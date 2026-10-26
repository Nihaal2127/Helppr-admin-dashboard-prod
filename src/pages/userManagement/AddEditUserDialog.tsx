import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col, Form, InputGroup } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { UserModel } from "../../lib/models/UserModel";
import {
  getRoleLabel,
  getStatusOptions,
  DetailsRowLinkDocument,
} from "../../helper/utility";
import { showErrorAlert, showSuccessAlert } from "../../lib/global/alertHelper";
import { fetchCityDropDownForForm } from "../../services/cityService";
import { fetchStateDropDown } from "../../services/stateService";
import { fetchAreasByCityForForm } from "../../services/areaService";
import { createOrUpdateUser, updatePartnerVerificationDecision } from "../../services/userService";
import {
  documentUploadFailureMessage,
  normalizeReplaceStoragePaths,
  uploadDocumentImages,
} from "../../services/documentUploadService";
import { fetchCategoryDropDown, fetchCategory } from "../../services/categoryService";
import {
  fetchService,
  normalizeServiceCategoryRef,
} from "../../services/servicesService";
import { apiRequest } from "../../lib/global/remote/apiHelper";
import CustomTextField from "../../components/CustomTextField";
import CustomTextFieldIndiaMobile from "../../components/CustomTextFieldIndiaMobile";
import CustomTextFieldSelect from "../../components/CustomTextFieldSelect";
import CustomTextFieldRadio from "../../components/CustomTextFieldRadio";
import CustomMultiSelect from "../../components/CustomMultiSelect";
import {
  genderForApiPayload,
  normalizeGenderValue,
} from "../../lib/user/genderOptions";
import CustomImageUploader from "../../components/CustomImageUploader";
import CustomUploadDialog from "../../components/CustomUpload";
import { dateToLocalYmd } from "../../helper/dateFormat";
import CustomTextFieldDatePicket from "../../components/CustomTextFieldDatePicket";
import {
  fetchSubscriptionPlanOptions,
  savePartnerSubscription,
} from "../../services/partnerManagementService";
import type { SubscriptionPlanOption } from "../../services/partnerManagementService";
import { partnerSubscriptionFormValuesFromUser } from "../../lib/partner/partnerSubscriptionView";
import {
  partnerFranchiseFieldsFromUser,
  partnerFranchiseIdFromUser,
} from "../../lib/partner/partnerFranchiseDisplay";
import { resolveFranchiseForArea } from "../../lib/partner/resolveFranchiseForArea";
import PartnerSubscriptionFormSection, {
  partnerSubscriptionFormBind,
  computedSubscriptionEndDate,
} from "../../components/partner/PartnerSubscriptionFormSection";
import type {
  PartnerSubscriptionRegisterFn,
  PartnerSubscriptionSetValueFn,
} from "../../components/partner/PartnerSubscriptionFormSection";
import type { FieldError } from "react-hook-form";
import { fetchFranchiseDropDown, fetchFranchiseById } from "../../services/franchiseService";
import type { FranchiseDropDownOption } from "../../services/franchiseService";
import {
  franchiseIdForApiQuery,
  readHeaderFranchisePreference,
  sessionFranchiseIdForScopedApis,
} from "../../lib/franchise/headerFranchisePreference";

import {
  FieldLabelText,
  REQUIRED_FIELD_RULE,
} from "../../components/RequiredFieldMark";
import { getLocalStorage } from "../../lib/global/localStorageHelper";
import { AppConstant, UserRole } from "../../lib/global/AppConstant";
import {
  PARTNER_VERIFICATION,
  normalizePartnerVerification,
  partnerVerificationLabel,
} from "../../lib/partner/partnerVerification";
import {
  PARTNER_CREATE_DOCUMENT_FIELDS,
  PARTNER_CREATE_DOCUMENT_SLOTS,
} from "../../lib/partner/partnerFormDocuments";
import { openDialog } from "../../lib/global/DialogManager";
import {
  sanitizeIndianPincodeInput,
} from "../../lib/user/pincodeValidation";
import { nationalDigitsWithoutIndia91 } from "../../lib/user/userFormValidation";

import {
  PartnerSingleSelect,
  emptyPartnerCatalogBlock,
  emptyPartnerServiceRow,
  newPartnerCatalogRowId,
  flattenPartnerBlocksForSave,
  partnerCatalogControlStyle,
  partnerCatalogOutlineAddBtn,
  partnerCatalogOutlineDeleteBtn,
  PartnerCatalogStatusToggle,
} from "../../components/partnerCatalogBlockUi";
import type { UserMultipartUploads } from "../../services/userService";
import type { PartnerCreateDocumentKey } from "../../lib/partner/partnerFormDocuments";
import type {
  PartnerCategoryBlock,
  PartnerCatalogServiceLite,
  PartnerServiceRow,
  PartnerCatalogFlattenOk,
} from "../../components/partnerCatalogBlockUi";

const PARTNER_ROLE = 2;
const FRANCHISE_EMPLOYEE_ROLE = 3;
const USER_ROLE = 4;

function sanitizeLettersAndSpaces(value: string): string {
  return value.replace(/[^A-Za-z\s]/g, "");
}

type PartnerSubCategoryRow = {
  id: string;
  subcategoryId: string;
  is_active: boolean;
  /** Services nested under this sub category (Category → Sub → Service). */
  serviceRows: PartnerServiceRow[];
};

type PartnerCategoryBlockExt = PartnerCategoryBlock & {
  subCategoryRows: PartnerSubCategoryRow[];
};

function normalizePartnerServiceRow(r: PartnerServiceRow): PartnerServiceRow {
  return {
    ...r,
    id: String(r?.id ?? "").trim() || newPartnerCatalogRowId(),
    serviceId: String(r?.serviceId ?? ""),
    description: String(r?.description ?? ""),
    price: String(r?.price ?? ""),
    is_active: r?.is_active !== false,
  };
}

function emptyPartnerSubCategoryRow(): PartnerSubCategoryRow {
  return {
    id: newPartnerCatalogRowId(),
    subcategoryId: "",
    is_active: true,
    serviceRows: [emptyPartnerServiceRow()],
  };
}

function syncBlockServiceRowsFromSubs(
  block: PartnerCategoryBlockExt
): PartnerCategoryBlockExt {
  const subCategoryRows = (block.subCategoryRows ?? []).map((sub) => {
    const serviceRows = (
      Array.isArray(sub.serviceRows) && sub.serviceRows.length > 0
        ? sub.serviceRows
        : [emptyPartnerServiceRow()]
    ).map(normalizePartnerServiceRow);
    return {
      id: String(sub?.id ?? "").trim() || newPartnerCatalogRowId(),
      subcategoryId: String(sub?.subcategoryId ?? ""),
      is_active: sub?.is_active !== false,
      serviceRows,
    };
  });
  return {
    ...block,
    subCategoryRows:
      subCategoryRows.length > 0
        ? subCategoryRows
        : [emptyPartnerSubCategoryRow()],
    serviceRows: (
      subCategoryRows.length > 0
        ? subCategoryRows
        : [emptyPartnerSubCategoryRow()]
    ).flatMap((s) => s.serviceRows),
  };
}

function emptyPartnerCatalogBlockExt(
  initialCategoryId: string
): PartnerCategoryBlockExt {
  return syncBlockServiceRowsFromSubs({
    ...emptyPartnerCatalogBlock(initialCategoryId),
    subCategoryRows: [emptyPartnerSubCategoryRow()],
  });
}

/** Local guard — keeps catalog UI safe without an extra module export (avoids dev HMR load issues). */
function ensurePartnerCatalogBlocks(
  blocks: PartnerCategoryBlock[] | null | undefined
): PartnerCategoryBlockExt[] {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return [emptyPartnerCatalogBlockExt("")];
  }
  return blocks.map((b) => {
    const ext = b as PartnerCategoryBlockExt;
    const rawSubs = Array.isArray(ext?.subCategoryRows)
      ? ext.subCategoryRows
      : [];
    const topServices = (
      Array.isArray(b?.serviceRows) && b.serviceRows.length > 0
        ? b.serviceRows
        : []
    ).map(normalizePartnerServiceRow);
    const hasNestedServices = rawSubs.some(
      (s) => Array.isArray(s?.serviceRows) && s.serviceRows.length > 0
    );
    const subCategoryRows = (
      rawSubs.length > 0 ? rawSubs : [emptyPartnerSubCategoryRow()]
    ).map((r, index) => {
      const nested = Array.isArray(r?.serviceRows) ? r.serviceRows : [];
      const serviceRows =
        nested.length > 0
          ? nested.map(normalizePartnerServiceRow)
          : !hasNestedServices && index === 0 && topServices.length > 0
            ? topServices
            : [emptyPartnerServiceRow()];
      return {
        id: String(r?.id ?? "").trim() || newPartnerCatalogRowId(),
        subcategoryId: String(r?.subcategoryId ?? ""),
        is_active: r?.is_active !== false,
        serviceRows,
      };
    });
    return syncBlockServiceRowsFromSubs({
      id: String(b?.id ?? "").trim() || newPartnerCatalogRowId(),
      categoryId: String(b?.categoryId ?? ""),
      is_active: b?.is_active !== false,
      subCategoryRows,
      serviceRows: [],
    });
  });
}

type OptionType = { value: string; label: string; service_ids?: string[] };

type AddPartnerServiceLite = PartnerCatalogServiceLite & {
  subcategory_id?: string;
};

function catalogRefIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    let id = "";
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      id = String(
        rec._id ?? rec.id ?? rec.service_id ?? rec.value ?? ""
      ).trim();
    } else {
      id = String(item ?? "").trim();
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function serviceSubCategoryIdFromRow(row: Record<string, unknown>): string {
  return (
    normalizeServiceCategoryRef(row.subcategory_id) ||
    normalizeServiceCategoryRef(row.sub_category_id) ||
    normalizeServiceCategoryRef(row.subcategory)
  );
}

function extractSubCategoryOptionsFromGetAll(
  data: unknown
): OptionType[] {
  const buckets: unknown[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) buckets.push(...value);
  };
  const walk = (node: unknown, depth = 0) => {
    if (depth > 4 || node == null) return;
    if (Array.isArray(node)) {
      push(node);
      return;
    }
    if (typeof node !== "object") return;
    const root = node as Record<string, unknown>;
    push(root.records);
    push(root.subcategories);
    push(root.sub_categories);
    push(root.list);
    push(root.items);
    push(root.data);
    if (root.data && typeof root.data === "object") walk(root.data, depth + 1);
  };
  walk(data);
  const seen = new Set<string>();
  const options: OptionType[] = [];
  for (const item of buckets) {
    const row =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    const value = String(
      row._id ??
        row.id ??
        row.subcategory_id ??
        row.sub_category_id ??
        row.value ??
        ""
    ).trim();
    if (!value || seen.has(value)) continue;
    const label =
      String(row.name ?? row.label ?? row.subcategory_name ?? "").trim() ||
      value;
    seen.add(value);
    const serviceIds = [
      ...catalogRefIds(row.service_ids),
      ...catalogRefIds(row.services),
    ];
    options.push({
      value,
      label,
      ...(serviceIds.length > 0 ? { service_ids: serviceIds } : {}),
    });
  }
  return options;
}

function extractServicesFromGetAll(data: unknown): AddPartnerServiceLite[] {
  const buckets: unknown[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) buckets.push(...value);
  };
  const walk = (node: unknown, depth = 0) => {
    if (depth > 4 || node == null) return;
    if (Array.isArray(node)) {
      push(node);
      return;
    }
    if (typeof node !== "object") return;
    const root = node as Record<string, unknown>;
    push(root.records);
    push(root.services);
    push(root.list);
    push(root.items);
    push(root.data);
    if (root.data && typeof root.data === "object") walk(root.data, depth + 1);
  };
  walk(data);
  const seen = new Set<string>();
  const out: AddPartnerServiceLite[] = [];
  for (const item of buckets) {
    const row =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    const value = String(
      row._id ?? row.id ?? row.service_id ?? row.value ?? ""
    ).trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const priceRaw = row.price ?? row.minimum_deposit;
    const priceNum =
      priceRaw !== undefined && priceRaw !== null ? Number(priceRaw) : NaN;
    out.push({
      _id: value,
      name: String(row.name ?? row.label ?? "").trim() || value,
      category_id: normalizeServiceCategoryRef(row.category_id),
      subcategory_id: serviceSubCategoryIdFromRow(row),
      price: Number.isFinite(priceNum) ? priceNum : undefined,
      payment_type: String(
        row.payment_type ?? row.min_deposit_type ?? ""
      ).trim(),
    });
  }
  return out;
}

function ensureSelectOption(
  options: OptionType[],
  value: string,
  label?: string
): OptionType[] {
  const v = String(value ?? "").trim();
  if (!v) return options;
  const existing = options.find((o) => String(o.value) === v);
  if (existing) {
    const nextLabel = String(label ?? "").trim();
    if (nextLabel && nextLabel !== existing.label && existing.label === v) {
      return options.map((o) =>
        String(o.value) === v ? { ...o, label: nextLabel } : o
      );
    }
    return options;
  }
  return [...options, { value: v, label: String(label ?? "").trim() || v }];
}

function firstLocationId(raw: unknown): string {
  if (Array.isArray(raw)) return firstLocationId(raw[0]);
  if (raw && typeof raw === "object") {
    return String(
      (raw as { _id?: unknown; id?: unknown })._id ??
        (raw as { id?: unknown }).id ??
        ""
    ).trim();
  }
  const s = String(raw ?? "").trim();
  if (!s || s === "[object Object]") return "";
  return s.includes(",") ? s.split(",")[0].trim() : s;
}

function firstLocationName(raw: unknown): string {
  if (Array.isArray(raw)) return firstLocationName(raw[0]);
  if (raw && typeof raw === "object") {
    return String(
      (raw as { name?: unknown; state_name?: unknown; city_name?: unknown })
        .name ??
        (raw as { state_name?: unknown }).state_name ??
        (raw as { city_name?: unknown }).city_name ??
        ""
    ).trim();
  }
  const s = String(raw ?? "").trim();
  if (!s || s === "[object Object]") return "";
  return s.includes(",") ? s.split(",")[0].trim() : s;
}

type ServiceLite = {
  _id: string;
  name: string;
  category_id: string;
  category_name?: string;
};

/** Extra fields on the form when adding a partner (not part of `UserModel`). */
type AddPartnerFormFields = {
  area_id?: string;
  is_blocked?: string | boolean;
  password?: string;
  confirm_password?: string;
  partner_bank_holder?: string;
  partner_bank_account_number?: string;
  partner_bank_ifsc?: string;
  partner_bank_legal_name?: string;
  partner_bank_branch?: string;
  bank_account_is_active?: string | boolean;
  /** Add partner — plan tier slug (set when selecting subscription plan). */
  subscription_plan?: string;
  subscription_plan_id?: string;
  subscription_start_date?: string;
  subscription_end_date?: string;
  /** Existing `partner_subscriptions[]._id` when updating a partner. */
  partner_subscription_id?: string;
  /** Super admin / staff: franchise for Add Partner category catalogue. */
  add_partner_franchise_id?: string;
};

/**
 * Do not spread full `UserModel` into RHF values: nested `partner_services.services`
 * (recursive) and index-signature `services` make `FieldPath` circular.
 */
type UserModelFormOmit =
  | "services"
  | "partner_services"
  | "partner_subscriptions"
  | "documents"
  | "bank_account"
  | "bank_accounts"
  | "extra_addresses"
  | "franchise_cities"
  | "service_cities"
  | "service_city_ids"
  | "service_city_names"
  | "franchise_id";

type AddEditUserFormValues = Partial<Omit<UserModel, UserModelFormOmit>> &
  AddPartnerFormFields & {
    /** Form stores franchise as an id string only. */
    franchise_id?: string | null;
  };

type AddEditUserDialogProps = {
  role: number;
  isEditable: boolean;
  user: UserModel | null;
  onClose: () => void;
  onRefreshData: () => void;
  /** Partner verification review: Status uses pending / rejected instead of active / inactive. */
  partnerStatusMode?: "active" | "verification";
};

const normalizeIdLike = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const id = obj._id ?? obj.id ?? obj.value ?? obj.area_id;
    return id == null ? "" : String(id).trim();
  }
  return String(value).trim();
};

const normalizeAddressValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const merged = value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          return String(
            obj.address ??
              obj.line1 ??
              obj.street ??
              obj.label ??
              obj.name ??
              ""
          ).trim();
        }
        return "";
      })
      .filter(Boolean);
    return merged.join(", ");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return String(
      obj.address ?? obj.line1 ?? obj.street ?? obj.label ?? obj.name ?? ""
    ).trim();
  }
  return String(value);
};

/** Super admin/staff: pre-fill Add Partner franchise from page header filter. */
function addPartnerFranchiseIdFromHeader(): string {
  const role = String(getLocalStorage(AppConstant.userRole) ?? "").trim();
  if (role !== UserRole.ADMIN && role !== UserRole.STAFF) return "";
  return franchiseIdForApiQuery(readHeaderFranchisePreference()) || "";
}

const normalizePincodeValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return String(obj.pincode ?? obj.pin_code ?? obj.pin ?? "").trim();
  }
  return "";
};

type CitySelectOption = { value: string; label: string };

/** Normalize `franchise_cities` / `service_cities` API arrays into select options. */
function citySelectOptionsFromRefs(raw: unknown): CitySelectOption[] {
  if (!Array.isArray(raw)) return [];
  const out: CitySelectOption[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const id = String(obj._id ?? obj.id ?? obj.value ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        value: id,
        label: String(obj.name ?? obj.label ?? id).trim() || id,
      });
      continue;
    }
    const id = String(item ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ value: id, label: id });
  }
  return out;
}

/** Build options from franchise `city_id` + `city_name` (string or array). */
function citySelectOptionsFromFranchiseFields(
  cityId: unknown,
  cityName: unknown
): CitySelectOption[] {
  const ids: string[] = [];
  if (Array.isArray(cityId)) {
    for (const x of cityId) {
      if (x && typeof x === "object") {
        const id = String(
          (x as Record<string, unknown>)._id ??
            (x as Record<string, unknown>).id ??
            ""
        ).trim();
        if (id) ids.push(id);
      } else {
        const id = String(x ?? "").trim();
        if (id) ids.push(id);
      }
    }
  } else if (cityId && typeof cityId === "object") {
    const id = String(
      (cityId as Record<string, unknown>)._id ??
        (cityId as Record<string, unknown>).id ??
        ""
    ).trim();
    if (id) ids.push(id);
  } else {
    const s = String(cityId ?? "").trim();
    if (s.includes(",")) {
      ids.push(
        ...s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      );
    } else if (s) {
      ids.push(s);
    }
  }

  const names: string[] = [];
  if (Array.isArray(cityName)) {
    for (const x of cityName) {
      names.push(String(x ?? "").trim());
    }
  } else {
    const s = String(cityName ?? "").trim();
    if (s.includes(",")) {
      names.push(
        ...s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      );
    } else if (s) {
      names.push(s);
    }
  }

  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  return uniqueIds.map((id, index) => ({
    value: id,
    label: names[index] || id,
  }));
}

function cityIdsFromRefs(raw: unknown): string[] {
  return citySelectOptionsFromRefs(raw).map((o) => o.value);
}

/** `direct_order` from `POST /user/create`, `GET /user/getAll`, and `PUT /user/update`. */
function isPartnerDirectOrderOn(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function AddEditUserDialogView({
  role,
  isEditable,
  user,
  onClose,
  onRefreshData,
  partnerStatusMode = "active",
}: AddEditUserDialogProps) {
  const isAddPartner = role === PARTNER_ROLE && !isEditable;
  const isPartnerEdit = role === PARTNER_ROLE && isEditable;
  const isUserUpdate = role === USER_ROLE && isEditable;
  const isFranchiseEmployeeRole = role === FRANCHISE_EMPLOYEE_ROLE;
  const usePartnerVerificationStatus =
    isPartnerEdit && partnerStatusMode === "verification";
  const partnerVerificationNorm = normalizePartnerVerification(
    user?.is_verified
  );
  const partnerVerificationApproved =
    partnerVerificationNorm === PARTNER_VERIFICATION.APPROVED;
  const [partnerVerificationDecision, setPartnerVerificationDecision] =
    useState<"approve" | "reject" | "pending">("pending");
  const [partnerVerificationRejectReason, setPartnerVerificationRejectReason] =
    useState("");

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    getValues,
    formState: { errors },
  } = useForm<AddEditUserFormValues>({
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      date_of_birth: user?.date_of_birth
        ? String(user.date_of_birth).slice(0, 10)
        : "",
      experience:
        user?.experience !== undefined && user?.experience !== null
          ? String(user.experience)
          : "",
      phone_number: nationalDigitsWithoutIndia91(user?.phone_number || ""),
      gender: normalizeGenderValue(user?.gender) || "male",
      address: normalizeAddressValue(user?.address),
      state_id: user?.state_id || "",
      city_id: user?.city_id || "",
      area_id: normalizeIdLike((user as any)?.area_id),
      pincode: normalizePincodeValue(user?.pincode),
      is_active: user?.is_active ?? true,
      is_blocked: (user as any)?.is_blocked ?? false,
      partner_bank_holder: "",
      partner_bank_account_number: "",
      partner_bank_ifsc: "",
      partner_bank_legal_name: "",
      partner_bank_branch: "",
      bank_account_is_active: "true",
      password: "",
      confirm_password: "",
      ...partnerSubscriptionFormValuesFromUser(
        role === PARTNER_ROLE && isEditable ? user : null
      ),
      add_partner_franchise_id:
        role === PARTNER_ROLE && !isEditable
          ? addPartnerFranchiseIdFromHeader()
          : "",
    },
  });

  const watchedCityId = watch("city_id");
  const watchedStateId = watch("state_id");
  const watchedAreaId = watch("area_id");

  const [categoryOptions, setCategoryOptions] = useState<OptionType[]>([]);
  /** Partner edit: bulk-loaded services for legacy category/service sync. Add Partner: filled lazily per category. */
  const [allServices, setAllServices] = useState<ServiceLite[]>([]);
  /** Add Partner: services loaded per category from franchise-scoped catalog (legacy). */
  const [servicesByCategoryId, setServicesByCategoryId] = useState<
    Record<string, PartnerCatalogServiceLite[]>
  >({});
  /** Add Partner: sub categories from `GET /subcategory/getAll?category_id=`. */
  const [subCategoriesByCategoryId, setSubCategoriesByCategoryId] = useState<
    Record<string, OptionType[]>
  >({});
  /** Add Partner: services from `GET /service/getAll?subcategory_id=`. */
  const [servicesBySubCategoryId, setServicesBySubCategoryId] = useState<
    Record<string, AddPartnerServiceLite[]>
  >({});
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [partnerCatalogBlocks, setPartnerCatalogBlocks] = useState<
    PartnerCategoryBlockExt[]
  >(() => [emptyPartnerCatalogBlockExt("")]);

  const safePartnerCatalogBlocks = useMemo(
    () => ensurePartnerCatalogBlocks(partnerCatalogBlocks),
    [partnerCatalogBlocks]
  );

  const [fileInputs, setFileInputs] = useState<File[]>([]);
  const [replaceUrls, setReplaceUrl] = useState<string[]>([]);

  useEffect(() => {
    setFileInputs([]);
    setReplaceUrl([]);
  }, [user?._id, isEditable]);

  const [partnerVerificationDocFiles, setPartnerVerificationDocFiles] =
    useState<Partial<Record<PartnerCreateDocumentKey, File>>>({});
  const [states, setState] = useState<{ value: string; label: string }[]>([]);
  const [cities, setCity] = useState<{ value: string; label: string }[]>([]);
  const [areas, setAreas] = useState<{ value: string; label: string }[]>([]);
  const [areaPincodes, setAreaPincodes] = useState<Map<string, string[]>>(
    new Map()
  );
  const [pincodeOptions, setPincodeOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [partnerPlanSelectOptions, setPartnerPlanSelectOptions] = useState<
    SubscriptionPlanOption[]
  >([]);
  const partnerPlansLoadingRef = useRef(false);
  const addPartnerCitiesLoadedKeyRef = useRef("");
  const addPartnerAreasLoadedKeyRef = useRef("");
  const addPartnerCategoriesLoadedKeyRef = useRef("");
  const addPartnerStatesLoadedRef = useRef(false);
  const addPartnerCategoryLoadingRef = useRef(false);
  const addPartnerServicesLoadingRef = useRef<Set<string>>(new Set());
  const addPartnerSubCategoriesLoadingRef = useRef<Set<string>>(new Set());

  const loadPartnerPlanOptions = useCallback(async () => {
    if (partnerPlansLoadingRef.current) return;
    partnerPlansLoadingRef.current = true;
    try {
      const opts = await fetchSubscriptionPlanOptions();
      setPartnerPlanSelectOptions(Array.isArray(opts) ? opts : []);
    } catch {
      setPartnerPlanSelectOptions([]);
    } finally {
      partnerPlansLoadingRef.current = false;
    }
  }, []);
  const [franchiseDropdownOptions, setFranchiseDropdownOptions] = useState<
    FranchiseDropDownOption[]
  >([]);
  const prevAddPartnerFranchiseRef = useRef<string | null>(null);
  const [partnerEditFranchiseId, setPartnerEditFranchiseId] = useState("");
  const [partnerEditFranchiseName, setPartnerEditFranchiseName] = useState("");
  const [partnerEditFranchiseResolving, setPartnerEditFranchiseResolving] =
    useState(false);
  /** Franchise cities → options for Service Cities multi-select (Add/Update Partner). */
  const [franchiseCityOptions, setFranchiseCityOptions] = useState<
    CitySelectOption[]
  >([]);
  const [serviceCityIds, setServiceCityIds] = useState<string[]>([]);
  const [directOrder, setDirectOrder] = useState<boolean>(
    isPartnerDirectOrderOn((user as any)?.direct_order)
  );

  const serviceCitiesHydratedForUserRef = useRef<string>("");

  const currentUserRole = String(
    getLocalStorage(AppConstant.userRole) ?? ""
  ).trim();
  const isSuperAdminOrStaff =
    currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.STAFF;
  const isFranchisePortalUser =
    currentUserRole === UserRole.FRANCHISE_ADMIN ||
    currentUserRole === UserRole.EMPLOYEE;

  const watchedPartnerFranchiseId = watch("add_partner_franchise_id");

  const effectiveAddPartnerFranchiseId = useMemo(() => {
    if (!isAddPartner) return "";
    if (isSuperAdminOrStaff)
      return String(watchedPartnerFranchiseId ?? "").trim();
    if (isFranchisePortalUser)
      return String(getLocalStorage(AppConstant.partnerId) ?? "").trim();
    return "";
  }, [
    isAddPartner,
    isSuperAdminOrStaff,
    isFranchisePortalUser,
    watchedPartnerFranchiseId,
  ]);

  /** API catalog scope: super admin/staff pick franchise; franchise portal uses session franchise. */
  const catalogFranchiseApiId = useMemo(() => {
    if (isFranchisePortalUser) return effectiveAddPartnerFranchiseId;
    return franchiseIdForApiQuery(
      isSuperAdminOrStaff ? effectiveAddPartnerFranchiseId : ""
    );
  }, [
    isFranchisePortalUser,
    isSuperAdminOrStaff,
    effectiveAddPartnerFranchiseId,
  ]);

  const addPartnerCatalogLocked = useMemo(
    () => isAddPartner && isSuperAdminOrStaff && !effectiveAddPartnerFranchiseId,
    [isAddPartner, isSuperAdminOrStaff, effectiveAddPartnerFranchiseId]
  );

  /** Scope city/area lists to franchise (portal session, Add Partner franchise, or edited user). */
  const locationFranchiseId = useMemo(() => {
    if (isFranchisePortalUser) {
      return sessionFranchiseIdForScopedApis();
    }
    if (isAddPartner && effectiveAddPartnerFranchiseId) {
      return effectiveAddPartnerFranchiseId;
    }
    if (isEditable) {
      return String((user as { franchise_id?: string })?.franchise_id ?? "").trim();
    }
    return "";
  }, [
    isFranchisePortalUser,
    isAddPartner,
    effectiveAddPartnerFranchiseId,
    isEditable,
    user,
  ]);

  const fetchCityFromApi = useCallback(
    async (stateId: string) => {
      const sid = String(stateId ?? "").trim();
      if (!sid) {
        setCity([]);
        return;
      }
      try {
        // Update Partner: show every city from city/getDropDown for the state.
        // Franchise-scoped filtering is for Add Partner / portal create flows.
        const franchiseScope =
          isPartnerEdit ? undefined : locationFranchiseId || undefined;
        let cityOptions = await fetchCityDropDownForForm(sid, franchiseScope);
        if (isEditable) {
          const preserveCityId = String(user?.city_id ?? "").trim();
          if (
            preserveCityId &&
            !cityOptions.some((c) => String(c.value) === preserveCityId)
          ) {
            const preserveLabel = String(
              (user as { city_name?: string })?.city_name ?? preserveCityId
            ).trim();
            cityOptions = [
              ...cityOptions,
              { value: preserveCityId, label: preserveLabel || preserveCityId },
            ];
          }
        }
        setCity(cityOptions);
        const currentCity = String(getValues("city_id") ?? "").trim();
        if (
          currentCity &&
          !cityOptions.some((c) => String(c.value) === currentCity)
        ) {
          setValue("city_id", "", { shouldValidate: false });
          setValue("area_id", "", { shouldValidate: false });
          setValue("pincode", "", { shouldValidate: false });
          setAreas([]);
          setAreaPincodes(new Map());
          setPincodeOptions([]);
        }
      } catch {
        setCity([]);
      }
    },
    [locationFranchiseId, getValues, setValue, isEditable, isPartnerEdit, user]
  );

  const onStateChangeClearLocationChain = useCallback(
    (stateId: string) => {
      const sid = String(stateId ?? "").trim();
      setValue("state_id", sid, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue("city_id", "", { shouldValidate: false });
      setValue("area_id", "", { shouldValidate: false });
      setValue("pincode", "", { shouldValidate: false });
      setAreas([]);
      setAreaPincodes(new Map());
      setPincodeOptions([]);
      addPartnerCitiesLoadedKeyRef.current = "";
      addPartnerAreasLoadedKeyRef.current = "";
      if (!isAddPartner) {
        void fetchCityFromApi(sid);
      }
    },
    [setValue, fetchCityFromApi, isAddPartner]
  );

  const onCityChangeClearAreaPin = useCallback(() => {
    setValue("area_id", "", { shouldValidate: false });
    setValue("pincode", "", { shouldValidate: false });
    setAreas([]);
    setAreaPincodes(new Map());
    setPincodeOptions([]);
    addPartnerAreasLoadedKeyRef.current = "";
  }, [setValue]);

  const applyAddPartnerFranchiseLocation = useCallback(
    async (franchiseId: string) => {
      const fid = String(franchiseId ?? "").trim();
      if (!fid || !isAddPartner) return;

      let stateId = "";
      let stateName = "";

      const fromDropdown = franchiseDropdownOptions.find(
        (o) => String(o.value) === fid
      );
      if (fromDropdown?.state_id) {
        stateId = firstLocationId(fromDropdown.state_id);
        stateName = String(fromDropdown.state_name ?? "").trim();
      }
      if (!stateId || !stateName) {
        const franchise = await fetchFranchiseById(fid, {
          skipAdminContactEnrichment: true,
        });
        if (!stateId) stateId = firstLocationId(franchise?.state_id);
        if (!stateName) stateName = firstLocationName(franchise?.state_name);
      }

      if (!stateId) return;

      setValue("state_id", stateId, { shouldValidate: true, shouldDirty: true });
      setValue("city_id", "", { shouldValidate: false });
      setValue("area_id", "", { shouldValidate: false });
      setValue("pincode", "", { shouldValidate: false });
      setState((prev) =>
        addPartnerStatesLoadedRef.current && prev.length > 0
          ? ensureSelectOption(prev, stateId, stateName)
          : ensureSelectOption([], stateId, stateName)
      );
      setCity([]);
      setAreas([]);
      setAreaPincodes(new Map());
      setPincodeOptions([]);
      addPartnerCitiesLoadedKeyRef.current = "";
      addPartnerAreasLoadedKeyRef.current = "";
      addPartnerCategoriesLoadedKeyRef.current = "";
    },
    [isAddPartner, franchiseDropdownOptions, setValue]
  );

  const fetchStateFromApi = useCallback(async () => {
    try {
      const stateOptions = await fetchStateDropDown();
      setState(stateOptions);

      if (isEditable && user?.state_id) {
        await fetchCityFromApi(String(user.state_id));
      }
    } catch {
      setState([]);
    }
  }, [isEditable, user?.state_id, fetchCityFromApi]);

  const loadAddPartnerStatesOnOpen = useCallback(async () => {
    if (!isAddPartner) return;
    if (addPartnerStatesLoadedRef.current && states.length > 0) return;
    addPartnerStatesLoadedRef.current = true;
    try {
      const stateOptions = await fetchStateDropDown();
      setState(stateOptions);
    } catch {
      addPartnerStatesLoadedRef.current = false;
      setState([]);
    }
  }, [isAddPartner, states.length]);

  const loadAddPartnerCitiesOnOpen = useCallback(async () => {
    if (!isAddPartner) return;
    const sid = String(getValues("state_id") ?? "").trim();
    if (!sid) return;
    const key = `${String(locationFranchiseId || "")}|${sid}`;
    if (addPartnerCitiesLoadedKeyRef.current === key && cities.length > 0) {
      return;
    }
    addPartnerCitiesLoadedKeyRef.current = key;
    await fetchCityFromApi(sid);
  }, [isAddPartner, getValues, locationFranchiseId, cities.length, fetchCityFromApi]);

  const loadAddPartnerAreasOnOpen = useCallback(async () => {
    if (!isAddPartner) return;
    const cityId = String(getValues("city_id") ?? "").trim();
    const stateId = String(getValues("state_id") ?? "").trim();
    if (!cityId) return;
    const franchiseScopeId = String(
      catalogFranchiseApiId || locationFranchiseId || ""
    ).trim();
    const key = `${franchiseScopeId}|${cityId}|${stateId}`;
    if (addPartnerAreasLoadedKeyRef.current === key && areas.length > 0) {
      return;
    }
    addPartnerAreasLoadedKeyRef.current = key;
    try {
      const rows = await fetchAreasByCityForForm(
        cityId,
        stateId || undefined,
        franchiseScopeId || undefined
      );
      const areaOptions: { value: string; label: string }[] = [];
      const pinMap = new Map<string, string[]>();
      for (const row of rows) {
        areaOptions.push({ value: row.value, label: row.label });
        pinMap.set(row.value, row.pincodes);
      }
      setAreas(areaOptions);
      setAreaPincodes(pinMap);
      const currentArea = String(getValues("area_id") ?? "").trim();
      if (currentArea && !areaOptions.some((a) => a.value === currentArea)) {
        setValue("area_id", "", { shouldValidate: false });
        setValue("pincode", "", { shouldValidate: false });
      }
    } catch {
      addPartnerAreasLoadedKeyRef.current = "";
      setAreas([]);
      setAreaPincodes(new Map());
    }
  }, [
    isAddPartner,
    getValues,
    setValue,
    catalogFranchiseApiId,
    locationFranchiseId,
    areas.length,
  ]);

  const loadAddPartnerCategoriesOnOpen = useCallback(async () => {
    if (!isAddPartner || addPartnerCatalogLocked) return;
    const apiFranchiseId = catalogFranchiseApiId;
    if (isSuperAdminOrStaff && !apiFranchiseId) return;
    const key = String(apiFranchiseId || "session");
    if (
      addPartnerCategoriesLoadedKeyRef.current === key &&
      categoryOptions.some((c) => c.value && c.value !== "select-all")
    ) {
      return;
    }
    if (addPartnerCategoryLoadingRef.current) return;
    addPartnerCategoryLoadingRef.current = true;
    addPartnerCategoriesLoadedKeyRef.current = key;
    try {
      const res = await fetchCategory(
        1,
        5000,
        { status: "true" },
        [],
        apiFranchiseId || undefined
      );
      if (!res.response) {
        setCategoryOptions([]);
        return;
      }
      const catList = (Array.isArray(res.categories) ? res.categories : [])
        .map((c) => ({
          value: String(c._id ?? c.category_id ?? "").trim(),
          label: String(c.name ?? "").trim(),
        }))
        .filter((c) => c.value);
      setCategoryOptions(catList);
    } catch {
      addPartnerCategoriesLoadedKeyRef.current = "";
      setCategoryOptions([]);
    } finally {
      addPartnerCategoryLoadingRef.current = false;
    }
  }, [
    isAddPartner,
    addPartnerCatalogLocked,
    catalogFranchiseApiId,
    isSuperAdminOrStaff,
    categoryOptions,
  ]);

  const loadAddPartnerSubCategoriesOnOpen = useCallback(
    async (categoryId: string) => {
      const cid = String(categoryId ?? "").trim();
      if (!cid || !isAddPartner) return;
      if ((subCategoriesByCategoryId[cid] ?? []).length > 0) return;
      if (addPartnerSubCategoriesLoadingRef.current.has(cid)) return;
      addPartnerSubCategoriesLoadingRef.current.add(cid);
      try {
        // GET /subcategory/getAll?category_id=… (Postman: category_id only)
        const params = new URLSearchParams({ category_id: cid });
        const res = await apiRequest(
          `/subcategory/getAll?${params.toString()}`,
          "GET",
          undefined,
          false,
          true
        );
        const options = res.success
          ? extractSubCategoryOptionsFromGetAll(res.data)
          : [];
        setSubCategoriesByCategoryId((prev) => ({
          ...prev,
          [cid]: options,
        }));
      } catch {
        setSubCategoriesByCategoryId((prev) => ({ ...prev, [cid]: [] }));
      } finally {
        addPartnerSubCategoriesLoadingRef.current.delete(cid);
      }
    },
    [isAddPartner, subCategoriesByCategoryId]
  );

  const loadAddPartnerServicesOnOpen = useCallback(
    async (subcategoryId: string, categoryId?: string) => {
      const sid = String(subcategoryId ?? "").trim();
      if (!sid || !isAddPartner) return;
      const cid = String(categoryId ?? "").trim();
      const allowedIds = new Set<string>();
      const subRows = cid
        ? subCategoriesByCategoryId[cid] ?? []
        : Object.values(subCategoriesByCategoryId).flat();
      const subHit = subRows.find((option) => option.value === sid);
      for (const id of subHit?.service_ids ?? []) {
        if (id) allowedIds.add(id);
      }
      const cached = servicesBySubCategoryId[sid] ?? [];
      if (
        cached.length > 0 &&
        cached.every((s) => {
          const recSub = String(s.subcategory_id ?? "").trim();
          return recSub === sid || allowedIds.has(s._id);
        })
      ) {
        return;
      }
      if (addPartnerServicesLoadingRef.current.has(sid)) return;
      addPartnerServicesLoadingRef.current.add(sid);
      try {

        const byId = new Map<string, AddPartnerServiceLite>();
        const ingest = (data: unknown) => {
          for (const row of extractServicesFromGetAll(data)) {
            const matchesSub = row.subcategory_id === sid;
            const matchesAllowed = allowedIds.has(row._id);
            const matchesCat =
              !cid || !row.category_id || row.category_id === cid;
            if ((matchesSub || matchesAllowed) && matchesCat) {
              byId.set(row._id, {
                ...row,
                category_id: cid || row.category_id,
                subcategory_id: sid,
              });
            }
          }
        };

        const subParams = new URLSearchParams({
          page: "1",
          limit: "200",
          subcategory_id: sid,
        });
        const subRes = await apiRequest(
          `/service/getAll?${subParams.toString()}`,
          "GET",
          undefined,
          false,
          true
        );
        if (subRes.success) ingest(subRes.data);

        if (cid) {
          const catParams = new URLSearchParams({
            page: "1",
            limit: "200",
            category_id: cid,
          });
          const catRes = await apiRequest(
            `/service/getAll?${catParams.toString()}`,
            "GET",
            undefined,
            false,
            true
          );
          if (catRes.success) ingest(catRes.data);
        }

        setServicesBySubCategoryId((prev) => ({
          ...prev,
          [sid]: Array.from(byId.values()),
        }));
      } catch {
        setServicesBySubCategoryId((prev) => ({ ...prev, [sid]: [] }));
      } finally {
        addPartnerServicesLoadingRef.current.delete(sid);
      }
    },
    [isAddPartner, servicesBySubCategoryId, subCategoriesByCategoryId]
  );

  useEffect(() => {
    if (!(isAddPartner || isPartnerEdit)) return;
    let cancelled = false;

    const cityId = String(
      watchedCityId || (isPartnerEdit ? user?.city_id ?? "" : "")
    ).trim();
    const stateId = String(
      watchedStateId || (isPartnerEdit ? user?.state_id ?? "" : "")
    ).trim();

    if (!cityId) {
      setAllServices([]);
      if (isPartnerEdit) {
        setCategoryOptions([{ value: "select-all", label: "Select All" }]);
      }
      if (isAddPartner) {
        setCategoryIds([]);
        setServiceIds([]);
        setPartnerCatalogBlocks([emptyPartnerCatalogBlockExt("")]);
        setServicesByCategoryId({});
        setSubCategoriesByCategoryId({});
        setServicesBySubCategoryId({});
      }
      return;
    }

    if (isAddPartner) {
      setCategoryIds([]);
      setServiceIds([]);
      setPartnerCatalogBlocks([emptyPartnerCatalogBlockExt("")]);
      setServicesByCategoryId({});
      setSubCategoriesByCategoryId({});
      setServicesBySubCategoryId({});
      return;
    }

    if (
      isPartnerEdit &&
      user?.city_id &&
      watchedCityId &&
      watchedCityId !== user.city_id
    ) {
      setCategoryIds([]);
      setServiceIds([]);
    }

    void (async () => {
      try {
        const [cats, svcRes] = await Promise.all([
          fetchCategoryDropDown(cityId),
          fetchService(1, 500, {
            city_id: cityId,
            ...(stateId ? { state_id: stateId } : {}),
          }),
        ]);
        if (cancelled) return;

        const catList = Array.isArray(cats)
          ? cats.filter((c: OptionType) => c?.value)
          : [];
        setCategoryOptions([
          { value: "select-all", label: "Select All" },
          ...catList,
        ]);

        const list =
          svcRes?.response && Array.isArray(svcRes.services)
            ? svcRes.services
            : [];
        setAllServices(
          list.map((s) => ({
            _id: String((s as { _id?: string })._id ?? ""),
            name: String((s as { name?: string }).name ?? ""),
            category_id: normalizeServiceCategoryRef(
              (s as { category_id?: unknown }).category_id
            ),
            category_name: (s as { category_name?: string }).category_name
              ? String((s as { category_name?: string }).category_name)
              : undefined,
            desc: String((s as { desc?: string }).desc ?? ""),
            price:
              (s as { price?: number | null }).price !== undefined &&
              (s as { price?: number | null }).price !== null
                ? Number((s as { price?: number }).price)
                : undefined,
          }))
        );
      } catch {
        if (!cancelled) {
          setCategoryOptions([{ value: "select-all", label: "Select All" }]);
          setAllServices([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isAddPartner,
    isPartnerEdit,
    watchedCityId,
    watchedStateId,
    user?.city_id,
    user?.state_id,
  ]);

  useEffect(() => {
    if (!isAddPartner) {
      prevAddPartnerFranchiseRef.current = null;
      return;
    }
    const fid = effectiveAddPartnerFranchiseId;
    if (prevAddPartnerFranchiseRef.current === fid) return;
    prevAddPartnerFranchiseRef.current = fid;
    setPartnerCatalogBlocks([emptyPartnerCatalogBlockExt("")]);
    setServicesByCategoryId({});
    setSubCategoriesByCategoryId({});
    setServicesBySubCategoryId({});
    setCategoryIds([]);
    setServiceIds([]);
    if (fid) {
      void applyAddPartnerFranchiseLocation(fid);
    } else {
      setValue("state_id", "", { shouldValidate: false });
      setValue("city_id", "", { shouldValidate: false });
      setValue("area_id", "", { shouldValidate: false });
      setValue("pincode", "", { shouldValidate: false });
      setCity([]);
      setAreas([]);
      setAreaPincodes(new Map());
      setPincodeOptions([]);
      setCategoryOptions([]);
      addPartnerCitiesLoadedKeyRef.current = "";
      addPartnerAreasLoadedKeyRef.current = "";
      addPartnerCategoriesLoadedKeyRef.current = "";
    }
  }, [
    isAddPartner,
    effectiveAddPartnerFranchiseId,
    applyAddPartnerFranchiseLocation,
    setValue,
  ]);

  useEffect(() => {
    if (!isAddPartner) return;
    const fid = effectiveAddPartnerFranchiseId;
    if (!fid) return;
    if (String(getValues("state_id") ?? "").trim()) return;
    void applyAddPartnerFranchiseLocation(fid);
  }, [
    isAddPartner,
    effectiveAddPartnerFranchiseId,
    franchiseDropdownOptions,
    applyAddPartnerFranchiseLocation,
    getValues,
  ]);

  useEffect(() => {
    if (!isAddPartner || !isSuperAdminOrStaff) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchFranchiseDropDown({ fullList: true });
        if (cancelled) return;
        const opts: FranchiseDropDownOption[] = (Array.isArray(rows) ? rows : [])
          .map((r) => ({
            value: String(r.value ?? "").trim(),
            label: String(r.label ?? "").trim(),
            state_id: r.state_id ? String(r.state_id).trim() : undefined,
            state_name: r.state_name ? String(r.state_name).trim() : undefined,
            city_id: r.city_id ? firstLocationId(r.city_id) : undefined,
            city_name: r.city_name ? String(r.city_name).trim() : undefined,
          }))
          .filter((o) => o.value);
        setFranchiseDropdownOptions(opts);
      } catch {
        if (!cancelled) setFranchiseDropdownOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAddPartner, isSuperAdminOrStaff]);

  useEffect(() => {
    if (!isAddPartner) return;
    const apiFranchiseId = catalogFranchiseApiId;
    if (isSuperAdminOrStaff && !apiFranchiseId) {
      setCategoryOptions([]);
    }
  }, [isAddPartner, isSuperAdminOrStaff, catalogFranchiseApiId]);

  useEffect(() => {
    if (isAddPartner) return;
    let cancelled = false;
    const loadAreasForCity = async () => {
      const cityId = String(watchedCityId ?? "").trim();
      const stateId = String(watchedStateId ?? "").trim();
      if (!cityId) {
        setAreas([]);
        setAreaPincodes(new Map());
        setPincodeOptions([]);
        setValue("area_id", "", { shouldValidate: false });
        return;
      }

      const franchiseScopeId = "";

      const rows = await fetchAreasByCityForForm(
        cityId,
        stateId || undefined,
        franchiseScopeId || undefined
      );
      if (cancelled) return;

      const areaOptions: { value: string; label: string }[] = [];
      const pinMap = new Map<string, string[]>();

      for (const row of rows) {
        areaOptions.push({ value: row.value, label: row.label });
        pinMap.set(row.value, row.pincodes);
      }

      if (isPartnerEdit) {
        const preserveAreaId = normalizeIdLike((user as any)?.area_id);
        if (
          preserveAreaId &&
          !areaOptions.some((a) => a.value === preserveAreaId)
        ) {
          const preserveLabel = String(
            (user as { area_name?: string })?.area_name ?? preserveAreaId
          ).trim();
          areaOptions.push({
            value: preserveAreaId,
            label: preserveLabel || preserveAreaId,
          });
          if (!pinMap.has(preserveAreaId)) {
            const pin = normalizePincodeValue(user?.pincode);
            pinMap.set(preserveAreaId, pin ? [pin] : []);
          }
        }
      }

      setAreas(areaOptions);
      setAreaPincodes(pinMap);
      const currentArea = String(watch("area_id") ?? "").trim();
      if (currentArea && !areaOptions.some((a) => a.value === currentArea)) {
        setValue("area_id", "", { shouldValidate: false });
        setValue("pincode", "", { shouldValidate: false });
      }
    };

    void loadAreasForCity();
    return () => {
      cancelled = true;
    };
  }, [
    watchedCityId,
    watchedStateId,
    setValue,
    watch,
    isPartnerEdit,
    user,
  ]);

  useEffect(() => {
    const areaId = String(watchedAreaId ?? "").trim();
    if (!areaId) {
      setPincodeOptions([]);
      setValue("pincode", "", { shouldValidate: false });
      return;
    }
    const pins = areaPincodes.get(areaId) ?? [];
    const options = pins.map((p) => ({ value: p, label: p }));
    setPincodeOptions(options);
    const currentPin = String(watch("pincode") ?? "").trim();
    if (currentPin && !options.some((o) => o.value === currentPin)) {
      setValue("pincode", "", { shouldValidate: false });
    }
  }, [watchedAreaId, areaPincodes, setValue, watch]);

  // Update Partner: resolve franchise from selected area (areas belong to franchises).
  useEffect(() => {
    if (!isPartnerEdit) {
      setPartnerEditFranchiseId("");
      setPartnerEditFranchiseName("");
      setPartnerEditFranchiseResolving(false);
      return;
    }

    const areaId = String(watchedAreaId ?? "").trim();
    const cityId = String(watchedCityId ?? "").trim();

    if (!areaId) {
      setPartnerEditFranchiseId("");
      setPartnerEditFranchiseName("");
      setPartnerEditFranchiseResolving(false);
      return;
    }

    // Seed from current user while resolving (same area / initial open).
    const existingId = partnerFranchiseIdFromUser(user);
    const existingName = partnerFranchiseFieldsFromUser(user).franchiseName;
    if (existingId) {
      setPartnerEditFranchiseId(existingId);
      if (existingName && existingName !== "—") {
        setPartnerEditFranchiseName(existingName);
      }
    }

    const areaName = String(
      areas.find((a) => a.value === areaId)?.label ?? ""
    ).trim();

    let cancelled = false;
    setPartnerEditFranchiseResolving(true);

    void (async () => {
      try {
        const resolved = await resolveFranchiseForArea(areaId, {
          cityId,
          areaName,
        });
        if (cancelled) return;
        if (resolved?.franchiseId) {
          setPartnerEditFranchiseId(resolved.franchiseId);
          setPartnerEditFranchiseName(
            resolved.franchiseName || resolved.franchiseId
          );
        } else {
          setPartnerEditFranchiseId("");
          setPartnerEditFranchiseName("");
        }
      } catch {
        if (!cancelled) {
          setPartnerEditFranchiseId("");
          setPartnerEditFranchiseName("");
        }
      } finally {
        if (!cancelled) setPartnerEditFranchiseResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPartnerEdit, watchedAreaId, watchedCityId, user, areas]);

  useEffect(() => {
    if (!isPartnerEdit || !user) return;
    setCategoryIds((user.category_ids ?? []).map(String));
    setServiceIds((user.service_ids ?? []).map(String));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate partner selections when user record identity changes
  }, [isPartnerEdit, user?._id]);

  /** Add Partner: load franchise cities as Service Cities options when franchise is chosen. */
  useEffect(() => {
    if (!isAddPartner) return;
    const fid = effectiveAddPartnerFranchiseId;
    if (!fid) {
      setFranchiseCityOptions([]);
      setServiceCityIds([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const fromDropdown = franchiseDropdownOptions.find(
        (o) => String(o.value) === fid
      );
      let options = citySelectOptionsFromFranchiseFields(
        fromDropdown?.city_id,
        fromDropdown?.city_name
      );
      if (options.length <= 1) {
        const franchise = await fetchFranchiseById(fid);
        if (franchise) {
          const fromFranchise = citySelectOptionsFromFranchiseFields(
            franchise.city_id,
            franchise.city_name
          );
          if (fromFranchise.length > 0) options = fromFranchise;
        }
      }
      if (cancelled) return;
      setFranchiseCityOptions(options);
      setServiceCityIds((prev) =>
        prev.filter((id) => options.some((o) => o.value === id))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isAddPartner,
    effectiveAddPartnerFranchiseId,
    franchiseDropdownOptions,
  ]);

  /** Update Partner: options from `franchise_cities`, selection from `service_cities`. */
  useEffect(() => {
    if (!isPartnerEdit || !user) {
      if (!isAddPartner) {
        setFranchiseCityOptions([]);
        setServiceCityIds([]);
        serviceCitiesHydratedForUserRef.current = "";
      }
      return;
    }
    const userKey = String(user._id ?? "");
    const fromFranchiseCities = citySelectOptionsFromRefs(user.franchise_cities);
    if (fromFranchiseCities.length > 0) {
      setFranchiseCityOptions(fromFranchiseCities);
    } else {
      const fid =
        String(partnerEditFranchiseId ?? "").trim() ||
        partnerFranchiseIdFromUser(user);
      if (fid) {
        void (async () => {
          const franchise = await fetchFranchiseById(fid);
          if (!franchise) return;
          const options = citySelectOptionsFromFranchiseFields(
            franchise.city_id,
            franchise.city_name
          );
          if (options.length > 0) setFranchiseCityOptions(options);
        })();
      }
    }
    if (serviceCitiesHydratedForUserRef.current !== userKey) {
      serviceCitiesHydratedForUserRef.current = userKey;
      const selected =
        cityIdsFromRefs(user.service_cities).length > 0
          ? cityIdsFromRefs(user.service_cities)
          : cityIdsFromRefs(user.service_city_ids);
      setServiceCityIds(selected);
    }
  }, [isPartnerEdit, isAddPartner, user, partnerEditFranchiseId]);

  const selectedServiceCityOptions = useMemo(
    () =>
      franchiseCityOptions.filter((o) => serviceCityIds.includes(o.value)),
    [franchiseCityOptions, serviceCityIds]
  );

  const handleServiceCitySelection = useCallback(
    (selectedOptions: CitySelectOption[]) => {
      setServiceCityIds(selectedOptions.map((o) => o.value));
    },
    []
  );

  const categorySelectOptionsForBlock = useCallback(
    (blockId: string): OptionType[] => {
      const rest = (categoryOptions ?? []).filter(
        (c) => c.value !== "select-all"
      );
      const taken = new Set(
        safePartnerCatalogBlocks
          .filter(
            (b) =>
              b.id !== blockId && String(b.categoryId ?? "").trim() !== ""
          )
          .map((b) => String(b.categoryId))
      );
      const filtered = rest.filter((c) => !taken.has(String(c.value)));
      return [{ value: "", label: "Select category" }, ...filtered];
    },
    [categoryOptions, safePartnerCatalogBlocks]
  );

  const subCategorySelectOptionsForRow = useCallback(
    (blockId: string, rowId: string): OptionType[] => {
      const block = safePartnerCatalogBlocks.find((b) => b.id === blockId);
      const categoryId = String(block?.categoryId ?? "").trim();
      const taken = new Set(
        (block?.subCategoryRows ?? [])
          .filter(
            (r) =>
              r.id !== rowId && String(r.subcategoryId ?? "").trim() !== ""
          )
          .map((r) => String(r.subcategoryId))
      );
      const loaded = categoryId
        ? subCategoriesByCategoryId[categoryId] ?? []
        : [];
      const rest = loaded.filter(
        (o) => o.value && !taken.has(String(o.value))
      );
      return [{ value: "", label: "Select sub category" }, ...rest];
    },
    [safePartnerCatalogBlocks, subCategoriesByCategoryId]
  );

  const catalogServicesForBlocks = useMemo((): PartnerCatalogServiceLite[] => {
    if (!isAddPartner) {
      return allServices.map((s) => ({
        _id: s._id,
        name: s.name,
        category_id: s.category_id,
      }));
    }
    const out: PartnerCatalogServiceLite[] = [];
    for (const list of Object.values(servicesBySubCategoryId)) {
      out.push(...list);
    }
    for (const list of Object.values(servicesByCategoryId)) {
      out.push(...list);
    }
    return out;
  }, [isAddPartner, allServices, servicesBySubCategoryId, servicesByCategoryId]);

  /** Per row: hide services already chosen on sibling rows; keep this row’s selection visible. */
  const serviceOptionsForPartnerBlockRow = useCallback(
    (
      block: PartnerCategoryBlock,
      subRow: PartnerSubCategoryRow,
      rowId: string
    ): OptionType[] => {
      const categoryId = String(block.categoryId ?? "").trim();
      const subcategoryId = String(subRow.subcategoryId ?? "").trim();
      if (!categoryId) {
        return [{ value: "", label: "Select category first" }];
      }
      if (isAddPartner && !subcategoryId) {
        return [{ value: "", label: "Select sub category first" }];
      }

      const rows = (isAddPartner ? subRow.serviceRows : block.serviceRows) ?? [];
      const currentRow = rows.find((r) => r.id === rowId);
      const currentSid = String(currentRow?.serviceId ?? "").trim();

      const selectedElsewhere = new Set(
        rows
          .filter((r) => r.id !== rowId)
          .map((r) => String(r.serviceId ?? "").trim())
          .filter(Boolean)
      );

      type Lite = { _id: string; name: string };
      let baseList: Lite[] = [];
      if (!isAddPartner) {
        baseList = allServices
          .filter((svc) => String(svc.category_id) === String(categoryId))
          .map((s) => ({ _id: s._id, name: s.name }));
      } else {
        const allowedIds = new Set(
          (subCategoriesByCategoryId[categoryId] ?? []).find(
            (option) => option.value === subcategoryId
          )?.service_ids ?? []
        );
        baseList = (servicesBySubCategoryId[subcategoryId] ?? [])
          .filter((s) => {
            const recSub = String(s.subcategory_id ?? "").trim();
            const recCat = String(s.category_id ?? "").trim();
            if (recCat && recCat !== categoryId) return false;
            if (recSub) return recSub === subcategoryId;
            return allowedIds.has(String(s._id));
          })
          .map((s) => ({
            _id: String(s._id),
            name: String(s.name),
          }));
      }

      const ordered: OptionType[] = [];
      const seen = new Set<string>();

      for (const s of baseList) {
        const id = String(s._id).trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ordered.push({ value: id, label: String(s.name) });
      }

      const resolveLabel = (sid: string): string => {
        const hit = catalogServicesForBlocks.find(
          (x) => String(x._id) === sid
        );
        return hit?.name ? String(hit.name) : sid;
      };

      if (currentSid && !seen.has(currentSid)) {
        ordered.push({ value: currentSid, label: resolveLabel(currentSid) });
      }

      const filtered = ordered.filter((o) => {
        if (o.value === currentSid) return true;
        return !selectedElsewhere.has(o.value);
      });

      return [{ value: "", label: "Select service" }, ...filtered];
    },
    [
      isAddPartner,
      allServices,
      servicesBySubCategoryId,
      subCategoriesByCategoryId,
      catalogServicesForBlocks,
    ]
  );

  const partnerServiceRowComplete = (row: PartnerServiceRow) =>
    Boolean(
      String(row.serviceId ?? "").trim() &&
        row.description.trim() &&
        String(row.price ?? "").trim()
    );

  const partnerSubCategoryRowComplete = (row: PartnerSubCategoryRow) =>
    Boolean(String(row.subcategoryId ?? "").trim());

  /** Plus stays enabled once category (+ its sub categories) are chosen; services are validated on save. */
  const canAddPartnerCategoryBlock = useMemo(() => {
    if (!isAddPartner) return true;
    return safePartnerCatalogBlocks.every((b) => {
      if (!String(b.categoryId ?? "").trim()) return false;
      return (b.subCategoryRows ?? []).every(partnerSubCategoryRowComplete);
    });
  }, [isAddPartner, safePartnerCatalogBlocks]);

  const canAddPartnerSubCategoryRow = useCallback(
    (block: PartnerCategoryBlockExt, row: PartnerSubCategoryRow) =>
      Boolean(
        String(block.categoryId ?? "").trim() &&
          partnerSubCategoryRowComplete(row)
      ),
    []
  );

  const canAddPartnerServiceRow = useCallback(
    (
      block: PartnerCategoryBlock,
      subRow: PartnerSubCategoryRow,
      row: PartnerServiceRow
    ) =>
      Boolean(
        String(block.categoryId ?? "").trim() &&
          partnerSubCategoryRowComplete(subRow) &&
          partnerServiceRowComplete(row)
      ),
    []
  );

  const addCategoryBlock = useCallback(() => {
    setPartnerCatalogBlocks((prev) => [
      ...ensurePartnerCatalogBlocks(prev),
      emptyPartnerCatalogBlockExt(""),
    ]);
  }, []);

  const removeCategoryBlock = useCallback((blockId: string) => {
    setPartnerCatalogBlocks((prev) => {
      const blocks = ensurePartnerCatalogBlocks(prev);
      return blocks.length <= 1
        ? blocks
        : blocks.filter((b) => b.id !== blockId);
    });
  }, []);

  const updateBlockActive = useCallback((blockId: string, is_active: boolean) => {
    setPartnerCatalogBlocks((prev) =>
      ensurePartnerCatalogBlocks(prev).map((b) =>
        b.id === blockId
          ? syncBlockServiceRowsFromSubs({
              ...b,
              is_active,
              subCategoryRows: (b.subCategoryRows ?? []).map((r) => ({
                ...r,
                is_active: is_active ? r.is_active !== false : false,
                serviceRows: (r.serviceRows ?? []).map((svc) => ({
                  ...svc,
                  is_active: is_active ? svc.is_active !== false : false,
                })),
              })),
            })
          : b
      )
    );
  }, []);

  const updateBlockCategory = useCallback(
    (blockId: string, categoryId: string) => {
      setPartnerCatalogBlocks((prev) =>
        ensurePartnerCatalogBlocks(prev).map((b) =>
          b.id === blockId
            ? syncBlockServiceRowsFromSubs({
                ...b,
                categoryId,
                subCategoryRows: [emptyPartnerSubCategoryRow()],
              })
            : b
        )
      );
    },
    []
  );

  const addSubCategoryRow = useCallback((blockId: string) => {
    setPartnerCatalogBlocks((prev) =>
      ensurePartnerCatalogBlocks(prev).map((b) =>
        b.id === blockId
          ? syncBlockServiceRowsFromSubs({
              ...b,
              subCategoryRows: [
                ...(b.subCategoryRows ?? []),
                emptyPartnerSubCategoryRow(),
              ],
            })
          : b
      )
    );
  }, []);

  const updateSubCategoryRow = useCallback(
    (
      blockId: string,
      rowId: string,
      patch: Partial<Omit<PartnerSubCategoryRow, "id" | "serviceRows">>
    ) => {
      setPartnerCatalogBlocks((prev) =>
        ensurePartnerCatalogBlocks(prev).map((b) =>
          b.id !== blockId
            ? b
            : syncBlockServiceRowsFromSubs({
                ...b,
                subCategoryRows: (b.subCategoryRows ?? []).map((r) => {
                  if (r.id !== rowId) return r;
                  const next = { ...r, ...patch };
                  if (
                    patch.subcategoryId !== undefined &&
                    String(patch.subcategoryId) !== String(r.subcategoryId)
                  ) {
                    next.serviceRows = [emptyPartnerServiceRow()];
                  }
                  if (patch.is_active === false) {
                    next.serviceRows = (next.serviceRows ?? []).map((svc) => ({
                      ...svc,
                      is_active: false,
                    }));
                  }
                  return next;
                }),
              })
        )
      );
    },
    []
  );

  const removeSubCategoryRow = useCallback((blockId: string, rowId: string) => {
    setPartnerCatalogBlocks((prev) =>
      ensurePartnerCatalogBlocks(prev).map((b) => {
        if (b.id !== blockId) return b;
        const rows = b.subCategoryRows ?? [];
        if (rows.length <= 1) {
          return b;
        }
        return syncBlockServiceRowsFromSubs({
          ...b,
          subCategoryRows: rows.filter((r) => r.id !== rowId),
        });
      })
    );
  }, []);

  const addServiceRow = useCallback((blockId: string, subRowId: string) => {
    setPartnerCatalogBlocks((prev) =>
      ensurePartnerCatalogBlocks(prev).map((b) =>
        b.id !== blockId
          ? b
          : syncBlockServiceRowsFromSubs({
              ...b,
              subCategoryRows: (b.subCategoryRows ?? []).map((sub) =>
                sub.id === subRowId
                  ? {
                      ...sub,
                      serviceRows: [
                        ...(sub.serviceRows ?? []),
                        emptyPartnerServiceRow(),
                      ],
                    }
                  : sub
              ),
            })
      )
    );
  }, []);

  const updateServiceRow = useCallback(
    (
      blockId: string,
      subRowId: string,
      rowId: string,
      patch: Partial<Omit<PartnerServiceRow, "id">>
    ) => {
      setPartnerCatalogBlocks((prev) =>
        ensurePartnerCatalogBlocks(prev).map((b) =>
          b.id !== blockId
            ? b
            : syncBlockServiceRowsFromSubs({
                ...b,
                subCategoryRows: (b.subCategoryRows ?? []).map((sub) =>
                  sub.id !== subRowId
                    ? sub
                    : {
                        ...sub,
                        serviceRows: (sub.serviceRows ?? []).map((r) =>
                          r.id === rowId ? { ...r, ...patch } : r
                        ),
                      }
                ),
              })
        )
      );
    },
    []
  );

  const removeServiceRow = useCallback(
    (blockId: string, subRowId: string, rowId: string) => {
      setPartnerCatalogBlocks((prev) =>
        ensurePartnerCatalogBlocks(prev).map((b) => {
          if (b.id !== blockId) return b;
          return syncBlockServiceRowsFromSubs({
            ...b,
            subCategoryRows: (b.subCategoryRows ?? []).map((sub) => {
              if (sub.id !== subRowId) return sub;
              const rows = sub.serviceRows ?? [];
              if (rows.length <= 1) return sub;
              return {
                ...sub,
                serviceRows: rows.filter((r) => r.id !== rowId),
              };
            }),
          });
        })
      );
    },
    []
  );

  const hoverIconBtn = (
    e: React.MouseEvent<HTMLButtonElement>,
    on: boolean
  ) => {
    (e.currentTarget as HTMLButtonElement).style.filter = on
      ? "brightness(0.94)"
      : "";
  };

  /** Stores files for multipart `POST /user/create` document fields. */
  const openAddPartnerVerificationDocumentUpload = useCallback(
    (docKey: PartnerCreateDocumentKey) => {
      CustomUploadDialog.show((files) => {
        const file = files[0];
        if (!file) return;
        setPartnerVerificationDocFiles((prev) => ({
          ...prev,
          [docKey]: file,
        }));
      });
    },
    []
  );

  useEffect(() => {
    if (!(isAddPartner || isPartnerEdit) || allServices.length === 0) return;
    if (isAddPartner) return;
    setCategoryIds((prev) =>
      prev.filter((catId) =>
        serviceIds.some((sid) => {
          const svc = allServices.find((x) => String(x._id) === String(sid));
          return Boolean(svc && String(svc.category_id) === String(catId));
        })
      )
    );
  }, [serviceIds, allServices, isAddPartner, isPartnerEdit]);

  const onSubmitEvent = async (data: AddEditUserFormValues) => {
    let partnerCatalogFlat: PartnerCatalogFlattenOk | null = null;
    let profile_url = "";
    if (fileInputs.length > 0) {
      const imageUpload = await uploadDocumentImages({
        uploadType: "4",
        files: fileInputs,
        isEditMode: isEditable,
        replaceUrls,
        existingStoragePaths: user?.profile_url ? [user.profile_url] : [],
      });
      if (!imageUpload.ok) {
        showErrorAlert(documentUploadFailureMessage(imageUpload.usedReplace));
        return;
      }
      profile_url = imageUpload.paths[0] ?? "";
    }

    if (!isEditable && profile_url === "") {
      showErrorAlert("Please select image");
      return;
    }

    if (isAddPartner || isPartnerEdit) {
      if (!data.city_id) {
        showErrorAlert(
          "Please select city before choosing categories and services."
        );
        return;
      }
      if (isAddPartner) {
        if (isSuperAdminOrStaff && !effectiveAddPartnerFranchiseId) {
          showErrorAlert(
            "Please select a franchise before choosing categories and services."
          );
          return;
        }
        if (isFranchisePortalUser && !effectiveAddPartnerFranchiseId) {
          showErrorAlert(
            "Franchise context is missing. Please sign in again."
          );
          return;
        }
        const catalogFlat = flattenPartnerBlocksForSave(
          safePartnerCatalogBlocks,
          catalogServicesForBlocks
        );
        if (!catalogFlat.ok) {
          showErrorAlert(catalogFlat.message);
          return;
        }
        partnerCatalogFlat = catalogFlat;
      }
      if (isPartnerEdit) {
        const areaId = String((data as any).area_id ?? "").trim();
        if (areaId && partnerEditFranchiseResolving) {
          showErrorAlert(
            "Please wait while franchise is resolved for the selected area."
          );
          return;
        }
        if (areaId && !String(partnerEditFranchiseId ?? "").trim()) {
          showErrorAlert(
            "Selected area is not linked to any franchise."
          );
          return;
        }
      }
    }

    if (isAddPartner) {
      const pw = String(data.password ?? "").trim();
      const cpw = String(data.confirm_password ?? "").trim();
      if (!pw) {
        showErrorAlert("Please enter a password.");
        return;
      }
      if (pw !== cpw) {
        showErrorAlert("Password and confirm password do not match.");
        return;
      }
    }

    if (isAddPartner || isPartnerEdit) {
      const planId = String(data.subscription_plan_id ?? "").trim();
      if (!planId) {
        showErrorAlert("Please select a subscription plan.");
        return;
      }
      if (isAddPartner) {
        if (!String(data.subscription_start_date ?? "").trim()) {
          showErrorAlert("Please select subscription start date.");
          return;
        }
      }
    }

    if (
      usePartnerVerificationStatus &&
      !partnerVerificationApproved
    ) {
      if (
        partnerVerificationDecision === "reject" &&
        !partnerVerificationRejectReason.trim()
      ) {
        showErrorAlert("Please enter a rejection reason.");
        return;
      }
    }

    const bankIsActive =
      data.bank_account_is_active === undefined ||
      data.bank_account_is_active === null
        ? true
        : typeof data.bank_account_is_active === "string"
        ? data.bank_account_is_active === "true"
        : Boolean(data.bank_account_is_active);

    const isActivePayload =
      typeof data.is_active === "string"
        ? data.is_active === "true"
        : typeof data.is_active === "boolean"
        ? data.is_active
        : true;
    const isBlockedPayload = usePartnerVerificationStatus
      ? Boolean((user as any)?.is_blocked)
      : isUserUpdate
      ? !isActivePayload
      : typeof (data as any).is_blocked === "string"
        ? String((data as any).is_blocked) === "true"
        : Boolean((data as any).is_blocked);
    const resolvedIsActivePayload = isUserUpdate
      ? isActivePayload
      : isBlockedPayload
        ? false
        : isActivePayload;

    const sessionFranchiseId = sessionFranchiseIdForScopedApis();
    const createFranchiseId =
      isAddPartner && effectiveAddPartnerFranchiseId
        ? effectiveAddPartnerFranchiseId
        : isPartnerEdit && String(partnerEditFranchiseId ?? "").trim()
          ? String(partnerEditFranchiseId).trim()
          : isFranchisePortalUser &&
              !isEditable &&
              (role === USER_ROLE || role === PARTNER_ROLE) &&
              sessionFranchiseId
            ? sessionFranchiseId
            : "";

    const subscriptionPlanId = String(data.subscription_plan_id ?? "").trim();
    const subscriptionStartDate = String(
      data.subscription_start_date ?? ""
    ).trim();
    let planOptionsForEnd = partnerPlanSelectOptions;
    if (
      (isAddPartner || isPartnerEdit) &&
      subscriptionPlanId &&
      planOptionsForEnd.length === 0
    ) {
      try {
        planOptionsForEnd = await fetchSubscriptionPlanOptions();
      } catch {
        planOptionsForEnd = [];
      }
    }
    const subscriptionEndDate =
      computedSubscriptionEndDate(
        planOptionsForEnd.find((p) => p.value === subscriptionPlanId),
        subscriptionStartDate
      ) || String(data.subscription_end_date ?? "").trim();

    const payload: Record<string, unknown> = {
      type: role,
      is_from_web: true,
      registration_type: 1,
      created_by_id: getLocalStorage(AppConstant.createdById),
      ...(createFranchiseId ? { franchise_id: createFranchiseId } : {}),
      name: data.name,
      email: data.email,
      gender: genderForApiPayload(data.gender) ?? "male",
      ...(role === PARTNER_ROLE && {
        date_of_birth: toYmdString(data.date_of_birth) ?? "",
        experience: String(data.experience ?? "").trim(),
      }),
      ...(role === USER_ROLE && {
        date_of_birth: toYmdString(data.date_of_birth) ?? "",
      }),
      ...(isFranchiseEmployeeRole && {
        date_of_birth: toYmdString(data.date_of_birth) ?? "",
      }),
      phone_number: data.phone_number,
      address: isUserUpdate
        ? normalizeAddressValue(user?.address)
        : data.address,
      state_id: isUserUpdate ? user?.state_id || "" : data.state_id,
      city_id: isUserUpdate ? user?.city_id || "" : data.city_id,
      area_id: isUserUpdate
        ? normalizeIdLike((user as any)?.area_id)
        : (data as any).area_id,
      is_active: resolvedIsActivePayload,
      is_blocked: isBlockedPayload,
      ...(role === PARTNER_ROLE && {
        direct_order: directOrder === true,
      }),
      pincode: isUserUpdate
        ? sanitizeIndianPincodeInput(
            String(normalizePincodeValue(user?.pincode) ?? "")
          )
        : sanitizeIndianPincodeInput(String(data.pincode ?? "")),
      ...(isUserUpdate &&
      (user as any)?.extra_addresses &&
      Array.isArray((user as any).extra_addresses) &&
      (user as any).extra_addresses.length > 0
        ? { extra_addresses: (user as any).extra_addresses }
        : {}),
      ...(profile_url !== "" && { profile_url }),
      ...(!isEditable &&
        String(data.password ?? "").trim() && {
          password: String(data.password ?? "").trim(),
          confirm_password: String(data.confirm_password ?? "").trim(),
        }),
      ...(role === PARTNER_ROLE &&
        (isAddPartner && partnerCatalogFlat
          ? {
              category_ids: partnerCatalogFlat.category_ids,
              service_ids: partnerCatalogFlat.service_ids,
              service_names: partnerCatalogFlat.service_names,
              service_descriptions: partnerCatalogFlat.service_descriptions,
              service_prices: partnerCatalogFlat.service_prices,
              category_is_active: partnerCatalogFlat.category_is_active,
              service_is_active: partnerCatalogFlat.service_is_active,
              partner_services: partnerCatalogFlat.partner_services,
            }
          : isPartnerEdit
          ? {
              category_ids: categoryIds,
              service_ids: serviceIds,
            }
          : {})),
      ...(isAddPartner && {
        bank_account: {
          account_holder_name: (data.partner_bank_holder ?? "").trim(),
          account_number: (data.partner_bank_account_number ?? "").trim(),
          ifsc_code: (data.partner_bank_ifsc ?? "").trim(),
          bank_name: (data.partner_bank_legal_name ?? "").trim(),
          branch_name: (data.partner_bank_branch ?? "").trim(),
          is_primary: true,
          is_active: bankIsActive,
        },
        is_verified: PARTNER_VERIFICATION.PENDING,
      }),
      ...((isAddPartner || isPartnerEdit) && {
        service_cities: serviceCityIds,
        subscription_plan_id: subscriptionPlanId,
        subscription_plan: String(data.subscription_plan ?? "").trim(),
        subscription_start_date: subscriptionStartDate,
        subscription_end_date: subscriptionEndDate,
        ...(String(data.partner_subscription_id ?? "").trim()
          ? {
              partner_subscription_id: String(
                data.partner_subscription_id ?? ""
              ).trim(),
            }
          : {}),
      }),
    };

    const selectedImageFile = fileInputs.length > 0 ? fileInputs[0] : null;
    const partnerDocumentFiles: UserMultipartUploads["partnerDocumentFiles"] =
      {};
    if (isAddPartner) {
      for (const slot of PARTNER_CREATE_DOCUMENT_SLOTS) {
        const file = partnerVerificationDocFiles[slot.key];
        if (file) {
          partnerDocumentFiles[PARTNER_CREATE_DOCUMENT_FIELDS[slot.key]] = file;
        }
      }
    }
    const multipartUploads: UserMultipartUploads = {
      image: selectedImageFile,
      ...(Object.keys(partnerDocumentFiles).length > 0
        ? { partnerDocumentFiles }
        : {}),
    };

    let responseUser;
    if (isEditable) {
      if (!user?._id) {
        showErrorAlert("Unable to update. ID is missing.");
        return;
      }
      responseUser = await createOrUpdateUser(
        payload,
        true,
        user?._id,
        multipartUploads
      );
    } else {
      responseUser = await createOrUpdateUser(
        payload,
        false,
        undefined,
        multipartUploads
      );
    }

    if (responseUser) {
      if (
        usePartnerVerificationStatus &&
        !partnerVerificationApproved &&
        user?._id
      ) {
        const verificationOk = await updatePartnerVerificationDecision(
          user._id,
          {
            status: partnerVerificationDecision,
            ...(partnerVerificationDecision === "reject"
              ? {
                  verification_rejection_reason:
                    partnerVerificationRejectReason.trim(),
                }
              : {}),
          }
        );
        if (!verificationOk) {
          return;
        }
        showSuccessAlert(
          partnerVerificationDecision === "approve"
            ? "Partner verified successfully."
            : partnerVerificationDecision === "reject"
              ? "Partner verification rejected."
              : "Partner verification set to pending."
        );
      }
      if (isPartnerEdit && user?._id) {
        const subId = String(data.partner_subscription_id ?? "").trim();
        if (subId) {
          await savePartnerSubscription({
            _id: subId,
            partner_id: user._id,
            partner_name: String(data.name ?? user.name ?? "").trim(),
            subscription_plan_id: String(
              data.subscription_plan_id ?? ""
            ).trim(),
            subscription_plan: String(data.subscription_plan ?? "").trim(),
            subscription_start_date: subscriptionStartDate,
            subscription_end_date: subscriptionEndDate,
            rating: "",
            is_active: true,
          });
        }
      }
      onClose && onClose();
      onRefreshData();
    }
  };

  useEffect(() => {
    if (!isPartnerEdit) return;
    void loadPartnerPlanOptions();
  }, [isPartnerEdit, loadPartnerPlanOptions]);

  useEffect(() => {
    if (isAddPartner) return;
    void fetchStateFromApi();
  }, [fetchStateFromApi, isAddPartner]);

  useEffect(() => {
    if (isEditable && user?.is_active !== undefined) {
      setValue("is_active", user.is_active);
    }
  }, [isEditable, user?.is_active, setValue]);

  // Ensure Add opens blank and Update always hydrates selected user.
  useEffect(() => {
    if (isAddPartner) {
      setPartnerVerificationDocFiles({});
    }
    reset({
      name: isEditable ? user?.name || "" : "",
      email: isEditable ? user?.email || "" : "",
      date_of_birth:
        isEditable && user?.date_of_birth
          ? String(user.date_of_birth).slice(0, 10)
          : "",
      experience:
        isEditable &&
        user?.experience !== undefined &&
        user?.experience !== null
          ? String(user.experience)
          : "",
      phone_number: isEditable
        ? nationalDigitsWithoutIndia91(user?.phone_number || "")
        : "",
      gender: isEditable
        ? normalizeGenderValue(user?.gender) || "male"
        : "male",
      address: isEditable ? normalizeAddressValue(user?.address) : "",
      state_id: isEditable ? user?.state_id || "" : "",
      city_id: isEditable ? user?.city_id || "" : "",
      area_id: isEditable ? normalizeIdLike((user as any)?.area_id) : "",
      pincode: isEditable ? normalizePincodeValue(user?.pincode) : "",
      is_active: isEditable ? user?.is_active ?? true : true,
      is_blocked: isEditable ? (user as any)?.is_blocked ?? false : false,
      password: isEditable ? "" : "",
      confirm_password: isEditable ? "" : "",
      partner_bank_holder: "",
      partner_bank_account_number: "",
      partner_bank_ifsc: "",
      partner_bank_legal_name: "",
      partner_bank_branch: "",
      bank_account_is_active: "true",
      ...partnerSubscriptionFormValuesFromUser(
        isPartnerEdit ? user : null
      ),
      add_partner_franchise_id: isAddPartner
        ? addPartnerFranchiseIdFromHeader()
        : "",
    });
  }, [isEditable, user, isAddPartner, isPartnerEdit, reset]);

  useEffect(() => {
    setDirectOrder(isPartnerDirectOrderOn((user as any)?.direct_order));
  }, [user, isAddPartner, isPartnerEdit]);

  useEffect(() => {
    if (!usePartnerVerificationStatus || !user) return;
    const norm = normalizePartnerVerification(user.is_verified);
    if (norm === PARTNER_VERIFICATION.REJECTED) {
      setPartnerVerificationDecision("reject");
      setPartnerVerificationRejectReason(
        String(user.verification_rejection_reason ?? "").trim()
      );
    } else if (norm === PARTNER_VERIFICATION.PENDING) {
      setPartnerVerificationDecision("pending");
      setPartnerVerificationRejectReason("");
    } else {
      setPartnerVerificationDecision("approve");
      setPartnerVerificationRejectReason("");
    }
  }, [usePartnerVerificationStatus, user]);

  useEffect(() => {
    if (!isAddPartner || !isSuperAdminOrStaff) return;
    const headerFranchiseId = addPartnerFranchiseIdFromHeader();
    if (!headerFranchiseId) return;
    const current = String(watchedPartnerFranchiseId ?? "").trim();
    if (current === headerFranchiseId) return;
    if (!current) {
      setValue("add_partner_franchise_id", headerFranchiseId, {
        shouldValidate: false,
      });
    }
  }, [
    isAddPartner,
    isSuperAdminOrStaff,
    franchiseDropdownOptions,
    setValue,
    watchedPartnerFranchiseId,
  ]);

  const subscriptionStartStr = watch("subscription_start_date");
  const subscriptionEndStr = watch("subscription_end_date");
  const partnerSubscriptionForm = partnerSubscriptionFormBind({
    register: register as PartnerSubscriptionRegisterFn,
    setValue: setValue as PartnerSubscriptionSetValueFn,
    watch: (name) => watch(name as keyof AddEditUserFormValues),
    errors: errors as Record<string, FieldError | undefined>,
  });
  const dateOfBirthStr = watch("date_of_birth");
  const toYmdString = (v: unknown): string | null => {
    if (v == null || v === "") return null;
    if (typeof v === "string") return v.length >= 10 ? v.slice(0, 10) : v;
    if (v instanceof Date && !Number.isNaN(v.getTime()))
      return dateToLocalYmd(v);
    return null;
  };

  return (
    <>
      <Modal
        show={true}
        onHide={onClose}
        centered
        {...(isAddPartner ? { size: "xl" as const } : {})}
        dialogClassName={
          isAddPartner
            ? "custom-big-modal add-partner-modal add-edit-user-dialog-vh"
            : "custom-big-modal"
        }
        enforceFocus={!(isAddPartner || isPartnerEdit)}
      >
        <Modal.Header
          className={
            isAddPartner
              ? "py-3 px-4 border-bottom-0 add-partner-modal-header"
              : "py-3 px-4 border-bottom-0 d-flex flex-wrap align-items-center gap-2"
          }
        >
          <Modal.Title as="h5" className="custom-modal-title mb-0">
            {isEditable ? "Update" : "Add"} {getRoleLabel(role)}
          </Modal.Title>
          <CustomCloseButton onClose={onClose} inline={isAddPartner} />
        </Modal.Header>
        <style>{`
          .direct-order-switch .form-check-input {
            width: 2.55em;
            height: 1.35em;
            cursor: pointer;
          }
          .direct-order-switch .form-check-input:checked {
            background-color: #198754 !important;
            border-color: #146c43 !important;
          }
          .direct-order-switch .form-check-input:focus {
            box-shadow: 0 0 0 0.2rem rgba(25, 135, 84, 0.28);
            border-color: #198754;
          }
        `}</style>
        <Modal.Body className="px-4 pb-4 pt-0">
          <form
            noValidate
            name="profile-form"
            id="profile-form"
            autoComplete={isEditable ? "on" : "off"}
            onSubmit={handleSubmit(onSubmitEvent)}
          >
            {!isEditable ? (
              <>
                <input
                  type="text"
                  autoComplete="username"
                  style={{ display: "none" }}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  style={{ display: "none" }}
                />
              </>
            ) : null}
            {isAddPartner ? (
              <>
                <div className="add-partner-form-fields">
                  {isSuperAdminOrStaff ? (
                    <Row className="g-3 add-partner-form-row">
                      <Col xs={12} md={6}>
                        <CustomTextFieldSelect
                          label="Franchise"
                          controlId="add_partner_franchise_id"
                          options={franchiseDropdownOptions}
                          register={register}
                          fieldName="add_partner_franchise_id"
                          error={(errors as any).add_partner_franchise_id}
                          defaultValue={String(watchedPartnerFranchiseId ?? "")}
                          setValue={
                            setValue as (name: string, value: unknown) => void
                          }
                          menuPortal
                          placeholder="Select franchise"
                          includeEmptyOption
                          emptyOptionLabel="Select franchise"
                          requiredMessage="Please select franchise"
                          noRowBottomMargin
                          labelSize={3}
                        />
                      </Col>
                    </Row>
                  ) : null}
                  <Row className="g-3 add-partner-form-row">
                    <Col xs={12} md={6}>
                      <CustomTextField
                        label="Name"
                        controlId="name"
                        placeholder="Enter Name"
                        register={register}
                        error={errors.name}
                        validation={{ required: "Name is required" }}
                        labelSize={3}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <CustomTextFieldDatePicket
                        label="Date of Birth"
                        controlId="date_of_birth"
                        selectedDate={toYmdString(dateOfBirthStr)}
                        birthDatePicker
                        enforceAdultAge
                        onChange={(date) => {
                          const value = date ? dateToLocalYmd(date) : "";
                          setValue("date_of_birth", value, {
                            shouldValidate: true,
                            shouldDirty: true,
                          });
                        }}
                        register={register}
                        setValue={setValue}
                        placeholderText="Select date of birth"
                        validation={{ required: "Date of birth is required" }}
                        error={errors.date_of_birth}
                        labelSize={3}
                      />
                    </Col>
                  </Row>
                  <Row className="g-3 add-partner-form-row">
                    <Col xs={12} md={6}>
                      <CustomTextFieldRadio
                        label="Gender"
                        name="gender"
                        options={[
                          { value: "male", label: "Male" },
                          { value: "female", label: "Female" },
                          { value: "others", label: "Others" },
                        ]}
                        defaultValue={String(watch("gender") ?? "male")}
                        isEditable={true}
                        setValue={setValue}
                        labelSize={3}
                        alignItemsCenter
                        required
                      />
                      <input
                        type="hidden"
                        {...register("gender", {
                          required: "Please select gender",
                          validate: (v) =>
                            normalizeGenderValue(v)
                              ? true
                              : "Please select gender",
                        })}
                      />
                      {(errors as { gender?: { message?: string } }).gender ? (
                        <div className="text-danger small mt-1">
                          {
                            (errors as { gender?: { message?: string } })
                              .gender?.message
                          }
                        </div>
                      ) : null}
                    </Col>
                    <Col xs={12} md={6}>
                      <CustomTextField
                        label="Email"
                        controlId="email"
                        placeholder="Enter Email"
                        register={register}
                        error={errors.email}
                        validation={{ required: "Email is required" }}
                        labelSize={3}
                      />
                    </Col>
                  </Row>
                  <Row className="g-3 add-partner-form-row">
                    <Col xs={12} md={6}>
                      <CustomTextFieldIndiaMobile
                        label="Phone No"
                        controlId="phone_number"
                        placeholder="Mobile number"
                        register={register}
                        error={errors.phone_number}
                        validation={{ required: "Phone no is required" }}
                        labelSize={3}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <CustomTextField
                        label="Experience"
                        controlId="experience"
                        placeholder="Years of experience"
                        register={register}
                        error={errors.experience}
                        validation={{ required: "Experience is required" }}
                        labelSize={3}
                      />
                    </Col>
                  </Row>
                  <Row className="g-3 add-partner-form-row">
                    <Col xs={12} md={6}>
                      <CustomTextField
                        label="Password"
                        controlId="password"
                        placeholder="Enter password"
                        register={register}
                        error={errors.password}
                        validation={{ required: "Password is required" }}
                        inputType="password"
                        autoComplete="new-password"
                        labelSize={3}
                        value={watch("password") ?? ""}
                        onChange={(value) =>
                          setValue("password", value, {
                            shouldDirty: true,
                            shouldValidate: false,
                          })
                        }
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <CustomTextField
                        label="Confirm Password"
                        controlId="confirm_password"
                        placeholder="Confirm password"
                        register={register}
                        error={errors.confirm_password}
                        validation={{
                          required: "Confirm password is required",
                          validate: (value: string) =>
                            value === watch("password") ||
                            "Passwords do not match",
                        }}
                        inputType="password"
                        autoComplete="new-password"
                        labelSize={3}
                        value={watch("confirm_password") ?? ""}
                        onChange={(value) =>
                          setValue("confirm_password", value, {
                            shouldDirty: true,
                            shouldValidate: false,
                          })
                        }
                      />
                    </Col>
                  </Row>
                  <Row className="g-3 add-partner-form-row">
                    <Col xs={12} md={6}>
                      <CustomTextFieldSelect
                        label="State"
                        controlId="State"
                        options={ensureSelectOption(
                          states ?? [],
                          String(watch("state_id") ?? "")
                        )}
                        register={register}
                        fieldName="state_id"
                        error={errors.state_id}
                        requiredMessage="Please select state"
                        defaultValue={String(watch("state_id") ?? "")}
                        setValue={setValue as (name: string, value: any) => void}
                        menuPortal
                        placeholder="Select state"
                        labelSize={3}
                        onMenuOpen={() => {
                          void loadAddPartnerStatesOnOpen();
                        }}
                        onChange={(e) =>
                          onStateChangeClearLocationChain(e.target.value)
                        }
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <CustomTextFieldSelect
                        label="City"
                        controlId="City"
                        options={ensureSelectOption(
                          cities ?? [],
                          String(watch("city_id") ?? "")
                        )}
                        register={register}
                        fieldName="city_id"
                        error={errors.city_id}
                        requiredMessage="Please select city"
                        defaultValue={String(watch("city_id") ?? "")}
                        setValue={setValue as (name: string, value: any) => void}
                        menuPortal
                        placeholder="Select city"
                        labelSize={3}
                        isDisabled={!String(watch("state_id") ?? "").trim()}
                        onMenuOpen={() => {
                          void loadAddPartnerCitiesOnOpen();
                        }}
                        onChange={() => onCityChangeClearAreaPin()}
                      />
                    </Col>
                  </Row>
                  <Row className="g-3 add-partner-form-row">
                    <Col xs={12} md={6}>
                      <CustomTextFieldSelect
                        label="Area"
                        controlId="Area"
                        options={[
                          { value: "", label: "Select Area" },
                          ...ensureSelectOption(
                            areas ?? [],
                            String(watch("area_id") ?? "")
                          ),
                        ]}
                        register={register}
                        fieldName="area_id"
                        error={(errors as any).area_id}
                        requiredMessage="Please select area"
                        defaultValue={String(watch("area_id") ?? "")}
                        setValue={setValue as (name: string, value: any) => void}
                        menuPortal
                        placeholder="Select area"
                        labelSize={3}
                        isDisabled={!String(watch("city_id") ?? "").trim()}
                        onMenuOpen={() => {
                          void loadAddPartnerAreasOnOpen();
                        }}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <CustomTextFieldSelect
                        label="Pincode"
                        controlId="Pincode"
                        options={[
                          { value: "", label: "Select Pincode" },
                          ...(pincodeOptions ?? []),
                        ]}
                        register={register}
                        fieldName="pincode"
                        error={errors.pincode}
                        requiredMessage="Please select pincode"
                        defaultValue={String(watch("pincode") ?? "")}
                        setValue={setValue as (name: string, value: any) => void}
                        menuPortal
                        placeholder="Select pincode"
                        labelSize={3}
                        isDisabled={!String(watch("area_id") ?? "").trim()}
                      />
                    </Col>
                    
                  </Row>
                  <Row className="g-3 add-partner-form-row align-items-center">
                    <Col xs={12} md={6}>
                      <Row className="align-items-center">
                        <Col sm={3} className="d-flex align-items-center">
                          <label className="custom-profile-lable mb-0">
                            <FieldLabelText label="Service Cities" />
                          </label>
                        </Col>
                        <Col>
                          <CustomMultiSelect
                            label=""
                            controlId="Cities"
                            asCol={false}
                            menuPortal
                            options={cities ?? []}
                            value={(cities ?? []).filter((c) =>
                              serviceCityIds.includes(String(c.value))
                            )}
                            onChange={(opts) =>
                              setServiceCityIds(
                                opts.map((o) => String(o.value))
                              )
                            }
                          />
                        </Col>
                      </Row>
                    </Col>
                    <Col xs={12} md={6}>
                      <Row className="align-items-center">
                        <Col sm={3} className="d-flex align-items-center">
                          <label
                            htmlFor="direct-order-toggle"
                            className="custom-profile-lable mb-0"
                          >
                            Direct order
                          </label>
                        </Col>
                        <Col className="d-flex align-items-center">
                          <Form.Check
                            type="switch"
                            id="direct-order-toggle"
                            className="mb-0 direct-order-switch"
                            checked={directOrder}
                            onChange={(e) => setDirectOrder(e.target.checked)}
                          />
                        </Col>
                      </Row>
                    </Col>
                  </Row>
                  <Row className="g-3 add-partner-form-row add-partner-address-photo-row align-items-stretch">
                    <Col xs={12} md={6} className="add-partner-address-col">
                      <CustomTextField
                        label="Address"
                        controlId="address"
                        placeholder="Enter Address"
                        register={register}
                        error={errors.address}
                        validation={{ required: "Address is required" }}
                        as="textarea"
                        rows={3}
                        labelSize={3}
                      />
                    </Col>
                    <Col xs={12} md={6} className="add-partner-profile-col">
                      <Row className="align-items-stretch">
                        <Col sm={3} className="d-flex align-items-start">
                          <label className="custom-profile-lable mb-0">
                            <FieldLabelText label="Profile Photo" required />
                          </label>
                        </Col>
                        <Col>
                          <CustomImageUploader
                            label=""
                            hideLabel
                            compact
                            maxFiles={1}
                            isEditable={Boolean(isEditable)}
                            {...(user?.profile_url
                              ? { existingImages: [user.profile_url] }
                              : [])}
                            onFileChange={(files, replaceUrlsFromUploader) => {
                              setFileInputs(files);
                              setReplaceUrl(
                                normalizeReplaceStoragePaths(
                                  replaceUrlsFromUploader
                                )
                              );
                            }}
                          />
                        </Col>
                      </Row>
                    </Col>
                  </Row>
                </div>

                <PartnerSubscriptionFormSection
                  {...partnerSubscriptionForm}
                  planOptions={partnerPlanSelectOptions}
                  subscriptionDatesRequired
                  onPlanMenuOpen={() => {
                    void loadPartnerPlanOptions();
                  }}
                  subscriptionStartStr={
                    toYmdString(subscriptionStartStr) ?? null
                  }
                  subscriptionEndStr={toYmdString(subscriptionEndStr) ?? null}
                  toYmdString={toYmdString}
                />
              </>
            ) : (
              <div className="d-flex flex-column gap-3">
                <CustomTextField
                  label="Name"
                  controlId="name"
                  placeholder="Enter Name"
                  register={register}
                  error={errors.name}
                  validation={{ required: "Name is required" }}
                  value={watch("name") ?? ""}
                  onChange={(value) =>
                    setValue("name", value, {
                      shouldDirty: true,
                      shouldValidate: false,
                    })
                  }
                />
                {role === USER_ROLE || isFranchiseEmployeeRole ? (
                  <CustomTextFieldDatePicket
                    label="Date of Birth"
                    controlId="date_of_birth"
                    selectedDate={toYmdString(dateOfBirthStr)}
                    birthDatePicker
                    enforceAdultAge={Boolean(isEditable && role !== USER_ROLE)}
                    onChange={(date) => {
                      const value = date
                        ? dateToLocalYmd(date)
                        : "";
                      setValue("date_of_birth", value, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }}
                    register={register}
                    setValue={setValue}
                    placeholderText="Select date of birth"
                    validation={{ required: "Date of birth is required" }}
                    error={errors.date_of_birth}
                  />
                ) : null}
                <CustomTextField
                  label="Email"
                  controlId="email"
                  placeholder="Enter Email"
                  register={register}
                  error={errors.email}
                  validation={{ required: "Email is required" }}
                  autoComplete={isEditable ? "email" : "off"}
                  value={watch("email") ?? ""}
                  onChange={(value) =>
                    setValue("email", value, {
                      shouldDirty: true,
                      shouldValidate: false,
                    })
                  }
                />
                {isPartnerEdit ? (
                  <>
                    <CustomTextFieldDatePicket
                      label="Date of Birth"
                      controlId="date_of_birth"
                      selectedDate={toYmdString(dateOfBirthStr)}
                      birthDatePicker
                      enforceAdultAge={Boolean(isEditable)}
                      onChange={(date) => {
                        const value = date
                          ? dateToLocalYmd(date)
                          : "";
                        setValue("date_of_birth", value, {
                          shouldValidate: true,
                          shouldDirty: true,
                        });
                      }}
                      register={register}
                      setValue={setValue}
                      placeholderText="Select date of birth"
                      validation={{ required: "Date of birth is required" }}
                      error={errors.date_of_birth}
                    />
                    <CustomTextField
                      label="Experience"
                      controlId="experience"
                      placeholder="Years of experience"
                      register={register}
                      error={errors.experience}
                      validation={{ required: "Experience is required" }}
                      value={watch("experience") ?? ""}
                      onChange={(value) =>
                        setValue("experience", value, {
                          shouldDirty: true,
                          shouldValidate: false,
                        })
                      }
                    />
                  </>
                ) : null}
                <CustomTextFieldIndiaMobile
                  label="Phone No"
                  controlId="phone_number"
                  placeholder="Mobile number"
                  register={register}
                  error={errors.phone_number}
                  validation={{ required: "Phone no is required" }}
                  value={watch("phone_number") ?? ""}
                  onChange={(value) =>
                    setValue("phone_number", value, {
                      shouldDirty: true,
                      shouldValidate: false,
                    })
                  }
                />
                <CustomTextFieldRadio
                  label="Gender"
                  name="gender"
                  
                  options={[
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                    { value: "others", label: "Others" },
                  ]}
                  defaultValue={String(watch("gender") ?? "male")}
                  isEditable={true}
                  setValue={setValue}
                />
                {isPartnerEdit ? (
                  <PartnerSubscriptionFormSection
                    {...partnerSubscriptionForm}
                    layout="stacked"
                    planOptions={partnerPlanSelectOptions}
                    onPlanMenuOpen={() => {
                      void loadPartnerPlanOptions();
                    }}
                    subscriptionStartStr={
                      toYmdString(subscriptionStartStr) ?? null
                    }
                    subscriptionEndStr={
                      toYmdString(subscriptionEndStr) ?? null
                    }
                    toYmdString={toYmdString}
                  />
                ) : null}
                {!isEditable ? (
                  <>
                    <CustomTextField
                      label="Password"
                      controlId="password"
                      placeholder="Enter Password"
                      register={register}
                      error={errors.password}
                      validation={{
                        required: "Password is required",
                      }}
                      inputType="password"
                      autoComplete="new-password"
                      value={watch("password") ?? ""}
                      onChange={(value) =>
                        setValue("password", value, {
                          shouldDirty: true,
                          shouldValidate: false,
                        })
                      }
                    />
                    <CustomTextField
                      label="Confirm Password"
                      controlId="confirm_password"
                      placeholder="Enter Confirm Password"
                      register={register}
                      error={errors.confirm_password}
                      validation={{
                        required: "Confirm password is required",
                        validate: (value: string) =>
                          value === watch("password") ||
                          "Passwords do not match",
                      }}
                      inputType="password"
                      autoComplete="new-password"
                      value={watch("confirm_password") ?? ""}
                      onChange={(value) =>
                        setValue("confirm_password", value, {
                          shouldDirty: true,
                          shouldValidate: false,
                        })
                      }
                    />
                  </>
                ) : null}
                {!isUserUpdate ? (
                  <>
                    <CustomTextFieldSelect
                      label="State"
                      controlId="State"
                      options={states ?? []}
                      register={register}
                      fieldName="state_id"
                      error={errors.state_id}
                      requiredMessage="Please select state"
                      defaultValue={
                        isEditable ? (user?.state_id ? user?.state_id : "") : ""
                      }
                      setValue={setValue as (name: string, value: any) => void}
                      onChange={(e) =>
                        onStateChangeClearLocationChain(e.target.value)
                      }
                    />
                    <CustomTextFieldSelect
                      key={`partner-edit-city-${String(watch("state_id") ?? "")}-${cities.length}`}
                      label="City"
                      controlId="City"
                      options={cities ?? []}
                      register={register}
                      fieldName="city_id"
                      error={errors.city_id}
                      requiredMessage="Please select city"
                      defaultValue={String(watch("city_id") ?? "")}
                      setValue={setValue as (name: string, value: any) => void}
                      menuPortal
                      placeholder="Select city"
                      isDisabled={!String(watch("state_id") ?? "").trim()}
                      onChange={() => onCityChangeClearAreaPin()}
                    />
                    <CustomTextFieldSelect
                      key={`partner-edit-area-${String(watch("city_id") ?? "")}-${areas.length}`}
                      label="Area"
                      controlId="Area"
                      options={[
                        { value: "", label: "Select Area" },
                        ...(areas ?? []),
                      ]}
                      register={register}
                      fieldName="area_id"
                      error={(errors as any).area_id}
                      requiredMessage="Please select area"
                      defaultValue={String(watch("area_id") ?? "")}
                      setValue={setValue as (name: string, value: any) => void}
                      menuPortal
                      placeholder="Select area"
                      isDisabled={!String(watch("city_id") ?? "").trim()}
                      onChange={() => {
                        setValue("pincode", "", { shouldValidate: false });
                      }}
                    />
                    <CustomTextFieldSelect
                      key={`partner-edit-pin-${String(watch("area_id") ?? "")}-${pincodeOptions.length}`}
                      label="Pincode"
                      controlId="Pincode"
                      options={[
                        { value: "", label: "Select Pincode" },
                        ...(pincodeOptions ?? []),
                      ]}
                      register={register}
                      fieldName="pincode"
                      error={errors.pincode}
                      requiredMessage="Please select pincode"
                      defaultValue={String(watch("pincode") ?? "")}
                      setValue={setValue as (name: string, value: any) => void}
                      menuPortal
                      placeholder="Select pincode"
                      isDisabled={!String(watch("area_id") ?? "").trim()}
                    />
                    <CustomTextField
                      label="Franchise Name"
                      controlId="partner_edit_franchise_name"
                      placeholder={
                        partnerEditFranchiseResolving
                          ? "Resolving franchise…"
                          : "Resolved from selected area"
                      }
                      register={register}
                      isEditable={false}
                      value={
                        partnerEditFranchiseResolving
                          ? "Resolving franchise…"
                          : partnerEditFranchiseName ||
                            (String(watch("area_id") ?? "").trim()
                              ? "No franchise linked to this area"
                              : "")
                      }
                    />
                    <CustomTextField
                      label="Address"
                      controlId="address"
                      placeholder="Enter Address"
                      register={register}
                      error={errors.address}
                      validation={{ required: "Address is required" }}
                      as="textarea"
                      rows={3}
                      value={watch("address") ?? ""}
                      onChange={(value) =>
                        setValue("address", normalizeAddressValue(value), {
                          shouldDirty: true,
                          shouldValidate: false,
                        })
                      }
                    />
                  </>
                ) : null}
                {isEditable ? (
                  <>
                    {role === USER_ROLE ? (
                      <CustomTextFieldRadio
                        label="Status"
                        name="is_active"
                        options={getStatusOptions()}
                        defaultValue={String(
                          watch("is_active") ?? user?.is_active ?? true
                        )}
                        isEditable={true}
                        setValue={setValue}
                      />
                    ) : usePartnerVerificationStatus ? (
                      partnerVerificationApproved ? (
                        <Row className="align-items-start">
                          <Col sm={4} className="d-flex align-items-start">
                            <label className="custom-profile-lable mb-0">
                              Verification status
                            </label>
                          </Col>
                          <Col>
                            <span className="custom-active">
                              {partnerVerificationLabel(user?.is_verified)}
                            </span>
                          </Col>
                        </Row>
                      ) : (
                        <>
                          <Row className="align-items-start g-2 mb-0">
                            <Col sm={4} className="d-flex align-items-start">
                              <label className="custom-profile-lable mb-0">
                                Verification status
                              </label>
                            </Col>
                            <Col>
                              <div className="d-flex flex-wrap gap-3 align-items-center">
                                <Form.Check
                                  type="radio"
                                  id={`add-edit-partner-approve-${user?._id ?? "new"}`}
                                  name="partner-verification-decision"
                                  className="custom-radio-check"
                                  label={
                                    <span className="custom-radio-text">
                                      Approve
                                    </span>
                                  }
                                  checked={
                                    partnerVerificationDecision === "approve"
                                  }
                                  onChange={() =>
                                    setPartnerVerificationDecision("approve")
                                  }
                                />
                                <Form.Check
                                  type="radio"
                                  id={`add-edit-partner-reject-${user?._id ?? "new"}`}
                                  name="partner-verification-decision"
                                  className="custom-radio-check"
                                  label={
                                    <span className="custom-radio-text">
                                      Reject
                                    </span>
                                  }
                                  checked={
                                    partnerVerificationDecision === "reject"
                                  }
                                  onChange={() =>
                                    setPartnerVerificationDecision("reject")
                                  }
                                />
                                <Form.Check
                                  type="radio"
                                  id={`add-edit-partner-pending-${user?._id ?? "new"}`}
                                  name="partner-verification-decision"
                                  className="custom-radio-check"
                                  label={
                                    <span className="custom-radio-text">
                                      Pending
                                    </span>
                                  }
                                  checked={
                                    partnerVerificationDecision === "pending"
                                  }
                                  onChange={() =>
                                    setPartnerVerificationDecision("pending")
                                  }
                                />
                              </div>
                            </Col>
                          </Row>
                          {partnerVerificationDecision === "reject" ? (
                            <Form.Group className="mt-3 mb-0">
                              <Form.Label className="custom-profile-lable mb-1">
                                Rejection reason
                              </Form.Label>
                              <Form.Control
                                as="textarea"
                                rows={4}
                                placeholder="Enter rejection reason"
                                value={partnerVerificationRejectReason}
                                onChange={(e) =>
                                  setPartnerVerificationRejectReason(
                                    e.target.value
                                  )
                                }
                              />
                            </Form.Group>
                          ) : null}
                        </>
                      )
                    ) : (
                      <CustomTextFieldRadio
                        label="Status"
                        name="is_blocked"
                        options={[
                          { value: "false", label: "Active" },
                          { value: "true", label: "Inactive" },
                        ]}
                        defaultValue={String(
                          watch("is_blocked") ??
                            (user as any)?.is_blocked ??
                            false
                        )}
                        isEditable={true}
                        setValue={setValue}
                      />
                    )}
                    {isPartnerEdit ? (
                      <Row className="align-items-center mt-2">
                        <Col sm={4} className="d-flex align-items-center">
                          <label
                            htmlFor="direct-order-edit-toggle"
                            className="custom-profile-lable mb-0"
                          >
                            Direct order
                          </label>
                        </Col>
                        <Col className="d-flex align-items-center">
                          <Form.Check
                            type="switch"
                            id="direct-order-edit-toggle"
                            className="mb-0 direct-order-switch"
                            checked={directOrder}
                            onChange={(e) =>
                              setDirectOrder(e.target.checked)
                            }
                          />
                        </Col>
                      </Row>
                    ) : null}
                  </>
                ) : null}
                <div className="mt-2">
                  <CustomImageUploader
                    label="Profile Photo"
                    maxFiles={1}
                    isEditable={Boolean(isEditable)}
                    {...(user?.profile_url
                      ? { existingImages: [user.profile_url] }
                      : [])}
                    onFileChange={(files, replaceUrlsFromUploader) => {
                      setFileInputs(files);
                      setReplaceUrl(
                        normalizeReplaceStoragePaths(replaceUrlsFromUploader)
                      );
                    }}
                  />
                </div>
              </div>
            )}

            {isAddPartner ? (
              <>
                <section
                  className="custom-other-details mt-4"
                  style={{ padding: "10px" }}
                >
                  <h3 className="mb-2">
                    Categories and sub categories and services
                  </h3>
                  {addPartnerCatalogLocked ? (
                    <p className="text-muted small mb-3">
                      {isSuperAdminOrStaff
                        ? "Select a franchise above to enable category and service fields."
                        : "Unable to resolve your franchise for the catalogue. Please contact support."}
                    </p>
                  ) : null}
                  {safePartnerCatalogBlocks.map((block) => (
                    <div
                      key={block.id}
                      className="add-partner-catalog-block rounded-3 border px-3 py-3 mb-4"
                      style={{
                        borderColor: "var(--lb1-border)",
                        backgroundColor: "var(--bg-color)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      }}
                    >
                      <div className="add-partner-catalog-grid add-partner-catalog-grid--category mb-3">
                        <div className="add-partner-catalog-field add-partner-catalog-field--category">
                          <PartnerSingleSelect
                            instanceId={`${block.id}-category`}
                            label="Category"
                            requiredMark
                            options={categorySelectOptionsForBlock(block.id)}
                            value={block.categoryId}
                            placeholder="Select category"
                            isDisabled={addPartnerCatalogLocked}
                            onMenuOpen={() => {
                              // Previous category API only: fetchCategory → GET /category/getAll
                              void loadAddPartnerCategoriesOnOpen();
                            }}
                            onChange={(cid: string) =>
                              updateBlockCategory(block.id, cid)
                            }
                          />
                        </div>
                        <div className="add-partner-catalog-field add-partner-catalog-field--status">
                          <PartnerCatalogStatusToggle
                            inline
                            instanceId={`${block.id}-category-status`}
                            value={block.is_active !== false}
                            onChange={(active) =>
                              updateBlockActive(block.id, active)
                            }
                            disabled={addPartnerCatalogLocked}
                          />
                        </div>
                        <div className="add-partner-catalog-field add-partner-catalog-field--actions">
                          <div className="add-partner-catalog-actions">
                            <button
                              type="button"
                              title="Add another category block"
                              aria-label="Add another category block"
                              style={partnerCatalogOutlineAddBtn}
                              disabled={!canAddPartnerCategoryBlock}
                              onClick={addCategoryBlock}
                              onMouseDown={(e) => e.preventDefault()}
                              onMouseEnter={(e) => hoverIconBtn(e, true)}
                              onMouseLeave={(e) => hoverIconBtn(e, false)}
                            >
                              <i className="bi bi-plus fs-6" aria-hidden />
                            </button>
                            {safePartnerCatalogBlocks.length > 1 ? (
                              <button
                                type="button"
                                title="Remove this category block"
                                aria-label="Remove this category block"
                                style={partnerCatalogOutlineDeleteBtn}
                                onClick={() => removeCategoryBlock(block.id)}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={(e) => hoverIconBtn(e, true)}
                                onMouseLeave={(e) => hoverIconBtn(e, false)}
                              >
                                <i
                                  className="bi bi-trash fs-6"
                                  aria-hidden
                                />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {(block.subCategoryRows ?? []).map((subRow) => {
                        const categoryActive = block.is_active !== false;
                        const subActive =
                          categoryActive && subRow.is_active !== false;
                        return (
                          <React.Fragment key={subRow.id}>
                            <div className="add-partner-catalog-grid add-partner-catalog-grid--category mb-3">
                              <div className="add-partner-catalog-field add-partner-catalog-field--category">
                                <PartnerSingleSelect
                                  instanceId={`${block.id}-${subRow.id}-subcategory`}
                                  label="Sub Category"
                                  requiredMark
                                  options={subCategorySelectOptionsForRow(
                                    block.id,
                                    subRow.id
                                  )}
                                  value={subRow.subcategoryId}
                                  placeholder={
                                    String(block.categoryId ?? "").trim()
                                      ? "Select sub category"
                                      : "Select category first"
                                  }
                                  isDisabled={
                                    addPartnerCatalogLocked ||
                                    !String(block.categoryId ?? "").trim()
                                  }
                                  onMenuOpen={() => {
                                    // GET /subcategory/getAll?category_id=… only
                                    void loadAddPartnerSubCategoriesOnOpen(
                                      block.categoryId
                                    );
                                  }}
                                  onChange={(sid: string) => {
                                    updateSubCategoryRow(block.id, subRow.id, {
                                      subcategoryId: sid,
                                    });
                                  }}
                                />
                              </div>
                              <div className="add-partner-catalog-field add-partner-catalog-field--status">
                                <PartnerCatalogStatusToggle
                                  inline
                                  instanceId={`${block.id}-${subRow.id}-subcategory-status`}
                                  value={subActive}
                                  disabled={
                                    addPartnerCatalogLocked || !categoryActive
                                  }
                                  onChange={(active) => {
                                    if (!categoryActive) return;
                                    updateSubCategoryRow(block.id, subRow.id, {
                                      is_active: active,
                                    });
                                  }}
                                />
                              </div>
                              <div className="add-partner-catalog-field add-partner-catalog-field--actions">
                                <div className="add-partner-catalog-actions">
                                  <button
                                    type="button"
                                    title="Add another sub category with service"
                                    aria-label="Add another sub category with service"
                                    style={partnerCatalogOutlineAddBtn}
                                    disabled={
                                      !canAddPartnerSubCategoryRow(
                                        block,
                                        subRow
                                      )
                                    }
                                    onClick={() => addSubCategoryRow(block.id)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onMouseEnter={(e) => hoverIconBtn(e, true)}
                                    onMouseLeave={(e) =>
                                      hoverIconBtn(e, false)
                                    }
                                  >
                                    <i
                                      className="bi bi-plus fs-6"
                                      aria-hidden
                                    />
                                  </button>
                                  {(block.subCategoryRows ?? []).length > 1 ? (
                                    <button
                                      type="button"
                                      title="Remove this sub category"
                                      aria-label="Remove this sub category"
                                      style={partnerCatalogOutlineDeleteBtn}
                                      onClick={() =>
                                        removeSubCategoryRow(
                                          block.id,
                                          subRow.id
                                        )
                                      }
                                      onMouseDown={(e) => e.preventDefault()}
                                      onMouseEnter={(e) =>
                                        hoverIconBtn(e, true)
                                      }
                                      onMouseLeave={(e) =>
                                        hoverIconBtn(e, false)
                                      }
                                    >
                                      <i
                                        className="bi bi-trash fs-6"
                                        aria-hidden
                                      />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            {(subRow.serviceRows ?? []).map((row) => {
                              const serviceActive =
                                subActive && row.is_active !== false;
                              return (
                                <div
                                  key={row.id}
                                  className="add-partner-catalog-grid add-partner-catalog-grid--service mb-2"
                                >
                                  <div className="add-partner-catalog-field add-partner-catalog-field--service">
                                    <PartnerSingleSelect
                                      instanceId={`${block.id}-${subRow.id}-${row.id}-service`}
                                      label="Service"
                                      requiredMark
                                      options={serviceOptionsForPartnerBlockRow(
                                        block,
                                        subRow,
                                        row.id
                                      )}
                                      value={row.serviceId}
                                      placeholder={
                                        String(subRow.subcategoryId ?? "").trim()
                                          ? "Select service"
                                          : "Select sub category first"
                                      }
                                      isDisabled={
                                        addPartnerCatalogLocked ||
                                        !String(block.categoryId ?? "").trim() ||
                                        !String(subRow.subcategoryId ?? "").trim()
                                      }
                                      onMenuOpen={() => {
                                        // Same as category: load list when menu opens
                                        // GET /service/getAll?subcategory_id=…
                                        const subcategoryId = String(
                                          subRow.subcategoryId ?? ""
                                        ).trim();
                                        if (!subcategoryId) return;
                                        void loadAddPartnerServicesOnOpen(
                                          subcategoryId,
                                          block.categoryId
                                        );
                                      }}
                                      onChange={(sid: string) => {
                                        const subcategoryId = String(
                                          subRow.subcategoryId ?? ""
                                        ).trim();
                                        const list =
                                          servicesBySubCategoryId[
                                            subcategoryId
                                          ] ?? [];
                                        const hit = list.find(
                                          (s) => String(s._id) === String(sid)
                                        );
                                        const priceNum =
                                          hit?.price !== undefined &&
                                          hit?.price !== null
                                            ? Number(hit.price)
                                            : NaN;
                                        const priceStr = Number.isFinite(
                                          priceNum
                                        )
                                          ? String(priceNum)
                                          : "";
                                        updateServiceRow(
                                          block.id,
                                          subRow.id,
                                          row.id,
                                          {
                                            serviceId: sid,
                                            price: priceStr,
                                          }
                                        );
                                      }}
                                    />
                                  </div>
                                  <div className="add-partner-catalog-field add-partner-catalog-field--description">
                                    <Form.Group
                                      controlId={`desc-${block.id}-${subRow.id}-${row.id}`}
                                    >
                                      <Form.Label className="fw-medium mb-1">
                                        <FieldLabelText
                                          label="Description"
                                          required
                                        />
                                      </Form.Label>
                                      <Form.Control
                                        as="textarea"
                                        rows={1}
                                        className="custom-form-input"
                                        style={{
                                          ...partnerCatalogControlStyle,
                                          resize: "vertical",
                                        }}
                                        placeholder="Describe this offering"
                                        value={row.description}
                                        onChange={(
                                          e: React.ChangeEvent<HTMLTextAreaElement>
                                        ) =>
                                          updateServiceRow(
                                            block.id,
                                            subRow.id,
                                            row.id,
                                            {
                                              description: e.target.value,
                                            }
                                          )
                                        }
                                      />
                                    </Form.Group>
                                  </div>
                                  <div className="add-partner-catalog-field add-partner-catalog-field--price">
                                    <Form.Group
                                      controlId={`price-${block.id}-${subRow.id}-${row.id}`}
                                    >
                                      <Form.Label className="fw-medium mb-1">
                                        <FieldLabelText
                                          label="Price"
                                          required
                                        />
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
                                          className="custom-form-input border-start-0"
                                          style={{
                                            ...partnerCatalogControlStyle,
                                            borderLeft: 0,
                                            borderTopLeftRadius: 0,
                                            borderBottomLeftRadius: 0,
                                          }}
                                          placeholder="e.g. 499"
                                          value={row.price}
                                          onChange={(
                                            e: React.ChangeEvent<HTMLInputElement>
                                          ) =>
                                            updateServiceRow(
                                              block.id,
                                              subRow.id,
                                              row.id,
                                              {
                                                price: e.target.value,
                                              }
                                            )
                                          }
                                        />
                                      </InputGroup>
                                    </Form.Group>
                                  </div>
                                  <div className="add-partner-catalog-field add-partner-catalog-field--status">
                                    <PartnerCatalogStatusToggle
                                      inline
                                      instanceId={`${block.id}-${subRow.id}-${row.id}-service-status`}
                                      label="Status"
                                      value={serviceActive}
                                      disabled={
                                        addPartnerCatalogLocked || !subActive
                                      }
                                      onChange={(active) => {
                                        if (!subActive) return;
                                        updateServiceRow(
                                          block.id,
                                          subRow.id,
                                          row.id,
                                          {
                                            is_active: active,
                                          }
                                        );
                                      }}
                                    />
                                  </div>
                                  <div className="add-partner-catalog-field add-partner-catalog-field--actions">
                                    <div className="add-partner-catalog-actions">
                                      <button
                                        type="button"
                                        title="Add another service under this sub category"
                                        aria-label="Add another service under this sub category"
                                        style={partnerCatalogOutlineAddBtn}
                                        disabled={
                                          !canAddPartnerServiceRow(
                                            block,
                                            subRow,
                                            row
                                          )
                                        }
                                        onClick={() =>
                                          addServiceRow(block.id, subRow.id)
                                        }
                                        onMouseDown={(e) => e.preventDefault()}
                                        onMouseEnter={(e) =>
                                          hoverIconBtn(e, true)
                                        }
                                        onMouseLeave={(e) =>
                                          hoverIconBtn(e, false)
                                        }
                                      >
                                        <i
                                          className="bi bi-plus fs-6"
                                          aria-hidden
                                        />
                                      </button>
                                      {(subRow.serviceRows ?? []).length >
                                      1 ? (
                                        <button
                                          type="button"
                                          title="Remove this service row"
                                          aria-label="Remove this service row"
                                          style={partnerCatalogOutlineDeleteBtn}
                                          onClick={() =>
                                            removeServiceRow(
                                              block.id,
                                              subRow.id,
                                              row.id
                                            )
                                          }
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          }
                                          onMouseEnter={(e) =>
                                            hoverIconBtn(e, true)
                                          }
                                          onMouseLeave={(e) =>
                                            hoverIconBtn(e, false)
                                          }
                                        >
                                          <i
                                            className="bi bi-trash fs-6"
                                            aria-hidden
                                          />
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ))}
                </section>

                <Row className="g-4 add-partner-form-row add-partner-docs-bank-row mt-3">
                  <Col xs={12} lg={6} className="d-flex">
                    <section
                      className="custom-other-details add-partner-docs-panel flex-fill"
                      style={{ padding: "10px" }}
                    >
                      <h3 className="mb-2">Verification &amp; Documents</h3>
                      {(PARTNER_CREATE_DOCUMENT_SLOTS ?? []).map((slot) => (
                        <DetailsRowLinkDocument
                          key={slot.key}
                          title={slot.title}
                          isEditable={false}
                          uploadedFileName={
                            partnerVerificationDocFiles[slot.key]?.name
                          }
                          onAddClick={() =>
                            void openAddPartnerVerificationDocumentUpload(
                              slot.key
                            )
                          }
                          onViewClick={() => {
                            const file = partnerVerificationDocFiles[slot.key];
                            if (file) {
                              const url = URL.createObjectURL(file);
                              window.open(url, "_blank", "noopener,noreferrer");
                              setTimeout(() => URL.revokeObjectURL(url), 60_000);
                            }
                          }}
                          onDeleteClick={() => {
                            setPartnerVerificationDocFiles((prev) => {
                              const next = { ...prev };
                              delete next[slot.key];
                              return next;
                            });
                          }}
                        />
                      ))}
                    </section>
                  </Col>
                  <Col xs={12} lg={6} className="d-flex">
                    <section
                      className="custom-other-details add-partner-bank-panel flex-fill"
                      style={{ padding: "10px" }}
                    >
                      <h3 className="mb-3">Bank Accounts</h3>
                      <div className="add-partner-bank-fields d-flex flex-column">
                        <CustomTextField
                          label="Bank Name"
                          controlId="partner_bank_legal_name"
                          placeholder="Enter bank name"
                          register={register}
                          value={watch("partner_bank_legal_name") ?? ""}
                          onChange={(value) =>
                            setValue(
                              "partner_bank_legal_name",
                              sanitizeLettersAndSpaces(value),
                              { shouldDirty: true }
                            )
                          }
                          hideValidationFeedback
                          labelSize={3}
                        />
                        <CustomTextField
                          label="Branch Name"
                          controlId="partner_bank_branch"
                          placeholder="Enter branch name"
                          register={register}
                          value={watch("partner_bank_branch") ?? ""}
                          onChange={(value) =>
                            setValue(
                              "partner_bank_branch",
                              sanitizeLettersAndSpaces(value),
                              { shouldDirty: true }
                            )
                          }
                          hideValidationFeedback
                          labelSize={3}
                        />
                        <CustomTextField
                          label="Account Name"
                          controlId="partner_bank_holder"
                          placeholder="Enter account holder name"
                          register={register}
                          hideValidationFeedback
                          labelSize={3}
                        />
                        <CustomTextField
                          label="Account Number"
                          controlId="partner_bank_account_number"
                          placeholder="Enter account number"
                          register={register}
                          hideValidationFeedback
                          labelSize={3}
                        />
                        <CustomTextField
                          label="IFSC Code"
                          controlId="partner_bank_ifsc"
                          placeholder="Enter IFSC code"
                          register={register}
                          hideValidationFeedback
                          labelSize={3}
                        />
                        
                      </div>
                    </section>
                  </Col>
                </Row>
              </>
            ) : null}

            <Row className="mt-4">
              <Col
                xs={12}
                className="text-center d-flex justify-content-end gap-3"
              >
                <Button type="submit" className="custom-btn-primary">
                  {isEditable ? "Update" : "Add"}
                </Button>

                <Button className="custom-btn-secondary" onClick={onClose}>
                  Cancel
                </Button>
              </Col>
            </Row>
          </form>
        </Modal.Body>
      </Modal>
    </>
  );
}

const AddEditUserDialog = Object.assign(AddEditUserDialogView, {
  show(
    role: number,
    isEditable: boolean,
    user: UserModel | null,
    onRefreshData: () => void,
    options?: { partnerStatusMode?: "active" | "verification" }
  ) {
    openDialog("add-user-details-modal", (close) => (
      <AddEditUserDialogView
        role={role}
        isEditable={isEditable}
        user={user}
        onClose={close}
        onRefreshData={onRefreshData}
        partnerStatusMode={options?.partnerStatusMode}
      />
    ));
  },
}) as typeof AddEditUserDialogView & {
  show: (
    role: number,
    isEditable: boolean,
    user: UserModel | null,
    onRefreshData: () => void,
    options?: { partnerStatusMode?: "active" | "verification" }
  ) => void;
};

export default AddEditUserDialog;
