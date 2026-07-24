import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ROUTES } from "../../routes/Routes";
import { useChatContext } from "../../lib/chat/ChatProvider";
import {
  chatCustomerDisplayName,
  chatLastMessagePreview,
  ChatType,
  chatLinkedOrderId,
  chatLinkedOrderUniqueId,
  chatLastMessageAtIso,
} from "../../lib/models/ChatModel";
import { formatChatInboxListTime, orderChatTitleFromRecord } from "../../lib/chat/chatDisplayHelpers";
import { filterChatsByFranchise, filterChatsByType } from "../../services/chatService";
import GroupChatListItem from "../../components/chat/GroupChatListItem";
import ChatInboxListItem from "../../components/chat/ChatInboxListItem";
import ChatListPageHeader from "../../components/chat/ChatListPageHeader";
import { useFranchiseHeaderForm } from "../../lib/global/hooks/useFranchiseScopedGetCount";

const QuoteChatListPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const { register, setValue, franchiseId } = useFranchiseHeaderForm();
  const { inbox, inboxLoading, socketConnected, socketError, typingByChatId, isChatParticipantOnline, enrichInboxFranchiseIdsIfNeeded } = useChatContext();

  const isGroupList = location.pathname.includes("/group-chats");
  const chatType: ChatType = isGroupList ? "order" : "quote";
  const unreadOnly = searchParams.get("filter") === "unread";

  useEffect(() => {
    if (!inbox.length) return;
    void enrichInboxFranchiseIdsIfNeeded();
  }, [enrichInboxFranchiseIdsIfNeeded, franchiseId, inbox.length]);

  const chats = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return filterChatsByFranchise(
      filterChatsByType(inbox, chatType),
      franchiseId
    ).filter((chat) => {
      if (unreadOnly && !((chat.unreadCount ?? 0) > 0)) return false;
      if (keyword.length === 0) return true;
      const orderId = chatLinkedOrderId(chat).toLowerCase();
      const orderUniqueId = chatLinkedOrderUniqueId(chat).toLowerCase();
      const name = isGroupList
        ? orderChatTitleFromRecord(chat).toLowerCase()
        : chatCustomerDisplayName(chat).toLowerCase();
      const preview = chatLastMessagePreview(chat).toLowerCase();
      return (
        name.includes(keyword) ||
        preview.includes(keyword) ||
        chat._id.toLowerCase().includes(keyword) ||
        orderId.includes(keyword) ||
        orderUniqueId.includes(keyword)
      );
    });
  }, [inbox, chatType, isGroupList, unreadOnly, search, franchiseId]);

  const listPath = isGroupList
    ? ROUTES.TICKET_MANAGEMENT_GROUP_CHAT.path
    : ROUTES.TICKET_MANAGEMENT_QUOTE_CHAT.path;
  const viewPath = isGroupList
    ? ROUTES.TICKET_MANAGEMENT_GROUP_CHAT_VIEW.path
    : ROUTES.TICKET_MANAGEMENT_QUOTE_CHAT_VIEW.path;

  return (
    <div className="main-page-content">
      <ChatListPageHeader
        title={isGroupList ? "Group Chats" : "Quote Chats"}
        backPath={ROUTES.TICKET_MANAGEMENT.path}
        register={register}
        setValue={setValue}
        socketConnected={socketConnected}
        socketError={socketError}
      />

      <div className="d-flex align-items-center gap-2 mb-3" role="tablist">
        <button
          type="button"
          className={`normal-chat-filter-tag ${!unreadOnly ? "active" : ""}`}
          onClick={() => navigate(listPath)}
        >
          All
        </button>
        <button
          type="button"
          className={`normal-chat-filter-tag ${unreadOnly ? "active" : ""}`}
          onClick={() => navigate(`${listPath}?filter=unread`)}
        >
          Unread
        </button>
      </div>

      <div className="normal-chat-page">
        <div className="normal-chat-search-wrap">
          <div className="normal-chat-search-input-wrap">
            <input
              className="normal-chat-search-input"
              type="text"
              placeholder={isGroupList ? "Search by order id or message" : "Search chats"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <i className="bi bi-search normal-chat-search-icon" />
          </div>
        </div>

        <div className="normal-chat-list-wrap">
          {inboxLoading && chats.length === 0 ? (
            <div className="normal-chat-empty-state d-flex align-items-center justify-content-center">
              Loading chats…
            </div>
          ) : chats.length === 0 ? (
            <div className="normal-chat-empty-state d-flex align-items-center justify-content-center">
              No chats found.
            </div>
          ) : isGroupList ? (
            chats.map((chat) => (
              <GroupChatListItem key={chat._id} chat={chat} viewPath={viewPath} />
            ))
          ) : (
            chats.map((chat) => {
              const name = chatCustomerDisplayName(chat);
              const typingLabel = typingByChatId[chat._id];
              const preview = typingLabel
                ? typingLabel === "typing"
                  ? "typing…"
                  : `${typingLabel} typing…`
                : chatLastMessagePreview(chat);
              const customerUser =
                (chat.participantUsers ?? []).find((u) => Number(u.type) === 4) ??
                chat.participantUsers?.[0];
              return (
                <ChatInboxListItem
                  key={chat._id}
                  name={name}
                  preview={preview}
                  avatarName={name}
                  avatarImageUrl={customerUser?.profile_url}
                  unreadCount={chat.unreadCount}
                  lastMessageTime={formatChatInboxListTime(chatLastMessageAtIso(chat))}
                  isOnline={isChatParticipantOnline(chat)}
                  onClick={() => navigate(`${viewPath}?chatId=${chat._id}`)}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default QuoteChatListPage;
