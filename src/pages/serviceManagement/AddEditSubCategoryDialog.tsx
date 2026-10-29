import React, { useEffect, useMemo, useRef, useState } from "react";
import { useForm, UseFormRegister } from "react-hook-form";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomMultiSelect from "../../components/CustomMultiSelect";
import { showErrorAlert } from "../../lib/global/alertHelper";
import { showAddEditServiceDialog } from "./AddEditServiceDialog";
import CustomCloseButton from "../../components/CustomCloseButton";
import { CustomFormInput } from "../../components/CustomFormInput";
import CustomFormSelect from "../../components/CustomFormSelect";
import { CustomRadioSelection } from "../../components/CustomRadioSelection";
import CustomImageUploader, {
  resolveExistingImageSrc,
} from "../../components/CustomImageUploader";
import { FieldLabelText } from "../../components/RequiredFieldMark";
import {
  formatDate,
  formatRequestedBy,
  FullDetailsRow,
  isCatalogRequestRow,
  mapApprovalStatusFromRecord,
  requestApprovalStatusLabel,
} from "../../helper/utility";
import {
  documentUploadFailureMessage,
  uploadDocumentImages,
} from "../../services/documentUploadService";
import { openDialog } from "../../lib/global/DialogManager";
import { apiRequest } from "../../lib/global/remote/apiHelper";
import { fetchCategoryDropDown } from "../../services/categoryService";
import {
  fetchServiceDropDown,
  fetchServicesForCategoryDialog,
} from "../../services/servicesService";

const SELECT_ALL_OPTION = "select-all";
const CREATE_SUBCATEGORY_PATH = "/subcategory/create";
const UPDATE_SUBCATEGORY_PATH = (id: string) => `/subcategory/update/${id}`;

function extractCreatedSubCategoryId(data: unknown): string {
  const fromRecord = (row: Record<string, unknown> | null): string => {
    if (!row) return "";
    return String(
      row._id ?? row.id ?? row.subcategory_id ?? row.sub_category_id ?? ""
    ).trim();
  };
  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  const root = asRecord(data);
  if (!root) return "";
  const nested = asRecord(root.data);
  const nestedRecord = asRecord(nested?.data);
  const candidate = asRecord(
    root.record ??
      root.subcategory ??
      nested?.record ??
      nested?.subcategory ??
      nestedRecord?.record ??
      nestedRecord?.subcategory ??
      (root._id || root.id ? root : undefined) ??
      (nested && (nested._id || nested.id) ? nested : undefined)
  );
  return (
    fromRecord(candidate) ||
    fromRecord(root) ||
    fromRecord(nested) ||
    fromRecord(nestedRecord)
  );
}

async function persistSubCategoryServiceIds(input: {
  id: string;
  name: string;
  description: string;
  category_id: string;
  service_ids: string[];
  is_active?: boolean;
}): Promise<boolean> {
  const id = String(input.id ?? "").trim();
  if (!id) return false;
  const response = await apiRequest(
    UPDATE_SUBCATEGORY_PATH(id),
    "PUT",
    {
      name: input.name,
      desc: input.description,
      description: input.description,
      category_id: input.category_id,
      service_ids: input.service_ids ?? [],
      is_active: input.is_active !== false,
    },
    false,
    false,
    false,
    true
  );
  return Boolean(response.success);
}


const SUBCATEGORY_VIEW_LABELS: Record<string, string> = {
  name: "Sub Category Name",
  category_name: "Category",
  category_id: "Category",
  desc: "Description",
  description: "Description",
  is_active: "Status",
  franchise_active: "Franchise Status",
  approval_status: "Approval Status",
  is_request: "Request",
  rejection_reason: "Rejection Reason",
  requested_by: "Requested By",
  created_at: "Created",
  createdAt: "Created",
  updated_at: "Updated",
  updatedAt: "Updated",
  services: "Services",
  service_ids: "Services",
};

