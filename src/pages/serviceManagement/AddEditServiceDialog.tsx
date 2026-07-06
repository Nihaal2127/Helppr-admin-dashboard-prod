import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm, UseFormRegister } from "react-hook-form";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { ServiceModel } from "../../lib/models/ServiceModel";
import { CustomFormInput } from "../../components/CustomFormInput";
import { CustomRadioSelection } from "../../components/CustomRadioSelection";
import { getStatusOptions } from "../../helper/utility";
import CustomFormSelect from "../../components/CustomFormSelect";
import CustomImageUploader, {
  resolveExistingImageSrc,
} from "../../components/CustomImageUploader";
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
import { openDialog } from "../../lib/global/DialogManager";
import { AppConstant } from "../../lib/global/AppConstant";
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

type AddEditServiceDialogProps = {
  isEditable: boolean;
  service: ServiceModel | null;
  onClose: () => void;
  onRefreshData: () => void;
  isViewMode?: boolean;
  lockCategory?: { id?: string; label?: string };
  /** When true (e.g. My Franchise catalog view), hide Active/Inactive and request-status rows. */
  hideStatusInView?: boolean;
};

const AddEditServiceDialog: React.FC<AddEditServiceDialogProps> & {
  show: (
    isEditable: boolean,
    service: ServiceModel | null,
    onRefreshData: () => void,
    isViewMode?: boolean,
    lockCategory?: { id?: string; label?: string },
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
      approval_status: mapApprovalStatusFromService(service),
      rejection_reason: (service as any)?.rejection_reason ?? "",
    } as any);
  }, [service, lockCategory?.id, localViewMode, reset]);

  const [categories, setCategory] = useState<
    { value: string; label: string }[]
  >([]);
  const [fileInputs, setFileInputs] = useState<File[]>([]);
  const [replaceUrls, setReplaceUrl] = useState<string[]>([]);
  const fetchRef = useRef(false);
  /** Used so Payment Type's `CustomFormSelect` sync does not wipe loaded `minimum_deposit` for non-consultancy rows. */
  const prevPaymentTypeRef = useRef<string | null>(null);

  useEffect(() => {
    prevPaymentTypeRef.current = null;
  }, [service?._id]);

  useEffect(() => {
    setFileInputs([]);
    setReplaceUrl([]);
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

  const serviceImagePath = useMemo(() => {
    if (!service) return "";
    const s = service as any;
    return String(s.image_url ?? s.image ?? s.imageUrl ?? "").trim();
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

            {serviceImagePath ? (
              <Row className="g-3 mt-3">
                <Col xs={12}>
                  <p
                    className="mb-2"
                    style={{ color: "var(--primary-color)", fontWeight: 600 }}
                  >
                    Service image
                  </p>
                  <img
                    src={resolveExistingImageSrc(serviceImagePath)}
                    alt=""
                    style={{
                      maxWidth: "min(100%, 280px)",
                      maxHeight: 200,
                      borderRadius: 8,
                      objectFit: "cover",
                      border: "1px solid var(--txtfld-border)",
                    }}
                  />
                </Col>
              </Row>
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
                      setValue(name as any, value, {
                        shouldValidate: true,
                        shouldDirty: true,
                        shouldTouch: true,
                      });
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
                <label className="fw-medium mb-1">Tax</label>
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
                <label className="fw-medium mb-1">Commission</label>
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

              <Col md={6}>
                <CustomImageUploader
                  label="Service image"
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

AddEditServiceDialog.show = (
  isEditable: boolean,
  service: ServiceModel | null,
  onRefreshData: () => void,
  isViewMode: boolean = false,
  lockCategory?: { id?: string; label?: string },
  hideStatusInView: boolean = false
) => {
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
};

export default AddEditServiceDialog;
