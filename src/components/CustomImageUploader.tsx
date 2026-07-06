import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Button, Col, Row } from "react-bootstrap";
import { showErrorAlert } from "../lib/global/alertHelper";
import {
  getSupportedImageExtensions,
  getSupportedImageMaxSizeBytes,
  isSupportedImageFile,
} from "../helper/utility";
import {
  resolveMediaAssetSrc,
  toStorageRelativePath,
} from "../services/documentUploadService";

/** Recommended upload dimensions — center-cropped to this square when needed. */
const RECOMMENDED_IMAGE_SIZE_PX = 375;
const RECOMMENDED_ASPECT_RATIO = "1:1";

interface CustomImageUploaderProps {
  label: string;
  maxFiles?: number;
  isEditable?: boolean;
  existingImages?: string[];
  onFileChange: (files: File[], replaceUrls: string[]) => void;
  /** Shorter single-file dropzone (e.g. Add Partner beside address). */
  compact?: boolean;
  /** Omit the built-in label (use an external label in the parent row). */
  hideLabel?: boolean;
}

export function resolveExistingImageSrc(url?: string): string {
  const resolved = resolveMediaAssetSrc(url);
  if (!resolved) return "";
  if (resolved.startsWith("data:") || resolved.startsWith("blob:")) {
    return resolved;
  }
  return `${resolved}${resolved.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

function LocalFilePreview({ file }: { file: File }) {
  const [objectUrl, setObjectUrl] = useState("");
  useLayoutEffect(() => {
    const u = URL.createObjectURL(file);
    setObjectUrl(u);
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [file]);
  if (!objectUrl) return null;
  return (
    <img
      alt=""
      src={objectUrl}
      width={RECOMMENDED_IMAGE_SIZE_PX}
      height={RECOMMENDED_IMAGE_SIZE_PX}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        aspectRatio: RECOMMENDED_ASPECT_RATIO,
      }}
    />
  );
}

function ImageUploadGuidelines({
  extLabel,
  maxKb,
  compact = false,
}: {
  extLabel: string;
  maxKb: number;
  compact?: boolean;
}) {
  const formats = extLabel
    .split(",")
    .map((part) => part.trim().replace(/^\./, "").toUpperCase())
    .join(", ");

  const lines = [
    formats,
    `Max size: ${maxKb} KB`,
    `Recommended: ${RECOMMENDED_IMAGE_SIZE_PX} × ${RECOMMENDED_IMAGE_SIZE_PX} px (${RECOMMENDED_ASPECT_RATIO})`,
    "Other sizes will be center-cropped automatically",
  ];

  return (
    <div
      className="small mb-0"
      style={{
        color: "var(--placeholder-txt)",
        lineHeight: compact ? 1.35 : 1.5,
      }}
    >
      {lines.map((line) => (
        <div key={line}>• {line}</div>
      ))}
    </div>
  );
}

function canvasToFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  mime: string,
  quality?: number
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode image"));
          return;
        }
        resolve(new File([blob], fileName, { type: mime }));
      },
      mime,
      quality
    );
  });
}

async function normalizeImageToRecommendedSize(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const cropSize = Math.min(bitmap.width, bitmap.height);
    const sx = Math.floor((bitmap.width - cropSize) / 2);
    const sy = Math.floor((bitmap.height - cropSize) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = RECOMMENDED_IMAGE_SIZE_PX;
    canvas.height = RECOMMENDED_IMAGE_SIZE_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");

    ctx.drawImage(
      bitmap,
      sx,
      sy,
      cropSize,
      cropSize,
      0,
      0,
      RECOMMENDED_IMAGE_SIZE_PX,
      RECOMMENDED_IMAGE_SIZE_PX
    );

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    const maxBytes = getSupportedImageMaxSizeBytes();
    const preferPng = file.type === "image/png";

    if (preferPng) {
      const pngFile = await canvasToFile(
        canvas,
        `${baseName}.png`,
        "image/png"
      );
      if (pngFile.size <= maxBytes) return pngFile;
    }

    let quality = 0.92;
    let jpegFile = await canvasToFile(
      canvas,
      `${baseName}.jpg`,
      "image/jpeg",
      quality
    );
    while (jpegFile.size > maxBytes && quality > 0.45) {
      quality -= 0.08;
      jpegFile = await canvasToFile(
        canvas,
        `${baseName}.jpg`,
        "image/jpeg",
        quality
      );
    }
    return jpegFile;
  } finally {
    bitmap.close();
  }
}

const squarePreviewImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
  aspectRatio: RECOMMENDED_ASPECT_RATIO,
};

const CustomImageUploader: React.FC<CustomImageUploaderProps> = ({
  label,
  maxFiles = 3,
  isEditable = false,
  existingImages = [],
  onFileChange,
  compact = false,
  hideLabel = false,
}) => {
  const [fileInputs, setFileInputs] = useState<(File | null)[]>([null]);
  const [replaceUrls, setReplaceUrls] = useState<string[]>([]);
  const [dragDepth, setDragDepth] = useState(0);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const initKeyRef = useRef<string>("");
  const existingImagesKey = existingImages.join("|");
  const maxKb = Math.floor(getSupportedImageMaxSizeBytes() / 1024);
  const extLabel = getSupportedImageExtensions().join(", ");

  useEffect(() => {
    const initKey = `${isEditable ? "1" : "0"}|${existingImagesKey}`;
    if (initKeyRef.current === initKey) return;
    initKeyRef.current = initKey;

    const initialFileInputs = isEditable
      ? existingImages.length > 0
        ? existingImages.map(() => null)
        : [null]
      : [null];
    setFileInputs(initialFileInputs);
    setReplaceUrls([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditable, existingImages.length, existingImagesKey]);

  const handleFileChange = (index: number, file: File | null) => {
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

    console.log("[ImageUploadDebug] CustomImageUploader — file change", {
      index,
      hasFile: Boolean(file),
      existingImageRaw: existingImages[index] ?? null,
      storageKeyForReplace: storageKey || null,
      replaceUrls: updatedReplaceUrls,
      fileMeta: file
        ? { name: file.name, size: file.size, type: file.type }
        : null,
    });

    onFileChange( 
      updatedFiles.filter((f) => f !== null) as File[],
      updatedReplaceUrls
    );
  };

  const handleClearSlot = (index: number) => {
    const input = inputRefs.current[index];
    if (input) input.value = "";
    handleFileChange(index, null);
  };

  const addFileInput = () => {
    if (fileInputs.length < maxFiles) {
      setFileInputs((prev) => [...prev, null]);
    }
  };

  const openPicker = (index: number) => {
    inputRefs.current[index]?.click();
  };

  const previewSize = maxFiles === 1 ? (compact ? 72 : 168) : 100;
  const isSingle = maxFiles === 1;
  const showLabel = !hideLabel && Boolean(label?.trim());
  const isDragOver = dragDepth > 0;

  const validateAndApplyFile = async (
    index: number,
    selectedFile: File | null
  ) => {
    if (!selectedFile) {
      handleFileChange(index, null);
      return;
    }
    if (!isSupportedImageFile(selectedFile)) {
      showErrorAlert(
        `Only ${extLabel} formats up to ${maxKb} KB are supported.`
      );
      const input = inputRefs.current[index];
      if (input) input.value = "";
      return;
    }

    try {
      const processed = await normalizeImageToRecommendedSize(selectedFile);
      if (processed.size > getSupportedImageMaxSizeBytes()) {
        showErrorAlert(
          `Image is too large after cropping to ${RECOMMENDED_IMAGE_SIZE_PX}×${RECOMMENDED_IMAGE_SIZE_PX} px. Use a smaller source file (max ${maxKb} KB).`
        );
        const input = inputRefs.current[index];
        if (input) input.value = "";
        return;
      }
      handleFileChange(index, processed);
    } catch {
      showErrorAlert("Could not process image. Try another file.");
      const input = inputRefs.current[index];
      if (input) input.value = "";
    }
  };

  return (
    <Row className="w-100 g-0 mx-0">
      <Col xs={12} className="px-0">
        <div className={compact ? "mb-0" : "mb-3"}>
          {showLabel ? (
            <label
              className="form-label fw-medium mb-2 d-block"
              style={{ color: "var(--content-txt-color)" }}
            >
              {label}
            </label>
          ) : null}

          <div
            style={
              isSingle
                ? { width: "100%" }
                : {
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 12,
                    maxWidth: "100%",
                  }
            }
          >
            {fileInputs.map((file, index) => {
              const existing = (existingImages[index] ?? "").trim();
              const hasPreview = Boolean(file || existing);

              if (isSingle) {
                return (
                  <div
                    key={index}
                    className={`custom-image-uploader-single rounded-3 border overflow-hidden${
                      compact ? " custom-image-uploader-single--compact" : ""
                    }`}
                    style={{
                      borderColor: isDragOver
                        ? "var(--primary-color)"
                        : "var(--txtfld-border)",
                      background: "var(--bg-color)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragDepth((d) => d + 1);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragDepth((d) => Math.max(0, d - 1));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragDepth(0);
                      const dropped = e.dataTransfer.files?.[0] ?? null;
                      if (dropped) validateAndApplyFile(index, dropped);
                    }}
                  >
                    <div
                      className={`d-flex align-items-center gap-2 ${
                        compact
                          ? "flex-row p-2"
                          : "flex-column flex-md-row align-items-stretch gap-3 p-3"
                      }`}
                      style={{
                        minHeight: compact ? previewSize + 16 : previewSize + 24,
                      }}
                    >
                      <div
                        className="position-relative flex-shrink-0 align-self-center align-self-md-start"
                        style={{
                          width: previewSize,
                          height: previewSize,
                          aspectRatio: RECOMMENDED_ASPECT_RATIO,
                        }}
                      >
                        <button
                          type="button"
                          className="border-0 p-0 bg-transparent w-100 h-100 rounded-2 overflow-hidden"
                          onClick={() => openPicker(index)}
                          aria-label={
                            hasPreview
                              ? "Replace image — choose file"
                              : "Choose image file"
                          }
                          style={{
                            cursor: "pointer",
                            outline: "none",
                            boxShadow: hasPreview
                              ? "inset 0 0 0 1px var(--txtfld-border)"
                              : "inset 0 0 0 2px dashed var(--txtfld-border)",
                            background: "rgba(0,0,0,0.03)",
                          }}
                        >
                          {file ? (
                            <LocalFilePreview file={file} />
                          ) : existing ? (
                            <img
                              alt=""
                              src={resolveExistingImageSrc(existing)}
                              width={RECOMMENDED_IMAGE_SIZE_PX}
                              height={RECOMMENDED_IMAGE_SIZE_PX}
                              style={squarePreviewImageStyle}
                            />
                          ) : (
                            <div
                              className="d-flex flex-column align-items-center justify-content-center px-2 h-100"
                              style={{ minHeight: previewSize }}
                            >
                              <i
                                className="bi bi-image"
                                style={{
                                  fontSize: compact ? "1.65rem" : "2rem",
                                  color: "var(--primary-color)",
                                  opacity: 0.85,
                                  lineHeight: 1,
                                }}
                                aria-hidden
                              />
                              {!compact ? (
                                <span
                                  className="text-center mt-2 px-1"
                                  style={{
                                    color: "var(--placeholder-txt)",
                                    fontSize: 12,
                                    lineHeight: 1.35,
                                  }}
                                >
                                  No image yet
                                </span>
                              ) : null}
                            </div>
                          )}
                        </button>
                        {file ? (
                          <button
                            type="button"
                            className="position-absolute border-0 rounded-circle d-flex align-items-center justify-content-center"
                            aria-label="Remove selected image"
                            title="Remove"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleClearSlot(index);
                            }}
                            style={{
                              top: 6,
                              right: 6,
                              width: 28,
                              height: 28,
                              fontSize: 16,
                              lineHeight: 1,
                              background: "rgba(255,255,255,0.96)",
                              color: "#b02a37",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                              cursor: "pointer",
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>

                      <div
                        className="d-flex flex-column justify-content-center flex-grow-1"
                        style={{ minWidth: 0, gap: compact ? 6 : 10 }}
                      >
                        {!compact ? (
                          <div>
                            <ImageUploadGuidelines
                              extLabel={extLabel}
                              maxKb={maxKb}
                            />
                            <p
                              className="small mb-0 mt-2"
                              style={{
                                color: "var(--placeholder-txt)",
                                lineHeight: 1.5,
                              }}
                            >
                              Drop a file on the preview or use the button.
                            </p>
                          </div>
                        ) : !hasPreview ? (
                          <ImageUploadGuidelines
                            extLabel={extLabel}
                            maxKb={maxKb}
                            compact
                          />
                        ) : null}
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <Button
                            type="button"
                            variant="outline-primary"
                            size="sm"
                            className={`text-nowrap ${
                              compact ? "px-2 py-1" : "px-3 py-2"
                            }`}
                            style={{
                              borderColor: "var(--primary-color)",
                              color: "var(--primary-color)",
                              fontWeight: 600,
                              lineHeight: 1.25,
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              openPicker(index);
                            }}
                          >
                            <i className="bi bi-folder2-open me-2" aria-hidden />
                            {hasPreview ? "Replace image" : "Choose image"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <input
                      type="file"
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const selectedFile = e.target.files?.[0] || null;
                        validateAndApplyFile(index, selectedFile);
                      }}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={index}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--txtfld-border)",
                    background: "var(--bg-color)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    position: "relative",
                  }}
                >
                <div
                  style={{
                    position: "relative",
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    className="w-100 border-0 p-0 text-center bg-transparent"
                    onClick={() => openPicker(index)}
                    aria-label="Choose image file"
                    style={{ cursor: "pointer" }}
                  >
                    <div
                      style={{
                        width: previewSize,
                        height: previewSize,
                        margin: "0 auto",
                        aspectRatio: RECOMMENDED_ASPECT_RATIO,
                        borderRadius: 8,
                        border: hasPreview
                          ? "1px solid var(--txtfld-border)"
                          : "2px dashed var(--txtfld-border)",
                        overflow: "hidden",
                        background: "rgba(0,0,0,0.02)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                      }}
                    >
                      {file ? (
                        <LocalFilePreview file={file} />
                      ) : existing ? (
                        <img
                          alt=""
                          src={resolveExistingImageSrc(existing)}
                          width={RECOMMENDED_IMAGE_SIZE_PX}
                          height={RECOMMENDED_IMAGE_SIZE_PX}
                          style={squarePreviewImageStyle}
                        />
                      ) : (
                        <div
                          className="d-flex flex-column align-items-center justify-content-center px-2 py-2"
                          style={{ width: "100%", height: "100%" }}
                        >
                          <i
                            className="bi bi-cloud-arrow-up"
                            style={{
                              fontSize: "1.35rem",
                              color: "var(--primary-color)",
                              opacity: 0.92,
                              lineHeight: 1,
                            }}
                            aria-hidden
                          />
                          <span
                            className="text-center"
                            style={{
                              color: "var(--placeholder-txt)",
                              fontSize: 10,
                              lineHeight: 1.25,
                              marginTop: 6,
                            }}
                          >
                            {RECOMMENDED_IMAGE_SIZE_PX}×
                            {RECOMMENDED_IMAGE_SIZE_PX} ({RECOMMENDED_ASPECT_RATIO})
                          </span>
                        </div>
                      )}
                    </div>
                  </button>

                  {file ? (
                    <button
                      type="button"
                      className="position-absolute border-0 rounded-circle d-flex align-items-center justify-content-center"
                      aria-label="Remove selected image"
                      title="Remove"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleClearSlot(index);
                      }}
                      style={{
                        top: 4,
                        right: 4,
                        width: 26,
                        height: 26,
                        fontSize: 14,
                        lineHeight: 1,
                        background: "rgba(255,255,255,0.95)",
                        color: "#b02a37",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>

                <input
                  type="file"
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0] || null;
                    validateAndApplyFile(index, selectedFile);
                  }}
                />
              </div>
            );
          })}
        </div>

        {maxFiles > 1 && fileInputs.length < maxFiles && (
          <Button
            type="button"
            variant="primary"
            style={{
              backgroundColor: "var(--primary-color)",
              border: "none",
              marginTop: 12,
            }}
            onClick={addFileInput}
          >
            + Add another
          </Button>
        )}
        </div>
      </Col>
    </Row>
  );
};

export default CustomImageUploader;