const SUBCATEGORY_VIEW_SKIP = new Set([
  "_id",
  "id",
  "__v",
  "deleted_at",
  "image",
  "image_url",
  "category",
  "franchise_active",
]);

function subcategoryFieldLabel(key: string): string {
  return (
    SUBCATEGORY_VIEW_LABELS[key] ??
    key
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

function subcategoryFieldText(key: string, value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") {
    if (key === "is_active" || key === "franchise_active") {
      return value ? "Active" : "Inactive";
    }
    if (key === "is_request") return value ? "Yes" : "No";
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (/(_at|At)$/.test(key)) {
      const formatted = formatDate(text);
      return formatted === "-" ? text : formatted;
    }
    return text;
  }
  if (Array.isArray(value)) {
    const names = value
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") {
          return String(item).trim();
        }
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return String(record.name ?? record.label ?? record._id ?? "").trim();
        }
        return "";
      })
      .filter(Boolean);
    return names.length > 0 ? names.join(", ") : null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name = String(record.name ?? record.label ?? "").trim();
    return name || null;
  }
  return null;
}

function subcategoryViewRows(
  detail: SubCategoryDetails
): { key: string; label: string; value: string }[] {
  const source = detail as unknown as Record<string, unknown>;
  const rows: { key: string; label: string; value: string }[] = [];
  const seenLabels = new Set<string>();
  const keys = [
    "name",
    "category_name",
    "is_active",
    "approval_status",
    "is_request",
    "description",
    "desc",
    "services",
    "service_ids",
    "rejection_reason",
    "requested_by",
    "created_at",
    "createdAt",
    "updated_at",
    "updatedAt",
    ...Object.keys(source),
  ];
  for (const key of keys) {
    if (SUBCATEGORY_VIEW_SKIP.has(key) || seenLabels.has(key)) continue;
    if (key === "desc" && source.description) continue;
    if (key === "description" && !source.description && source.desc) continue;
    if (key === "service_ids" && Array.isArray(source.services) && source.services.length) {
      continue;
    }
    if (key === "createdAt" && source.created_at) continue;
    if (key === "updatedAt" && source.updated_at) continue;
    if (key === "category_id" && source.category_name) continue;
    const value = subcategoryFieldText(key, source[key]);
    if (!value) continue;
    const label = subcategoryFieldLabel(key);
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    seenLabels.add(key);
    rows.push({ key, label, value });
  }
  return rows;
}

export type SubCategoryDetails = {
  _id: string;
  name: string;
  category_name: string;
  category_id?: string;
  is_active: boolean;
  desc?: string;
  image_url?: string;
  service_ids?: string[];
};

/** Fields sent as multipart form-data to `POST /subcategory/create`. */
export type SubCategorySavePayload = {
  name: string;
  description: string;
  category_id: string;
  category_name: string;
  service_ids: string[];
  image: File | null;
  /** Request row already saved via `PUT /subcategory/update/:id`. */
  requestModerationHandled?: boolean;
};

type SubCategoryFormValues = {
  name: string;
  category_id: string;
  desc: string;
  approval_status?: "pending" | "approved" | "rejected";
  rejection_reason?: string;
};

type Props = {
  subCategory: SubCategoryDetails | null;
  isViewMode?: boolean;
  onClose: () => void;
  /** Category name typed on Add Category, shown in the Category field. */
  presetCategoryName?: string;
  /** Existing category id — used for POST /subcategory/create (no category/create). */
  presetCategoryId?: string;
  onSaved?: (
    saved: SubCategorySavePayload
  ) => void | boolean | Promise<void | boolean>;
};

