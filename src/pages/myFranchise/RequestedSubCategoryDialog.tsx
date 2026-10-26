import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button, Row, Col } from "react-bootstrap";
import { useForm, UseFormRegister } from "react-hook-form";
import CustomCloseButton from "../../components/CustomCloseButton";
import { CustomFormInput } from "../../components/CustomFormInput";
import CustomFormSelect from "../../components/CustomFormSelect";
import CustomImageUploader from "../../components/CustomImageUploader";
import { FieldLabelText } from "../../components/RequiredFieldMark";
import { FullDetailsRow, formatRequestedBy, mapApprovalStatusFromRecord, requestApprovalStatusColor, requestApprovalStatusLabel } from "../../helper/utility";
import { openDialog } from "../../lib/global/DialogManager";
import { showErrorAlert, showSuccessAlert } from "../../lib/global/alertHelper";
import { AppConstant } from "../../lib/global/AppConstant";
import { getLocalStorage } from "../../lib/global/localStorageHelper";
import { apiRequest } from "../../lib/global/remote/apiHelper";
import { resolveExistingImageSrc } from "../../services/documentUploadService";

const CREATE_SUBCATEGORY_REQUEST_PATH = "/subcategory/create-request";
const UPDATE_SUBCATEGORY_REQUEST_PATH = (id: string) =>
  `/subcategory/update-request/${id}`;

export type SubCategoryViewDetail = {
  _id?: string;
  name: string;
  description: string;
  imageUrl: string;
  isRequest: boolean;
  isActive: boolean;
  category_id?: string;
  requestedBy?: unknown;
  approvalRecord?: Record<string, unknown>;
};

type CategoryOption = { value: string; label: string };

type SubCategoryRequestFormValues = {
  name: string;
  category_id: string;
  desc: string;
};

type RequestedSubCategoryDialogProps = {
  onClose: () => void;
  onRefreshData: () => void;
  categoryOptions: CategoryOption[];
};

