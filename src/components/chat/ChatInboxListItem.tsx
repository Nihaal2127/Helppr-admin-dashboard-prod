import React from "react";
import ChatAvatar from "./ChatAvatar";

export type ChatInboxListItemProps = {
  name: string;
  preview: string;
  avatarName?: string;
  avatarImageUrl?: string | null;
  unreadCount?: number;
  subtitle?: string;
  lastMessageTime?: string;
  isOnline?: boolean;
  onClick: () => void;
};

const ChatInboxListItem: React.FC<ChatInboxListItemProps> = ({
  name,
  preview,
  avatarName,
  avatarImageUrl,
  unreadCount = 0,
  subtitle,
  lastMessageTime,
  isOnline = false,
  onClick,
}) => {
  const unread = Math.max(0, Number(unreadCount) || 0);
  const hasUnread = unread > 0;

  return (
    <div
      className={`normal-chat-list-item d-flex${hasUnread ? " has-unread" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <ChatAvatar
        name={avatarName ?? name}
        imageUrl={avatarImageUrl}
        className="flex-shrink-0"
        isOnline={isOnline}
      />
      <div className="normal-chat-list-body">
        <div className="normal-chat-list-top-row">
          <h6
            className={`normal-chat-user-name mb-0${hasUnread ? " is-unread" : ""}`}
            title={name}
          >
            {name}
          </h6>
          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            {lastMessageTime ? (
              <small className="normal-chat-time">{lastMessageTime}</small>
            ) : null}
            {hasUnread && (
              <span className="normal-chat-unread-badge flex-shrink-0" aria-label={`${unread} unread`}>
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
        <p
          className={`normal-chat-preview mb-0${hasUnread ? " is-unread" : ""}`}
          title={preview}
        >
          {preview || "No messages yet"}
        </p>
        {subtitle ? <small className="normal-chat-time d-block">{subtitle}</small> : null}
      </div>
    </div>
  );
};

export default ChatInboxListItem;
