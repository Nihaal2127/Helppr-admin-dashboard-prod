import React from "react";

type ChatTypingIndicatorProps = {
  label?: string;
};

const ChatTypingIndicator: React.FC<ChatTypingIndicatorProps> = ({
  label = "typing",
}) => (
  <div className="normal-chat-typing-row" aria-live="polite">
    <div className="normal-chat-typing-bubble">
      <span className="normal-chat-typing-label">{label}</span>
      <span className="normal-chat-typing-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    </div>
  </div>
);

export default ChatTypingIndicator;