const SubCategoryDetailsView: React.FC<{
  detail: SubCategoryViewDetail;
  onClose: () => void;
  onRefreshData: () => void;
}> = ({ detail, onClose, onRefreshData }) => {
  const approvalStatus = mapApprovalStatusFromRecord(detail.approvalRecord);
  const canEdit = approvalStatus === "pending";
  const [isEditing, setIsEditing] = useState(false);
  const [fileInputs, setFileInputs] = useState<File[]>([]);
  const imageSrc = detail.imageUrl
    ? resolveExistingImageSrc(detail.imageUrl)
    : "";
  const rejectionReason = String(
    (detail.approvalRecord as { rejection_reason?: unknown } | undefined)
      ?.rejection_reason ?? ""
  ).trim();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SubCategoryRequestFormValues>({
    defaultValues: {
      name: detail.name ?? "",
      category_id: String(detail.category_id ?? ""),
      desc: detail.description ?? "",
    },
  });

  useEffect(() => {
    if (!isEditing) return;
    reset({
      name: detail.name ?? "",
      category_id: String(detail.category_id ?? ""),
      desc: detail.description ?? "",
    });
    setFileInputs([]);
  }, [isEditing, detail, reset]);

  const existingForUploader = useMemo(
    () => (detail.imageUrl ? [String(detail.imageUrl)] : []),
    [detail.imageUrl]
  );

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

  const onSubmitEdit = async (data: SubCategoryRequestFormValues) => {
    const subcategoryId = String(detail._id ?? "").trim();
    if (!subcategoryId) {
      showErrorAlert("Unable to update. ID is missing.");
      return;
    }
    const name = data.name.trim();
    const description = data.desc.trim();
    if (!name) {
      showErrorAlert("Sub category name is required");
      return;
    }
    if (!description) {
      showErrorAlert("Description is required");
      return;
    }

    let image_url: string | undefined = detail.imageUrl;
    if (fileInputs.length > 0) {
      try {
        image_url = await readImageDataUrl(fileInputs);
      } catch {
        showErrorAlert("Could not read image file");
        return;
      }
    }
    if (!image_url) {
      showErrorAlert("Please select an image");
      return;
    }

    const franchiseId = String(
      getLocalStorage(AppConstant.partnerId) ?? ""
    ).trim();
    const response = await apiRequest(
      UPDATE_SUBCATEGORY_REQUEST_PATH(subcategoryId),
      "PUT",
      {
        name,
        category_id: String(detail.category_id ?? "").trim(),
        service_ids: [] as string[],
        desc: description,
        image_url,
        city_ids: [] as string[],
        state_ids: [] as string[],
        ...(franchiseId ? { franchise_id: franchiseId } : {}),
        is_request: true,
        is_active: false,
      },
      false,
      false,
      false,
      true
    );
    if (response.success) {
      showSuccessAlert("Sub category request updated");
      onRefreshData();
      onClose();
    }
  };

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
          {isEditing ? "Edit sub category" : "Sub Category Details"}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        {isEditing ? (
          <form
            noValidate
            id="franchise-edit-requested-sub-category-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit(onSubmitEdit)(e);
            }}
          >
            <Row className="g-3">
              <Col xs={12}>
                <CustomFormInput
                  label="Sub category name"
                  controlId="name"
                  placeholder="Enter sub category name"
                  register={register}
                  error={errors.name}
                  asCol={false}
                  validation={{ required: "Sub category name is required" }}
                />
              </Col>
              <Col xs={12} md={6}>
                <CustomImageUploader
                  label="Upload sub category image"
                  maxFiles={1}
                  isEditable
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
                  placeholder="Describe the sub category and how it will be used"
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
        ) : (
          <section
            className="custom-other-details modal-readonly-details"
            style={{ padding: "14px 16px", borderRadius: 12 }}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="mb-0">Sub Category Information</h3>
              {canEdit ? (
                <i
                  className="bi bi-pencil-fill fs-6 text-danger"
                  style={{ cursor: "pointer" }}
                  role="button"
                  aria-label="Edit request"
                  onClick={() => setIsEditing(true)}
                />
              ) : null}
            </div>
            <Row className="g-3 align-items-start">
              <Col xs={12} md={6}>
                <FullDetailsRow title="Sub Category Name" value={detail.name} />
              </Col>
              <Col xs={12} md={6}>
                <FullDetailsRow
                  title="Approval status"
                  value={
                    <span
                      style={{
                        color: requestApprovalStatusColor(approvalStatus),
                        fontWeight: 600,
                      }}
                    >
                      {requestApprovalStatusLabel(approvalStatus)}
                    </span>
                  }
                />
              </Col>
            </Row>
            <Row className="g-3 align-items-start mt-1">
              <Col xs={12} md={6}>
                <FullDetailsRow
                  title="Requested by"
                  value={formatRequestedBy(detail.requestedBy)}
                />
              </Col>
            </Row>
            {rejectionReason ? (
              <Row className="g-3 mt-1">
                <Col xs={12}>
                  <FullDetailsRow
                    title="Rejection reason"
                    value={rejectionReason}
                  />
                </Col>
              </Row>
            ) : null}
            <Row className="g-3 mt-1">
              <Col xs={12}>
                <h3>Description</h3>
                <div
                  className="mb-0 w-100"
                  title={detail.description || undefined}
                  style={{
                    color: "var(--content-txt-color)",
                    fontSize: "0.95rem",
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    minWidth: 0,
                  }}
                >
                  {detail.description || "-"}
                </div>
              </Col>
            </Row>
            <Row className="g-3 mt-3 align-items-start">
              <Col xs={12}>
                <p
                  className="mb-2"
                  style={{ color: "var(--primary-color)", fontWeight: 600 }}
                >
                  Sub category image
                </p>
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt="Sub category"
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
          </section>
        )}
      </Modal.Body>
      {isEditing ? (
        <Modal.Footer className="border-0 px-4 pb-4 pt-0">
          <Button
            type="submit"
            form="franchise-edit-requested-sub-category-form"
            className="custom-btn-primary"
          >
            Update
          </Button>
          <Button
            type="button"
            className="custom-btn-secondary"
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </Button>
        </Modal.Footer>
      ) : null}
    </Modal>
  );
};

