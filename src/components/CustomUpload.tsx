import React, { useState, useRef } from "react";
import ReactDOM from "react-dom";
import { Modal, Button, Row } from "react-bootstrap";
import CustomCloseButton from "./CustomCloseButton";
import uploadIcon from "../assets/icons/upload.svg";
import { showErrorAlert } from "../lib/global/alertHelper";
import { AppConstant } from "../lib/global/AppConstant";
import {
  getSupportedImageExtensions,
  getSupportedImageMaxSizeBytes,
  isSupportedImageFile,
} from "../helper/utility";
import { toStorageRelativePath } from "../services/documentUploadService";

type CustomUploadDialogProps = {
  onUploadSave: (files: File[], replaceUrls: string[]) => void;
  onClose: () => void;
  existingImages?: string[];
};

const CustomUploadDialog: React.FC<CustomUploadDialogProps> & {
  show: (
    onUploadSave: (files: File[], replaceUrls: string[]) => void,
    existingImages?: string[]
  ) => void;
} = ({ onUploadSave, onClose, existingImages = [] }) => {
  const [fileInputs, setFileInputs] = useState<(File | null)[]>([]);
  const [replaceUrls, setReplaceUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File | null) => {
    const index: number = 0;
    const updatedFiles = [...fileInputs];
    const updatedReplaceUrls = [...replaceUrls];

    updatedFiles[index] = file;

    const storageKey = toStorageRelativePath(existingImages[index]);
    if (file && storageKey) {
      if (!updatedReplaceUrls.includes(storageKey)) {
        updatedReplaceUrls.push(storageKey);
      }
    } else if (!file && storageKey) {
      const urlIndex = updatedReplaceUrls.indexOf(storageKey);
      if (urlIndex !== -1) {
        updatedReplaceUrls.splice(urlIndex, 1);
      }
    }

    setFileInputs(updatedFiles);
    setReplaceUrls(updatedReplaceUrls);

    // onFileChange(updatedFiles.filter((f) => f !== null) as File[], updatedReplaceUrls);
  };

  const handleOnUploadSave = () => {
    const files = fileInputs.filter((f) => f !== null) as File[];
    if (files.length === 0) {
      showErrorAlert("Please select file");
      return;
    }
    if (!isSupportedImageFile(files[0])) {
      showErrorAlert(
        `Only ${getSupportedImageExtensions().join(
          ", "
        )} formats up to ${Math.floor(
          getSupportedImageMaxSizeBytes() / 1024
        )}KB are supported.`
      );
      return;
    }
    onClose();
    onUploadSave(files, replaceUrls);
  };

  const maxKb = Math.floor(getSupportedImageMaxSizeBytes() / 1024);
  const formatLabel = getSupportedImageExtensions()
    .map((ext) => ext.toUpperCase())
    .join(", ");

  return (
    <>
      <Modal
        show={true}
        onHide={onClose}
        centered
        dialogClassName="custom-big-modal"
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <CustomCloseButton onClose={onClose} />
        </Modal.Header>
        <Modal.Body className="px-4 pb-4 pt-0">
          <div className="text-center">
            <img
              src={
                fileInputs[0]
                  ? URL.createObjectURL(fileInputs[0])
                  : existingImages.length > 0
                  ? `${AppConstant.IMAGE_BASE_URL}${existingImages[0]}`
                  : uploadIcon
              }
              alt={existingImages.toString()}
              style={{
                height: "160px",
                width: "160px",
                objectFit: "contain",
                cursor: "pointer",
              }}
              onClick={() => fileInputRef.current?.click()}
            />
          </div>

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (!isSupportedImageFile(file)) {
                  showErrorAlert(
                    `Only ${getSupportedImageExtensions().join(
                      ", "
                    )} formats up to ${Math.floor(
                      getSupportedImageMaxSizeBytes() / 1024
                    )}KB are supported.`
                  );
                  e.target.value = "";
                  return;
                }
                handleFileChange(file);
              }
            }}
          />

          <div
            className="small mt-3 text-start"
            style={{ color: "var(--placeholder-txt)", lineHeight: 1.5 }}
          >
            <div>• {formatLabel}</div>
            <div>• Max size: {maxKb} KB</div>
          </div>

          <Row className="mt-4">
            <Button
              type="submit"
              style={{
                backgroundColor: "var(--secondary-btn)",
                fontSize: 20,
                fontWeight: "normal",
                color: "var(--secondary-txt)",
                border: "var(--secondary-btn)",
                borderRadius: "8px",
                height: "48px",
                padding: "6px 12px",
              }}
              onClick={handleOnUploadSave}
            >
              Upload Photo
            </Button>
          </Row>
        </Modal.Body>
      </Modal>
    </>
  );
};

CustomUploadDialog.show = (
  onUploadSave: (files: File[], replaceUrls: string[]) => void,
  existingImages?: string[]
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
      // onFileChange={onFileChange}
      onUploadSave={onUploadSave}
      existingImages={existingImages}
      onClose={closeModal}
    />,
    modalContainer
  );
};

export default CustomUploadDialog;
