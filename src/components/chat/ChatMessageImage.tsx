import React from "react";
import {
  downloadChatMediaFile,
} from "../../lib/chat/chatDisplayHelpers";
import { useChatMediaSrc } from "../../lib/chat/useChatMediaSrc";
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
  const { src, loadFailed, onError } = useChatMediaSrc(fileUrl);

  const downloadName = fileName || alt || "image.jpg";

  if (!fileUrl) return null;

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
        ) : src ? (
          <img
            key={`${fileUrl}-${src}`}
            src={src}
            alt={alt}
            className={className}
            loading="lazy"
            onError={onError}
          />
        ) : null}
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