const AddEditSubCategoryDialog: React.FC<Props> & {
  show: (
    subCategory?: SubCategoryDetails | null,
    isViewMode?: boolean,
    options?: {
      presetCategoryName?: string;
      presetCategoryId?: string;
      onSaved?: (
        saved: SubCategorySavePayload
      ) => void | boolean | Promise<void | boolean>;
    }
  ) => void;
} = ({
  subCategory,
  isViewMode = false,
  onClose,
  presetCategoryName = "",
  presetCategoryId = "",
  onSaved,
}) => {
  const [localViewMode, setLocalViewMode] = useState(isViewMode);
  const isEditable = Boolean(subCategory);
  const [serviceIds, setServiceIds] = useState<string[]>(
    subCategory?.service_ids ?? []
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [serviceChoices, setServiceChoices] = useState<
    { value: string; label: string }[]
  >([]);
  /** Set after POST /subcategory/create from + Add Service so main Add does not create twice. */
  const createdViaAddServiceRef = useRef(false);
  const createdSubCategoryIdRef = useRef(String(subCategory?._id ?? "").trim());
  const serviceIdsRef = useRef<string[]>(serviceIds);
  serviceIdsRef.current = serviceIds;
  const serviceChoicesRef = useRef(serviceChoices);
  serviceChoicesRef.current = serviceChoices;

const serviceOptions = useMemo(
  () => [
    { value: SELECT_ALL_OPTION, label: "Select All" },
    ...serviceChoices,
  ],
  [serviceChoices]
);

const selectedServiceOptions = useMemo(
  () => serviceChoices.filter((s) => serviceIds.includes(s.value)),
  [serviceChoices, serviceIds]
);

const handleServiceSelection = (
  selectedOptions: { value: string; label: string }[]
) => {
  const isSelectAll = selectedOptions.some(
    (o) => o.value === SELECT_ALL_OPTION
  );
  if (isSelectAll) {
    const allSelected =
      serviceChoices.length > 0 && serviceIds.length === serviceChoices.length;
    setServiceIds(allSelected ? [] : serviceChoices.map((s) => s.value));
    return;
  }
  setServiceIds(selectedOptions.map((o) => o.value));
};

  const presetCategory = String(presetCategoryName ?? "").trim();
  const presetCategoryIdValue = String(presetCategoryId ?? "").trim();
  const initialCategoryName = subCategory?.category_name || presetCategory || "";

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<SubCategoryFormValues>({
    mode: "onSubmit",
    defaultValues: {
      name: subCategory?.name ?? "",
      category_id:
        subCategory?.category_id ?? presetCategoryIdValue ?? "",
      desc: subCategory?.desc ?? "",
      approval_status: mapApprovalStatusFromRecord(
        subCategory as unknown as Record<string, unknown>
      ),
      rejection_reason: String(
        (subCategory as { rejection_reason?: unknown } | null)?.rejection_reason ??
          ""
      ),
    },
  });

  const isRequestSubCategory = isCatalogRequestRow(
    subCategory as unknown as Record<string, unknown>
  );
  const approvalStatusWatch = watch("approval_status");
  const approvalStatusDefaultForEdit = mapApprovalStatusFromRecord(
    subCategory as unknown as Record<string, unknown>
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const categories = await fetchCategoryDropDown();
      if (cancelled) return;
      setCategoryOptions(categories.filter((option) => option.value));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCategoryId = String(watch("category_id") ?? "").trim();

  useEffect(() => {
    if (categoryOptions.length === 0) return;
    const current = String(getValues("category_id") ?? "").trim();
    if (categoryOptions.some((option) => option.value === current)) return;
    if (presetCategoryIdValue) {
      const byId = categoryOptions.find(
        (option) => option.value === presetCategoryIdValue
      );
      if (byId) {
        setValue("category_id", byId.value, { shouldValidate: false });
        return;
      }
    }
    const wanted = String(
      subCategory?.category_id ||
        subCategory?.category_name ||
        presetCategoryIdValue ||
        presetCategory ||
        ""
    )
      .trim()
      .toLowerCase();
    if (!wanted) return;
    const match = categoryOptions.find(
      (option) =>
        option.value.trim().toLowerCase() === wanted ||
        option.label.trim().toLowerCase() === wanted
    );
    if (match) {
      setValue("category_id", match.value, { shouldValidate: false });
    }
  }, [
    categoryOptions,
    getValues,
    presetCategory,
    presetCategoryIdValue,
    setValue,
    subCategory,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cid = String(
        selectedCategoryId ||
          presetCategoryIdValue ||
          subCategory?.category_id ||
          ""
      ).trim();
      const services = cid
        ? await fetchServicesForCategoryDialog({
            mode: isEditable ? "edit" : "add",
            categoryId: cid,
          })
        : await fetchServiceDropDown();
      if (cancelled) return;
      setServiceChoices(
        services
          .filter((service) => service.value)
          .map((service) => ({
            value: service.value,
            label: service.label || service.value,
          }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isEditable,
    presetCategoryIdValue,
    selectedCategoryId,
    subCategory?.category_id,
  ]);

  const lockedCategoryLabel =
    categoryOptions.find((option) => option.value === selectedCategoryId)
      ?.label || initialCategoryName;

  const openAddServiceFromSubCategory = async () => {
    const name = String(getValues("name") ?? "").trim();
    const description = String(getValues("desc") ?? "").trim();
    const categoryId = String(getValues("category_id") ?? "").trim();
    const matchedCategory = categoryOptions.find(
      (option) => option.value === categoryId
    );
    if (!name) {
      showErrorAlert("Sub Category name is required");
      return;
    }
    if (!matchedCategory) {
      showErrorAlert("Please select category first");
      return;
    }
    if (!description) {
      showErrorAlert("Description is required");
      return;
    }
    if (!isEditable && !imageFile && !createdViaAddServiceRef.current) {
      showErrorAlert("Please select image");
      return;
    }

    // + Add Service → POST /subcategory/create first, then open Add Service
    if (!isEditable && !createdViaAddServiceRef.current) {
      const body = new FormData();
      body.append("name", name);
      body.append("description", description);
      body.append("desc", description);
      body.append("category_id", matchedCategory.value);
      const currentServiceIds = serviceIdsRef.current ?? [];
      body.append("service_ids", JSON.stringify(currentServiceIds));
      currentServiceIds.forEach((id) => body.append("service_ids", id));
      if (imageFile) {
        body.append("image", imageFile);
      }
      const response = await apiRequest(
        CREATE_SUBCATEGORY_PATH,
        "POST",
        body,
        true
      );
      if (!response.success) return;
      createdViaAddServiceRef.current = true;
      const createdId = extractCreatedSubCategoryId(response.data);
      if (createdId) createdSubCategoryIdRef.current = createdId;
      if (createdId && currentServiceIds.length > 0) {
        await persistSubCategoryServiceIds({
          id: createdId,
          name,
          description,
          category_id: matchedCategory.value,
          service_ids: currentServiceIds,
          is_active: true,
        });
      }
      void onSaved?.({
        name,
        description,
        category_id: matchedCategory.value,
        category_name: matchedCategory.label,
        service_ids: currentServiceIds,
        image: imageFile,
      });
    }

    const categoryLabel =
      matchedCategory.label || lockedCategoryLabel || "Selected Category";
    const previousIds = new Set(
      serviceChoicesRef.current.map((s) => s.value)
    );
    const subcategoryId = String(
      createdSubCategoryIdRef.current || subCategory?._id || ""
    ).trim();
    showAddEditServiceDialog(
      false,
      null,
      async () => {
        const services = await fetchServicesForCategoryDialog({
          mode: "edit",
          categoryId: matchedCategory.value,
        });
        const nextChoices = services
          .filter((service) => service.value)
          .map((service) => ({
            value: service.value,
            label: service.label || service.value,
          }));
        setServiceChoices(nextChoices);
        const newlyAdded = nextChoices
          .filter((s) => !previousIds.has(s.value))
          .map((s) => s.value);
        const nextServiceIds = Array.from(
          new Set([...(serviceIdsRef.current ?? []), ...newlyAdded])
        );
        setServiceIds(nextServiceIds);
        const linkedSubCategoryId = String(
          createdSubCategoryIdRef.current || subCategory?._id || ""
        ).trim();
        if (linkedSubCategoryId && nextServiceIds.length > 0) {
          await persistSubCategoryServiceIds({
            id: linkedSubCategoryId,
            name,
            description,
            category_id: matchedCategory.value,
            service_ids: nextServiceIds,
            is_active: subCategory?.is_active !== false,
          });
        }
      },
      false,
      {
        id: matchedCategory.value,
        label: categoryLabel,
        ...(subcategoryId
          ? { subcategoryId, subcategoryLabel: name }
          : {}),
      }
    );
  };

  const addServiceMenuFooter = (
    <button
      type="button"
      className="w-100 text-start border-0 bg-transparent py-2 px-3"
      style={{
        color: "var(--primary-color)",
        fontWeight: 600,
        fontSize: 14,
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={() => void openAddServiceFromSubCategory()}
    >
      + Add Service
    </button>
  );

  const onSubmitEvent = async (data: SubCategoryFormValues) => {
    if (isRequestSubCategory && isEditable) {
      const subcategoryId = String(subCategory?._id ?? "").trim();
      if (!subcategoryId) {
        showErrorAlert("Unable to update. ID is missing.");
        return;
      }
      const name = String(data.name ?? "").trim();
      const description = String(data.desc ?? "").trim();
      if (!name) {
        showErrorAlert("Sub Category name is required");
        return;
      }
      if (!description) {
        showErrorAlert("Description is required");
        return;
      }
      const moderationStatus =
        data.approval_status ??
        getValues("approval_status") ??
        approvalStatusDefaultForEdit;
      const rejectionReason = String(data.rejection_reason ?? "").trim();
      if (moderationStatus === "rejected" && !rejectionReason) {
        showErrorAlert("Rejection note is required");
        return;
      }

      let image_url = "";
      if (imageFile) {
        const imageUpload = await uploadDocumentImages({
          uploadType: "2",
          files: [imageFile],
          isEditMode: true,
          existingStoragePaths: subCategory?.image_url
            ? [subCategory.image_url]
            : [],
        });
        if (!imageUpload.ok) {
          showErrorAlert(documentUploadFailureMessage(imageUpload.usedReplace));
          return;
        }
        image_url = imageUpload.paths[0] ?? "";
      }

      const payload: Record<string, unknown> = {
        name,
        desc: description,
      };
      if (moderationStatus === "approved") {
        payload.approval_status = "approve";
        payload.is_active = true;
      } else if (moderationStatus === "rejected") {
        payload.approval_status = "rejected";
        payload.rejection_reason = rejectionReason;
      } else {
        payload.approval_status = "pending";
      }
      if (image_url) payload.image_url = image_url;

      const response = await apiRequest(
        UPDATE_SUBCATEGORY_PATH(subcategoryId),
        "PUT",
        payload
      );
      if (!response.success) return;

      const result = await onSaved?.({
        name,
        description,
        category_id: String(subCategory?.category_id ?? ""),
        category_name: String(subCategory?.category_name ?? ""),
        service_ids: serviceIds,
        image: imageFile,
        requestModerationHandled: true,
      });
      if (result === false) return;
      onClose();
      return;
    }

    if (serviceIds.length === 0) {
      showErrorAlert("Please select at least one service");
      return;
    }
    if (!isEditable && !imageFile && !createdViaAddServiceRef.current) {
      showErrorAlert("Please select image");
      return;
    }
    const categoryId = String(data.category_id ?? "").trim();
    const matchedCategory = categoryOptions.find(
      (option) => option.value === categoryId
    );
    if (!matchedCategory) {
      showErrorAlert("Please select category");
      return;
    }
    const saved: SubCategorySavePayload = {
      name: String(data.name ?? "").trim(),
      description: String(data.desc ?? "").trim(),
      category_id: matchedCategory.value,
      category_name: matchedCategory.label,
      service_ids: serviceIds,
      image: imageFile,
    };

    // Add: POST /subcategory/create only (skip if already created via + Add Service)
    if (!isEditable && !createdViaAddServiceRef.current) {
      const body = new FormData();
      body.append("name", saved.name);
      body.append("description", saved.description);
      body.append("desc", saved.description);
      body.append("category_id", saved.category_id);
      body.append("service_ids", JSON.stringify(saved.service_ids ?? []));
      (saved.service_ids ?? []).forEach((id) => body.append("service_ids", id));
      if (saved.image) {
        body.append("image", saved.image);
      }
      const response = await apiRequest(
        CREATE_SUBCATEGORY_PATH,
        "POST",
        body,
        true
      );
      if (!response.success) return;
      createdViaAddServiceRef.current = true;
      const createdId = extractCreatedSubCategoryId(response.data);
      if (createdId) createdSubCategoryIdRef.current = createdId;
    }

    const persistId = String(
      createdSubCategoryIdRef.current || subCategory?._id || ""
    ).trim();
    if (persistId) {
      const linked = await persistSubCategoryServiceIds({
        id: persistId,
        name: saved.name,
        description: saved.description,
        category_id: saved.category_id,
        service_ids: saved.service_ids ?? [],
        is_active: subCategory?.is_active !== false,
      });
      if (!linked) return;
    } else if (!isEditable) {
      showErrorAlert("Sub category saved, but services could not be linked.");
    }

    const result = await onSaved?.(saved);
    if (result === false) return;
    onClose();
  };

  return (
    <Modal
      show={true}
      onHide={onClose}
      centered
      size="lg"
      dialogClassName="custom-big-modal"
      enforceFocus={false}
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {localViewMode
            ? "Sub Category Details"
            : isEditable
            ? "Edit Sub Category"
            : "Add Sub Category"}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        {localViewMode && subCategory ? (
          <section
            className="custom-other-details modal-readonly-details"
            style={{ padding: "14px 16px", borderRadius: 12 }}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="mb-0">Sub Category Information</h3>
              {isEditable && (
                <i
                  className="bi bi-pencil-fill fs-6 text-danger"
                  style={{ cursor: "pointer" }}
                  role="button"
                  aria-label="Edit sub category"
                  onClick={() => setLocalViewMode(false)}
                />
              )}
            </div>

            {isCatalogRequestRow(
              subCategory as unknown as Record<string, unknown>
            ) ? (
              <>
                <Row className="g-3 align-items-start">
                  <Col xs={12} md={6}>
                    <FullDetailsRow
                      title="Sub Category Name"
                      value={subCategory.name || "-"}
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <FullDetailsRow
                      title="Approval status"
                      value={
                        <span
                          style={{
                            color:
                              mapApprovalStatusFromRecord(
                                subCategory as unknown as Record<
                                  string,
                                  unknown
                                >
                              ) === "approved"
                                ? "#198754"
                                : mapApprovalStatusFromRecord(
                                    subCategory as unknown as Record<
                                      string,
                                      unknown
                                    >
                                  ) === "rejected"
                                ? "#dc3545"
                                : "#fd7e14",
                            fontWeight: 600,
                          }}
                        >
                          {requestApprovalStatusLabel(
                            mapApprovalStatusFromRecord(
                              subCategory as unknown as Record<string, unknown>
                            )
                          )}
                        </span>
                      }
                    />
                  </Col>
                </Row>
                <Row className="g-3 align-items-start mt-1">
                  <Col xs={12} md={6}>
                    <FullDetailsRow
                      title="Requested by"
                      value={formatRequestedBy(
                        (subCategory as { requested_by?: unknown }).requested_by
                      )}
                    />
                  </Col>
                </Row>
                {String(
                  (subCategory as { rejection_reason?: unknown }).rejection_reason ??
                    ""
                ).trim() ? (
                  <Row className="g-3 mt-1">
                    <Col xs={12}>
                      <FullDetailsRow
                        title="Rejection reason"
                        value={String(
                          (subCategory as { rejection_reason?: unknown })
                            .rejection_reason ?? ""
                        ).trim()}
                      />
                    </Col>
                  </Row>
                ) : null}
                <Row className="g-3 mt-1">
                  <Col xs={12}>
                    <h3>Description</h3>
                    <div
                      className="mb-0 w-100"
                      title={
                        String(subCategory.desc ?? "").trim() || undefined
                      }
                      style={{
                        color: "var(--content-txt-color)",
                        fontSize: "0.95rem",
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        minWidth: 0,
                      }}
                    >
                      {String(subCategory.desc ?? "").trim() || "-"}
                    </div>
                  </Col>
                </Row>
                <Row className="g-3 mt-3 align-items-start">
                  <Col xs={12}>
                    <p
                      className="mb-2"
                      style={{
                        color: "var(--primary-color)",
                        fontWeight: 600,
                      }}
                    >
                      Sub category image
                    </p>
                    {subCategory.image_url ? (
                      <img
                        src={resolveExistingImageSrc(subCategory.image_url)}
                        alt="Sub Category"
                        className="d-block"
                        style={{
                          maxWidth: "min(100%, 280px)",
                          maxHeight: 200,
                          borderRadius: 8,
                          objectFit: "contain",
                          background: "#fff",
                          border: "1px solid var(--txtfld-border)",
                        }}
                      />
                    ) : (
                      <span className="text-muted small">No image</span>
                    )}
                  </Col>
                </Row>
              </>
            ) : (
              <>
                <Row className="g-3 align-items-start">
                  {subcategoryViewRows(subCategory).map((field) => (
                    <Col
                      xs={12}
                      md={
                        field.key === "desc" ||
                        field.key === "description" ||
                        field.key === "services"
                          ? 12
                          : 6
                      }
                      key={field.key}
                    >
                      <FullDetailsRow
                        title={field.label}
                        value={
                          field.key === "is_active" ? (
                            <span
                              style={{
                                color: subCategory.is_active
                                  ? "#198754"
                                  : "#dc3545",
                                fontWeight: 600,
                              }}
                            >
                              {field.value}
                            </span>
                          ) : (
                            field.value
                          )
                        }
                      />
                    </Col>
                  ))}
                </Row>
                <Row className="g-3 mt-3 align-items-start">
                  <Col xs={12} md={6}>
                    <p
                      className="mb-2"
                      style={{
                        color: "var(--primary-color)",
                        fontWeight: 600,
                      }}
                    >
                      Sub Category image
                    </p>
                    {subCategory.image_url ? (
                      <img
                        src={resolveExistingImageSrc(subCategory.image_url)}
                        alt="Sub Category"
                        className="d-block"
                        style={{
                          maxWidth: "min(100%, 280px)",
                          maxHeight: 200,
                          borderRadius: 8,
                          objectFit: "contain",
                          background: "#fff",
                          border: "1px solid var(--txtfld-border)",
                        }}
                      />
                    ) : (
                      <span className="text-muted small">No image</span>
                    )}
                  </Col>
                </Row>
              </>
            )}
          </section>
        ) : (
          <form noValidate onSubmit={handleSubmit(onSubmitEvent)}>
            <Row className="g-4 align-items-start">
              <Col md={6}>
                <CustomFormInput
                  label="Sub Category name"
                  controlId="name"
                  placeholder="Enter Sub Category Name"
                  register={register}
                  value={watch("name") || ""}
                  onChange={(value) =>
                    setValue("name", value as any, { shouldValidate: true })
                  }
                  error={errors.name}
                  asCol={false}
                  validation={{ required: "Sub Category name is required" }}
                />
              </Col>

              {isRequestSubCategory && isEditable ? (
                <Col md={6}>
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
              ) : (
                <Col md={6}>
                  {presetCategory ? (
                    <CustomFormInput
                      label="Category"
                      controlId="locked-category"
                      placeholder=""
                      value={lockedCategoryLabel}
                      register={register}
                      error={undefined as any}
                      asCol={false}
                      isEditable={false}
                    />
                  ) : (
                    <CustomFormSelect
                      label="Category"
                      controlId="category"
                      options={categoryOptions}
                      register={register as unknown as UseFormRegister<any>}
                      fieldName="category_id"
                      error={errors.category_id}
                      asCol={false}
                      requiredMessage="Please select category"
                      defaultValue={watch("category_id") || ""}
                      setValue={(name: string, value: any) =>
                        setValue(name as any, value, { shouldValidate: true })
                      }
                    />
                  )}
                </Col>
              )}

              <Col md={12}>
                <CustomFormInput
                  label="Description"
                  controlId="desc"
                  placeholder="Enter Sub Category Description"
                  register={register}
                  value={watch("desc") || ""}
                  onChange={(value) =>
                    setValue("desc", value as any, { shouldValidate: true })
                  }
                  error={errors.desc}
                  asCol={false}
                  validation={{ required: "Description is required" }}
                  as="textarea"
                  rows={4}
                />
              </Col>

              {isRequestSubCategory &&
              isEditable &&
              approvalStatusWatch === "rejected" ? (
                <Col md={12}>
                  <CustomFormInput
                    label="Rejection note"
                    controlId="rejection_reason"
                    placeholder="Enter rejection note"
                    register={register}
                    value={watch("rejection_reason") || ""}
                    onChange={(value) =>
                      setValue("rejection_reason", value as any, {
                        shouldValidate: true,
                        shouldDirty: true,
                        shouldTouch: true,
                      })
                    }
                    error={errors.rejection_reason}
                    asCol={false}
                    validation={{
                      validate: (value: string) =>
                        value?.trim() ? true : "Rejection note is required",
                    }}
                    as="textarea"
                    rows={3}
                  />
                </Col>
              ) : null}

              <Col xs={12} md={isRequestSubCategory ? 12 : 6} className="min-w-0">
                <label className="form-label fw-medium mb-2 d-block">
                  <FieldLabelText label="Sub Category image" required />
                </label>
                <CustomImageUploader
                  label=""
                  hideLabel
                  maxFiles={1}
                  isEditable={isEditable}
                  existingImages={
                    subCategory?.image_url ? [subCategory.image_url] : []
                  }
                  onFileChange={(files) => setImageFile(files[0] ?? null)}
                />
              </Col>
              {!isRequestSubCategory ? (
                <Col xs={12} md={6} className="min-w-0">
                  <label className="form-label fw-medium mb-2 d-block">
                    <FieldLabelText label="Services" required />
                  </label>
                  <CustomMultiSelect
                    label=""
                    controlId="Service"
                    options={serviceOptions}
                    value={selectedServiceOptions}
                    onChange={handleServiceSelection}
                    asCol={false}
                    menuPortal
                    menuFooter={addServiceMenuFooter}
                  />
                </Col>
              ) : null}
            </Row>

            <Row className="mt-4">
              <Col xs={12} className="d-flex justify-content-end gap-3">
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

export function showAddEditSubCategoryDialog(
  subCategory: SubCategoryDetails | null = null,
  isViewMode = false,
  options?: {
    presetCategoryName?: string;
    presetCategoryId?: string;
    onSaved?: (
      saved: SubCategorySavePayload
    ) => void | boolean | Promise<void | boolean>;
  }
): void {
  openDialog("sub-category-details-modal", (close) => (
    <AddEditSubCategoryDialog
      subCategory={subCategory}
      isViewMode={isViewMode}
      presetCategoryName={options?.presetCategoryName}
      presetCategoryId={options?.presetCategoryId}
      onSaved={options?.onSaved}
      onClose={close}
    />
  ));
}

AddEditSubCategoryDialog.show = showAddEditSubCategoryDialog;

export default AddEditSubCategoryDialog;