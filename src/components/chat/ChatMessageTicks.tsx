import React from "react";
import { MessageTickStatus } from "../../lib/chat/chatDisplayHelpers";

type ChatMessageTicksProps = {
  status: MessageTickStatus;
};

const ChatMessageTicks: React.FC<ChatMessageTicksProps> = ({ status }) => {
  if (status === "failed") {
    return <span className="normal-chat-ticks failed" aria-label="Failed to send">!</span>;
  }
  if (status === "sending") {
    return <i className="bi bi-clock normal-chat-ticks sending" aria-label="Sending" />;
  }
  if (status === "sent") {
    return <i className="bi bi-check normal-chat-ticks sent" aria-label="Sent" />;
  }
  if (status === "delivered") {
    return (
      <span className="normal-chat-ticks delivered" aria-label="Delivered">
        <i className="bi bi-check2-all" />
      </span>
    );
  }
  return (
    <span className="normal-chat-ticks read" aria-label="Seen">
      <i className="bi bi-check2-all" />
    </span>
  );
};

export default ChatMessageTicks;
