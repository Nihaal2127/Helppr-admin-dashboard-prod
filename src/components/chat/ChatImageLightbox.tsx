import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import CustomCloseButton from "../CustomCloseButton";
import {
  downloadChatMediaFile,
  ChatGalleryImageItem,
  resolveChatMediaUrlCandidates,
} from "../../lib/chat/chatDisplayHelpers";
import { showErrorAlert } from "../../lib/global/alertHelper";

type ChatImageLightboxProps = {
  show: boolean;
  images: ChatGalleryImageItem[];
  currentIndex: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

const ChatImageLightbox: React.FC<ChatImageLightboxProps> = ({
  show,
  images,
  currentIndex,
  onClose,
  onIndexChange,
}) => {
  const current = images[currentIndex];
  const candidates = useMemo(
    () => resolveChatMediaUrlCandidates(current?.fileUrl),
    [current?.fileUrl]
  );

  const [srcIndex, setSrcIndex] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  const isFirst = currentIndex <= 0;
  const isLast = currentIndex >= images.length - 1;
  const src = candidates[srcIndex] ?? "";
  const hasMoreCandidates = srcIndex < candidates.length - 1;
  const downloadName = current?.fileName || current?.alt || "image.jpg";

  useEffect(() => {
    setSrcIndex(0);
    setLoadFailed(false);
  }, [current?.fileUrl, currentIndex]);

  useEffect(() => {
    if (!show) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && !isFirst) {
        onIndexChange(currentIndex - 1);
      }
      if (event.key === "ArrowRight" && !isLast) {
        onIndexChange(currentIndex + 1);
      }
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [show, isFirst, isLast, currentIndex, onClose, onIndexChange]);

  if (!current) return null;

  const tryNextSrc = () => {
    setSrcIndex((prev) => {
      if (prev < candidates.length - 1) {
        return prev + 1;
      }
      setLoadFailed(true);
      return prev;
    });
  };

  const handleDownload = () => {
    const key = String(current.fileUrl ?? "").trim();
    if (!key) return;

    const ok = downloadChatMediaFile(key, downloadName);
    if (!ok) {
      showErrorAlert("Could not download the image. Please try again.");
    }
  };

  return (
    <Modal
      show={show}
      onHide={onClose}
      centered
      dialogClassName="normal-chat-image-lightbox"
      contentClassName="border-0 bg-transparent"
    >
      <div className="normal-chat-image-lightbox-inner">
        <div className="normal-chat-image-lightbox-actions">
          <span className="normal-chat-image-lightbox-counter">
            {currentIndex + 1} / {images.length}
          </span>
          <button
            type="button"
            className="normal-chat-image-lightbox-action-btn"
            onClick={handleDownload}
            disabled={loadFailed}
            aria-label={`Download ${downloadName}`}
            title="Download image"
          >
            <i className="bi bi-download" />
          </button>
          <CustomCloseButton inline onClose={onClose} />
        </div>

        <button
          type="button"
          className="normal-chat-image-lightbox-nav normal-chat-image-lightbox-nav-prev"
          onClick={() => onIndexChange(currentIndex - 1)}
          disabled={isFirst}
          aria-label="Previous image"
        >
          <i className="bi bi-chevron-left" />
        </button>

        <button
          type="button"
          className="normal-chat-image-lightbox-nav normal-chat-image-lightbox-nav-next"
          onClick={() => onIndexChange(currentIndex + 1)}
          disabled={isLast}
          aria-label="Next image"
        >
          <i className="bi bi-chevron-right" />
        </button>

        {loadFailed || !src ? (
          <div className="normal-chat-image-lightbox-fallback">
            <i className="bi bi-image" />
            <span>{current.alt}</span>
          </div>
        ) : (
          <img
            key={`lightbox-${currentIndex}-${srcIndex}-${src}`}
            src={src}
            alt={current.alt}
            className="normal-chat-image-lightbox-img"
            onError={tryNextSrc}
          />
        )}
      </div>
    </Modal>
  );
};

export default ChatImageLightbox;
