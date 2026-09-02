import React, { useEffect } from "react";
import { Modal } from "react-bootstrap";
import CustomCloseButton from "./CustomCloseButton";
import { useMediaAssetSrc } from "../hooks/useMediaAssetSrc";

export type PostImagePreviewItem = {
  url: string;
  title: string;
};

type PostImagePreviewModalProps = {
  show: boolean;
  images: PostImagePreviewItem[];
  currentIndex: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

function PostImagePreviewSlide({ url, title }: PostImagePreviewItem) {
  const { src, loadFailed, onError } = useMediaAssetSrc(url);

  if (loadFailed || !src) {
    return (
      <div className="normal-chat-image-lightbox-fallback">
        <i className="bi bi-image" aria-hidden />
        <span>{title}</span>
      </div>
    );
  }

  return (
    <img
      key={`post-lightbox-${url}-${src}`}
      src={src}
      alt={title}
      className="normal-chat-image-lightbox-img"
      onError={onError}
    />
  );
}

const PostImagePreviewModal: React.FC<PostImagePreviewModalProps> = ({
  show,
  images,
  currentIndex,
  onClose,
  onIndexChange,
}) => {
  const current = images[currentIndex];
  const isFirst = currentIndex <= 0;
  const isLast = currentIndex >= images.length - 1;
  const showNav = images.length > 1;

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

  return (
    <Modal
      show={show}
      onHide={onClose}
      centered
      dialogClassName="normal-chat-image-lightbox"
      contentClassName="border-0 bg-transparent"
      enforceFocus={false}
    >
      <div className="normal-chat-image-lightbox-inner">
        <div className="normal-chat-image-lightbox-actions">
          {showNav ? (
            <span className="normal-chat-image-lightbox-counter">
              {currentIndex + 1} / {images.length}
            </span>
          ) : null}
          <CustomCloseButton inline onClose={onClose} />
        </div>

        {showNav ? (
          <>
            <button
              type="button"
              className="normal-chat-image-lightbox-nav normal-chat-image-lightbox-nav-prev"
              onClick={() => onIndexChange(currentIndex - 1)}
              disabled={isFirst}
              aria-label="Previous image"
            >
              <i className="bi bi-chevron-left" aria-hidden />
            </button>
            <button
              type="button"
              className="normal-chat-image-lightbox-nav normal-chat-image-lightbox-nav-next"
              onClick={() => onIndexChange(currentIndex + 1)}
              disabled={isLast}
              aria-label="Next image"
            >
              <i className="bi bi-chevron-right" aria-hidden />
            </button>
          </>
        ) : null}

        <PostImagePreviewSlide url={current.url} title={current.title} />
      </div>
    </Modal>
  );
};

export default PostImagePreviewModal;
