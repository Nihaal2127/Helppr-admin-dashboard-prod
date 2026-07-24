import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { CategoryModel } from "../../lib/models/CategoryModel";
import { CustomFormInput } from "../../components/CustomFormInput";
import { CustomRadioSelection } from "../../components/CustomRadioSelection";
import {
  FullDetailsRow,
  getStatusOptions,
  formatRequestedBy,
  isCatalogRequestRow,
  mapApprovalStatusFromRecord,
  requestApprovalStatusLabel,
} from "../../helper/utility";
import CustomImageUploader, {
  resolveExistingImageSrc,
} from "../../components/CustomImageUploader";
import { FieldLabelText } from "../../components/RequiredFieldMark";
import { showErrorAlert } from "../../lib/global/alertHelper";
import {
  createOrUpdateCategory,
  createOrUpdateCategoryWithRecord,
} from "../../services/categoryService";
import {
  documentUploadFailureMessage,
  normalizeReplaceStoragePaths,
  toStorageRelativePath,
  uploadDocumentImages,
} from "../../services/documentUploadService";
import CustomMultiSelect from "../../components/CustomMultiSelect";
import { fetchServicesForCategoryDialog } from "../../services/servicesService";
import { openDialog } from "../../lib/global/DialogManager";
import AddEditServiceDialog from "./AddEditServiceDialog";

type AddEditCategoryDialogProps = {
  isEditable: boolean;
  isViewMode?: boolean;
  category: CategoryModel | null;
  onClose: () => void;
  onRefreshData: () => void;
  /** When true (e.g. My Franchise catalog view), hide Active/Inactive in read-only details. */
  hideStatusInView?: boolean;
};

type CategoryFormValues = Omit<CategoryModel, "is_active"> & {
  /** Radio group uses string "true" | "false" from `getStatusOptions`. */
  is_active?: boolean | string;
  approval_status?: "pending" | "approved" | "rejected";
  rejection_reason?: string;
};

function mapApprovalStatusFromCategory(
  c: CategoryModel | null
): "pending" | "approved" | "rejected" {
  return mapApprovalStatusFromRecord(
    c ? (c as unknown as Record<string, unknown>) : null
  );
}

const SELECT_ALL_OPTION = "select-all";

