import React from "react";
import { useSearchParams } from "react-router-dom";
import ChatConversationCore from "../../components/chat/ChatConversationCore";
import { ROUTES } from "../../routes/Routes";

const QuoteChatConversationPage = () => {
  const [searchParams] = useSearchParams();
  const chatId = searchParams.get("chatId") || "";

  if (!chatId) {
    return <div className="main-page-content p-4 text-muted">Chat not found.</div>;
  }

  return (
    <ChatConversationCore
      chatId={chatId}
      backPath={ROUTES.TICKET_MANAGEMENT_QUOTE_CHAT.path}
      title="Quote Chat"
      showTransfer
    />
  );
};

export default QuoteChatConversationPage;
