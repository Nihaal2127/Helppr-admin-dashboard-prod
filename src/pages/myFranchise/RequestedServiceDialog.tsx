import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button, Row, Col } from "react-bootstrap";
import { useForm, UseFormRegister } from "react-hook-form";
import CustomCloseButton from "../../components/CustomCloseButton";
import { CustomFormInput } from "../../components/CustomFormInput";
import CustomFormSelect from "../../components/CustomFormSelect";
import CustomImageUploader from "../../components/CustomImageUploader";
import {
  FullDetailsRow,
  formatRequestedBy,
  mapApprovalStatusFromRecord,
  mergeServiceDetailForDialog,
  requestApprovalStatusColor,
  requestApprovalStatusLabel,
} from "../../helper/utility";
import { openDialog } from "../../lib/global/DialogManager";
import { showErrorAlert, showSuccessAlert } from "../../lib/global/alertHelper";
import { AppConstant } from "../../lib/global/AppConstant";
import type { RequestedServiceRow } from "../../services/myFranchiseService";
import {
  createRequestedService,
  updateRequestedService,
} from "../../services/myFranchiseService";
import { fetchCategoryDropDown } from "../../services/categoryService";
import { fetchServiceById } from "../../services/servicesService";
import sampleServiceViewImage from "../../assets/icons/profile.svg";

type CategoryOption = { value: string; label: string };

type RequestedServiceFormValues = {
  name: string;
  category_id: string;
  desc: string;
};

type RequestedServiceDialogProps = {
  onClose: () => void;
  onRefreshData: () => void;
  categoryOptions: CategoryOption[];
} & (
  | { mode: "add"; request: null }
  | { mode: "view-edit"; request: RequestedServiceRow }
);

function resolveImageSrc(url?: string): string | null {
  if (!url || !String(url).trim()) return null;
  const u = String(url).trim();
  if (u.startsWith("data:")) return u;
  return `${AppConstant.IMAGE_BASE_URL}${u}?t=${Date.now()}`;
}

