import React from "react";
import { downloadChatMediaFile } from "../../lib/chat/chatDisplayHelpers";
import { showErrorAlert } from "../../lib/global/alertHelper";

type ChatMessageFileProps = {
  fileUrl: string;
  fileName: string;
  isPdf?: boolean;
};

const ChatMessageFile: React.FC<ChatMessageFileProps> = ({
  fileUrl,
  fileName,
  isPdf = false,
}) => {
  const handleDownload = () => {
    const key = String(fileUrl ?? "").trim();
    if (!key) return;

    const ok = downloadChatMediaFile(key, fileName);
    if (!ok) {
      showErrorAlert("Could not download the file. Please try again.");
    }
  };

  return (
    <button
      type="button"
      className="normal-chat-bubble-file"
      onClick={handleDownload}
      aria-label={isPdf ? `Download ${fileName}` : `Open ${fileName}`}
    >
      <i className={`bi ${isPdf ? "bi-file-earmark-pdf" : "bi-file-earmark-text"}`} />
      <span className="normal-chat-bubble-file-name">{fileName}</span>
      <i className="bi bi-download normal-chat-bubble-file-action" aria-hidden />
    </button>
  );
};

export default ChatMessageFile;
