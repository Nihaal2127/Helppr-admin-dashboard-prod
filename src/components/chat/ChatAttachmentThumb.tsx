import React from "react";
import { useChatMediaSrc } from "../../lib/chat/useChatMediaSrc";

type ChatAttachmentThumbProps = {
  mediaKey: string;
  fileName: string;
  className?: string;
};

const ChatAttachmentThumb: React.FC<ChatAttachmentThumbProps> = ({
  mediaKey,
  fileName,
  className = "normal-chat-attachment-thumb",
}) => {
  const { src, loadFailed, onError } = useChatMediaSrc(mediaKey);

  if (loadFailed || !src) {
    return (
      <div className="normal-chat-attachment-file-thumb d-flex align-items-center justify-content-center">
        <i className="bi bi-image fs-4 text-muted" aria-hidden />
      </div>
    );
  }

  return (
    <img
      key={`${mediaKey}-${src}`}
      src={src}
      alt={fileName}
      className={className}
      loading="lazy"
      onError={onError}
    />
  );
};

export default ChatAttachmentThumb;