const AddEditCategoryDialog: React.FC<AddEditCategoryDialogProps> & {
  show: (
    isEditable: boolean,
    category: CategoryModel | null,
    onRefreshData: () => void,
    isViewMode?: boolean,
    hideStatusInView?: boolean
  ) => void;
} = ({
  isEditable,
  isViewMode = false,
  category,
  onClose,
  onRefreshData,
  hideStatusInView = false,
}) => {
  const [localViewMode, setLocalViewMode] = useState(isViewMode);

  useEffect(() => {
    setLocalViewMode(isViewMode);
  }, [isViewMode, category?._id]);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors },
    watch,
  } = useForm<CategoryFormValues>({
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: {
      name: category?.name || "",
      desc: category?.desc || "",
      is_active: category?.is_active ?? true,
      franchise_id: category?.franchise_id || "",
      approval_status: mapApprovalStatusFromCategory(category),
      rejection_reason: String((category as any)?.rejection_reason ?? ""),
    },
  });

  const [fileInputs, setFileInputs] = useState<File[]>([]);
  const [replaceUrls, setReplaceUrl] = useState<string[]>([]);
  const [serviceOptions, setServiceOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [draftCategoryId, setDraftCategoryId] = useState<string>("");
  const [draftImageUrl, setDraftImageUrl] = useState<string>("");
  /** Same as `draftCategoryId` state, updated synchronously before opening Add Service so `loadServiceOptions` never reads a stale empty draft (React state lags one render). */
  const draftCategoryIdRef = useRef<string>("");

  useEffect(() => {
    draftCategoryIdRef.current = draftCategoryId;
  }, [draftCategoryId]);

  const loadServiceOptions = useCallback(async () => {
    const editingId = String(category?._id ?? "").trim();
    const draft = String(draftCategoryIdRef.current ?? "").trim();
    const mode = editingId ? ("edit" as const) : ("add" as const);
    const scopeId = mode === "edit" ? editingId : draft || undefined;

    const serviceOpts = await fetchServicesForCategoryDialog({
      mode,
      categoryId: scopeId,
    });
    const options = [
      { value: SELECT_ALL_OPTION, label: "Select All" },
      ...serviceOpts,
    ];
    setServiceOptions(options);
    return options;
  }, [category?._id]);

  useEffect(() => {
    if (!category) return;
    reset({
      name: category.name || "",
      desc: category.desc || "",
      is_active: category.is_active ?? true,
      franchise_id: category.franchise_id || "",
      approval_status: mapApprovalStatusFromCategory(category),
      rejection_reason: String((category as any)?.rejection_reason ?? ""),
    });
  }, [category, localViewMode, reset]);

  /** Load / reload services when category, draft id, or mode changes so add vs edit lists stay correct. */
  useEffect(() => {
    if (category?.is_request) return;
    void loadServiceOptions();
  }, [loadServiceOptions, draftCategoryId, category?.is_request]);

  useEffect(() => {
    const hydrateIds = isEditable || localViewMode;
    if (hydrateIds && category) {
      if ((category as CategoryModel).is_request) {
        setServiceIds([]);
      } else {
        // Supports both old shape (`service_ids`) and API detail shape (`services: [{ _id, name }]`).
        const idsFromServiceIds = Array.isArray((category as any).service_ids)
          ? (category as any).service_ids.map(String)
          : [];
        const idsFromServicesArray = Array.isArray((category as any).services)
          ? (category as any).services
              .map((s: any) => String(s?._id ?? ""))
              .filter(Boolean)
          : [];
        setServiceIds(
          idsFromServiceIds.length > 0 ? idsFromServiceIds : idsFromServicesArray
        );
      }
      setValue("franchise_id", category.franchise_id || "", {
        shouldValidate: false,
      });
      setDraftCategoryId("");
      setDraftImageUrl("");
    } else if (!category) {
      setServiceIds([]);
      setDraftCategoryId("");
      setDraftImageUrl("");
      setValue("franchise_id", "", { shouldValidate: false });
    }
  }, [isEditable, localViewMode, category, setValue]);

  useEffect(() => {
    if (isEditable && category?.is_active !== undefined) {
      setValue("is_active", category.is_active);
    }
  }, [isEditable, category?.is_active, setValue]);

  useEffect(() => {
    setFileInputs([]);
    setReplaceUrl([]);
  }, [category?._id, isEditable]);

  const openAddServiceForCategory = useCallback(async () => {
    const currentCategoryName = String(getValues("name") ?? "").trim();
    const categoryIdFromRecord =
      (category as any)?._id ??
      (category as any)?.category_id ??
      (category as any)?.id ??
      "";
    const currentCategoryId = String(
      draftCategoryId || categoryIdFromRecord || ""
    ).trim();

    let resolvedCategoryId = currentCategoryId;
    if (!resolvedCategoryId) {
      const name = String(getValues("name") ?? "").trim();
      const desc = String(getValues("desc") ?? "").trim();
      const franchise_id = String(getValues("franchise_id") ?? "").trim();
      if (!name || !desc) {
        showErrorAlert("Enter category name and description first.");
        return;
      }
      if (fileInputs.length === 0) {
        showErrorAlert("Upload category image first.");
        return;
      }

      const draftUpload = await uploadDocumentImages({
        uploadType: "2",
        files: fileInputs,
        isEditMode: false,
      });
      if (!draftUpload.ok) {
        showErrorAlert(documentUploadFailureMessage(draftUpload.usedReplace));
        return;
      }
      const fileList = draftUpload.paths;

      const draftRes = await createOrUpdateCategoryWithRecord(
        {
          name,
          desc,
          service_ids: [],
          is_active: true,
          ...(franchise_id ? { franchise_id } : {}),
          image_url: String(fileList[0]),
        },
        false
      );
      resolvedCategoryId = String(
        (draftRes.record as any)?._id ??
          (draftRes.record as any)?.category_id ??
          ""
      ).trim();
      if (!draftRes.response || !resolvedCategoryId) {
        showErrorAlert("Please save category first, then add service.");
        return;
      }
      draftCategoryIdRef.current = resolvedCategoryId;
      setDraftCategoryId(resolvedCategoryId);
      setDraftImageUrl(String(fileList[0]));
    }

    draftCategoryIdRef.current = resolvedCategoryId;

    const previousServiceIds = new Set(
      serviceOptions
        .filter((s) => s.value !== SELECT_ALL_OPTION)
        .map((s) => s.value)
    );

    AddEditServiceDialog.show(
      false,
      null,
      async () => {
        const refreshedOptions = await loadServiceOptions();
        setServiceIds((prev) => {
          const next = new Set(prev);
          refreshedOptions
            .filter(
              (s) =>
                s.value !== SELECT_ALL_OPTION &&
                !previousServiceIds.has(s.value)
            )
            .forEach((s) => next.add(s.value));
          return Array.from(next);
        });
        onRefreshData();
      },
      false,
      {
        id: resolvedCategoryId,
        label: category?.name || currentCategoryName || "Current Category",
      }
    );
  }, [
    category,
    draftCategoryId,
    fileInputs,
    getValues,
    loadServiceOptions,
    onRefreshData,
    serviceOptions,
    setDraftCategoryId,
    setDraftImageUrl,
    setServiceIds,
  ]);

  const addServiceMenuFooter = useMemo(
    () => (
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
        onClick={() => void openAddServiceForCategory()}
      >
        + Add Service
      </button>
    ),
    [openAddServiceForCategory]
  );

  const handleServiceSelection = async (
    selectedOptions: { value: string; label: string }[]
  ) => {
    const isSelectAllSelected = selectedOptions.some(
      (option) => option.value === SELECT_ALL_OPTION
    );

    let selectedIds: string[] = [];

    if (isSelectAllSelected) {
      const allServices = serviceOptions.filter(
        (s) => s.value !== SELECT_ALL_OPTION
      );
      const picked = selectedOptions.filter(
        (o) => o.value !== SELECT_ALL_OPTION
      );
      const isAllSelected =
        picked.length === allServices.length &&
        allServices.every((svc) =>
          picked.some((selected) => selected.value === svc.value)
        );

      selectedIds = isAllSelected ? [] : allServices.map((svc) => svc.value);
    } else {
      selectedIds = selectedOptions.map((option) => option.value);
    }

    setServiceIds(selectedIds);
  };

  const selectedServiceOptions = useMemo(
    () =>
      serviceOptions.filter(
        (svc) =>
          svc.value !== SELECT_ALL_OPTION && serviceIds.includes(svc.value)
      ),
    [serviceOptions, serviceIds]
  );

  const linkedServiceNamesForView = useMemo(() => {
    if (!category) return [];
    const rawServices = (category as any).services;
    if (Array.isArray(rawServices) && rawServices.length > 0) {
      if (typeof rawServices[0] === "object") {
        return rawServices
          .map((s: any) => String(s?.name ?? s?.label ?? ""))
          .filter(Boolean);
      }
      return rawServices.map((s: any) => String(s)).filter(Boolean);
    }
    if (
      Array.isArray(category.service_names) &&
      category.service_names.length > 0
    ) {
      return category.service_names.map(String).filter(Boolean);
    }

    const idsFromApi = (category.service_ids ?? []).map(String);
    const ids = idsFromApi.length > 0 ? idsFromApi : serviceIds;
    const fromOptions = ids
      .map(
        (id) =>
          serviceOptions.find(
            (s) => s.value === id && s.value !== SELECT_ALL_OPTION
          )?.label
      )
      .filter(Boolean) as string[];
    if (fromOptions.length > 0) return fromOptions;

    const countHint =
      typeof category.services === "number" && category.services > 0
        ? category.services
        : ids.length > 0
        ? ids.length
        : 0;
    if (countHint > 0) {
      return [`${countHint} service(s) linked`];
    }
    return [];
  }, [category, serviceOptions, serviceIds]);

  const isRequestCategory = isCatalogRequestRow(
    category as unknown as Record<string, unknown>
  );
  const approvalStatusWatch = watch("approval_status");
  const approvalStatusDefaultForEdit =
    mapApprovalStatusFromCategory(category);

  const onSubmitEvent = async (data: CategoryFormValues) => {
    const isRequestCategorySubmit = Boolean(category?.is_request);
    if (!isRequestCategorySubmit && serviceIds.length === 0) {
      showErrorAlert("Please select at least one service");
      return;
    }

    let image_url = "";
    if (fileInputs.length > 0) {
      console.log("[ImageUploadDebug] Edit Category — Update clicked", {
        categoryId: category?._id,
        isEditable,
        existingImageUrl: category?.image_url,
        existingImageUrlNormalized: normalizeReplaceStoragePaths(
          category?.image_url ? [category.image_url] : []
        ),
        replaceUrls,
        fileInputs: fileInputs.map((f) => ({
          name: f.name,
          size: f.size,
          type: f.type,
        })),
      });

      const previousImagePath = toStorageRelativePath(category?.image_url);

      const imageUpload = await uploadDocumentImages({
        uploadType: "2",
        files: fileInputs,
        isEditMode: isEditable,
        replaceUrls,
        existingStoragePaths: category?.image_url ? [category.image_url] : [],
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
      console.log("[ImageUploadDebug] Edit Category — upload done", {
        previousImagePath,
        image_url,
        pathChanged: previousImagePath !== image_url,
        usedReplace: imageUpload.usedReplace,
      });
    } else {
      console.log("[ImageUploadDebug] Edit Category — Update clicked (no new file)", {
        categoryId: category?._id,
        existingImageUrl: category?.image_url,
        fileInputsCount: fileInputs.length,
      });
    }

    if (!isEditable && !draftCategoryId && image_url === "") {
      showErrorAlert("Please select image");
      return;
    }
    const isActiveNormal =
      data.is_active === true ||
      data.is_active === "true" ||
      String(data.is_active).toLowerCase() === "true";

    const moderationStatus =
      isEditable && isRequestCategorySubmit
        ? (data.approval_status ??
            getValues("approval_status") ??
            mapApprovalStatusFromCategory(category))
        : undefined;

    const isActive =
      isEditable && isRequestCategorySubmit
        ? moderationStatus !== "rejected"
        : hideStatusInView && category?.is_active !== undefined
        ? Boolean(category.is_active)
        : isActiveNormal;

    const payload = {
      name: data.name,
      desc: data.desc,
      is_active: isActive,
      service_ids: isRequestCategorySubmit ? [] : serviceIds,
      franchise_id: data.franchise_id,
      ...(isEditable &&
        isRequestCategorySubmit &&
        moderationStatus &&
        moderationStatus !== "pending" && {
          is_rejected: moderationStatus === "rejected",
        }),
      ...(isEditable &&
        isRequestCategorySubmit &&
        moderationStatus && {
          approval_status: moderationStatus,
        }),
      ...(isEditable &&
        isRequestCategorySubmit && {
          rejection_reason:
            moderationStatus === "rejected"
              ? String(data.rejection_reason ?? "").trim()
              : "",
        }),
      ...((image_url !== "" || draftImageUrl !== "") && {
        image_url: image_url || draftImageUrl,
      }),
    };

    console.log("[ImageUploadDebug] Edit Category — category PUT payload", {
      categoryId: draftCategoryId || category?._id,
      includesImageUrl: "image_url" in payload,
      image_url: (payload as { image_url?: string }).image_url,
      payload,
    });

    let responseCategory;
    if (isEditable || draftCategoryId) {
      if (!category?._id) {
        if (!draftCategoryId) {
          showErrorAlert("Unable to update. ID is missing.");
          return;
        }
      }

      responseCategory = await createOrUpdateCategory(
        payload,
        true,
        draftCategoryId || category?._id
      );
    } else {
      responseCategory = await createOrUpdateCategory(payload, false);
    }

    if (responseCategory) {
      onClose && onClose();
      onRefreshData();
    }
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
            ? "Category Details"
            : isEditable
            ? "Edit Category"
            : "Add Category"}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        {localViewMode && category ? (
          <section
            className="custom-other-details modal-readonly-details"
            style={{ padding: "14px 16px", borderRadius: 12 }}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="mb-0">Category Information</h3>
              {isEditable && (
                <i
                  className="bi bi-pencil-fill fs-6 text-danger"
                  style={{ cursor: "pointer" }}
                  role="button"
                  aria-label="Edit category"
                  onClick={() => setLocalViewMode(false)}
                />
              )}
            </div>

            <Row className="g-3 align-items-start">
              <Col xs={12} md={6}>
                <FullDetailsRow
                  title="Category Name"
                  value={category.name ?? "-"}
                />
              </Col>
              {isRequestCategory ? (
                <Col xs={12} md={6}>
                  <FullDetailsRow
                    title="Approval status"
                    value={
                      <span
                        style={{
                          color:
                            mapApprovalStatusFromCategory(category) ===
                            "approved"
                              ? "#198754"
                              : mapApprovalStatusFromCategory(category) ===
                                "rejected"
                              ? "#dc3545"
                              : "#fd7e14",
                          fontWeight: 600,
                        }}
                      >
                        {requestApprovalStatusLabel(
                          mapApprovalStatusFromCategory(category)
                        )}
                      </span>
                    }
                  />
                </Col>
              ) : !hideStatusInView ? (
                <Col xs={12} md={6}>
                  <FullDetailsRow
                    title="Status"
                    value={
                      <span
                        style={{
                          color: category.is_active ? "#198754" : "#dc3545",
                          fontWeight: 600,
                        }}
                      >
                        {category.is_active ? "Active" : "Inactive"}
                      </span>
                    }
                  />
                </Col>
              ) : null}
            </Row>

            {isRequestCategory ? (
              <Row className="g-3 align-items-start mt-1">
                <Col xs={12} md={6}>
                  <FullDetailsRow
                    title="Requested by"
                    value={formatRequestedBy(
                      (category as CategoryModel).requested_by
                    )}
                  />
                </Col>
              </Row>
            ) : null}

            {isRequestCategory &&
            String((category as any)?.rejection_reason ?? "").trim() ? (
              <Row className="g-3 mt-1">
                <Col xs={12}>
                  <FullDetailsRow
                    title="Rejection reason"
                    value={String(
                      (category as any)?.rejection_reason ?? ""
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
                    String(category.desc ?? "").trim() || undefined
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
                  {category.desc?.trim() ? category.desc.trim() : "-"}
                </div>
              </Col>
            </Row>

            <Row className="g-3 mt-3 align-items-start">
              <Col xs={12} md={isRequestCategory ? 12 : 6}>
                <p
                  className="mb-2"
                  style={{ color: "var(--primary-color)", fontWeight: 600 }}
                >
                  Category image
                </p>
                {category.image_url ? (
                  <img
                    src={resolveExistingImageSrc(category.image_url)}
                    alt="Category"
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
              {!isRequestCategory ? (
                <Col xs={12} md={6}>
                  <p
                    className="mb-2"
                    style={{ color: "var(--primary-color)", fontWeight: 600 }}
                  >
                    Services
                  </p>
                  {linkedServiceNamesForView.length > 0 ? (
                    <div
                      style={{
                        maxHeight: 220,
                        overflowY:
                          linkedServiceNamesForView.length > 8
                            ? "auto"
                            : "visible",
                        border: "1px solid var(--txtfld-border)",
                        borderRadius: 8,
                        padding: "10px 12px",
                        background: "var(--bs-body-bg, #fff)",
                      }}
                    >
                      {linkedServiceNamesForView.map(
                        (svc: string, idx: number) => (
                          <div
                            key={`${svc}-${idx}`}
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "start",
                              padding: "6px 0",
                              borderBottom:
                                idx !== linkedServiceNamesForView.length - 1
                                  ? "1px dashed var(--txtfld-border)"
                                  : "none",
                            }}
                          >
                            <span
                              className="flex-shrink-0"
                              style={{
                                color: "var(--primary-color)",
                                fontWeight: 600,
                              }}
                            >
                              {idx + 1}.
                            </span>
                            <span style={{ color: "var(--content-txt-color)" }}>
                              {svc}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <span className="text-muted small">No services linked</span>
                  )}
                </Col>
              ) : null}
            </Row>
          </section>
        ) : (
          <form
            noValidate
            name="profile-form"
            id="profile-form"
            onSubmit={handleSubmit(onSubmitEvent)}
          >
            <Row className="g-4 align-items-start">
              <Col md={6}>
                <CustomFormInput
                  label="Category name"
                  controlId="name"
                  placeholder="Enter Category Name"
                  register={register}
                  value={watch("name") || ""}
                  onChange={(value) =>
                    setValue("name", value as any, {
                      shouldValidate: true,
                      shouldDirty: true,
                      shouldTouch: true,
                    })
                  }
                  error={errors.name}
                  asCol={false}
                  validation={{ required: "Category name is required" }}
                />
              </Col>
              {isEditable && isRequestCategory ? (
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
              ) : isEditable && !hideStatusInView ? (
                <Col md={6}>
                  <CustomRadioSelection
                    label="Status"
                    name="is_active"
                    options={getStatusOptions()}
                    defaultValue={
                      category?.is_active !== undefined
                        ? category.is_active.toString()
                        : "true"
                    }
                    isEditable
                    setValue={setValue}
                  />
                </Col>
              ) : null}

              <Col md={12}>
                <CustomFormInput
                  label="Description"
                  controlId="desc"
                  placeholder="Enter Category Description"
                  register={register}
                  value={watch("desc") || ""}
                  onChange={(value) =>
                    setValue("desc", value as any, {
                      shouldValidate: true,
                      shouldDirty: true,
                      shouldTouch: true,
                    })
                  }
                  error={errors.desc}
                  asCol={false}
                  validation={{ required: "Category description is required" }}
                  as="textarea"
                  rows={4}
                />
              </Col>

              {isEditable && isRequestCategory && approvalStatusWatch === "rejected" ? (
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
              ) : null}

              <Col md={isRequestCategory ? 12 : 6}>
                <label className="form-label fw-medium mb-2 d-block">
                  <FieldLabelText label="Category image" required />
                </label>
                <CustomImageUploader
                  label=""
                  hideLabel
                  maxFiles={1}
                  isEditable={isEditable}
                  existingImages={
                    category?.image_url ? [category.image_url] : []
                  }
                  onFileChange={(files, replaceUrlsFromUploader) => {
                    setFileInputs(files);
                    setReplaceUrl(
                      normalizeReplaceStoragePaths(replaceUrlsFromUploader)
                    );
                  }}
                />
              </Col>
              {!isRequestCategory ? (
                <Col md={6}>
                   <label className="form-label fw-medium mb-2 d-block">
                  <FieldLabelText label="Services" required />
                </label>
                  <CustomMultiSelect
                    label=""
                    controlId="Service"
                    options={serviceOptions}
                    value={selectedServiceOptions}
                    onChange={(selectedOptions) => {
                      void handleServiceSelection(selectedOptions);
                    }}
                    asCol={false}
                    menuPortal
                    menuFooter={addServiceMenuFooter}
                  />
                </Col>
              ) : null}
            </Row>
            <Row className="mt-4">
              <Col
                xs={12}
                className="text-center  d-flex justify-content-end gap-3 "
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

AddEditCategoryDialog.show = (
  isEditable: boolean,
  category: CategoryModel | null,
  onRefreshData: () => void,
  isViewMode: boolean = false,
  hideStatusInView: boolean = false
) => {
  openDialog("category-details-modal", (close) => (
    <AddEditCategoryDialog
      isEditable={isEditable}
      isViewMode={isViewMode}
      category={category}
      hideStatusInView={hideStatusInView}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default AddEditCategoryDialog;
