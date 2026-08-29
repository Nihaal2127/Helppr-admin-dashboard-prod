import ReactDOM from "react-dom";
import { Modal, Button } from "react-bootstrap";
import CustomCloseButton from "./CustomCloseButton";
import { DocumentModel } from "../lib/models/DocumentModel";
import { resolveMediaAssetSrc } from "../services/documentUploadService";
import { partnerDocumentDisplayTitle } from "../lib/partner/partnerFormDocuments";

function formatDocumentPreviewTitle(name: string | null | undefined): string {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "Document";
  return trimmed
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function isLikelyImageUrl(url: string): boolean {
  const path = url.split("?")[0].toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(path);
}

function isLikelyPdfUrl(url: string): boolean {
  const path = url.split("?")[0].toLowerCase();
  return path.endsWith(".pdf");
}

export const CustomImagePreviewDialog = (documentPreview: DocumentModel) => {
  const modalContainer = document.createElement("div");
  document.body.appendChild(modalContainer);
  const rawName = String(documentPreview.name ?? "").trim();
  const mappedTitle = partnerDocumentDisplayTitle(documentPreview.name);
  const title =
    mappedTitle && mappedTitle !== rawName
      ? mappedTitle
      : formatDocumentPreviewTitle(documentPreview.name);

  const src = resolveMediaAssetSrc(documentPreview.document_image);
  const showAsImage = Boolean(src) && isLikelyImageUrl(src);
  const showAsPdf = Boolean(src) && isLikelyPdfUrl(src);

  const closeModal = () => {
    ReactDOM.unmountComponentAtNode(modalContainer);
    document.body.removeChild(modalContainer);
  };

  ReactDOM.render(
    <Modal
      show={true}
      onHide={closeModal}
      centered
      dialogClassName="custom-big-modal"
    >
      <Modal.Header className="border-bottom-0">
        <Modal.Title as="h5" className="custom-dialog-title mt-0">
          {title}
        </Modal.Title>
        <CustomCloseButton onClose={closeModal} />
      </Modal.Header>
      <Modal.Body className="d-flex justify-content-center align-items-center flex-column gap-3">
        {!src ? (
          <p className="text-muted mb-0">No document available</p>
        ) : showAsImage ? (
          <img
            src={src}
            alt="document"
            className="img-fluid"
            style={{ maxWidth: "80%", maxHeight: "80%" }}
          />
        ) : showAsPdf ? (
          <iframe
            title={title}
            src={src}
            style={{
              width: "100%",
              minHeight: "70vh",
              border: "1px solid var(--txtfld-border)",
              borderRadius: 8,
            }}
          />
        ) : (
          <div className="text-center px-3">
            <i
              className="bi bi-file-earmark-text d-block mb-3"
              style={{ fontSize: "2.5rem", color: "var(--primary-color)" }}
              aria-hidden
            />
            <p className="mb-3 text-muted">
              This file type can’t be previewed here. Open it in a new tab.
            </p>
            <Button
              type="button"
              className="custom-btn-primary"
              onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
            >
              Open file
            </Button>
          </div>
        )}
      </Modal.Body>
    </Modal>,
    modalContainer
  );
};
