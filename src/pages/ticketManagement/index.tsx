import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import CustomHeader from "../../components/CustomHeader";
import CustomSummaryBox from "../../components/CustomSummaryBox";
import { ROUTES } from "../../routes/Routes";
import { useChatContext } from "../../lib/chat/ChatProvider";
import {
  countUnreadChats,
  filterChatsByFranchise,
  filterChatsByType,
} from "../../services/chatService";
import { readHeaderFranchisePreference } from "../../lib/franchise/headerFranchisePreference";
import { HEADER_FRANCHISE_CHANGED_EVENT } from "../../lib/franchise/headerFranchisePreference";

type ChatCardType = "normal" | "dispute" | "quote" | "group";

const TicketManagement = () => {
  const navigate = useNavigate();
  const { register, setValue } = useForm();
  const { inbox, inboxLoading, enrichInboxFranchiseIdsIfNeeded } = useChatContext();

  const [franchiseId, setFranchiseId] = useState(() => readHeaderFranchisePreference());
  const [selectedChatCard, setSelectedChatCard] = useState<ChatCardType | "">("");

  useEffect(() => {
    const onFranchiseChange = () => {
      setFranchiseId(readHeaderFranchisePreference());
    };
    window.addEventListener(HEADER_FRANCHISE_CHANGED_EVENT, onFranchiseChange);
    return () =>
      window.removeEventListener(HEADER_FRANCHISE_CHANGED_EVENT, onFranchiseChange);
  }, []);

  useEffect(() => {
    if (!inbox.length) return;
    void enrichInboxFranchiseIdsIfNeeded();
  }, [enrichInboxFranchiseIdsIfNeeded, franchiseId, inbox.length]);

  const scopedInbox = useMemo(
    () => filterChatsByFranchise(inbox, franchiseId),
    [inbox, franchiseId]
  );

  const supportChats = useMemo(
    () => filterChatsByType(scopedInbox, "support"),
    [scopedInbox]
  );
  const disputeChats = useMemo(
    () => filterChatsByType(scopedInbox, "dispute"),
    [scopedInbox]
  );
  const quoteChats = useMemo(
    () => filterChatsByType(scopedInbox, "quote"),
    [scopedInbox]
  );
  const orderChats = useMemo(
    () => filterChatsByType(scopedInbox, "order"),
    [scopedInbox]
  );
  const hubLoading = inboxLoading;

  const chatCards: {
    id: ChatCardType;
    title: string;
    data: Record<string, number>;
  }[] = [
    {
      id: "normal",
      title: "General Chats",
      data: {
        All: supportChats.length,
        Unread: countUnreadChats(supportChats),
      },
    },
    {
      id: "dispute",
      title: "Dispute Chats",
      data: {
        All: disputeChats.length,
        Unread: countUnreadChats(disputeChats),
      },
    },
    // {
    //   id: "quote",
    //   title: "Quote Chats",
    //   data: { All: quoteAllCount, Unread: quoteUnreadThreads },
    // },
    {
      id: "group",
      title: "Group Chats",
      data: {
        All: orderChats.length,
        Unread: countUnreadChats(orderChats),
      },
    },
  ];

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Ticket Management"
        register={register}
        setValue={setValue}
        onLocationChange={(selectedFranchiseId) => {
          setFranchiseId(selectedFranchiseId);
        }}
      />

      {hubLoading && (
        <p className="small text-muted mb-2">Refreshing counts…</p>
      )}

      <div className="box-container my-franchise-box-container mb-3">
        {chatCards.map((card) => (
          <CustomSummaryBox
            key={card.id}
            divId={card.id}
            title={card.title}
            data={card.data}
            onSelect={(divId) => {
              const cardId = divId as ChatCardType;
              setSelectedChatCard(cardId);
              if (cardId === "normal") {
                navigate(ROUTES.TICKET_MANAGEMENT_NORMAL_CHAT.path);
                return;
              }
              if (cardId === "dispute") {
                navigate(ROUTES.TICKET_MANAGEMENT_DISPUTE_CHAT.path);
                return;
              }
              if (cardId === "quote") {
                navigate(ROUTES.TICKET_MANAGEMENT_QUOTE_CHAT.path);
                return;
              }
              if (cardId === "group") {
                navigate(ROUTES.TICKET_MANAGEMENT_GROUP_CHAT.path);
              }
            }}
            isSelected={selectedChatCard === card.id}
            onFilterChange={() => {}}
            onItemClick={(key) => {
              if (card.id === "normal") {
                navigate(
                  key === "Unread"
                    ? `${ROUTES.TICKET_MANAGEMENT_NORMAL_CHAT.path}?filter=unread`
                    : ROUTES.TICKET_MANAGEMENT_NORMAL_CHAT.path
                );
              }
              if (card.id === "quote") {
                navigate(
                  key === "Unread"
                    ? `${ROUTES.TICKET_MANAGEMENT_QUOTE_CHAT.path}?filter=unread`
                    : ROUTES.TICKET_MANAGEMENT_QUOTE_CHAT.path
                );
              }
              if (card.id === "group") {
                navigate(
                  key === "Unread"
                    ? `${ROUTES.TICKET_MANAGEMENT_GROUP_CHAT.path}?filter=unread`
                    : ROUTES.TICKET_MANAGEMENT_GROUP_CHAT.path
                );
              }
              if (card.id === "dispute") {
                navigate(
                  key === "Unread"
                    ? `${ROUTES.TICKET_MANAGEMENT_DISPUTE_CHAT.path}?filter=unread`
                    : ROUTES.TICKET_MANAGEMENT_DISPUTE_CHAT.path
                );
              }
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default TicketManagement;
