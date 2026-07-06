import React from "react";
import { useNavigate } from "react-router-dom";
import { useChatContext } from "../../lib/chat/ChatProvider";
import { ChatRecordModel, chatLastMessagePreview, chatLastMessageAtIso } from "../../lib/models/ChatModel";
import { formatChatInboxListTime, orderChatTitleFromRecord } from "../../lib/chat/chatDisplayHelpers";
import ChatInboxListItem from "./ChatInboxListItem";

type GroupChatListItemProps = {
  chat: ChatRecordModel;
  viewPath: string;
};

const GroupChatListItem: React.FC<GroupChatListItemProps> = ({ chat, viewPath }) => {
  const navigate = useNavigate();
  const { typingByChatId, isChatParticipantOnline } = useChatContext();
  const title = orderChatTitleFromRecord(chat);
  const typingLabel = typingByChatId[chat._id];
  const preview = typingLabel
    ? typingLabel === "typing"
      ? "typing…"
      : `${typingLabel} typing…`
    : chatLastMessagePreview(chat);

  return (
    <ChatInboxListItem
      name={title}
      preview={preview}
      avatarName={title}
      unreadCount={chat.unreadCount}
      lastMessageTime={formatChatInboxListTime(chatLastMessageAtIso(chat))}
      isOnline={isChatParticipantOnline(chat)}
      onClick={() => navigate(`${viewPath}?chatId=${chat._id}`)}
    />
  );
};

export default GroupChatListItem;
