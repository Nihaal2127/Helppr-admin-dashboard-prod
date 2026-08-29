import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Button, Col, Row } from "react-bootstrap";
import { showErrorAlert } from "../lib/global/alertHelper";
import {
  getSupportedDocumentMaxSizeBytes,
  getSupportedImageExtensions,
  getSupportedImageMaxSizeBytes,
  isLikelyImageFile,
  isSupportedDocumentFile,
  isSupportedImageFile,
} from "../helper/utility";
import {
  resolveMediaAssetSrc,
  toStorageRelativePath,
} from "../services/documentUploadService";

/** Recommended upload dimensions — center-cropped to this square when needed. */
const RECOMMENDED_IMAGE_SIZE_PX = 375;
const RECOMMENDED_ASPECT_RATIO = "1:1";

export type ImageUploaderOutputSize = {
  width: number;
  height: number;
};

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
  /** Center-crop uploads to this size (default 375×375). */
  outputSize?: ImageUploaderOutputSize;
  /** Optional size guidance shown in the uploader help text. */
  sizeHint?: string;
  /**
   * Verification & Documents: accept any file type (PDF, etc.) up to 512 KB.
   * Skips image crop/normalization. Profile photos keep the default image-only path.
   */
  allowAnyFile?: boolean;
}

export function resolveExistingImageSrc(url?: string): string {
  const resolved = resolveMediaAssetSrc(url);
  if (!resolved) return "";
  if (resolved.startsWith("data:") || resolved.startsWith("blob:")) {
    return resolved;
  }
  // Google (and other) avatar hosts reject extra query params / our Referer.
  // Cache-bust only our storage/CDN keys.
  if (/^https?:\/\//i.test(resolved)) {
    try {
      const host = new URL(resolved).hostname.toLowerCase();
      const isGoogleAvatar =
        host.includes("googleusercontent.com") ||
        host.includes("ggpht.com") ||
        host.includes("google.com");
      if (isGoogleAvatar) return resolved;
    } catch {
      return resolved;
    }
  }
  return `${resolved}${resolved.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

function LocalFilePreview({
  file,
  aspectRatio,
}: {
  file: File;
  aspectRatio: string;
}) {
  const [objectUrl, setObjectUrl] = useState("");
  const showAsImage = isLikelyImageFile(file);

  useLayoutEffect(() => {
    if (!showAsImage) {
      setObjectUrl("");
      return;
    }
    const u = URL.createObjectURL(file);
    setObjectUrl(u);
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [file, showAsImage]);

  if (!showAsImage) {
    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center h-100 w-100 px-2"
        style={{ aspectRatio, background: "rgba(0,0,0,0.03)" }}
      >
        <i
          className="bi bi-file-earmark-text"
          style={{
            fontSize: "2rem",
            color: "var(--primary-color)",
            opacity: 0.9,
            lineHeight: 1,
          }}
          aria-hidden
        />
        <span
          className="text-center mt-2 px-1 text-truncate w-100"
          style={{
            color: "var(--content-txt-color)",
            fontSize: 12,
            lineHeight: 1.35,
            maxWidth: "100%",
          }}
          title={file.name}
        >
          {file.name}
        </span>
      </div>
    );
  }

  if (!objectUrl) return null;
  return (
    <img
      alt=""
      src={objectUrl}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        aspectRatio,
      }}
    />
  );
}

function ImageUploadGuidelines({
  extLabel,
  maxKb,
  compact = false,
  outputWidth = RECOMMENDED_IMAGE_SIZE_PX,
  outputHeight = RECOMMENDED_IMAGE_SIZE_PX,
  sizeHint,
  allowAnyFile = false,
}: {
  extLabel: string;
  maxKb: number;
  compact?: boolean;
  outputWidth?: number;
  outputHeight?: number;
  sizeHint?: string;
  allowAnyFile?: boolean;
}) {
  const formats = extLabel
    .split(",")
    .map((part) => part.trim().replace(/^\./, "").toUpperCase())
    .join(", ");

  const lines = allowAnyFile
    ? [
        "Images, PDF, and other files",
        `Max size: ${maxKb} KB`,
        sizeHint ?? "Any file type under the size limit",
      ]
    : [
        formats,
        `Max size: ${maxKb} KB`,
        sizeHint ?? `Recommended: ${outputWidth} × ${outputHeight} px`,
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

async function normalizeImageToOutputSize(
  file: File,
  targetWidth: number,
  targetHeight: number
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const targetAspect = targetWidth / targetHeight;
    const sourceAspect = bitmap.width / bitmap.height;
    let sw: number;
    let sh: number;
    let sx: number;
    let sy: number;
    if (sourceAspect > targetAspect) {
      sh = bitmap.height;
      sw = sh * targetAspect;
      sx = (bitmap.width - sw) / 2;
      sy = 0;
    } else {
      sw = bitmap.width;
      sh = sw / targetAspect;
      sx = 0;
      sy = (bitmap.height - sh) / 2;
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");

    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

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

async function normalizeImageToRecommendedSize(file: File): Promise<File> {
  return normalizeImageToOutputSize(
    file,
    RECOMMENDED_IMAGE_SIZE_PX,
    RECOMMENDED_IMAGE_SIZE_PX
  );
}

function previewBoxDimensions(
  outputWidth: number,
  outputHeight: number,
  compact: boolean,
  isSingle: boolean
): { width: number; height: number } {
  if (!isSingle) {
    const width = 100;
    return {
      width,
      height: Math.max(1, Math.round(width * (outputHeight / outputWidth))),
    };
  }
  const width = compact ? 120 : 220;
  return {
    width,
    height: Math.max(1, Math.round(width * (outputHeight / outputWidth))),
  };
}

const CustomImageUploader: React.FC<CustomImageUploaderProps> = ({
  label,
  maxFiles = 3,
  isEditable = false,
  existingImages = [],
  onFileChange,
  compact = false,
  hideLabel = false,
  outputSize,
  sizeHint,
  allowAnyFile = false,
}) => {
  const [fileInputs, setFileInputs] = useState<(File | null)[]>([null]);
  const [replaceUrls, setReplaceUrls] = useState<string[]>([]);
  const [dragDepth, setDragDepth] = useState(0);
  const [existingPreviewFailed, setExistingPreviewFailed] = useState<
    Record<number, boolean>
  >({});
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const initKeyRef = useRef<string>("");
  const existingImagesKey = existingImages.join("|");
  const maxKb = Math.floor(
    (allowAnyFile
      ? getSupportedDocumentMaxSizeBytes()
      : getSupportedImageMaxSizeBytes()) / 1024
  );
  const extLabel = getSupportedImageExtensions().join(", ");
  const fileAccept = allowAnyFile
    ? "*/*"
    : ".jpg,.jpeg,.png,image/jpeg,image/png";
  const chooseLabel = allowAnyFile ? "Choose file" : "Choose image";
  const replaceLabel = allowAnyFile ? "Replace file" : "Replace image";
  const emptyHint = allowAnyFile ? "No file yet" : "No image yet";
  const outputWidth = outputSize?.width ?? RECOMMENDED_IMAGE_SIZE_PX;
  const outputHeight = outputSize?.height ?? RECOMMENDED_IMAGE_SIZE_PX;
  const outputAspectRatio = `${outputWidth} / ${outputHeight}`;
  const previewImageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    aspectRatio: outputAspectRatio,
  };

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
    setExistingPreviewFailed({});
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

  const isSingle = maxFiles === 1;
  const previewBox = previewBoxDimensions(
    outputWidth,
    outputHeight,
    compact,
    isSingle
  );
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

    if (allowAnyFile) {
      if (!isSupportedDocumentFile(selectedFile)) {
        showErrorAlert(
          `File must be ${maxKb} KB or smaller. Images, PDF, and other file types are allowed.`
        );
        const input = inputRefs.current[index];
        if (input) input.value = "";
        return;
      }
      handleFileChange(index, selectedFile);
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
      const processed = outputSize
        ? await normalizeImageToOutputSize(
            selectedFile,
            outputWidth,
            outputHeight
          )
        : await normalizeImageToRecommendedSize(selectedFile);
      if (processed.size > getSupportedImageMaxSizeBytes()) {
        showErrorAlert(
          `Image is too large after cropping to ${outputWidth}×${outputHeight} px. Use a smaller source file (max ${maxKb} KB).`
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
              const hasPreview = Boolean(
                file || (existing && !existingPreviewFailed[index])
              );

              if (isSingle) {
                return (
                  <div
                    key={index}
                    className={`custom-image-uploader-single rounded-3 border${
                      compact ? " custom-image-uploader-single--compact" : ""
                    }`}
                    style={{
                      borderColor: isDragOver
                        ? "var(--primary-color)"
                        : "var(--txtfld-border)",
                      background: "var(--bg-color)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      width: "100%",
                      maxWidth: "100%",
                      overflow: "visible",
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
                      className={
                        compact
                          ? "d-flex flex-row align-items-center gap-2 p-2"
                          : "d-flex flex-column align-items-stretch gap-3 p-3"
                      }
                    >
                      <div
                        className={
                          compact
                            ? "position-relative flex-shrink-0"
                            : "position-relative flex-shrink-0 align-self-center"
                        }
                        style={{
                          width: previewBox.width,
                          height: previewBox.height,
                          maxWidth: "100%",
                          aspectRatio: outputAspectRatio,
                        }}
                      >
                        <button
                          type="button"
                          className="border-0 p-0 bg-transparent w-100 h-100 rounded-2 overflow-hidden"
                          onClick={() => openPicker(index)}
                          aria-label={
                            hasPreview
                              ? allowAnyFile
                                ? "Replace file — choose file"
                                : "Replace image — choose file"
                              : allowAnyFile
                              ? "Choose file"
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
                            <LocalFilePreview
                              file={file}
                              aspectRatio={outputAspectRatio}
                            />
                          ) : existing && !existingPreviewFailed[index] ? (
                            <img
                              alt=""
                              src={resolveExistingImageSrc(existing)}
                              style={previewImageStyle}
                              onError={() =>
                                setExistingPreviewFailed((prev) => ({
                                  ...prev,
                                  [index]: true,
                                }))
                              }
                            />
                          ) : existing && existingPreviewFailed[index] ? (
                            <div
                              className="d-flex flex-column align-items-center justify-content-center px-2 h-100"
                              style={{ minHeight: previewBox.height }}
                            >
                              <i
                                className="bi bi-file-earmark-text"
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
                                  Document on file
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <div
                              className="d-flex flex-column align-items-center justify-content-center px-2 h-100"
                              style={{ minHeight: previewBox.height }}
                            >
                              <i
                                className={
                                  allowAnyFile
                                    ? "bi bi-file-earmark-arrow-up"
                                    : "bi bi-image"
                                }
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
                                  {emptyHint}
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
                        className={
                          compact
                            ? "d-flex flex-column justify-content-center flex-grow-1"
                            : "d-flex flex-column align-items-stretch w-100"
                        }
                        style={{ minWidth: 0, gap: compact ? 6 : 10 }}
                      >
                        {!compact ? (
                          <div>
                            <ImageUploadGuidelines
                              extLabel={extLabel}
                              maxKb={maxKb}
                              outputWidth={outputWidth}
                              outputHeight={outputHeight}
                              sizeHint={sizeHint}
                              allowAnyFile={allowAnyFile}
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
                            outputWidth={outputWidth}
                            outputHeight={outputHeight}
                            sizeHint={sizeHint}
                            allowAnyFile={allowAnyFile}
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
                            {hasPreview ? replaceLabel : chooseLabel}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <input
                      type="file"
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      accept={fileAccept}
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
                        width: previewBox.width,
                        height: previewBox.height,
                        margin: "0 auto",
                        aspectRatio: outputAspectRatio,
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
                        <LocalFilePreview
                          file={file}
                          aspectRatio={outputAspectRatio}
                        />
                      ) : existing && !existingPreviewFailed[index] ? (
                        <img
                          alt=""
                          src={resolveExistingImageSrc(existing)}
                          style={previewImageStyle}
                          onError={() =>
                            setExistingPreviewFailed((prev) => ({
                              ...prev,
                              [index]: true,
                            }))
                          }
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
                            {outputWidth}×{outputHeight}
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
                  accept={fileAccept}
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
