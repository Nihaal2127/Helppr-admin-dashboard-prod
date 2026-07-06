import React, { useEffect, useMemo, useState } from "react";
import {
  downloadChatMediaFile,
  resolveChatMediaUrlCandidates,
} from "../../lib/chat/chatDisplayHelpers";
import { showErrorAlert } from "../../lib/global/alertHelper";

type ChatMessageImageProps = {
  fileUrl?: string | null;
  fileName?: string;
  alt?: string;
  className?: string;
  onOpenPreview?: () => void;
};

const ChatMessageImage: React.FC<ChatMessageImageProps> = ({
  fileUrl,
  fileName,
  alt = "Image",
  className = "normal-chat-bubble-attachment-preview",
  onOpenPreview,
}) => {
  const candidates = useMemo(() => resolveChatMediaUrlCandidates(fileUrl), [fileUrl]);
  const [srcIndex, setSrcIndex] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  const downloadName = fileName || alt || "image.jpg";

  useEffect(() => {
    setSrcIndex(0);
    setLoadFailed(false);
  }, [fileUrl]);

  const src = candidates[srcIndex] ?? "";
  const hasMoreCandidates = srcIndex < candidates.length - 1;

  if (!src) return null;

  const tryNextSrc = () => {
    setSrcIndex((prev) => {
      if (prev < candidates.length - 1) {
        return prev + 1;
      }
      setLoadFailed(true);
      return prev;
    });
  };

  const handleDownload = (event: React.MouseEvent) => {
    event.stopPropagation();
    const key = String(fileUrl ?? "").trim();
    if (!key) return;

    const ok = downloadChatMediaFile(key, downloadName);
    if (!ok) {
      showErrorAlert("Could not download the image. Please try again.");
    }
  };

  const handleOpenPreview = () => {
    if (loadFailed) return;
    onOpenPreview?.();
  };

  return (
    <div className="normal-chat-bubble-image-wrap">
      <button
        type="button"
        className="normal-chat-bubble-attachment-btn"
        onClick={handleOpenPreview}
        aria-label="Open image preview"
        disabled={loadFailed}
      >
        {loadFailed ? (
          <span className="normal-chat-bubble-attachment-fallback">
            <i className="bi bi-image" />
            <span>{alt}</span>
          </span>
        ) : (
          <img
            key={`${srcIndex}-${src}`}
            src={src}
            alt={alt}
            className={className}
            loading="lazy"
            onError={() => {
              if (hasMoreCandidates) {
                tryNextSrc();
              } else {
                setLoadFailed(true);
              }
            }}
          />
        )}
      </button>
      {!loadFailed && (
        <button
          type="button"
          className="normal-chat-bubble-image-download-btn"
          onClick={handleDownload}
          aria-label={`Download ${downloadName}`}
          title="Download image"
        >
          <i className="bi bi-download" />
        </button>
      )}
    </div>
  );
};

export default ChatMessageImage;
