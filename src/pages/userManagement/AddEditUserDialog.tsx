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
import { showErrorAlert } from "../../lib/global/alertHelper";
import { fetchCityDropDownForForm } from "../../services/cityService";
import { fetchStateDropDown } from "../../services/stateService";
import { fetchAreasByCityForForm } from "../../services/areaService";
import { createOrUpdateUser } from "../../services/userService";
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
import CustomTextField from "../../components/CustomTextField";
import CustomTextFieldIndiaMobile from "../../components/CustomTextFieldIndiaMobile";
import CustomTextFieldSelect from "../../components/CustomTextFieldSelect";
import CustomTextFieldRadio from "../../components/CustomTextFieldRadio";
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
import PartnerSubscriptionFormSection, {
  partnerSubscriptionFormBind,
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
import { PARTNER_VERIFICATION } from "../../lib/partner/partnerVerification";
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

const LETTERS_AND_SPACES_ONLY = /^[A-Za-z\s]+$/;

function sanitizeLettersAndSpaces(value: string): string {
  return value.replace(/[^A-Za-z\s]/g, "");
}

const ADD_PARTNER_LETTERS_ONLY_FIELD_RULE = {
  ...REQUIRED_FIELD_RULE,
  pattern: {
    value: LETTERS_AND_SPACES_ONLY,
    message: "Only letters are allowed",
  },
};

/** Local guard — keeps catalog UI safe without an extra module export (avoids dev HMR load issues). */
function ensurePartnerCatalogBlocks(
  blocks: PartnerCategoryBlock[] | null | undefined
): PartnerCategoryBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return [emptyPartnerCatalogBlock("")];
  }
  return blocks.map((b) => ({
    id: String(b?.id ?? "").trim() || newPartnerCatalogRowId(),
    categoryId: String(b?.categoryId ?? ""),
    is_active: b?.is_active !== false,
    serviceRows: (
      Array.isArray(b?.serviceRows) && b.serviceRows.length > 0
        ? b.serviceRows
        : [emptyPartnerServiceRow()]
    ).map((r) => ({
      ...r,
      is_active: r?.is_active !== false,
    })),
  }));
}

type OptionType = { value: string; label: string };

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

type AddEditUserFormValues = Partial<UserModel> & AddPartnerFormFields;

