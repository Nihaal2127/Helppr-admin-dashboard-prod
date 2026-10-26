import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm, UseFormRegister } from "react-hook-form";
import { Modal, Button, Row, Col, Form } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { ServiceModel } from "../../lib/models/ServiceModel";
import { CustomFormInput } from "../../components/CustomFormInput";
import { CustomRadioSelection } from "../../components/CustomRadioSelection";
import { getStatusOptions } from "../../helper/utility";
import CustomFormSelect from "../../components/CustomFormSelect";
import CustomImageUploader, {
  resolveExistingImageSrc,
} from "../../components/CustomImageUploader";
import { FieldLabelText } from "../../components/RequiredFieldMark";
import { showErrorAlert } from "../../lib/global/alertHelper";
import {
  fetchCategoriesAsSelectOptions,
} from "../../services/categoryService";
import {
  createOrUpdateService,
  normalizeServiceCategoryRef,
} from "../../services/servicesService";
import {
  documentUploadFailureMessage,
  normalizeReplaceStoragePaths,
  toStorageRelativePath,
  uploadDocumentImages,
} from "../../services/documentUploadService";
import { openConfirmDialog } from "../../components/CustomConfirmDialog";
import { openDialog } from "../../lib/global/DialogManager";
import { AppConstant } from "../../lib/global/AppConstant";
import { apiRequest } from "../../lib/global/remote/apiHelper";
import {
  extractMinDepositTypeKey,
  getMinDepositViewParts,
} from "../../lib/service/serviceMinDepositDisplay";
import {
  FullDetailsRow,
  formatRequestedBy,
  isCatalogRequestRow,
  mapApprovalStatusFromRecord,
  requestApprovalStatusColor,
  requestApprovalStatusLabel,
} from "../../helper/utility";

function mapPaymentTypeToMinDepositType(s: ServiceModel | null): string {
  if (!s) return "";
  const any = s as any;
  const raw = String(any.min_deposit_type ?? any.payment_type ?? "").trim();
  return extractMinDepositTypeKey(raw);
}

/** Map backend subcategory list/dropdown body → select options (same fields as getAll). */
function extractSubCategoryDropDownOptions(
  data: unknown
): { value: string; label: string }[] {
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
    push(root.result);
    push(root.data);
    if (root.data && typeof root.data === "object") {
      walk(root.data, depth + 1);
    }
  };
  walk(data);
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  for (const item of buckets) {
    if (typeof item === "string" || typeof item === "number") {
      const value = String(item).trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      options.push({ value, label: value });
      continue;
    }
    const row =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    const value = String(
      row._id ?? row.id ?? row.subcategory_id ?? row.sub_category_id ?? row.value ?? ""
    ).trim();
    if (!value || seen.has(value)) continue;
    const label =
      String(row.name ?? row.label ?? row.subcategory_name ?? "").trim() ||
      value;
    seen.add(value);
    options.push({ value, label });
  }
  return options;
}

function serviceSubCategoryIdFromRecord(service: unknown): string {
  if (!service || typeof service !== "object") return "";
  const rec = service as Record<string, unknown>;
  return (
    normalizeServiceCategoryRef(rec.subcategory_id) ||
    normalizeServiceCategoryRef(rec.sub_category_id)
  );
}

function serviceSubCategoryLabelFromRecord(service: unknown): string {
  if (!service || typeof service !== "object") return "";
  const rec = service as Record<string, unknown>;
  const nestedName = (value: unknown): string => {
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number") {
      const s = String(value).trim();
      if (!s || /^[a-f0-9]{24}$/i.test(s)) return "";
      return s;
    }
    if (typeof value === "object") {
      const o = value as Record<string, unknown>;
      return nestedName(
        o.name ?? o.label ?? o.subcategory_name ?? o.title
      );
    }
    return "";
  };
  return (
    nestedName(rec.subcategory_name) ||
    nestedName(rec.sub_category_name) ||
    nestedName(rec.subcategory) ||
    nestedName(rec.subcategory_id) ||
    nestedName(rec.sub_category_id)
  );
}

async function fetchSubCategoriesForCategoryFromApi(
  categoryId: string
): Promise<{ value: string; label: string }[]> {
  const cid = String(categoryId ?? "").trim();
  if (!cid) return [];

  const byId = new Map<string, { value: string; label: string }>();
  const merge = (rows: { value: string; label: string }[]) => {
    for (const row of rows) {
      if (!row.value || byId.has(row.value)) continue;
      byId.set(row.value, row);
    }
  };

  const dropParams = new URLSearchParams({ category_id: cid });
  const dropRes = await apiRequest(
    `/subcategory/getDropDown?${dropParams.toString()}`,
    "GET",
    undefined,
    false,
    true
  );
  if (dropRes.success) {
    merge(extractSubCategoryDropDownOptions(dropRes.data));
  }

  // Same list as the Sub Category tab (`records` + `_id`), so a newly added
  // subcategory still appears even when getDropDown omits it.
  const listParams = new URLSearchParams({
    page: "1",
    limit: "200",
    category_id: cid,
  });
  const listRes = await apiRequest(
    `/subcategory/getAll?${listParams.toString()}`,
    "GET",
    undefined,
    false,
    true
  );
  if (listRes.success) {
    merge(extractSubCategoryDropDownOptions(listRes.data));
  }

  return Array.from(byId.values());
}

function mapMinimumDepositValue(s: ServiceModel | null): string {
  if (!s) return "";
  const any = s as any;
  const v = any.min_deposit_value ?? any.minimum_deposit;
  if (v === undefined || v === null) return "";
  return String(v);
}

