import React, { useState } from "react";
import ReactDOM from "react-dom";
import { Modal, Button } from "react-bootstrap";
import CustomCloseButton from "./CustomCloseButton";
import CustomImageUploader from "./CustomImageUploader";
import { showErrorAlert } from "../lib/global/alertHelper";

type CustomUploadDialogProps = {
  onUploadSave: (files: File[], replaceUrls: string[]) => void;
  onClose: () => void;
  existingImages?: string[];
  title?: string;
  /**
   * Verification & Documents: images + PDF/other files under 512 KB.
   * Defaults to true — this dialog is the document upload entry point.
   */
  allowAnyFile?: boolean;
};

const CustomUploadDialog: React.FC<CustomUploadDialogProps> & {
  show: (
    onUploadSave: (files: File[], replaceUrls: string[]) => void,
    existingImages?: string[],
    title?: string,
    options?: { allowAnyFile?: boolean }
  ) => void;
} = ({
  onUploadSave,
  onClose,
  existingImages = [],
  title = "Upload document",
  allowAnyFile = true,
}) => {
  const [fileInputs, setFileInputs] = useState<File[]>([]);
  const [replaceUrls, setReplaceUrls] = useState<string[]>([]);

  const handleClose = () => {
    setFileInputs([]);
    setReplaceUrls([]);
    onClose();
  };

  const handleSave = () => {
    if (fileInputs.length === 0) {
      showErrorAlert("Please select file");
      return;
    }
    onClose();
    onUploadSave(fileInputs, replaceUrls);
  };

  return (
    <Modal
      show={true}
      onHide={handleClose}
      centered
      dialogClassName="custom-big-modal"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {title}
        </Modal.Title>
        <CustomCloseButton onClose={handleClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        <CustomImageUploader
          key={`upload-${existingImages.join("|")}-${allowAnyFile ? "any" : "img"}`}
          label={title}
          hideLabel
          maxFiles={1}
          isEditable={existingImages.length > 0}
          existingImages={existingImages}
          allowAnyFile={allowAnyFile}
          onFileChange={(files, replaceUrlsFromUploader) => {
            setFileInputs(files);
            setReplaceUrls(replaceUrlsFromUploader);
          }}
        />
        <div className="d-flex justify-content-end gap-3 mt-4">
          <Button
            type="button"
            className="custom-btn-primary"
            onClick={handleSave}
          >
            Save
          </Button>
          <Button
            type="button"
            className="custom-btn-secondary"
            onClick={handleClose}
          >
            Cancel
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
};

CustomUploadDialog.show = (
  onUploadSave: (files: File[], replaceUrls: string[]) => void,
  existingImages?: string[],
  title?: string,
  options?: { allowAnyFile?: boolean }
) => {
  const existingModal = document.getElementById("upload-document-modal");
  if (existingModal) {
    return;
  }
  const modalContainer = document.createElement("div");
  modalContainer.id = "upload-document-modal";
  document.body.appendChild(modalContainer);

  const closeModal = () => {
    ReactDOM.unmountComponentAtNode(modalContainer);
    document.body.removeChild(modalContainer);
  };

  ReactDOM.render(
    <CustomUploadDialog
      onUploadSave={onUploadSave}
      existingImages={existingImages}
      title={title}
      allowAnyFile={options?.allowAnyFile !== false}
      onClose={closeModal}
    />,
    modalContainer
  );
};

export default CustomUploadDialog;
