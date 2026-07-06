import { useState } from "react";
import { Modal, Row, Button } from "react-bootstrap";
import CustomCloseButton from "../components/CustomCloseButton";
import { Link } from "react-router-dom";
import { showLog } from "../helper/utility";
import { showErrorAlert } from "../lib/global/alertHelper";
import {
  getSupportedImageExtensions,
  getSupportedImageMaxSizeBytes,
  isSupportedImageFile,
} from "../helper/utility";
import { toStorageRelativePath } from "../services/documentUploadService";

interface CustomPhotoUploadProps {
  isOpen?: boolean;
  onClose: () => void;
  onUploadSave: () => void;
  existingImages?: string[];
  onFileChange: (files: File[], replaceUrls: string[]) => void;
}

const CustomPhotoUpload = ({
  isOpen,
  onClose,
  onUploadSave,
  existingImages = [],
  onFileChange,
}: CustomPhotoUploadProps) => {
  const [fileInputs, setFileInputs] = useState<(File | null)[]>([]);
  const [replaceUrls, setReplaceUrls] = useState<string[]>([]);

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

    onFileChange(
      updatedFiles.filter((f) => f !== null) as File[],
      updatedReplaceUrls
    );
  };

  return (
    <Modal
      show={isOpen}
      onHide={onClose}
      centered
      dialogClassName="custom-big-modal"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-10">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "40vh",
            width: "100%",
          }}
        >
          <label
            style={{
              display: "inline-block",
              backgroundColor: "var(--bg-color)",
              fontSize: 16,
              fontWeight: "normal",
              color: "var(--content-txt-color)",
              border: "1px solid var(--content-txt-color)",
              borderRadius: "8px",
              height: "36px",
              padding: "6px 12px",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            Upload from Computer
            <input
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              style={{
                display: "none",
              }}
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
                  showLog("Selected file:", file);
                  handleFileChange(file);
                }
              }}
            />
          </label>

          <Link to="#" className="custom-profile-link text-center mt-2">
            Remove Photo
          </Link>
        </div>

        <Row className="mt-4">
          <Button
            type="submit"
            style={{
              backgroundColor: "var(--primary-txt-color)",
              fontSize: 20,
              fontWeight: "normal",
              color: "var(--secondary-txt)",
              border: "var(--primary-txt-color)",
              borderRadius: "8px",
              height: "48px",
              padding: "6px 12px",
            }}
            onClick={onUploadSave}
          >
            Save
          </Button>
        </Row>
      </Modal.Body>
    </Modal>
  );
};

export default CustomPhotoUpload;
