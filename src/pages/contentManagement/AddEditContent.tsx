import React, { useEffect, useMemo, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import CustomHeader from "../../components/CustomHeader";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { useForm } from "react-hook-form";
import { showErrorAlert } from "../../lib/global/alertHelper";
import {
  fetchContentById,
  normalizeEditorHtml,
  saveContentWithApi,
} from "../../services/contentManagementService";

const AddEditContent = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const { register, setValue } = useForm<any>();
  const contentData = (location.state as any)?.contentData;

  const [title, setTitle] = useState(contentData?.title || "");
  const [content, setContent] = useState(contentData?.description || "");
  const [contentId, setContentId] = useState<string>(
    String(contentData?.id ?? id ?? "").trim()
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const isEditMode = useMemo(() => Boolean(contentId), [contentId]);

  const hydrateEditor = async (targetId: string) => {
    const cleanId = String(targetId ?? "").trim();
    if (!cleanId) return;
    setIsLoadingContent(true);
    const latest = await fetchContentById(cleanId);
    setIsLoadingContent(false);
    if (!latest) return;
    setTitle(latest.title ?? "");
    setContent(latest.description ?? "");
    setContentId(String(latest.id ?? cleanId));
  };

  useEffect(() => {
    const routeId = String(id ?? "").trim();
    const stateId = String(contentData?.id ?? "").trim();
    const targetId = routeId || stateId;
    if (!targetId) return;
    setContentId(targetId);
    hydrateEditor(targetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    const cleanedTitle = title.trim();
    const normalizedContent = normalizeEditorHtml(content);
    if (!cleanedTitle) {
      showErrorAlert("Please enter heading/title.");
      return;
    }
    if (!normalizedContent) {
      showErrorAlert("Please enter content.");
      return;
    }

    setIsSaving(true);
    const saveResult = await saveContentWithApi({
      id: contentId || undefined,
      title: cleanedTitle,
      description: normalizedContent,
    });
    if (!saveResult.ok) {
      setIsSaving(false);
      return;
    }

    await hydrateEditor(saveResult.id);
    setIsSaving(false);
    // showInfoAlert("Content is saved and editor is refreshed with latest data.");
  };

  const quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline"],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ align: [] }],
      ["link", "image"],
      ["clean"],
    ],
  };

  return (
    <div className="main-page-content d-flex flex-column vh-100">
      <CustomHeader
        title="Content Management"
        register={register}
        setValue={setValue}
        hideFranchiseDropdown
      />

      <div className="card shadow-sm border-0 flex-grow-1 d-flex flex-column">
        <div className="card-body p-4 d-flex flex-column h-100">
          {/* Heading + More */}
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="financial-subpage-back text-danger"
                onClick={() => navigate("/content-management")}
                aria-label="Back to content list"
              >
                <i className="bi bi-chevron-left" aria-hidden="true" />
              </button>
              <h5 className="fw-bold text-uppercase mb-0 text-danger">
                {isEditMode ? "Edit Content" : "Add Content"}
              </h5>
            </div>
          </div>

          {/* Title Input (no label) */}
          <div className="mb-4">
            <Form.Control
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title"
              className="py-2 "
            />
          </div>

          {/* Editor */}
          <div>
            <ReactQuill
              className="quill-editor"
              theme="snow"
              value={content}
              onChange={setContent}
              modules={quillModules}
              readOnly={isLoadingContent || isSaving}
            />
          </div>

          {/* Buttons */}
          <div className="d-flex justify-content-end gap-2 mt-3">
            <Button
              variant="outline-danger"
              onClick={() => navigate("/content-management")}
            >
              Cancel
            </Button>

            <Button
              variant="danger"
              onClick={handleSave}
              disabled={isSaving || isLoadingContent}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddEditContent;