type AddEditUserDialogProps = {
  role: number;
  isEditable: boolean;
  user: UserModel | null;
  onClose: () => void;
  onRefreshData: () => void;
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

function AddEditUserDialogView({
  role,
  isEditable,
  user,
  onClose,
  onRefreshData,
}: AddEditUserDialogProps) {
  const isAddPartner = role === PARTNER_ROLE && !isEditable;
  const isPartnerEdit = role === PARTNER_ROLE && isEditable;
  const isUserUpdate = role === USER_ROLE && isEditable;
  const isFranchiseEmployeeRole = role === FRANCHISE_EMPLOYEE_ROLE;

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
  /** Add Partner: services loaded per category from franchise-scoped catalog. */
  const [servicesByCategoryId, setServicesByCategoryId] = useState<
    Record<string, PartnerCatalogServiceLite[]>
  >({});
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [partnerCatalogBlocks, setPartnerCatalogBlocks] = useState<
    PartnerCategoryBlock[]
  >(() => [emptyPartnerCatalogBlock("")]);

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
  const [franchiseDropdownOptions, setFranchiseDropdownOptions] = useState<
    FranchiseDropDownOption[]
  >([]);
  const prevAddPartnerFranchiseRef = useRef<string | null>(null);

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
        let cityOptions = await fetchCityDropDownForForm(
          sid,
          locationFranchiseId || undefined
        );
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
    [locationFranchiseId, getValues, setValue, isEditable, user]
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
      void fetchCityFromApi(sid);
    },
    [setValue, fetchCityFromApi]
  );

  const onCityChangeClearAreaPin = useCallback(() => {
    setValue("area_id", "", { shouldValidate: false });
    setValue("pincode", "", { shouldValidate: false });
  }, [setValue]);

  const applyAddPartnerFranchiseLocation = useCallback(
    async (franchiseId: string) => {
      const fid = String(franchiseId ?? "").trim();
      if (!fid || !isAddPartner) return;

      let stateId = "";
      let cityId = "";

      const fromDropdown = franchiseDropdownOptions.find(
        (o) => String(o.value) === fid
      );
      if (fromDropdown?.state_id) {
        stateId = String(fromDropdown.state_id).trim();
        cityId = String(fromDropdown.city_id ?? "").trim();
      } else {
        const franchise = await fetchFranchiseById(fid, {
          skipAdminContactEnrichment: true,
        });
        stateId = String(franchise?.state_id ?? "").trim();
        cityId = String(franchise?.city_id ?? "").trim();
      }

      if (!stateId) return;

      setValue("state_id", stateId, { shouldValidate: true, shouldDirty: true });
      setValue("area_id", "", { shouldValidate: false });
      setValue("pincode", "", { shouldValidate: false });
      setAreas([]);
      setAreaPincodes(new Map());
      setPincodeOptions([]);

      await fetchCityFromApi(stateId);

      if (cityId) {
        setValue("city_id", cityId, { shouldValidate: true, shouldDirty: true });
      } else {
        setValue("city_id", "", { shouldValidate: false });
      }
    },
    [isAddPartner, franchiseDropdownOptions, setValue, fetchCityFromApi]
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
        setPartnerCatalogBlocks([emptyPartnerCatalogBlock("")]);
        setServicesByCategoryId({});
      }
      return;
    }

    if (isAddPartner) {
      setCategoryIds([]);
      setServiceIds([]);
      setPartnerCatalogBlocks([emptyPartnerCatalogBlock("")]);
      setServicesByCategoryId({});
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
    setPartnerCatalogBlocks([emptyPartnerCatalogBlock("")]);
    setServicesByCategoryId({});
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
            city_id: r.city_id ? String(r.city_id).trim() : undefined,
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
      setCategoryOptions([{ value: "select-all", label: "Select All" }]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchCategory(
          1,
          5000,
          { status: "true" },
          [],
          apiFranchiseId || undefined
        );
        if (cancelled) return;
        if (!res.response) {
          setCategoryOptions([{ value: "select-all", label: "Select All" }]);
          return;
        }
        const catList = (Array.isArray(res.categories) ? res.categories : [])
          .map((c) => ({
            value: String(c._id ?? c.category_id ?? "").trim(),
            label: String(c.name ?? "").trim(),
          }))
          .filter((c) => c.value);
        setCategoryOptions([
          { value: "select-all", label: "Select All" },
          ...catList,
        ]);
      } catch {
        if (!cancelled) {
          setCategoryOptions([{ value: "select-all", label: "Select All" }]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAddPartner, isSuperAdminOrStaff, catalogFranchiseApiId]);

  useEffect(() => {
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

      const franchiseScopeId =
        isAddPartner || isPartnerEdit
          ? String(catalogFranchiseApiId || locationFranchiseId || "").trim()
          : "";

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

      setAreas(areaOptions);
      setAreaPincodes(pinMap);
      const currentArea = String(watch("area_id") ?? "").trim();
      if (currentArea && !areaOptions.some((a) => a.value === currentArea)) {
        setValue("area_id", "", { shouldValidate: false });
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
    isAddPartner,
    isPartnerEdit,
    catalogFranchiseApiId,
    locationFranchiseId,
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

  useEffect(() => {
    if (!isPartnerEdit || !user) return;
    setCategoryIds((user.category_ids ?? []).map(String));
    setServiceIds((user.service_ids ?? []).map(String));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate partner selections when user record identity changes
  }, [isPartnerEdit, user?._id]);

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

  const catalogServicesForBlocks = useMemo((): PartnerCatalogServiceLite[] => {
    if (!isAddPartner) {
      return allServices.map((s) => ({
        _id: s._id,
        name: s.name,
        category_id: s.category_id,
      }));
    }
    const out: PartnerCatalogServiceLite[] = [];
    for (const list of Object.values(servicesByCategoryId)) {
      out.push(...list);
    }
    return out;
  }, [isAddPartner, allServices, servicesByCategoryId]);

  /** Per row: hide services already chosen on sibling rows in this block; keep this row’s selection visible. */
  const serviceOptionsForPartnerBlockRow = useCallback(
    (block: PartnerCategoryBlock, rowId: string): OptionType[] => {
      const categoryId = String(block.categoryId ?? "").trim();
      if (!categoryId) {
        return [{ value: "", label: "Select category first" }];
      }

      const rows = block.serviceRows ?? [];
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
        baseList = (servicesByCategoryId[categoryId] ?? []).map((s) => ({
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
    [isAddPartner, allServices, servicesByCategoryId, catalogServicesForBlocks]
  );

  const partnerServiceRowComplete = (row: PartnerServiceRow) =>
    Boolean(
      String(row.serviceId ?? "").trim() &&
        row.description.trim() &&
        String(row.price ?? "").trim()
    );

  const canAddPartnerCategoryBlock = useMemo(() => {
    if (!isAddPartner) return true;
    return safePartnerCatalogBlocks.every((b) => {
      if (!String(b.categoryId ?? "").trim()) return false;
      return (b.serviceRows ?? []).every(partnerServiceRowComplete);
    });
  }, [isAddPartner, safePartnerCatalogBlocks]);

  const canAddPartnerServiceRow = useCallback(
    (block: PartnerCategoryBlock, row: PartnerServiceRow) =>
      Boolean(
        String(block.categoryId ?? "").trim() &&
          partnerServiceRowComplete(row)
      ),
    []
  );

  const addCategoryBlock = useCallback(() => {
    setPartnerCatalogBlocks((prev) => [
      ...ensurePartnerCatalogBlocks(prev),
      emptyPartnerCatalogBlock(""),
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
          ? {
              ...b,
              is_active,
              serviceRows: (b.serviceRows ?? []).map((r) => ({
                ...r,
                is_active: is_active ? r.is_active !== false : false,
              })),
            }
          : b
      )
    );
  }, []);

  const updateBlockCategory = useCallback(
    (blockId: string, categoryId: string) => {
      setPartnerCatalogBlocks((prev) =>
        ensurePartnerCatalogBlocks(prev).map((b) =>
          b.id === blockId
            ? {
                ...b,
                categoryId,
                serviceRows: (b.serviceRows ?? []).map((r) => ({
                  ...r,
                  serviceId: "",
                  price: "",
                })),
              }
            : b
        )
      );
      const cid = String(categoryId ?? "").trim();
      if (!cid || !isAddPartner) return;
      const apiFranchiseId = catalogFranchiseApiId;
      if (isSuperAdminOrStaff && !apiFranchiseId) {
        setServicesByCategoryId((prev) => ({ ...prev, [cid]: [] }));
        return;
      }
      const cityId = String(watchedCityId ?? "").trim();
      const stateId = String(watchedStateId ?? "").trim();
      void (async () => {
        try {
          const svcRes = await fetchService(
            1,
            5000,
            {
              status: "true",
              ...(cityId ? { city_id: cityId } : {}),
              ...(stateId ? { state_id: stateId } : {}),
            },
            [],
            apiFranchiseId || undefined
          );
          const list =
            svcRes.response && Array.isArray(svcRes.services)
              ? svcRes.services
              : [];
          const filtered = list.filter(
            (s) => normalizeServiceCategoryRef(s.category_id) === cid
          );
          const mapped: PartnerCatalogServiceLite[] = filtered.map((s) => ({
            _id: String((s as { _id?: string })._id ?? ""),
            name: String((s as { name?: string }).name ?? ""),
            category_id: cid,
            price:
              (s as { price?: number | null }).price !== undefined &&
              (s as { price?: number | null }).price !== null
                ? Number((s as { price?: number }).price)
                : undefined,
            payment_type: String(
              (s as { payment_type?: string }).payment_type ??
                (s as { min_deposit_type?: string }).min_deposit_type ??
                ""
            ).trim(),
          }));
          setServicesByCategoryId((prev) => ({
            ...prev,
            [cid]: mapped,
          }));
        } catch {
          setServicesByCategoryId((prev) => ({ ...prev, [cid]: [] }));
        }
      })();
    },
    [
      isAddPartner,
      isSuperAdminOrStaff,
      catalogFranchiseApiId,
      watchedCityId,
      watchedStateId,
    ]
  );

  const addServiceRow = useCallback((blockId: string) => {
    setPartnerCatalogBlocks((prev) =>
      ensurePartnerCatalogBlocks(prev).map((b) =>
        b.id === blockId
          ? {
              ...b,
              serviceRows: [...(b.serviceRows ?? []), emptyPartnerServiceRow()],
            }
          : b
      )
    );
  }, []);

  const updateServiceRow = useCallback(
    (
      blockId: string,
      rowId: string,
      patch: Partial<Omit<PartnerServiceRow, "id">>
    ) => {
      setPartnerCatalogBlocks((prev) =>
        ensurePartnerCatalogBlocks(prev).map((b) =>
          b.id !== blockId
            ? b
            : {
                ...b,
                serviceRows: (b.serviceRows ?? []).map((r) =>
                  r.id === rowId ? { ...r, ...patch } : r
                ),
              }
        )
      );
    },
    []
  );

  const removeServiceRow = useCallback((blockId: string, rowId: string) => {
    setPartnerCatalogBlocks((prev) =>
      ensurePartnerCatalogBlocks(prev).map((b) => {
        if (b.id !== blockId) return b;
        const rows = b.serviceRows ?? [];
        if (rows.length <= 1) {
          return b;
        }
        return {
          ...b,
          serviceRows: rows.filter((r) => r.id !== rowId),
        };
      })
    );
  }, []);

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
        if (!String(data.subscription_end_date ?? "").trim()) {
          showErrorAlert("Please select subscription end date.");
          return;
        }
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
    const isBlockedPayload = isUserUpdate
      ? Boolean((user as any)?.is_blocked)
      : typeof (data as any).is_blocked === "string"
        ? String((data as any).is_blocked) === "true"
        : Boolean((data as any).is_blocked);
    const resolvedIsActivePayload = isBlockedPayload ? false : isActivePayload;

    const sessionFranchiseId = sessionFranchiseIdForScopedApis();
    const createFranchiseId =
      isAddPartner && effectiveAddPartnerFranchiseId
        ? effectiveAddPartnerFranchiseId
        : isFranchisePortalUser &&
            !isEditable &&
            (role === USER_ROLE || role === PARTNER_ROLE) &&
            sessionFranchiseId
          ? sessionFranchiseId
          : "";

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
              "partner-services": partnerCatalogFlat.partner_services,
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
        subscription_plan_id: String(data.subscription_plan_id ?? "").trim(),
        subscription_plan: String(data.subscription_plan ?? "").trim(),
        subscription_start_date: String(
          data.subscription_start_date ?? ""
        ).trim(),
        subscription_end_date: String(data.subscription_end_date ?? "").trim(),
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
            subscription_start_date: String(
              data.subscription_start_date ?? ""
            ).trim(),
            subscription_end_date: String(
              data.subscription_end_date ?? ""
            ).trim(),
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
    if (!isAddPartner && !isPartnerEdit) return;
    let cancelled = false;
    void (async () => {
      try {
        const opts = await fetchSubscriptionPlanOptions();
        if (!cancelled)
          setPartnerPlanSelectOptions(Array.isArray(opts) ? opts : []);
      } catch {
        if (!cancelled) setPartnerPlanSelectOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAddPartner, isPartnerEdit]);

  useEffect(() => {
    void fetchStateFromApi();
  }, [fetchStateFromApi]);

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
                        options={states ?? []}
                        register={register}
                        fieldName="state_id"
                        error={errors.state_id}
                        requiredMessage="Please select state"
                        defaultValue={String(watch("state_id") ?? "")}
                        setValue={setValue as (name: string, value: any) => void}
                        menuPortal
                        placeholder="Select state"
                        labelSize={3}
                        onChange={(e) =>
                          onStateChangeClearLocationChain(e.target.value)
                        }
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <CustomTextFieldSelect
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
                        labelSize={3}
                        isDisabled={!String(watch("state_id") ?? "").trim()}
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
                        labelSize={3}
                        isDisabled={!String(watch("city_id") ?? "").trim()}
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
                      label="City"
                      controlId="City"
                      options={cities ?? []}
                      register={register}
                      fieldName="city_id"
                      error={errors.city_id}
                      requiredMessage="Please select city"
                      defaultValue={
                        isEditable ? (user?.city_id ? user?.city_id : "") : ""
                      }
                      setValue={setValue as (name: string, value: any) => void}
                      onChange={() => onCityChangeClearAreaPin()}
                    />
                    <CustomTextFieldSelect
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
                      defaultValue={
                        isEditable ? normalizeIdLike((user as any)?.area_id) : ""
                      }
                      setValue={setValue as (name: string, value: any) => void}
                    />
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
                      defaultValue={
                        isEditable ? normalizePincodeValue(user?.pincode) : ""
                      }
                      setValue={setValue as (name: string, value: any) => void}
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
                    {role !== USER_ROLE ? (
                      <CustomTextFieldRadio
                        label="Status"
                        name="is_blocked"
                        options={[
                          { value: "false", label: "Active" },
                          { value: "true", label: "Inactive" },
                        ]}
                        defaultValue={String(
                          watch("is_blocked") ?? (user as any)?.is_blocked ?? false
                        )}
                        isEditable={true}
                        setValue={setValue}
                      />
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
                  <h3 className="mb-2">Categories and services</h3>
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

                      {(block.serviceRows ?? []).map((row) => {
                        const categoryActive = block.is_active !== false;
                        const serviceActive =
                          categoryActive && row.is_active !== false;
                        return (
                        <div
                          key={row.id}
                          className="add-partner-catalog-grid add-partner-catalog-grid--service mb-2"
                        >
                          <div className="add-partner-catalog-field add-partner-catalog-field--service">
                            <PartnerSingleSelect
                              instanceId={`${block.id}-${row.id}-service`}
                              label="Service"
                              requiredMark
                              options={serviceOptionsForPartnerBlockRow(
                                block,
                                row.id
                              )}
                              value={row.serviceId}
                              placeholder="Select service"
                              isDisabled={addPartnerCatalogLocked}
                              onChange={(sid: string) => {
                                const categoryId = String(
                                  block.categoryId ?? ""
                                ).trim();
                                const list =
                                  servicesByCategoryId[categoryId] ?? [];
                                const hit = list.find(
                                  (s) => String(s._id) === String(sid)
                                );
                                const priceNum =
                                  hit?.price !== undefined &&
                                  hit?.price !== null
                                    ? Number(hit.price)
                                    : NaN;
                                const priceStr = Number.isFinite(priceNum)
                                  ? String(priceNum)
                                  : "";
                                updateServiceRow(block.id, row.id, {
                                  serviceId: sid,
                                  price: priceStr,
                                });
                              }}
                            />
                          </div>
                          <div className="add-partner-catalog-field add-partner-catalog-field--description">
                            <Form.Group
                              controlId={`desc-${block.id}-${row.id}`}
                            >
                              <Form.Label className="fw-medium mb-1">
                                <FieldLabelText label="Description" required />
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
                                  updateServiceRow(block.id, row.id, {
                                    description: e.target.value,
                                  })
                                }
                              />
                            </Form.Group>
                          </div>
                          <div className="add-partner-catalog-field add-partner-catalog-field--price">
                            <Form.Group
                              controlId={`price-${block.id}-${row.id}`}
                            >
                              <Form.Label className="fw-medium mb-1">
                                <FieldLabelText label="Price" required />
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
                                    updateServiceRow(block.id, row.id, {
                                      price: e.target.value,
                                    })
                                  }
                                />
                              </InputGroup>
                            </Form.Group>
                          </div>
                          <div className="add-partner-catalog-field add-partner-catalog-field--status">
                            <PartnerCatalogStatusToggle
                              inline
                              instanceId={`${block.id}-${row.id}-service-status`}
                              label="Status"
                              value={serviceActive}
                              disabled={
                                addPartnerCatalogLocked || !categoryActive
                              }
                              onChange={(active) => {
                                if (!categoryActive) return;
                                updateServiceRow(block.id, row.id, {
                                  is_active: active,
                                });
                              }}
                            />
                          </div>
                          <div className="add-partner-catalog-field add-partner-catalog-field--actions">
                            <div className="add-partner-catalog-actions">
                              <button
                                type="button"
                                title="Add another service in this category"
                                aria-label="Add another service in this category"
                                style={partnerCatalogOutlineAddBtn}
                                disabled={!canAddPartnerServiceRow(block, row)}
                                onClick={() => addServiceRow(block.id)}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={(e) => hoverIconBtn(e, true)}
                                onMouseLeave={(e) => hoverIconBtn(e, false)}
                              >
                                <i className="bi bi-plus fs-6" aria-hidden />
                              </button>
                              {(block.serviceRows ?? []).length > 1 ? (
                                <button
                                  type="button"
                                  title="Remove this service row"
                                  aria-label="Remove this service row"
                                  style={partnerCatalogOutlineDeleteBtn}
                                  onClick={() =>
                                    removeServiceRow(block.id, row.id)
                                  }
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
                          error={errors.partner_bank_legal_name}
                          validation={ADD_PARTNER_LETTERS_ONLY_FIELD_RULE}
                          value={watch("partner_bank_legal_name") ?? ""}
                          onChange={(value) =>
                            setValue(
                              "partner_bank_legal_name",
                              sanitizeLettersAndSpaces(value),
                              { shouldValidate: true, shouldDirty: true }
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
                          error={errors.partner_bank_branch}
                          validation={ADD_PARTNER_LETTERS_ONLY_FIELD_RULE}
                          value={watch("partner_bank_branch") ?? ""}
                          onChange={(value) =>
                            setValue(
                              "partner_bank_branch",
                              sanitizeLettersAndSpaces(value),
                              { shouldValidate: true, shouldDirty: true }
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
                          error={errors.partner_bank_holder}
                          validation={REQUIRED_FIELD_RULE}
                          hideValidationFeedback
                          labelSize={3}
                        />
                        <CustomTextField
                          label="Account Number"
                          controlId="partner_bank_account_number"
                          placeholder="Enter account number"
                          register={register}
                          error={errors.partner_bank_account_number}
                          validation={REQUIRED_FIELD_RULE}
                          hideValidationFeedback
                          labelSize={3}
                        />
                        <CustomTextField
                          label="IFSC Code"
                          controlId="partner_bank_ifsc"
                          placeholder="Enter IFSC code"
                          register={register}
                          error={errors.partner_bank_ifsc}
                          validation={REQUIRED_FIELD_RULE}
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
    onRefreshData: () => void
  ) {
    openDialog("add-user-details-modal", (close) => (
      <AddEditUserDialogView
        role={role}
        isEditable={isEditable}
        user={user}
        onClose={close}
        onRefreshData={onRefreshData}
      />
    ));
  },
}) as typeof AddEditUserDialogView & {
  show: (
    role: number,
    isEditable: boolean,
    user: UserModel | null,
    onRefreshData: () => void
  ) => void;
};

export default AddEditUserDialog;