function mapApprovalStatusFromService(
  s: ServiceModel | null
): "pending" | "approved" | "rejected" {
  return mapApprovalStatusFromRecord(
    s ? (s as unknown as Record<string, unknown>) : null
  );
}

function isTruthyFormBool(v: unknown): boolean {
  return (
    v === true ||
    v === "true" ||
    v === 1 ||
    v === "1"
  );
}

function serviceDirectOrderOn(s: ServiceModel | null | undefined): boolean {
  if (!s) return false;
  const rec = s as ServiceModel & Record<string, unknown>;
  return isTruthyFormBool(
    rec.direct_order ?? rec.is_direct_order ?? rec.directOrder
  );
}

const SERVICE_DETAIL_IMAGE_PX = 280;

type AddEditServiceDialogProps = {
  isEditable: boolean;
  service: ServiceModel | null;
  onClose: () => void;
  onRefreshData: () => void;
  isViewMode?: boolean;
  lockCategory?: {
    id?: string;
    label?: string;
    subcategoryId?: string;
    subcategoryLabel?: string;
  };
  /** When true (e.g. My Franchise catalog view), hide Active/Inactive and request-status rows. */
  hideStatusInView?: boolean;
};

const AddEditServiceDialog: React.FC<AddEditServiceDialogProps> & {
  show: (
    isEditable: boolean,
    service: ServiceModel | null,
    onRefreshData: () => void,
    isViewMode?: boolean,
    lockCategory?: {
      id?: string;
      label?: string;
      subcategoryId?: string;
      subcategoryLabel?: string;
    },
    hideStatusInView?: boolean
  ) => void;
} = ({
  isEditable,
  service,
  onClose,
  onRefreshData,
  isViewMode = false,
  lockCategory,
  hideStatusInView = false,
}) => {
  const [localViewMode, setLocalViewMode] = useState(isViewMode);

  useEffect(() => {
    setLocalViewMode(isViewMode);
  }, [isViewMode, service?._id]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<
    ServiceModel & {
      approval_status?: "pending" | "approved" | "rejected";
      rejection_reason?: string;
      subcategory_id?: string;
      direct_order?: boolean;
    }
  >({
    defaultValues: {
      name: service?.name || "",
      desc: service?.desc || "",
      tax: ((service as any)?.tax ?? "") as any,
      commission: ((service as any)?.commission ?? "") as any,
      min_deposit_type: mapPaymentTypeToMinDepositType(service),
      min_deposit_value: mapMinimumDepositValue(service) as any,
      is_active: service?.is_active ?? true,
      category_id: normalizeServiceCategoryRef(service?.category_id),
      subcategory_id:
        serviceSubCategoryIdFromRecord(service) ||
        String(lockCategory?.subcategoryId ?? "").trim(),
      direct_order: serviceDirectOrderOn(service),
      approval_status: mapApprovalStatusFromService(service),
      rejection_reason: (service as any)?.rejection_reason ?? "",
    } as any,
  });

  useEffect(() => {
    reset({
      name: service?.name || "",
      desc: service?.desc || "",
      tax: ((service as any)?.tax ?? "") as any,
      commission: ((service as any)?.commission ?? "") as any,
      min_deposit_type: mapPaymentTypeToMinDepositType(service),
      min_deposit_value: mapMinimumDepositValue(service) as any,
      is_active: service?.is_active ?? true,
      category_id:
        normalizeServiceCategoryRef(service?.category_id) ||
        String(lockCategory?.id ?? "").trim(),
      subcategory_id:
        serviceSubCategoryIdFromRecord(service) ||
        String(lockCategory?.subcategoryId ?? "").trim(),
      direct_order: serviceDirectOrderOn(service),
      approval_status: mapApprovalStatusFromService(service),
      rejection_reason: (service as any)?.rejection_reason ?? "",
    } as any);
  }, [service, lockCategory?.id, lockCategory?.subcategoryId, localViewMode, reset]);

  const [categories, setCategory] = useState<
    { value: string; label: string }[]
  >([]);
  const [subCategories, setSubCategories] = useState<
    { value: string; label: string }[]
  >([]);
  const [fileInputs, setFileInputs] = useState<File[]>([]);
  const [replaceUrls, setReplaceUrl] = useState<string[]>([]);
  const [brokenPartnerAvatarIds, setBrokenPartnerAvatarIds] = useState<
    Set<string>
  >(() => new Set());
  const fetchRef = useRef(false);
  /** Used so Payment Type's `CustomFormSelect` sync does not wipe loaded `minimum_deposit` for non-consultancy rows. */
  const prevPaymentTypeRef = useRef<string | null>(null);

  useEffect(() => {
    prevPaymentTypeRef.current = null;
  }, [service?._id]);

  useEffect(() => {
    setFileInputs([]);
    setReplaceUrl([]);
    setBrokenPartnerAvatarIds(new Set());
  }, [service?._id, isEditable]);

  // const depositType = watch("min_deposit_type");
  const serviceCategoryId = normalizeServiceCategoryRef(
    service?.category_id
  );
  const categoryLabelForView =
    serviceCategoryId &&
    categories.find((c) => c.value === serviceCategoryId)?.label;

  const { paymentTypeLabel: paymentTypeForView, minDepositValue: minDepositForView } =
    getMinDepositViewParts(service as unknown as Record<string, unknown>);

  /** Percentage 0–100; allows decimals (e.g. 4.5). Max 2 fraction digits; caps at 100 while typing. */
  const sanitizePercentageText = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, "");
    const firstDot = cleaned.indexOf(".");
    let t =
      firstDot === -1
        ? cleaned
        : cleaned.slice(0, firstDot + 1) +
          cleaned.slice(firstDot + 1).replace(/\./g, "");
    const hasDot = t.includes(".");
    const [intRaw, ...rest] = t.split(".");
    const intPart = (intRaw ?? "").replace(/\D/g, "").slice(0, 3);
    const decPart = hasDot
      ? rest.join("").replace(/\D/g, "").slice(0, 2)
      : "";
    let out: string;
    if (!hasDot) {
      out = intPart;
    } else if (decPart.length > 0) {
      out = `${intPart}.${decPart}`;
    } else {
      out = intPart === "" ? "0." : `${intPart}.`;
    }
    if (out === "" || out === ".") return "";
    const n = parseFloat(out);
    if (Number.isFinite(n) && n > 100) return "100";
    return out;
  };

  const isValidPercentageString = (v: string) => {
    const t = String(v ?? "").trim();
    if (t === "" || t === ".") return false;
    // Integers or decimals; allow trailing "." while editing (e.g. "4." → 4)
    if (!/^\d+(\.\d*)?$/.test(t)) return false;
    const n = parseFloat(t);
    return Number.isFinite(n) && n >= 0 && n <= 100;
  };

  const fetchDataFromApi = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;

    try {
      if (lockCategory) {
        setCategory([
          {
            value: lockCategory.id || "",
            label: lockCategory.label || "Selected Category",
          },
        ]);
        if (lockCategory.id) {
          setValue("category_id", lockCategory.id as any, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
          });
        }
        const lockedSubId = String(lockCategory.subcategoryId ?? "").trim();
        if (lockedSubId) {
          setValue("subcategory_id" as any, lockedSubId, {
            shouldValidate: false,
            shouldDirty: false,
          });
          const lockedSubLabel =
            String(lockCategory.subcategoryLabel ?? "").trim() || lockedSubId;
          setSubCategories((prev) =>
            prev.some((option) => option.value === lockedSubId)
              ? prev
              : [...prev, { value: lockedSubId, label: lockedSubLabel }]
          );
        }
        return;
      }
      let categoryOptions = await fetchCategoriesAsSelectOptions();
      const currentId = normalizeServiceCategoryRef(service?.category_id);
      const currentName = String(service?.category_name ?? "").trim();
      if (
        currentId &&
        !categoryOptions.some((r) => r.value === currentId)
      ) {
        categoryOptions = [
          ...categoryOptions,
          { value: currentId, label: currentName || currentId },
        ].sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
        );
      }
      setCategory(categoryOptions);
    } finally {
      fetchRef.current = false;
    }
  }, [lockCategory, setValue, service]);

  useEffect(() => {
    void fetchDataFromApi();
  }, [fetchDataFromApi]);

  useEffect(() => {
    if (isEditable && service?.is_active !== undefined) {
      setValue("is_active", service.is_active);
    }
  }, [isEditable, service?.is_active, setValue]);

  useEffect(() => {
    if (!serviceCategoryId || categories.length === 0) return;
    const selectedCategory = categories.find(
      (category) => category.value === serviceCategoryId
    );
    if (selectedCategory) {
      setValue("category_id", serviceCategoryId as any, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
    }
  }, [categories, serviceCategoryId, setValue]);

  useEffect(() => {
    const t = mapPaymentTypeToMinDepositType(service);
    if (isEditable && t) {
      prevPaymentTypeRef.current = t;
      setValue("min_deposit_type" as any, t, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
    }
  }, [isEditable, service, setValue]);

  const isRequestService = Boolean((service as any)?.is_request);
  const approvalStatus = watch("approval_status");
  const approvalStatusDefaultForEdit =
    mapApprovalStatusFromService(service);
  const categoryIdWatch = watch("category_id");
  const subcategoryIdWatch = watch("subcategory_id");
  const directOrderOn = isTruthyFormBool(watch("direct_order"));

  const applySubCategoryOptions = useCallback(
    (loaded: { value: string; label: string }[]) => {
      const lockedId = String(lockCategory?.subcategoryId ?? "").trim();
      const lockedLabel = String(lockCategory?.subcategoryLabel ?? "").trim();
      const current =
        String(getValues("subcategory_id") ?? "").trim() || lockedId;
      const extraLabel =
        lockedLabel || serviceSubCategoryLabelFromRecord(service) || current;
      const byId = new Map<string, { value: string; label: string }>();
      for (const row of loaded) {
        if (row.value) byId.set(row.value, row);
      }
      if (lockedId && !byId.has(lockedId)) {
        byId.set(lockedId, {
          value: lockedId,
          label: extraLabel || lockedId,
        });
      }
      if (current && !byId.has(current)) {
        byId.set(current, { value: current, label: extraLabel || current });
      }
      const options = Array.from(byId.values());
      setSubCategories(options);
      if (current && options.some((option) => option.value === current)) {
        if (String(getValues("subcategory_id") ?? "").trim() !== current) {
          setValue("subcategory_id" as any, current, {
            shouldValidate: false,
            shouldDirty: false,
          });
        }
        return;
      }
      if (!isEditable && options.length === 1) {
        setValue("subcategory_id" as any, options[0].value, {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
    },
    [
      getValues,
      isEditable,
      lockCategory?.subcategoryId,
      lockCategory?.subcategoryLabel,
      service,
      setValue,
    ]
  );

  const loadSubCategoriesForSelectedCategory = useCallback(async () => {
    const categoryId = String(getValues("category_id") ?? "").trim();
    if (!categoryId) {
      setSubCategories([]);
      return;
    }
    const options = await fetchSubCategoriesForCategoryFromApi(categoryId);
    applySubCategoryOptions(options);
  }, [applySubCategoryOptions, getValues]);

  useEffect(() => {
    const categoryId = String(categoryIdWatch ?? "").trim();
    let cancelled = false;
    if (!categoryId) {
      setSubCategories([]);
      return;
    }
    void (async () => {
      const options = await fetchSubCategoriesForCategoryFromApi(categoryId);
      if (cancelled) return;
      applySubCategoryOptions(options);
    })();
    return () => {
      cancelled = true;
    };
  }, [applySubCategoryOptions, categoryIdWatch]);

  const serviceImagePath = useMemo(() => {
    if (!service) return "";
    const s = service as any;
    return String(s.image_url ?? s.image ?? s.imageUrl ?? "").trim();
  }, [service]);

  const servicePartners = useMemo(() => {
    const raw = (service as ServiceModel | null)?.partners;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((p) => {
        const rec = p as Record<string, unknown>;
        const id = String(rec.id ?? rec._id ?? "").trim();
        const name = String(rec.name ?? "").trim();
        const profile_url = String(
          rec.profile_url ?? rec.profileUrl ?? rec.image_url ?? ""
        ).trim();
        const ratingRaw = rec.average_rating ?? rec.avg_rating ?? rec.rating;
        const ratingNum = Number(ratingRaw);
        const franchiseObj =
          rec.franchise && typeof rec.franchise === "object"
            ? (rec.franchise as Record<string, unknown>)
            : rec.franchise_id && typeof rec.franchise_id === "object"
              ? (rec.franchise_id as Record<string, unknown>)
              : null;
        const franchiseName =
          String(
            rec.franchise_name ??
              rec.franchiseName ??
              franchiseObj?.name ??
              franchiseObj?.franchise_name ??
              (typeof rec.franchise === "string" ? rec.franchise : "") ??
              ""
          ).trim() || "—";
        return {
          id,
          name: name || id,
          profile_url,
          rating: Number.isFinite(ratingNum) ? ratingNum : null,
          franchiseName,
        };
      })
      .filter((p) => p.id || p.name);
  }, [service]);

  const onSubmitEvent = async (
    data: ServiceModel & {
      approval_status?: "pending" | "approved" | "rejected";
      rejection_reason?: string;
    }
  ) => {
    const resolvedCategoryId = String(
      lockCategory?.id || data.category_id || ""
    ).trim();
    if (!resolvedCategoryId) {
      showErrorAlert("Please save category first, then add service.");
      return;
    }

    const nextPaymentType = extractMinDepositTypeKey(
      String(
        (data as { min_deposit_type?: string }).min_deposit_type ??
          getValues("min_deposit_type" as never) ??
          ""
      )
    );
    const originalPaymentType = extractMinDepositTypeKey(
      mapPaymentTypeToMinDepositType(service)
    );
    const rawPartners = (service as ServiceModel | null)?.partners;
    const partnerCountFromApi = Array.isArray(rawPartners)
      ? rawPartners.length
      : Number(
          (service as { partner_count?: number } | null)?.partner_count ?? 0
        ) || 0;
    const partnerCount = Math.max(partnerCountFromApi, servicePartners.length);
    const paymentTypeChanged =
      isEditable && originalPaymentType !== nextPaymentType;

    const persistService = async () => {
    let image_url = "";

    if (fileInputs.length > 0) {
      console.log("[ImageUploadDebug] Edit Service — Update clicked", {
        serviceId: service?._id,
        isEditable,
        serviceImagePath,
        serviceImagePathNormalized: normalizeReplaceStoragePaths(
          serviceImagePath ? [serviceImagePath] : []
        ),
        replaceUrls,
        fileInputs: fileInputs.map((f) => ({
          name: f.name,
          size: f.size,
          type: f.type,
        })),
      });

      const previousImagePath = toStorageRelativePath(serviceImagePath);

      const imageUpload = await uploadDocumentImages({
        uploadType: "2",
        files: fileInputs,
        isEditMode: isEditable,
        replaceUrls,
        existingStoragePaths: serviceImagePath ? [serviceImagePath] : [],
      });
      if (!imageUpload.ok) {
        showErrorAlert(documentUploadFailureMessage(imageUpload.usedReplace));
        return;
      }
      image_url = imageUpload.paths[0] ?? "";
      if (
        previousImagePath &&
        image_url &&
        image_url === previousImagePath
      ) {
        showErrorAlert(
          "New image was not saved — the server returned the previous file path. Please try again."
        );
        return;
      }
      console.log("[ImageUploadDebug] Edit Service — upload done", {
        previousImagePath,
        image_url,
        pathChanged: previousImagePath !== image_url,
        usedReplace: imageUpload.usedReplace,
      });
    } else {
      console.log("[ImageUploadDebug] Edit Service — Update clicked (no new file)", {
        serviceId: service?._id,
        serviceImagePath,
        fileInputsCount: fileInputs.length,
      });
    }

    if (!isEditable && image_url === "") {
      showErrorAlert("Please select image");
      return;
    }

    const mdType = extractMinDepositTypeKey(
      String((data as any).min_deposit_type ?? "")
    );
    const mdRaw = (data as any).min_deposit_value;
    const mdParsed =
      mdRaw === "" || mdRaw === undefined || mdRaw === null
        ? 0
        : Number(mdRaw);

    /** RHF submit `data` can omit fields only touched via `setValue` (e.g. CustomRadioSelection). */
    const moderationStatus =
      isEditable && isRequestService
        ? ((data as any).approval_status ??
            getValues("approval_status" as any) ??
            mapApprovalStatusFromService(service))
        : undefined;

    const subcategoryId =
      String(
        (data as any).subcategory_id ??
          getValues("subcategory_id" as any) ??
          lockCategory?.subcategoryId ??
          ""
      ).trim() ||
      (!isEditable && subCategories.length === 1
        ? subCategories[0].value
        : "");
    if (!subcategoryId) {
      showErrorAlert("Please select sub category");
      return;
    }
    const subcategoryName =
      subCategories.find((s) => s.value === subcategoryId)?.label ||
      String(lockCategory?.subcategoryLabel ?? "").trim() ||
      serviceSubCategoryLabelFromRecord(service);

    const payload = {
      name: data.name,
      desc: data.desc,
      tax: Number((data as any).tax),
      commission: Number((data as any).commission),
      min_deposit_type: mdType,
      payment_type: mdType,
      min_deposit_value:
        mdType === "per_consultancy" ? mdParsed : 0,
      minimum_deposit: mdParsed,
      is_active:
        isEditable && isRequestService
          ? moderationStatus !== "rejected"
          : hideStatusInView && service?.is_active !== undefined
          ? Boolean(service.is_active)
          : isTruthyFormBool(data.is_active),
      ...(isEditable &&
        isRequestService &&
        moderationStatus &&
        moderationStatus !== "pending" && {
          is_rejected: moderationStatus === "rejected",
        }),
      ...(isEditable &&
        isRequestService &&
        moderationStatus && {
          approval_status: moderationStatus,
        }),
      ...(isEditable &&
        isRequestService && {
          rejection_reason:
            moderationStatus === "rejected"
              ? (data.rejection_reason ?? "").trim()
              : "",
        }),
      category_id: resolvedCategoryId,
      subcategory_id: subcategoryId,
      subcategory_name: subcategoryName,
      direct_order: directOrderOn,
      ...(image_url !== "" && { image_url }),
    };

    console.log("[ImageUploadDebug] Edit Service — service PUT payload", {
      serviceId: service?._id,
      includesImageUrl: "image_url" in payload,
      image_url: (payload as { image_url?: string }).image_url,
      payload,
    });

    let responseService;

    if (isEditable) {
      if (!service?._id) {
        showErrorAlert("Unable to update. ID is missing.");
        return;
      }

      responseService = await createOrUpdateService(payload, true, service._id);
    } else {
      responseService = await createOrUpdateService(payload, false);
    }

    if (responseService) {
      onClose();
      onRefreshData();
    }
    };

    if (paymentTypeChanged && partnerCount > 0) {
      openConfirmDialog(
        "Updating Payment type may effect partner service prices. Do you want to continue?",
        "Update",
        "Cancel",
        () => {
          void persistService();
        }
      );
      return;
    }

    await persistService();
  };

  return (
    <Modal
      show={true}
      size="lg"
      onHide={onClose}
      centered
      dialogClassName="custom-big-modal"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {localViewMode
            ? "Service Details"
            : isEditable
            ? "Edit Service"
            : "Add Service"}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>

      <Modal.Body className="px-4 pb-4 pt-0">
        {localViewMode && service ? (
          <section
            className="custom-other-details modal-readonly-details"
            style={{ padding: "14px 16px", borderRadius: 12 }}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="mb-0">Service Information</h3>
              {isEditable && (
                <i
                  className="bi bi-pencil-fill fs-6 text-danger"
                  style={{ cursor: "pointer" }}
                  role="button"
                  aria-label="Edit service"
                  onClick={() => setLocalViewMode(false)}
                />
              )}
            </div>

            <Row className="g-3 align-items-start">
              <Col xs={12} md={6}>
                <FullDetailsRow title="Service Name" value={service.name ?? "-"} />
              </Col>
              <Col xs={12} md={6}>
                <FullDetailsRow
                  title="Sub Category"
                  value={serviceSubCategoryLabelFromRecord(service) || "-"}
                />
              </Col>
              <Col xs={12} md={6}>
                <FullDetailsRow
                  title="Category"
                  value={
                    (service as any).category_name ??
                    categoryLabelForView ??
                    service.category_id ??
                    "-"
                  }
                />
              </Col>
              <Col xs={12} md={6}>
                <FullDetailsRow
                  title="Tax"
                  value={
                    service.tax !== undefined && service.tax !== null
                      ? `${service.tax}${AppConstant.percentageSymbol}`
                      : "-"
                  }
                />
              </Col>
              <Col xs={12} md={6}>
                <FullDetailsRow
                  title="Commission"
                  value={
                    service.commission !== undefined &&
                    service.commission !== null
                      ? `${service.commission}${AppConstant.percentageSymbol}`
                      : "-"
                  }
                />
              </Col>
              <Col xs={12} md={6}>
                <FullDetailsRow title="Payment type" value={paymentTypeForView} />
              </Col>
              <Col xs={12} md={6}>
                <FullDetailsRow
                  title="Direct order"
                  value={serviceDirectOrderOn(service) ? "On" : "Off"}
                />
              </Col>
              <Col xs={12} md={6}>
                <FullDetailsRow title="Min deposit" value={minDepositForView} />
              </Col>
              {!hideStatusInView ? (
                isCatalogRequestRow(service as unknown as Record<string, unknown>) ? (
                  <>
                    <Col xs={12} md={6}>
                      <FullDetailsRow
                        title="Approval status"
                        value={
                          <span
                            style={{
                              color: requestApprovalStatusColor(
                                mapApprovalStatusFromService(service)
                              ),
                              fontWeight: 600,
                            }}
                          >
                            {requestApprovalStatusLabel(
                              mapApprovalStatusFromService(service)
                            )}
                          </span>
                        }
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <FullDetailsRow
                        title="Requested by"
                        value={formatRequestedBy((service as any).requested_by)}
                      />
                    </Col>
                    {String((service as any)?.rejection_reason ?? "").trim() ? (
                      <Col xs={12}>
                        <FullDetailsRow
                          title="Rejection reason"
                          value={String(
                            (service as any).rejection_reason ?? ""
                          ).trim()}
                        />
                      </Col>
                    ) : null}
                  </>
                ) : (
                  <Col xs={12} md={6}>
                    <FullDetailsRow
                      title="Status"
                      value={service.is_active ? "Active" : "Inactive"}
                    />
                  </Col>
                )
              ) : null}
            </Row>

            <Row className="g-3 mt-1">
              <Col xs={12}>
                <h3>Description</h3>
                <div
                  className="mb-0 w-100"
                  title={String(service.desc ?? "").trim() || undefined}
                  style={{
                    color: "var(--content-txt-color)",
                    fontSize: "0.95rem",
                    lineHeight: 1.45,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                  }}
                >
                  {service.desc?.trim() ? service.desc : "-"}
                </div>
              </Col>
            </Row>

            {(serviceImagePath || servicePartners.length > 0) ? (
              <div
                className="d-flex flex-wrap mt-3 align-items-start"
                style={{ gap: 16 }}
              >
                <div style={{ flex: "0 0 auto" }}>
                  <p
                    className="mb-2"
                    style={{ color: "var(--primary-color)", fontWeight: 600 }}
                  >
                    Service image
                  </p>
                  {serviceImagePath ? (
                    <img
                      src={resolveExistingImageSrc(serviceImagePath)}
                      alt=""
                      width={SERVICE_DETAIL_IMAGE_PX}
                      height={SERVICE_DETAIL_IMAGE_PX}
                      style={{
                        width: SERVICE_DETAIL_IMAGE_PX,
                        height: SERVICE_DETAIL_IMAGE_PX,
                        borderRadius: 8,
                        objectFit: "cover",
                        border: "1px solid var(--txtfld-border)",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      className="d-flex align-items-center justify-content-center text-muted"
                      style={{
                        width: SERVICE_DETAIL_IMAGE_PX,
                        height: SERVICE_DETAIL_IMAGE_PX,
                        borderRadius: 8,
                        border: "1px dashed var(--txtfld-border)",
                        fontSize: 13,
                      }}
                    >
                      No image
                    </div>
                  )}
                </div>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <p
                    className="mb-2"
                    style={{ color: "var(--primary-color)", fontWeight: 600 }}
                  >
                    Partners
                  </p>
                  <div
                    style={{
                      height: SERVICE_DETAIL_IMAGE_PX,
                      overflowY: "auto",
                      border: "1px solid var(--txtfld-border)",
                      borderRadius: 8,
                      backgroundColor: "var(--bg-color)",
                    }}
                  >
                    {servicePartners.length === 0 ? (
                      <div className="text-muted small px-3 py-3">—</div>
                    ) : (
                      servicePartners.map((p, index) => (
                        <div
                          key={p.id || `${p.name}-${index}`}
                          className="d-flex align-items-start"
                          style={{
                            gap: 10,
                            padding: "10px 12px",
                            borderBottom:
                              index < servicePartners.length - 1
                                ? "1px solid var(--txtfld-border)"
                                : undefined,
                          }}
                        >
                          {p.profile_url &&
                          !brokenPartnerAvatarIds.has(p.id || p.profile_url) ? (
                            <img
                              src={resolveExistingImageSrc(p.profile_url)}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={() => {
                                const key = p.id || p.profile_url;
                                setBrokenPartnerAvatarIds((prev) => {
                                  const next = new Set(prev);
                                  next.add(key);
                                  return next;
                                });
                              }}
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: "50%",
                                objectFit: "cover",
                                flexShrink: 0,
                                border: "1px solid var(--txtfld-border)",
                              }}
                            />
                          ) : (
                            <div
                              className="d-flex align-items-center justify-content-center flex-shrink-0"
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: "50%",
                                backgroundColor: "var(--primary-color)",
                                color: "#fff",
                                fontSize: 14,
                                fontWeight: 600,
                              }}
                            >
                              {(p.name || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              className="d-flex align-items-start justify-content-between"
                              style={{ gap: 8 }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                {p.id ? (
                                  <button
                                    type="button"
                                    className="p-0 m-0 border-0 bg-transparent text-start text-decoration-underline"
                                    style={{
                                      display: "block",
                                      width: "100%",
                                      fontSize: 14,
                                      fontWeight: 600,
                                      color: "var(--primary-color)",
                                      lineHeight: 1.3,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      cursor: "pointer",
                                    }}
                                    onClick={() => {
                                      void import(
                                        "../../components/partner/PartnerDetailsDialog"
                                      ).then((mod) => {
                                        mod.default.show(p.id, () => {});
                                      });
                                    }}
                                  >
                                    {p.name}
                                  </button>
                                ) : (
                                  <span
                                    className="fw-semibold d-block"
                                    style={{ fontSize: 14, lineHeight: 1.3 }}
                                  >
                                    {p.name}
                                  </span>
                                )}
                                <div
                                  className="text-muted"
                                  style={{
                                    fontSize: 12,
                                    lineHeight: 1.35,
                                    marginTop: 2,
                                  }}
                                >
                                  Franchise: {p.franchiseName}
                                </div>
                              </div>
                              <span
                                className="flex-shrink-0"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  backgroundColor: "#E8C547",
                                  color: "#3d2e00",
                                  borderRadius: 6,
                                  padding: "5px 8px 3px",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  lineHeight: 1,
                                  marginTop: 2,
                                }}
                              >
                                <i
                                  className="bi bi-star-fill"
                                  style={{ fontSize: 11, color: "#7a5a00" }}
                                  aria-hidden
                                />
                                {p.rating != null
                                  ? p.rating.toFixed(
                                      Number.isInteger(p.rating) ? 0 : 2
                                    )
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <form
            noValidate
            name="profile-form"
            id="profile-form"
            onSubmit={handleSubmit(onSubmitEvent)}
          >
            <Row>
              <Col md={6}>
                <CustomFormInput
                  label="Service"
                  controlId="name"
                  placeholder="Enter Service Name"
                  register={register}
                  error={errors.name}
                  asCol={false}
                  validation={{ required: "Service name is required" }}
                />
              </Col>

              <Col md={6}>
                <CustomFormSelect
                  label="Sub Category"
                  controlId="subcategory"
                  options={subCategories}
                  register={register as unknown as UseFormRegister<any>}
                  fieldName="subcategory_id"
                  error={(errors as any).subcategory_id}
                  asCol={false}
                  placeholder="Select"
                  requiredMessage="Please select sub category"
                  menuPortal
                  defaultValue={String(subcategoryIdWatch ?? "").trim()}
                  onMenuOpen={() => {
                    void loadSubCategoriesForSelectedCategory();
                  }}
                  setValue={(name: string, value: any) => {
                    setValue(name as any, value, {
                      shouldValidate: true,
                      shouldDirty: true,
                      shouldTouch: true,
                    });
                  }}
                />
              </Col>

              {!lockCategory ? (
                <Col md={6}>
                  <CustomFormSelect
                    label="Category"
                    controlId="category"
                    options={categories}
                    register={register as unknown as UseFormRegister<any>}
                    fieldName="category_id"
                    error={errors.category_id}
                    asCol={false}
                    requiredMessage="Please select category"
                    defaultValue={String(categoryIdWatch ?? "").trim()}
                    setValue={(name: string, value: any) => {
                      const nextCategoryId = String(value ?? "").trim();
                      const prevCategoryId = String(
                        getValues("category_id") ?? ""
                      ).trim();
                      setValue(name as any, value, {
                        shouldValidate: true,
                        shouldDirty: true,
                        shouldTouch: true,
                      });
                      if (nextCategoryId !== prevCategoryId) {
                        setValue("subcategory_id" as any, "", {
                          shouldValidate: false,
                          shouldDirty: true,
                        });
                      }
                    }}
                  />
                </Col>
              ) : (
                <Col md={6}>
                  <CustomFormInput
                    label="Category"
                    controlId="locked-category"
                    placeholder=""
                    value={lockCategory.label || "Selected Category"}
                    register={register}
                    error={undefined as any}
                    asCol={false}
                    isEditable={false}
                  />
                </Col>
              )}

              <Col md={6} className="mb-3">
                <label className="fw-medium mb-1">
                  <FieldLabelText label="Tax" required />
                </label>
                <div className="custom-form-group">
                  <div className="input-group">
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`form-control ${
                        (errors as any).tax ? "is-invalid" : ""
                      }`}
                      placeholder="Enter Tax"
                      onInput={(e) => {
                        const target = e.currentTarget;
                        target.value = sanitizePercentageText(target.value);
                      }}
                      {...register("tax" as any, {
                        required: "Tax is required",
                        validate: (v: string) => {
                          if (!isValidPercentageString(v))
                            return "Enter 0–100 (decimals allowed, e.g. 4.5)";
                          return true;
                        },
                      })}
                    />
                    <span className="input-group-text">%</span>
                  </div>
                  {(errors as any).tax && (
                    <div className="invalid-feedback d-block">
                      {(errors as any).tax?.message}
                    </div>
                  )}
                </div>
              </Col>

              <Col md={6}>
                <label className="fw-medium mb-1">
                  <FieldLabelText label="Commission" required />
                </label>
                <div className="custom-form-group">
                  <div className="input-group">
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`form-control ${
                        (errors as any).commission ? "is-invalid" : ""
                      }`}
                      placeholder="Enter Commission"
                      onInput={(e) => {
                        const target = e.currentTarget;
                        target.value = sanitizePercentageText(target.value);
                      }}
                      {...register("commission" as any, {
                        required: "Commission is required",
                        validate: (v: string) => {
                          if (!isValidPercentageString(v))
                            return "Enter 0–100 (decimals allowed, e.g. 4.5)";
                          return true;
                        },
                      })}
                    />
                    <span className="input-group-text">%</span>
                  </div>
                  {(errors as any).commission && (
                    <div className="invalid-feedback d-block">
                      {(errors as any).commission?.message}
                    </div>
                  )}
                </div>
              </Col>

              <Col md={6} className="mt-3">
                <CustomFormSelect
                  label="Payment Type"
                  controlId="Payment Type"
                  options={[
                    { value: "per_hour", label: "Per Hour" },
                    { value: "per_day", label: "Per Day" },
                    { value: "per_month", label: "Per Month" },
                    { value: "per_consultancy", label: "Per Consultancy" },
                  ]}
                  register={register as unknown as UseFormRegister<any>}
                  fieldName="min_deposit_type"
                  error={(errors as any).min_deposit_type}
                  asCol={false}
                  requiredMessage="Please select payment type"
                  defaultValue={mapPaymentTypeToMinDepositType(service)}
                  setValue={(name: string, value: any) => {
                    const next = String(value ?? "");
                    const prev = prevPaymentTypeRef.current;
                    prevPaymentTypeRef.current = next;

                    setValue(name as any, value, {
                      shouldValidate: true,
                      shouldDirty: true,
                      shouldTouch: true,
                    });

                    // Only clear when leaving per_consultancy. Initial select sync calls this with
                    // e.g. `per_month` and would otherwise erase API `minimum_deposit` / form reset.
                    if (prev === "per_consultancy" && next !== "per_consultancy") {
                      setValue("min_deposit_value" as any, "" as any, {
                        shouldValidate: true,
                        shouldDirty: true,
                        shouldTouch: true,
                      });
                    }
                  }}
                />
              </Col>

              <Col md={6} className="mt-3">
                <label className="fw-medium mb-1">Minimum Deposit</label>
                <div className="custom-form-group">
                  <div className="input-group">
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`form-control ${
                        (errors as any).min_deposit_value ? "is-invalid" : ""
                      }`}
                      placeholder="Enter Minimum Deposit"
                      onInput={(e) => {
                        const target = e.currentTarget;
                        target.value = sanitizePercentageText(target.value);
                      }}
                      {...register("min_deposit_value" as any, {
                        validate: (v: string, formValues: any) => {
                          const isEmpty =
                            v === undefined ||
                            v === null ||
                            String(v).trim() === "";
                          if (
                            formValues.min_deposit_type === "per_consultancy"
                          ) {
                            if (isEmpty) return "Minimum deposit is required";
                          } else if (isEmpty) {
                            return true;
                          }
                          if (!isValidPercentageString(v))
                            return "Enter 0–100 (decimals allowed, e.g. 4.5)";
                          return true;
                        },
                      })}
                    />
                    <span className="input-group-text">%</span>
                  </div>
                  {(errors as any).min_deposit_value && (
                    <div className="invalid-feedback d-block">
                      {(errors as any).min_deposit_value?.message}
                    </div>
                  )}
                </div>
              </Col>

              <Col md={6} className="mt-3">
                <style>{`
                  .service-direct-order-switch.franchise-status-switch .form-check-input {
                    width: 2.55em;
                    height: 1.35em;
                  }
                `}</style>
                <div
                  aria-hidden="true"
                  className="fw-medium mb-1"
                  style={{ visibility: "hidden", lineHeight: "normal" }}
                >
                  Direct order
                </div>
                <div
                  className="d-flex align-items-center"
                  style={{ gap: 10, minHeight: 35 }}
                >
                  <label
                    htmlFor="service-direct-order"
                    className="fw-medium mb-0"
                  >
                    Direct order
                  </label>
                  <Form.Check
                    type="switch"
                    id="service-direct-order"
                    className={`franchise-status-switch service-direct-order-switch mb-0${
                      directOrderOn ? " franchise-status-switch--on" : ""
                    }`}
                    checked={directOrderOn}
                    aria-label={
                      directOrderOn
                        ? "Direct order on"
                        : "Direct order off"
                    }
                    onChange={(e) =>
                      setValue("direct_order" as any, e.target.checked, {
                        shouldDirty: true,
                        shouldTouch: true,
                      })
                    }
                  />
                </div>
              </Col>

              <Col md={8}>
                <label className="form-label fw-medium mb-2 d-block">
                  <FieldLabelText label="Service image" required />
                </label>
                <CustomImageUploader
                  label=""
                  hideLabel
                  maxFiles={1}
                  isEditable={isEditable}
                  existingImages={serviceImagePath ? [serviceImagePath] : []}
                  onFileChange={(files, replaceUrlsFromUploader) => {
                    setFileInputs(files);
                    setReplaceUrl(
                      normalizeReplaceStoragePaths(replaceUrlsFromUploader)
                    );
                  }}
                />
              </Col>

              {isEditable && isRequestService ? (
                <Col md={6} className="mb-3">
                  <CustomRadioSelection
                    label="Approval status"
                    name="approval_status"
                    options={[
                      { label: "Pending", value: "pending" },
                      { label: "Approved", value: "approved" },
                      { label: "Rejected", value: "rejected" },
                    ]}
                    defaultValue={approvalStatusDefaultForEdit}
                    isEditable={isEditable}
                    setValue={setValue}
                  />
                </Col>
              ) : isEditable && !hideStatusInView ? (
                <Col md={6} className="mb-3">
                  <CustomRadioSelection
                    label="Status"
                    name="is_active"
                    options={getStatusOptions()}
                    defaultValue={
                      service?.is_active !== undefined
                        ? String(service.is_active)
                        : "true"
                    }
                    isEditable={isEditable}
                    setValue={setValue}
                  />
                </Col>
              ) : null}
              {isEditable && isRequestService && approvalStatus === "rejected" && (
                <Col md={12}>
                  <CustomFormInput
                    label="Rejection Note"
                    controlId="rejection_reason"
                    placeholder="Enter rejection note"
                    register={register}
                    error={(errors as any).rejection_reason}
                    asCol={false}
                    validation={{
                      validate: (value: string) =>
                        value?.trim() ? true : "Rejection note is required",
                    }}
                    as="textarea"
                    rows={3}
                  />
                </Col>
              )}
              <Col md={12}>
                <CustomFormInput
                  label="Description"
                  controlId="desc"
                  placeholder="Enter Service Description"
                  register={register}
                  error={errors.desc}
                  asCol={false}
                  validation={{ required: "Service description is required" }}
                  as="textarea"
                  rows={4}
                />
              </Col>
            </Row>

            <Row className="mt-4">
              <Col
                xs={12}
                className="text-center d-flex justify-content-end gap-3 "
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
        )}
      </Modal.Body>
    </Modal>
  );
};

function showAddEditServiceDialog(
  isEditable: boolean,
  service: ServiceModel | null,
  onRefreshData: () => void,
  isViewMode: boolean = false,
  lockCategory?: {
    id?: string;
    label?: string;
    subcategoryId?: string;
    subcategoryLabel?: string;
  },
  hideStatusInView: boolean = false
) {
  openDialog("service-details-modal", (close) => (
    <AddEditServiceDialog
      isEditable={isEditable}
      isViewMode={isViewMode}
      service={service}
      lockCategory={lockCategory}
      hideStatusInView={hideStatusInView}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
}

AddEditServiceDialog.show = showAddEditServiceDialog;

export default AddEditServiceDialog;
export { showAddEditServiceDialog };
