import ReactDOM from "react-dom";
import { Modal } from "react-bootstrap";
import CustomCloseButton from "./CustomCloseButton";
import { DocumentModel } from "../lib/models/DocumentModel";
import { AppConstant } from "../lib/global/AppConstant";
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

export const CustomImagePreviewDialog = (documentPreview: DocumentModel) => {
  const modalContainer = document.createElement("div");
  document.body.appendChild(modalContainer);
  const rawName = String(documentPreview.name ?? "").trim();
  const mappedTitle = partnerDocumentDisplayTitle(documentPreview.name);
  const title =
    mappedTitle && mappedTitle !== rawName
      ? mappedTitle
      : formatDocumentPreviewTitle(documentPreview.name);

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
      <Modal.Body className="d-flex justify-content-center align-items-center">
        <img
          src={`${AppConstant.IMAGE_BASE_URL}${documentPreview.document_image}`}
          alt="document"
          className="img-fluid"
          style={{ maxWidth: "80%", maxHeight: "80%" }}
        />
      </Modal.Body>
    </Modal>,
    modalContainer
  );
};