const RequestedServiceDialog: React.FC<RequestedServiceDialogProps> & {
  showAdd: (
    categoryOptions: CategoryOption[],
    onRefreshData: () => void
  ) => void;
  showView: (
    request: RequestedServiceRow,
    categoryOptions: CategoryOption[],
    onRefreshData: () => void
  ) => void;
} = (props) => {
  const { onClose, onRefreshData, categoryOptions } = props;
  const isAdd = props.mode === "add";
  const request = isAdd ? null : props.request;

  const [isEditing, setIsEditing] = useState(isAdd);
  const [fileInputs, setFileInputs] = useState<File[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecord, setDetailRecord] = useState<Record<string, unknown> | null>(
    null
  );
  const [effectiveCategoryOptions, setEffectiveCategoryOptions] =
    useState<CategoryOption[]>(categoryOptions);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const fromApi = await fetchCategoryDropDown();
        if (!cancelled && Array.isArray(fromApi) && fromApi.length > 0) {
          setEffectiveCategoryOptions(fromApi);
          return;
        }
      } catch {
        /* fall back to franchise categories */
      }
      if (!cancelled) {
        setEffectiveCategoryOptions(categoryOptions);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryOptions]);

  useEffect(() => {
    setIsEditing(isAdd);
    setFileInputs([]);
    setDetailRecord(null);
  }, [isAdd, request?._id]);

  useEffect(() => {
    if (isAdd || !request?._id) return;
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const { response, service } = await fetchServiceById(request._id);
        if (cancelled) return;
        if (response && service) {
          setDetailRecord(
            mergeServiceDetailForDialog(
              request as unknown as Record<string, unknown>,
              service
            ) as unknown as Record<string, unknown>
          );
        } else {
          setDetailRecord(request as unknown as Record<string, unknown>);
        }
      } catch {
        if (!cancelled) {
          setDetailRecord(request as unknown as Record<string, unknown>);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdd, request]);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<RequestedServiceFormValues>({
    defaultValues: {
      name: "",
      category_id: "",
      desc: "",
    },
  });

  useEffect(() => {
    if (isAdd) {
      reset({ name: "", category_id: "", desc: "" });
      return;
    }
    if (request && isEditing) {
      reset({
        name: request.name,
        category_id: request.category_id,
        desc: request.description ?? "",
      });
    }
  }, [isAdd, request, isEditing, reset]);

  const readImageDataUrl = (files: File[]): Promise<string | undefined> => {
    if (!files.length) return Promise.resolve(undefined);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : undefined);
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(files[0]);
    });
  };

  const onSubmitForm = async (data: RequestedServiceFormValues) => {
    const name = data.name.trim();
    const category_id = String(data.category_id ?? "").trim();
    const description = data.desc.trim();
    if (!name) {
      showErrorAlert("Service name is required");
      return;
    }
    if (!category_id) {
      showErrorAlert("Please select a category");
      return;
    }
    if (!description) {
      showErrorAlert("Description is required");
      return;
    }

    let image_url: string | undefined = request?.image_url;
    if (fileInputs.length > 0) {
      try {
        image_url = await readImageDataUrl(fileInputs);
      } catch {
        showErrorAlert("Could not read image file");
        return;
      }
    }

    if (isAdd && !image_url) {
      showErrorAlert("Please select an image");
      return;
    }

    if (isAdd) {
      const ok = await createRequestedService({
        name,
        category_id,
        description,
        image_url,
      });
      if (ok) {
        showSuccessAlert("Service request submitted");
        onRefreshData();
        onClose();
      }
      return;
    }

    if (!request?._id) {
      showErrorAlert("Unable to update. ID is missing.");
      return;
    }

    const ok = await updateRequestedService(request._id, {
      name,
      category_id,
      description,
      image_url: image_url ?? request.image_url,
    });
    if (ok) {
      showSuccessAlert("Service request updated");
      onRefreshData();
      onClose();
    }
  };

  const modalTitle = isAdd
    ? "Add service request"
    : isEditing
    ? "Edit service request"
    : "Service Request Details";

  const viewSource = useMemo(() => {
    if (!request) return null;
    const detail = detailRecord ?? (request as unknown as Record<string, unknown>);
    const approvalStatus = mapApprovalStatusFromRecord(detail);
    const rejectionReason = String(detail.rejection_reason ?? "").trim();
    const description = String(
      detail.desc ?? detail.description ?? request.description ?? ""
    ).trim();
    return {
      name: String(detail.name ?? request.name ?? "-"),
      category_name: String(
        detail.category_name ?? request.category_name ?? "-"
      ),
      service_id: String(detail.service_id ?? "").trim(),
      approvalStatus,
      requested_by: detail.requested_by ?? request.requested_by,
      rejectionReason,
      description,
      image_url: String(detail.image_url ?? request.image_url ?? ""),
      canEdit: approvalStatus === "pending",
    };
  }, [request, detailRecord]);

  const renderViewBody = () => {
    if (!request || !viewSource) return null;
    const img = resolveImageSrc(viewSource.image_url);
    const displayImg = img ?? sampleServiceViewImage;
    return (
      <section
        className="custom-other-details modal-readonly-details"
        style={{ padding: "14px 16px", borderRadius: 12 }}
      >
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h3 className="mb-0">Service Information</h3>
          {viewSource.canEdit ? (
            <i
              className="bi bi-pencil-fill fs-6 text-danger"
              style={{ cursor: "pointer" }}
              role="button"
              aria-label="Edit request"
              onClick={() => setIsEditing(true)}
            />
          ) : null}
        </div>

        {detailLoading ? (
          <p className="text-muted small mb-3">Loading details…</p>
        ) : null}

        <Row className="g-3">
          <Col xs={12} md={6}>
            <FullDetailsRow title="Service name" value={viewSource.name} />
          </Col>
          <Col xs={12} md={6}>
            <FullDetailsRow
              title="Category"
              value={viewSource.category_name}
            />
          </Col>
          {viewSource.service_id ? (
            <Col xs={12} md={6}>
              <FullDetailsRow title="Service ID" value={viewSource.service_id} />
            </Col>
          ) : null}
          <Col xs={12} md={6}>
            <FullDetailsRow
              title="Approval status"
              value={
                <span
                  style={{
                    color: requestApprovalStatusColor(viewSource.approvalStatus),
                    fontWeight: 600,
                  }}
                >
                  {requestApprovalStatusLabel(viewSource.approvalStatus)}
                </span>
              }
            />
          </Col>
          <Col xs={12} md={6}>
            <FullDetailsRow
              title="Requested by"
              value={formatRequestedBy(viewSource.requested_by)}
            />
          </Col>
          {viewSource.rejectionReason ? (
            <Col xs={12}>
              <FullDetailsRow
                title="Rejection reason"
                value={viewSource.rejectionReason}
              />
            </Col>
          ) : null}
        </Row>

        <Row className="g-3 mt-1">
          <Col xs={12}>
            <p
              className="mb-1 small text-uppercase fw-semibold"
              style={{
                color: "var(--primary-color)",
                letterSpacing: "0.04em",
              }}
            >
              Description
            </p>
            <div
              className="mb-0 w-100"
              title={viewSource.description || undefined}
              style={{
                color: "var(--content-txt-color)",
                fontSize: "0.95rem",
                lineHeight: 1.45,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                minWidth: 0,
              }}
            >
              {viewSource.description || "-"}
            </div>
          </Col>
        </Row>

        <Row className="g-3 mt-3">
          <Col xs={12}>
            <p
              className="mb-2"
              style={{ color: "var(--primary-color)", fontWeight: 600 }}
            >
              Service image
            </p>
            <img
              alt=""
              src={displayImg}
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
      </section>
    );
  };

  const existingForUploader = useMemo(
    () => (request?.image_url ? [String(request.image_url)] : []),
    [request?.image_url]
  );

  const renderFormBody = () => (
    <form
      noValidate
      id="franchise-requested-service-form"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit(onSubmitForm)(e);
      }}
    >
      <Row>
        <Col md={6}>
          <CustomFormInput
            label="Service name"
            controlId="name"
            placeholder="Enter service name"
            register={register}
            error={errors.name}
            asCol={false}
            validation={{ required: "Service name is required" }}
          />
        </Col>
        <Col md={6}>
          <CustomFormSelect
            label="Category"
            controlId="category"
            options={effectiveCategoryOptions}
            register={register as unknown as UseFormRegister<any>}
            fieldName="category_id"
            error={errors.category_id as any}
            asCol={false}
            requiredMessage="Please select category"
            placeholder="Select category"
            defaultValue={isAdd ? "" : request?.category_id ?? ""}
            setValue={(name: string, value: any) => {
              setValue(name as keyof RequestedServiceFormValues, value, {
                shouldValidate: true,
                shouldDirty: true,
                shouldTouch: true,
              });
            }}
            menuPortal
          />
        </Col>
        <Col md={12}>
          <CustomImageUploader
            label="Upload Service Image"
            maxFiles={1}
            isEditable={!isAdd}
            existingImages={existingForUploader}
            onFileChange={(files, _replaceUrls) => {
              setFileInputs(files);
            }}
          />
          <label style={{ color: "var(--primary-color)" }}>
            Image size should be 512*512
          </label>
        </Col>
        <Col md={12}>
          <CustomFormInput
            label="Description"
            controlId="desc"
            placeholder="Enter description"
            register={register}
            error={errors.desc}
            asCol={false}
            validation={{ required: "Description is required" }}
            as="textarea"
            rows={4}
          />
        </Col>
      </Row>
      <Row className="mt-4">
        <Col xs={12} className="text-center d-flex justify-content-end gap-3">
          <Button type="submit" className="custom-btn-primary">
            {isAdd ? "Submit request" : "Update"}
          </Button>
          <Button
            type="button"
            className="custom-btn-secondary"
            onClick={() => {
              if (!isAdd && isEditing) {
                setIsEditing(false);
                return;
              }
              onClose();
            }}
          >
            Cancel
          </Button>
        </Col>
      </Row>
    </form>
  );

  return (
    <Modal
      show={true}
      size="lg"
      onHide={onClose}
      centered
      scrollable
      dialogClassName="custom-big-modal"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {modalTitle}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        {!isAdd && !isEditing && renderViewBody()}
        {(isAdd || isEditing) && renderFormBody()}
      </Modal.Body>
    </Modal>
  );
};

RequestedServiceDialog.showAdd = (
  categoryOptions: CategoryOption[],
  onRefreshData: () => void
) => {
  openDialog("franchise-requested-service-modal", (close) => (
    <RequestedServiceDialog
      mode="add"
      request={null}
      categoryOptions={categoryOptions}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

RequestedServiceDialog.showView = (
  request: RequestedServiceRow,
  categoryOptions: CategoryOption[],
  onRefreshData: () => void
) => {
  openDialog("franchise-requested-service-modal", (close) => (
    <RequestedServiceDialog
      mode="view-edit"
      request={request}
      categoryOptions={categoryOptions}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default RequestedServiceDialog;
