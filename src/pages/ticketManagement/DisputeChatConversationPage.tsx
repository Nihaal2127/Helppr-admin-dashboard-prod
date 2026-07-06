import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ChatConversationCore from "../../components/chat/ChatConversationCore";
import { ROUTES } from "../../routes/Routes";
import { fetchChatById } from "../../services/chatService";
import { fetchDisputeById } from "../../services/disputeService";

const DisputeChatConversationPage = () => {
  const [searchParams] = useSearchParams();
  const chatIdParam = String(searchParams.get("chatId") ?? "").trim();
  const disputeId = String(
    searchParams.get("disputeId") ?? searchParams.get("ticketId") ?? ""
  ).trim();

  const [chatId, setChatId] = useState(chatIdParam);
  const [franchiseId, setFranchiseId] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      setLoading(true);

      if (chatIdParam) {
        const res = await fetchChatById(chatIdParam, { skipLoader: true });
        if (!cancelled && res.chat) {
          setChatId(res.chat._id);
          setFranchiseId(res.chat.franchiseId ?? res.chat.franchise_id);
        }
      } else if (disputeId) {
        const res = await fetchDisputeById(disputeId, { skipLoader: true });
        if (!cancelled && res.dispute) {
          setChatId(String(res.dispute.chat_id ?? res.dispute.chatId ?? "").trim());
          setFranchiseId(res.dispute.franchise_id ?? res.dispute.franchiseId);
        }
      }

      if (!cancelled) setLoading(false);
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [chatIdParam, disputeId]);

  if (loading) {
    return (
      <div className="main-page-content p-4 text-muted">Loading chat…</div>
    );
  }

  if (!chatId) {
    return (
      <div className="main-page-content p-4 text-muted">Chat not found.</div>
    );
  }

  return (
    <ChatConversationCore
      chatId={chatId}
      backPath={ROUTES.TICKET_MANAGEMENT_DISPUTE_CHAT.path}
      title="Dispute Chat"
      franchiseId={franchiseId}
      chatKind="dispute"
    />
  );
};

export default DisputeChatConversationPage;
