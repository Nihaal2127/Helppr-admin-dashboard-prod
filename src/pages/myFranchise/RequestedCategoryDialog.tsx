import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button, Row, Col } from "react-bootstrap";
import { useForm } from "react-hook-form";
import CustomCloseButton from "../../components/CustomCloseButton";
import { CustomFormInput } from "../../components/CustomFormInput";
import CustomImageUploader from "../../components/CustomImageUploader";
import {
  FullDetailsRow,
  formatRequestedBy,
  mapApprovalStatusFromRecord,
  mergeCategoryDetailForDialog,
  requestApprovalStatusColor,
  requestApprovalStatusLabel,
} from "../../helper/utility";
import { openDialog } from "../../lib/global/DialogManager";
import { showErrorAlert, showSuccessAlert } from "../../lib/global/alertHelper";
import { AppConstant } from "../../lib/global/AppConstant";
import type { RequestedCategoryRow } from "../../services/myFranchiseService";
import {
  createRequestedCategory,
  updateRequestedCategory,
} from "../../services/myFranchiseService";
import { fetchCategoryById } from "../../services/categoryService";
import sampleCategoryViewImage from "../../assets/icons/profile.svg";

type RequestedCategoryFormValues = {
  name: string;
  desc: string;
};

type RequestedCategoryDialogProps = {
  onClose: () => void;
  onRefreshData: () => void;
} & (
  | { mode: "add"; request: null }
  | { mode: "view-edit"; request: RequestedCategoryRow }
);

function resolveImageSrc(url?: string): string | null {
  if (!url || !String(url).trim()) return null;
  const u = String(url).trim();
  if (u.startsWith("data:")) return u;
  return `${AppConstant.IMAGE_BASE_URL}${u}?t=${Date.now()}`;
}

const RequestedCategoryDialog: React.FC<RequestedCategoryDialogProps> & {
  showAdd: (onRefreshData: () => void) => void;
  showView: (request: RequestedCategoryRow, onRefreshData: () => void) => void;
} = (props) => {
  const { onClose, onRefreshData } = props;
  const isAdd = props.mode === "add";
  const request = isAdd ? null : props.request;

  const [isEditing, setIsEditing] = useState(isAdd);
  const [fileInputs, setFileInputs] = useState<File[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecord, setDetailRecord] = useState<Record<string, unknown> | null>(
    null
  );

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
        const { response, category } = await fetchCategoryById(request._id);
        if (cancelled) return;
        if (response && category) {
          setDetailRecord(
            mergeCategoryDetailForDialog(
              request as unknown as Record<string, unknown>,
              category
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
    reset,
    formState: { errors },
  } = useForm<RequestedCategoryFormValues>({
    defaultValues: { name: "", desc: "" },
  });

  useEffect(() => {
    if (isAdd) {
      reset({ name: "", desc: "" });
      return;
    }
    if (request && isEditing) {
      reset({
        name: request.name,
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

  const onSubmitForm = async (data: RequestedCategoryFormValues) => {
    const name = data.name.trim();
    const description = data.desc.trim();
    if (!name) {
      showErrorAlert("Category name is required");
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

    const payload = {
      name,
      service_ids: isAdd
        ? ([] as string[])
        : (request?.service_ids ?? []).map(String),
      description,
      image_url,
    };

    if (isAdd) {
      const ok = await createRequestedCategory(payload);
      if (ok) {
        showSuccessAlert("Category request submitted");
        onRefreshData();
        onClose();
      }
      return;
    }

    if (!request?._id) {
      showErrorAlert("Unable to update. ID is missing.");
      return;
    }

    const ok = await updateRequestedCategory(request._id, {
      ...payload,
      image_url: image_url ?? request.image_url,
    });
    if (ok) {
      showSuccessAlert("Category request updated");
      onRefreshData();
      onClose();
    }
  };

  const modalTitle = isAdd
    ? "Add category"
    : isEditing
    ? "Edit category"
    : "Category Request Details";

  const viewSource = useMemo(() => {
    if (!request) return null;
    const detail = detailRecord ?? (request as unknown as Record<string, unknown>);
    const approvalStatus = mapApprovalStatusFromRecord(detail);
    const rejectionReason = String(detail.rejection_reason ?? "").trim();
    const description = String(
      detail.desc ?? detail.description ?? request.description ?? ""
    ).trim();
    const serviceNames = Array.isArray(detail.service_names)
      ? (detail.service_names as string[]).filter(Boolean)
      : request.service_names ?? [];
    return {
      name: String(detail.name ?? request.name ?? "-"),
      approvalStatus,
      requested_by: detail.requested_by ?? request.requested_by,
      rejectionReason,
      description,
      serviceNames,
      image_url: String(detail.image_url ?? request.image_url ?? ""),
      canEdit: approvalStatus === "pending",
    };
  }, [request, detailRecord]);

  const renderViewBody = () => {
    if (!request || !viewSource) return null;
    const img = resolveImageSrc(viewSource.image_url);
    const displayImg = img ?? sampleCategoryViewImage;
    return (
      <section
        className="custom-other-details modal-readonly-details"
        style={{ padding: "14px 16px", borderRadius: 12 }}
      >
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h3 className="mb-0">Category Information</h3>
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
            <FullDetailsRow title="Category name" value={viewSource.name} />
          </Col>
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
          {viewSource.serviceNames.length > 0 ? (
            <Col xs={12}>
              <FullDetailsRow
                title="Services"
                value={viewSource.serviceNames.join(", ")}
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
              Category image
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
      id="franchise-requested-category-form"
      className="franchise-requested-category-form"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit(onSubmitForm)(e);
      }}
    >
      <Row className="g-3">
        <Col xs={12}>
          <CustomFormInput
            label="Category name"
            controlId="name"
            placeholder="Enter category name"
            register={register}
            error={errors.name}
            asCol={false}
            validation={{ required: "Category name is required" }}
          />
        </Col>
        <Col xs={12} md={6}>
          <CustomImageUploader
            label="Upload category image"
            maxFiles={1}
            isEditable={!isAdd}
            existingImages={existingForUploader}
            onFileChange={(files) => {
              setFileInputs(files);
            }}
          />
        </Col>
        <Col xs={12} md={6}>
          <CustomFormInput
            label="Description"
            controlId="desc"
            placeholder="Describe the category and how it will be used"
            register={register}
            error={errors.desc}
            asCol={false}
            validation={{ required: "Description is required" }}
            as="textarea"
            rows={5}
          />
        </Col>
      </Row>
    </form>
  );

  return (
    <Modal
      show
      size="lg"
      onHide={onClose}
      centered
      scrollable
      dialogClassName="custom-big-modal"
      enforceFocus={false}
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
      {(isAdd || isEditing) && (
        <Modal.Footer className="border-0 px-4 pb-4 pt-0">
          <Button
            type="submit"
            form="franchise-requested-category-form"
            className="custom-btn-primary"
          >
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
        </Modal.Footer>
      )}
    </Modal>
  );
};

RequestedCategoryDialog.showAdd = (onRefreshData: () => void) => {
  openDialog("franchise-requested-category-modal", (close) => (
    <RequestedCategoryDialog
      mode="add"
      request={null}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

RequestedCategoryDialog.showView = (
  request: RequestedCategoryRow,
  onRefreshData: () => void
) => {
  openDialog("franchise-requested-category-modal", (close) => (
    <RequestedCategoryDialog
      mode="view-edit"
      request={request}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default RequestedCategoryDialog;
