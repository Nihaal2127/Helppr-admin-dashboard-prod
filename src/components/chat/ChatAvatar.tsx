import React from "react";
import { initialsFromName } from "../../lib/chat/chatDisplayHelpers";
import { AppConstant } from "../../lib/global/AppConstant";


function resolveChatAvatarImageSrc(imageUrl?: string | null): string | null {
  const raw = String(imageUrl ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${AppConstant.CHAT_AVATAR_IMAGE_BASE_URL}${raw.replace(/^\//, "")}`;
}

type ChatAvatarProps = {
  name?: string;
  imageUrl?: string | null;
  className?: string;
  size?: "sm" | "md";
  fallbackColor?: string;
  isOnline?: boolean;
};

const ChatAvatar: React.FC<ChatAvatarProps> = ({
  name,
  imageUrl,
  className = "",
  size = "md",
  fallbackColor = "#7f1d1d",
  isOnline = false,
}) => {
  const src = resolveChatAvatarImageSrc(imageUrl);
  const sizeClass = size === "sm" ? "normal-chat-message-avatar-sm" : "";

  return (
    <div className={`normal-chat-avatar-wrap ${className}`.trim()}>
      <div
        className={`normal-chat-message-avatar ${sizeClass}`.trim()}
        style={!src ? { backgroundColor: fallbackColor } : undefined}
        aria-hidden
      >
        {src ? (
          <img src={src} alt="" className="normal-chat-avatar-img" />
        ) : (
          initialsFromName(name)
        )}
      </div>
      {isOnline ? (
        <span className="normal-chat-online-dot" aria-label="Online" />
      ) : null}
    </div>
  );
};

export default ChatAvatar;
