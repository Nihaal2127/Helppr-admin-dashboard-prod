import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Row, Col, Form, Button } from "react-bootstrap";
import { useForm, UseFormRegister } from "react-hook-form";
import CustomCloseButton from "../../../components/CustomCloseButton";
import CustomFormSelect from "../../../components/CustomFormSelect";
import { resolveExistingImageSrc } from "../../../components/CustomImageUploader";
import { CustomFormInput } from "../../../components/CustomFormInput";
import { openDialog } from "../../../lib/global/DialogManager";
import { DetailsRow, WideLabelValueBlock } from "../../../helper/utility";
import {
  addPartnerPostMock,
  moderatePartnerPost,
  postStatusDisplayLabel,
  postStatusTextClass,
  updatePartnerPostStatus,
  USE_MOCK_PARTNER_POSTS_API,
} from "../../../services/partnerManagementService";
import type { PostModel } from "../../../lib/types/partnerManagementTypes";

type AddEditPostManagementDialogProps = {
  isEditable: boolean;
  post: PostModel | null;
  onClose: () => void;
  onRefreshData: () => void;
};

type MediaItem = {
  id: number;
  type: "image" | "video";
  url: string;
  title: string;
};

const VIEW_DEMO_MEDIA: MediaItem[] = [
  {
    id: 1,
    type: "image",
    url: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=900&q=80",
    title: "Wedding Image 1",
  },
  {
    id: 2,
    type: "image",
    url: "https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=900&q=80",
    title: "Wedding Image 2",
  },
  {
    id: 3,
    type: "video",
    url: "https://www.w3schools.com/html/mov_bbb.mp4",
    title: "Teaser Video 1",
  },
  {
    id: 4,
    type: "video",
    url: "https://www.w3schools.com/html/movie.mp4",
    title: "Teaser Video 2",
  },
];

type PostAddFormValues = {
  post_partner_name: string;
  post_description: string;
  post_moderation_status: PostModel["status"];
};

const POST_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
  { value: "removed", label: "Removed" },
];

const AddEditPostManagementDialog: React.FC<
  AddEditPostManagementDialogProps