const RequestedSubCategoryDialog: React.FC<RequestedSubCategoryDialogProps> & {
  showAdd: (
    categoryOptions: CategoryOption[],
    onRefreshData: () => void
  ) => void;
  showView: (
    detail: SubCategoryViewDetail,
    onRefreshData: () => void
  ) => void;
} = ({ onClose, onRefreshData, categoryOptions }) => {
  const [fileInputs, setFileInputs] = useState<File[]>([]);
  /** Category options come from franchise `GET /franchise-category/getAll` via My Franchise. */
  const effectiveCategoryOptions = categoryOptions;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SubCategoryRequestFormValues>({
    defaultValues: { name: "", category_id: "", desc: "" },
  });

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

  const onSubmitForm = async (data: SubCategoryRequestFormValues) => {
    const name = data.name.trim();
    const category_id = String(data.category_id ?? "").trim();
    const description = data.desc.trim();
    if (!name) {
      showErrorAlert("Sub category name is required");
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
    if (!fileInputs.length) {
      showErrorAlert("Please select an image");
      return;
    }

    let image_url: string | undefined;
    try {
      image_url = await readImageDataUrl(fileInputs);
    } catch {
      showErrorAlert("Could not read image file");
      return;
    }
    if (!image_url) {
      showErrorAlert("Please select an image");
      return;
    }

    const franchiseId = String(
      getLocalStorage(AppConstant.partnerId) ?? ""
    ).trim();
    const response = await apiRequest(
      CREATE_SUBCATEGORY_REQUEST_PATH,
      "POST",
      {
        name,
        category_id,
        service_ids: [] as string[],
        desc: description,
        image_url,
        city_ids: [] as string[],
        state_ids: [] as string[],
        ...(franchiseId ? { franchise_id: franchiseId } : {}),
        is_request: true,
      },
      false,
      false,
      false,
      true
    );
    if (response.success) {
      showSuccessAlert("Sub category request submitted");
      onRefreshData();
      onClose();
    }
  };

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
          Add sub category
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        <form
          noValidate
          id="franchise-requested-sub-category-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(onSubmitForm)(e);
          }}
        >
          <Row className="g-3">
            <Col xs={12} md={6}>
              <CustomFormInput
                label="Sub category name"
                controlId="name"
                placeholder="Enter sub category name"
                register={register}
                error={errors.name}
                asCol={false}
                validation={{ required: "Sub category name is required" }}
              />
            </Col>
            <Col xs={12} md={6}>
              <CustomFormSelect
                label="Category"
                controlId="sub-category-request-category"
                options={effectiveCategoryOptions}
                register={register as unknown as UseFormRegister<any>}
                fieldName="category_id"
                error={errors.category_id}
                asCol={false}
                requiredMessage="Please select a category"
                placeholder="Select category"
                defaultValue=""
                setValue={(name: string, value: unknown) => {
                  setValue(
                    name as keyof SubCategoryRequestFormValues,
                    value as string,
                    {
                      shouldValidate: true,
                      shouldDirty: true,
                      shouldTouch: true,
                    }
                  );
                }}
                menuPortal
              />
            </Col>
            <Col xs={12} md={6}>
              <label className="form-label fw-medium mb-2 d-block">
                <FieldLabelText label="Upload sub category image" required />
              </label>
              <CustomImageUploader
                label="Upload sub category image"
                hideLabel
                maxFiles={1}
                isEditable={false}
                existingImages={[]}
                onFileChange={(files) => {
                  setFileInputs(files);
                }}
              />
            </Col>
            <Col xs={12} md={6}>
              <CustomFormInput
                label="Description"
                controlId="desc"
                placeholder="Describe the sub category and how it will be used"
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
      </Modal.Body>
      <Modal.Footer className="border-0 px-4 pb-4 pt-0">
        <Button
          type="submit"
          form="franchise-requested-sub-category-form"
          className="custom-btn-primary"
        >
          Submit request
        </Button>
        <Button
          type="button"
          className="custom-btn-secondary"
          onClick={onClose}
        >
          Cancel
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

RequestedSubCategoryDialog.showView = (
  detail: SubCategoryViewDetail,
  onRefreshData: () => void
) => {
  openDialog("franchise-sub-category-details-modal", (close) => (
    <SubCategoryDetailsView
      detail={detail}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

RequestedSubCategoryDialog.showAdd = (
  categoryOptions: CategoryOption[],
  onRefreshData: () => void
) => {
  openDialog("franchise-requested-sub-category-modal", (close) => (
    <RequestedSubCategoryDialog
      categoryOptions={categoryOptions}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default RequestedSubCategoryDialog;
