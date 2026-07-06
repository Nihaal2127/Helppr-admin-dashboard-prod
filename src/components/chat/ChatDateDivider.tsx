import React from "react";

type ChatDateDividerProps = {
  label: string;
};

const ChatDateDivider: React.FC<ChatDateDividerProps> = ({ label }) => (
  <div className="normal-chat-date-divider" role="separator" aria-label={label}>
    <span>{label}</span>
  </div>
);

export default ChatDateDivider;