> = ({ isEditable, post, onClose, onRefreshData }) => {
  const formData: PostModel = useMemo(
    () =>
      post || {
        partner_id: "",
        partner_name: "",
        description: "",
        media_type: "image",
        location: "",
        uploaded_date: "",
        status: "published",
      },
    [post]
  );

  const isAddMode = isEditable && !post;
  const isViewMode = !isEditable;

  const { register, setValue, watch, reset } = useForm<PostAddFormValues>({
    defaultValues: {
      post_partner_name: "",
      post_description: "",
      post_moderation_status: "published",
    },
  });

  const [activeMediaTab, setActiveMediaTab] = useState<"image" | "video">(
    "image"
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusDraftInModal, setStatusDraftInModal] = useState<
    PostModel["status"]
  >(formData.status);

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>([]);
  const nextMediaIdRef = useRef(1);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  const [displayStatus, setDisplayStatus] = useState<PostModel["status"]>(
    formData.status
  );

  useEffect(() => {
    setDisplayStatus(formData.status);
    setStatusDraftInModal(formData.status);
  }, [formData.status, post?._id, post?.id]);

  useEffect(() => {
    if (isAddMode) {
      reset({
        post_partner_name: "",
        post_description: "",
      });
      setMediaItems([]);
      setSelectedMediaIds([]);
      nextMediaIdRef.current = 1;
    } else if (isViewMode && post) {
      const imageItems: MediaItem[] = (post.images ?? []).map((url, idx) => ({
        id: idx + 1,
        type: "image" as const,
        url: resolveExistingImageSrc(url),
        title: `Image ${idx + 1}`,
      }));
      const videoItems: MediaItem[] = (post.videos ?? []).map((url, idx) => ({
        id: imageItems.length + idx + 1,
        type: "video" as const,
        url: resolveExistingImageSrc(url),
        title: `Video ${idx + 1}`,
      }));
      const fromApi = [...imageItems, ...videoItems].filter((item) =>
        Boolean(item.url?.trim())
      );
      setMediaItems(fromApi.length > 0 ? fromApi : VIEW_DEMO_MEDIA);
      setSelectedMediaIds([]);
      nextMediaIdRef.current =
        (fromApi.length > 0 ? fromApi.length : VIEW_DEMO_MEDIA.length) + 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when dialog mode/post identity changes
  }, [
    isAddMode,
    isViewMode,
    post?._id,
    post?.id,
    post?.images,
    post?.videos,
    reset,
  ]);

  const openStatusModal = (): void => {
    setStatusDraftInModal(displayStatus);
    setValue("post_moderation_status", displayStatus);
    setStatusModalOpen(true);
  };

  const toggleMediaSelection = (id: number): void => {
    setSelectedMediaIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = (): void => {
    if (selectedMediaIds.length === 0) return;
    setShowDeleteDialog(true);
  };

  const confirmDeleteSelected = (): void => {
    setMediaItems((prev) => {
      const removing = prev.filter((item) =>
        selectedMediaIds.includes(item.id)
      );
      removing.forEach((item) => {
        if (item.url.startsWith("blob:")) URL.revokeObjectURL(item.url);
      });
      return prev.filter((item) => !selectedMediaIds.includes(item.id));
    });
    setSelectedMediaIds([]);
    setShowDeleteDialog(false);
    onRefreshData();
  };

  const addMediaFromFiles = (
    files: FileList | null,
    type: "image" | "video"
  ): void => {
    if (!files?.length) return;
    const additions: MediaItem[] = Array.from(files).map((file) => {
      const id = nextMediaIdRef.current++;
      return {
        id,
        type,
        url: URL.createObjectURL(file),
        title: file.name.replace(/\.[^/.]+$/, "") || file.name,
      };
    });
    setMediaItems((prev) => [...prev, ...additions]);
  };

  const filteredMedia = mediaItems.filter(
    (item) => item.type === activeMediaTab
  );

  const mediaToolbar = (
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div className="d-flex gap-2">
        <Button
          variant={activeMediaTab === "image" ? "danger" : "outline-secondary"}
          size="sm"
          className={activeMediaTab === "image" ? "" : "custom-btn-secondary"}
          onClick={() => setActiveMediaTab("image")}
        >
          Images
        </Button>
        <Button
          variant={activeMediaTab === "video" ? "danger" : "outline-secondary"}
          size="sm"
          className={activeMediaTab === "video" ? "" : "custom-btn-secondary"}
          onClick={() => setActiveMediaTab("video")}
        >
          Videos
        </Button>
      </div>
      <Button
        variant="outline-secondary"
        size="sm"
        className="custom-btn-secondary"
        onClick={handleDeleteSelected}
        disabled={selectedMediaIds.length === 0}
      >
        Delete selected
      </Button>
    </div>
  );

  const mediaGrid = (
    <Row className="g-2">
      {filteredMedia.length > 0 ? (
        filteredMedia.map((media) => (
          <Col md={6} lg={4} key={media.id}>
            <div className="h-100 border rounded overflow-hidden bg-white">
              <div className="px-2 pt-2 pb-1">
                <Form.Check
                  type="checkbox"
                  checked={selectedMediaIds.includes(media.id)}
                  onChange={() => toggleMediaSelection(media.id)}
                  label="Select"
                  className="small"
                />
              </div>
              {media.type === "image" ? (
                <img
                  src={media.url}
                  alt={media.title}
                  className="d-block w-100"
                  style={{
                    height: "160px",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <video
                  controls
                  className="d-block w-100"
                  style={{ height: "160px", objectFit: "cover" }}
                >
                  <source src={media.url} type="video/mp4" />
                </video>
              )}
              <div
                className="px-2 py-2 small fw-medium"
                style={{ color: "var(--txt-color)" }}
              >
                {media.title}
              </div>
            </div>
          </Col>
        ))
      ) : (
        <Col md={12}>
          <div
            className="text-center py-4 rounded text-muted small"
            style={{
              border: "1px dashed var(--lb1-border, #dee2e6)",
              backgroundColor: "rgba(0,0,0,0.02)",
            }}
          >
            No {activeMediaTab === "image" ? "images" : "videos"} yet — use the
            upload area
            {isAddMode ? " above" : ""} to add some.
          </div>
        </Col>
      )}
    </Row>
  );

  const addMediaUploadZones = isAddMode ? (
    <Row className="g-3 mb-3">
      <Col md={6}>
        <div
          className="rounded p-3 h-100"
          style={{
            border: "2px dashed var(--lb1-border, #dee2e6)",
            backgroundColor: "rgba(0,0,0,0.02)",
          }}
        >
          <div className="fw-medium mb-1" style={{ color: "var(--txt-color)" }}>
            Add images
          </div>
          <p className="text-muted small mb-2 mb-md-3">
            Choose JPG, PNG or WEBP files. You can select multiple files at
            once.
          </p>
          <input
            ref={imageFileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="d-none"
            onChange={(e) => {
              addMediaFromFiles(e.target.files, "image");
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline-secondary"
            size="sm"
            className="custom-btn-secondary"
            onClick={() => imageFileInputRef.current?.click()}
          >
            <i className="bi bi-image me-1" aria-hidden />
            Choose images
          </Button>
        </div>
      </Col>
      <Col md={6}>
        <div
          className="rounded p-3 h-100"
          style={{
            border: "2px dashed var(--lb1-border, #dee2e6)",
            backgroundColor: "rgba(0,0,0,0.02)",
          }}
        >
          <div className="fw-medium mb-1" style={{ color: "var(--txt-color)" }}>
            Add videos
          </div>
          <p className="text-muted small mb-2 mb-md-3">
            Choose MP4 or other supported video files. Preview appears in the
            list below.
          </p>
          <input
            ref={videoFileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="d-none"
            onChange={(e) => {
              addMediaFromFiles(e.target.files, "video");
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline-secondary"
            size="sm"
            className="custom-btn-secondary"
            onClick={() => videoFileInputRef.current?.click()}
          >
            <i className="bi bi-camera-video me-1" aria-hidden />
            Choose videos
          </Button>
        </div>
      </Col>
    </Row>
  ) : null;

  const partnerNameVal = watch("post_partner_name");
  const descriptionVal = watch("post_description");

  const addFormSection = isAddMode ? (
    <div className="pt-1">
      <Row className="gx-3 gy-2">
        <Col md={12}>
          <CustomFormInput
            label="Partner Name"
            controlId="post_partner_name"
            placeholder="Enter partner name"
            register={register}
            asCol={false}
            value={partnerNameVal}
            onChange={(v) =>
              setValue("post_partner_name", v, { shouldDirty: true })
            }
          />
        </Col>
        <Col md={12}>
          <CustomFormInput
            label="Description"
            controlId="post_description"
            placeholder="Enter description"
            register={register}
            asCol={false}
            as="textarea"
            rows={4}
            value={descriptionVal}
            onChange={(v) =>
              setValue("post_description", v, { shouldDirty: true })
            }
          />
        </Col>
      </Row>
    </div>
  ) : null;

  const statusValueEl = (
    <span className={postStatusTextClass(displayStatus)}>
      {postStatusDisplayLabel(displayStatus)}
    </span>
  );

  return (
    <>
      <Modal show={true} onHide={onClose} centered size="lg">
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            {isEditable
              ? post
                ? "Edit Post"
                : "Add Post"
              : "Post information"}
          </Modal.Title>
          <CustomCloseButton onClose={onClose} />
        </Modal.Header>

        <Modal.Body
          className="px-4 pb-4 pt-0"
          style={{ maxHeight: "70vh", overflowY: "auto" }}
        >
          {isViewMode ? (
            <div className="custom-other-details" style={{ padding: "10px" }}>
              <Row className="align-items-center mb-2">
                <Col>
                  <h3 className="mb-0" style={{ color: "#000" }}>
                    Post
                  </h3>
                </Col>
                <Col xs="auto" className="text-end">
                  <i
                    className="bi bi-pencil-square fs-5"
                    role="button"
                    title="Edit status"
                    onClick={openStatusModal}
                    style={{ cursor: "pointer", color: "var(--primary-color)" }}
                  />
                </Col>
              </Row>

              <Row>
                <Col md={6} className="custom-helper-column">
                  <DetailsRow
                    title="Partner Name"
                    value={formData.partner_name || "—"}
                  />
                  <DetailsRow
                    title="Uploaded Date"
                    value={formData.uploaded_date || "—"}
                  />
                </Col>
                <Col md={6} className="custom-helper-column">
                  <DetailsRow title="Status" value={statusValueEl} />
                </Col>
              </Row>

              <Row className="mt-2">
                <Col md={12}>
                  <WideLabelValueBlock label="Description">
                    {formData.description || "—"}
                  </WideLabelValueBlock>
                </Col>
              </Row>

              <div
                className="fw-medium mt-4 mb-2"
                style={{ color: "var(--txt-color)" }}
              >
                Media
              </div>
              {mediaToolbar}
              {mediaGrid}
            </div>
          ) : (
            <div className="custom-other-details" style={{ padding: "10px" }}>
              {addFormSection}
              {addMediaUploadZones}
              <div
                className="fw-medium mt-2 mb-2"
                style={{ color: "var(--txt-color)" }}
              >
                Media library
              </div>
              {mediaToolbar}
              {mediaGrid}
            </div>
          )}
        </Modal.Body>

        {isViewMode ? (
          <Modal.Footer className="d-flex flex-wrap gap-2 justify-content-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              className="btn-danger"
              type="button"
              onClick={openStatusModal}
            >
              Edit status
            </Button>
          </Modal.Footer>
        ) : isAddMode ? (
          <Modal.Footer>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="btn-danger"
              onClick={() => {
                const name = (watch("post_partner_name") || "").trim();
                const desc = (watch("post_description") || "").trim();
                const mediaType: "image" | "video" = mediaItems.some(
                  (m) => m.type === "video"
                )
                  ? "video"
                  : "image";
                if (!name || !desc) return;
                addPartnerPostMock({
                  partner_name: name,
                  description: desc,
                  media_type: mediaType,
                  location: "",
                });
                onRefreshData();
                onClose();
              }}
              disabled={!partnerNameVal?.trim() || !descriptionVal?.trim()}
            >
              Save post
            </Button>
          </Modal.Footer>
        ) : null}
      </Modal>

      <Modal
        show={statusModalOpen}
        onHide={() => setStatusModalOpen(false)}
        centered
        size="sm"
        enforceFocus={false}
      >
        <Modal.Header className="py-3 px-3 border-bottom-0 d-flex align-items-center justify-content-between">
          <Modal.Title as="h6" className="custom-modal-title mb-0">
            Change post visibility
          </Modal.Title>
          <CustomCloseButton onClose={() => setStatusModalOpen(false)} />
        </Modal.Header>
        <Modal.Body className="px-3 pb-3 pt-0">
          <CustomFormSelect
            label="Post status"
            controlId="post_moderation_status"
            options={POST_STATUS_OPTIONS}
            register={register as unknown as UseFormRegister<any>}
            fieldName="post_moderation_status"
            asCol={false}
            isClearable={false}
            defaultValue={statusDraftInModal}
            setValue={(name, value) => {
              setValue(name as keyof PostAddFormValues, value as never);
            }}
            onChange={(e) =>
              setStatusDraftInModal(e.target.value as PostModel["status"])
            }
            menuPortal
          />
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setStatusModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            className="btn-danger"
            size="sm"
            onClick={() => {
              void (async () => {
                const postKey = formData._id ?? formData.id;
                if (USE_MOCK_PARTNER_POSTS_API) {
                  updatePartnerPostStatus(postKey, statusDraftInModal);
                } else {
                  const ok = await moderatePartnerPost(
                    String(postKey ?? ""),
                    statusDraftInModal
                  );
                  if (!ok) return;
                }
                setDisplayStatus(statusDraftInModal);
                onRefreshData();
                setStatusModalOpen(false);
              })();
            }}
          >
            Save
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showDeleteDialog}
        onHide={() => setShowDeleteDialog(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete selected{" "}
          {activeMediaTab === "image" ? "images" : "videos"}?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setShowDeleteDialog(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDeleteSelected}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

const AddEditPostManagementDialogWithShow =
  AddEditPostManagementDialog as typeof AddEditPostManagementDialog & {
    show: (
      isEditable: boolean,
      post: PostModel | null,
      onRefreshData: () => void
    ) => void;
  };

AddEditPostManagementDialogWithShow.show = (
  isEditable: boolean,
  post: PostModel | null,
  onRefreshData: () => void
) => {
  openDialog("post-management-info-dialog", (close) => (
    <AddEditPostManagementDialog
      isEditable={isEditable}
      post={post}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default AddEditPostManagementDialogWithShow;
