import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";

import { AppConstant } from "../../lib/global/AppConstant";

import { getLocalStorage } from "../../lib/global/localStorageHelper";

import { showErrorAlert } from "../../lib/global/alertHelper";

import {

  chatCustomerDisplayName,

  chatEmployeeDisplayName,

  chatLinkedDisputeUniqueId,

  chatLinkedDisputeId,

  chatLinkedOrderUniqueId,

  ChatMessageModel,

  ChatRecordModel,

  ChatType,

  mapChatRecord,
  chatWithAssignee,
  chatAssignedFranchiseEmployee,
} from "../../lib/models/ChatModel";

import { useChatThread } from "../../lib/chat/useChatThread";

import { useChatContext } from "../../lib/chat/ChatProvider";
import { enrichChatFranchiseFromCache } from "../../lib/chat/chatFranchiseHelpers";

import { emitTypingStart, emitTypingStop } from "../../lib/chat/chatSocket";

import {

  chatMessageAttachmentLabel,
  chatMessageImageFileName,

  collectChatAttachments,
  collectChatGalleryImages,

  inferAttachmentMessageType,

  isImageAttachment,
  isPdfAttachment,
  messageHasAttachment,

  messageTickStatus,

  orderChatTitleFromRecord,

  chatMessageMediaKey,

  resolveChatMediaUrl,

  chatDateDividerLabel,

  transferHistoryFromMessages,

  formatDisputeOpenedSystemContent,

  disputeOpenedSummaryLabel,

  parseDisputeCodeFromOpenedMessage,

} from "../../lib/chat/chatDisplayHelpers";

import {
  canStaffCloseChat,
  canStaffReopenChat,
  canStaffSendChatMessages,
  canStaffTransferChat,
} from "../../lib/chat/chatPermissions";

import { fetchChatById, updateChatStatus } from "../../services/chatService";
import { fetchDisputeById } from "../../services/disputeService";

import {

  documentUploadFailureMessage,

  uploadDocumentImages,

} from "../../services/documentUploadService";

import { APP_USER_TYPE, fetchChatTransferAssigneeOptions, fetchUserById } from "../../services/userService";

import TransferChatModal from "../TransferChatModal";

import ChatAvatar from "./ChatAvatar";

import ChatMessageTicks from "./ChatMessageTicks";

import ChatTypingIndicator from "./ChatTypingIndicator";

import ChatConversationSidebar from "./ChatConversationSidebar";
import ChatMessageImage from "./ChatMessageImage";
import ChatImageLightbox from "./ChatImageLightbox";
import ChatMessageFile from "./ChatMessageFile";
import ChatDateDivider from "./ChatDateDivider";

export type ChatConversationKind = "general" | "group" | "dispute";



type PendingAttachment = {

  id: string;

  file: File;

  previewUrl?: string;

};



type ChatConversationCoreProps = {

  chatId: string;

  backPath: string;

  title?: string;

  inputDisabled?: boolean;

  showTransfer?: boolean;

  franchiseId?: string;

  chatKind?: ChatConversationKind;

};

const CHAT_ATTACHMENT_UPLOAD_TYPE = "7";

const ACCEPTED_CHAT_FILES =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar";

function formatMessageTime(iso?: string): string {

  if (!iso) return "";

  const d = new Date(iso);

  if (isNaN(d.getTime())) return iso;

  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

}



function isOwnMessage(msg: ChatMessageModel): boolean {

  const myId = String(getLocalStorage(AppConstant.createdById) ?? "").trim();

  if (!myId) return false;

  return String(msg.senderId ?? "") === myId;

}



function inferChatKind(type?: ChatType, isGroup?: boolean): ChatConversationKind {

  if (type === "order" || isGroup) return "group";

  if (type === "dispute") return "dispute";

  return "general";

}



const ChatConversationCore: React.FC<ChatConversationCoreProps> = ({

  chatId,

  backPath,

  title = "Chat",

  inputDisabled = false,

  showTransfer = true,

  franchiseId,

  chatKind: chatKindProp,

}) => {

  const navigate = useNavigate();

  const [chatMeta, setChatMeta] = useState<ChatRecordModel | null>(null);

  const [messageDraft, setMessageDraft] = useState("");

  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);

  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [chatStatusPending, setChatStatusPending] = useState(false);

  const [galleryOpen, setGalleryOpen] = useState(false);

  const [galleryIndex, setGalleryIndex] = useState(0);

  const [assigneeOptions, setAssigneeOptions] = useState<

    { value: string; label: string }[]

  >([]);

  const [transferSubmitting, setTransferSubmitting] = useState(false);

  const [customerEmail, setCustomerEmail] = useState("");

  const [employeeEmail, setEmployeeEmail] = useState("");

  const messageAreaRef = useRef<HTMLDivElement | null>(null);

  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { socketConnected, socketError, subscribeChatUpdated, refreshInbox } =
    useChatContext();



  const {

    messages,

    loading,

    sendTextMessage,

    retryMessage,

    loadOlder,

    loadingMore,

    hasMore,

    loadError,

    typingLabel,

  } = useChatThread(chatId);



  const chatKind = chatKindProp ?? inferChatKind(chatMeta?.type, chatMeta?.isGroup);

  const isGroup = chatKind === "group";

  const showSenderNames = isGroup;

  const resolvedFranchiseId = useMemo(
    () =>
      String(
        franchiseId ?? chatMeta?.franchiseId ?? chatMeta?.franchise_id ?? ""
      ).trim(),
    [franchiseId, chatMeta]
  );

  const chatClosed = useMemo(
    () => String(chatMeta?.status ?? "").trim().toLowerCase() === "closed",
    [chatMeta?.status]
  );

  const messagingLocked = inputDisabled || chatClosed;

  const canCloseChat = useMemo(
    () => canStaffCloseChat(chatMeta),
    [chatMeta]
  );

  const canOpenChat = useMemo(
    () => canStaffReopenChat(chatMeta),
    [chatMeta]
  );

  const canTransfer = useMemo(
    () =>
      showTransfer &&
      !messagingLocked &&
      canStaffTransferChat(chatMeta, chatKind),
    [showTransfer, messagingLocked, chatMeta, chatKind]
  );

  const canSendMessages = useMemo(
    () => canStaffSendChatMessages(chatMeta, chatKind, messagingLocked),
    [chatMeta, chatKind, messagingLocked]
  );

  const composerDisabled = !canSendMessages;

  const viewOnlyMode = useMemo(
    () =>
      Boolean(
        chatMeta &&
          !messagingLocked &&
          !canStaffSendChatMessages(chatMeta, chatKind, false)
      ),
    [chatMeta, chatKind, messagingLocked]
  );

  const chatParticipantIds = useMemo(() => {
    const ids = (chatMeta?.participantUsers ?? []).map((user) => user._id).filter(Boolean);
    const assignedTo = String(chatMeta?.assignedTo ?? "").trim();
    if (assignedTo && !ids.includes(assignedTo)) ids.push(assignedTo);
    return ids;
  }, [chatMeta?.participantUsers, chatMeta?.assignedTo]);



  useEffect(() => {

    if (!chatId) return;

    fetchChatById(chatId, { skipLoader: true }).then((res) => {

      if (res.response && res.chat) {
        setChatMeta(enrichChatFranchiseFromCache(res.chat));
      }

    });

  }, [chatId]);



  const customerId = useMemo(
    () =>
      chatMeta?.participantUsers?.find((u) => Number(u.type) === APP_USER_TYPE.CUSTOMER)
        ?._id ?? "",
    [chatMeta?.participantUsers]
  );

  const assignedEmployee = useMemo(
    () => (chatMeta ? chatAssignedFranchiseEmployee(chatMeta) : undefined),
    [chatMeta]
  );

  const employeeId = useMemo(
    () => assignedEmployee?._id ?? "",
    [assignedEmployee]
  );

  useEffect(() => {

    let cancelled = false;

    if (customerId) {

      fetchUserById(customerId).then((res) => {

        if (!cancelled && res.user?.email) setCustomerEmail(res.user.email);

      });

    } else {

      setCustomerEmail("");

    }

    if (employeeId) {

      fetchUserById(employeeId).then((res) => {

        if (!cancelled && res.user?.email) setEmployeeEmail(res.user.email);

      });

    } else {

      setEmployeeEmail("");

    }

    return () => {

      cancelled = true;

    };

  }, [customerId, employeeId]);



  useEffect(() => {
    if (!chatMeta || chatKind !== "dispute") return;

    const hasOrderUnique = Boolean(chatLinkedOrderUniqueId(chatMeta));
    const hasDisputeUnique = Boolean(chatLinkedDisputeUniqueId(chatMeta));
    if (hasOrderUnique && hasDisputeUnique) return;

    const disputeMongoId = chatLinkedDisputeId(chatMeta);
    if (!disputeMongoId) return;

    let cancelled = false;
    fetchDisputeById(disputeMongoId, { skipLoader: true }).then((res) => {
      if (cancelled || !res.dispute) return;

      const orderUnique = String(
        res.dispute.order_unique_id ?? res.dispute.orderUniqueId ?? ""
      ).trim();
      const disputeUnique = String(
        res.dispute.unique_id ??
          res.dispute.dispute_unique_id ??
          ""
      ).trim();

      if (!orderUnique && !disputeUnique) return;

      setChatMeta((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          context: {
            ...prev.context,
            ...(orderUnique ? { orderUniqueId: orderUnique } : {}),
            ...(disputeUnique ? { disputeUniqueId: disputeUnique } : {}),
          },
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [chatMeta, chatKind]);



  useEffect(() => {

    if (!showTransferModal) return;

    let cancelled = false;

    const currentAssignee = String(chatMeta?.assignedTo ?? "").trim();

    fetchChatTransferAssigneeOptions(resolvedFranchiseId || undefined, currentAssignee)
      .then((options) => {
        if (cancelled) return;
        setAssigneeOptions(options);
      });

    return () => {
      cancelled = true;
    };

  }, [showTransferModal, resolvedFranchiseId, chatMeta?.assignedTo]);



  useEffect(() => {
    if (!chatId) return;

    const unsubscribe = subscribeChatUpdated((payload) => {
      const data =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : null;
      if (!data || String(data.type ?? "") === "messages_read") return;

      const record =
        (data.record &&
        typeof data.record === "object" &&
        !Array.isArray(data.record)
          ? (data.record as Record<string, unknown>)
          : null) ??
        (data.chat && typeof data.chat === "object" && !Array.isArray(data.chat)
          ? (data.chat as Record<string, unknown>)
          : null);

      if (record) {
        const updatedId = String(record._id ?? record.id ?? "").trim();
        if (updatedId === chatId) {
          setChatMeta(enrichChatFranchiseFromCache(mapChatRecord(record)));
        }
        return;
      }

      const updatedChatId = String(data.chatId ?? data.chat_id ?? "").trim();
      if (updatedChatId === chatId) {
        void fetchChatById(chatId, { skipLoader: true }).then((res) => {
          if (res.chat) setChatMeta(enrichChatFranchiseFromCache(res.chat));
        });
      }
    });

    return unsubscribe;
  }, [chatId, subscribeChatUpdated]);



  const adjustComposerHeight = useCallback(() => {

    const el = composerRef.current;

    if (!el) return;

    el.style.height = "auto";

    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;

  }, []);



  useEffect(() => {

    adjustComposerHeight();

  }, [messageDraft, adjustComposerHeight]);



  useEffect(() => {

    if (!messageAreaRef.current) return;

    messageAreaRef.current.scrollTop = messageAreaRef.current.scrollHeight;

  }, [messages, typingLabel, pendingFiles]);



  useEffect(() => {

    if (!chatId || composerDisabled || !socketConnected) return;



    if (!messageDraft.trim()) {

      emitTypingStop(chatId);

      return;

    }



    emitTypingStart(chatId);

    if (typingStopTimerRef.current) {

      clearTimeout(typingStopTimerRef.current);

    }

    typingStopTimerRef.current = setTimeout(() => {

      emitTypingStop(chatId);

    }, 2000);



    return () => {

      if (typingStopTimerRef.current) {

        clearTimeout(typingStopTimerRef.current);

      }

    };

  }, [messageDraft, chatId, composerDisabled, socketConnected]);



  useEffect(() => {
    return () => {
      emitTypingStop(chatId);
    };
  }, [chatId]);

  const pendingFilesRef = useRef(pendingFiles);
  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => {
    return () => {
      pendingFilesRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);



  const customerName = chatMeta ? chatCustomerDisplayName(chatMeta) : "Customer";

  const employeeName = chatMeta ? chatEmployeeDisplayName(chatMeta) : "";

  const customerUser = useMemo(

    () =>

      (chatMeta?.participantUsers ?? []).find((u) => Number(u.type) === 4) ??

      chatMeta?.participantUsers?.[0],

    [chatMeta]

  );

  const headerTitle = useMemo(() => {

    if (isGroup && chatMeta) {

      return orderChatTitleFromRecord(chatMeta);

    }

    return customerName;

  }, [isGroup, chatMeta, customerName]);



  const orderUniqueId = useMemo(
    () => (chatMeta ? chatLinkedOrderUniqueId(chatMeta) : ""),
    [chatMeta]
  );

  const disputeDisplayCode = useMemo(() => {
    if (!chatMeta || chatKind !== "dispute") return "";
    const fromContext = chatLinkedDisputeUniqueId(chatMeta);
    if (fromContext) return fromContext;
    const opened = messages.find(
      (msg) =>
        (msg.type === "system" || msg.senderUser?.role === "system") &&
        /Dispute\s+\S+\s+opened/i.test(String(msg.content ?? ""))
    );
    return parseDisputeCodeFromOpenedMessage(opened?.content);
  }, [chatMeta, chatKind, messages]);

  const disputeSummary = useMemo(
    () => disputeOpenedSummaryLabel(disputeDisplayCode, orderUniqueId),
    [disputeDisplayCode, orderUniqueId]
  );

  const headerSubtitle = useMemo(() => {

    if (chatKind === "dispute") {
      const handler = employeeName
        ? `Handler: ${employeeName}`
        : "No employee assigned";
      if (disputeSummary) return `${disputeSummary} · ${handler}`;
      return handler;
    }

    if (isGroup) {

      const names = (chatMeta?.participantUsers ?? []).map((u) => u.name).join(", ");

      return names || "Group chat";

    }

    return employeeName ? `Handler: ${employeeName}` : "No employee assigned";

  }, [chatMeta, chatKind, disputeSummary, employeeName, isGroup]);



  const sidebarAttachments = useMemo(() => collectChatAttachments(messages), [messages]);

  const transferHistory = useMemo(() => transferHistoryFromMessages(messages), [messages]);

  const galleryImages = useMemo(() => collectChatGalleryImages(messages), [messages]);

  const galleryIndexByMessageId = useMemo(() => {
    const map = new Map<string, number>();
    galleryImages.forEach((item, index) => {
      map.set(item.id, index);
    });
    return map;
  }, [galleryImages]);

  const openGalleryForMessage = useCallback(
    (messageId: string) => {
      const index = galleryIndexByMessageId.get(messageId);
      if (index === undefined) return;
      setGalleryIndex(index);
      setGalleryOpen(true);
    },
    [galleryIndexByMessageId]
  );



  const isSendDisabled =

    composerDisabled ||

    uploadingAttachment ||

    (messageDraft.trim().length === 0 && pendingFiles.length === 0);



  const composerPlaceholder = messagingLocked
    ? "Chat is closed"
    : viewOnlyMode
      ? "View only — you cannot send messages"
      : uploadingAttachment
        ? "Uploading…"
        : "Type a message...";



  const openAttachmentPicker = () => {

    fileInputRef.current?.click();

  };



  const onAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {

    const files = Array.from(event.target.files || []);

    if (files.length === 0) return;



    const mapped: PendingAttachment[] = files.map((file, index) => {

      const isImage = file.type.startsWith("image/");

      return {

        id: `${Date.now()}-${index}-${file.name}`,

        file,

        previewUrl: isImage ? URL.createObjectURL(file) : undefined,

      };

    });



    setPendingFiles((prev) => [...prev, ...mapped]);

    event.target.value = "";

  };



  const removePendingFile = (id: string) => {

    setPendingFiles((prev) => {

      const target = prev.find((item) => item.id === id);

      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);

      return prev.filter((item) => item.id !== id);

    });

  };



  const uploadChatFile = async (file: File): Promise<string | null> => {

    const upload = await uploadDocumentImages({

      uploadType: CHAT_ATTACHMENT_UPLOAD_TYPE,

      files: [file],

      isEditMode: false,

    });



    if (!upload.ok || upload.paths.length === 0) {

      showErrorAlert(documentUploadFailureMessage(upload.usedReplace));

      return null;

    }



    return upload.paths[0];

  };



  const handleSend = async () => {

    if (isSendDisabled) return;

    emitTypingStop(chatId);



    const text = messageDraft.trim();

    const filesToSend = [...pendingFiles];



    if (filesToSend.length > 0) {

      setUploadingAttachment(true);

      try {

        for (const item of filesToSend) {

          const fileUrl = await uploadChatFile(item.file);

          if (!fileUrl) continue;



          const type = inferAttachmentMessageType(item.file);

          const caption = filesToSend.length === 1 ? text : "";

          const ok = await sendTextMessage(caption, {

            fileUrl,

            type,

            fileName: item.file.name,

          });

          if (!ok) break;

        }



        if (filesToSend.length > 1 && text) {

          await sendTextMessage(text);

        }



        setPendingFiles((prev) => {

          prev.forEach((item) => {

            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);

          });

          return [];

        });

        setMessageDraft("");

        if (composerRef.current) {

          composerRef.current.style.height = "auto";

        }

      } finally {

        setUploadingAttachment(false);

      }

      return;

    }



    const ok = await sendTextMessage(text);

    if (ok) {

      setMessageDraft("");

      if (composerRef.current) {

        composerRef.current.style.height = "auto";

      }

    }

  };



  const handleTransfer = async (assigneeId: string) => {

    setTransferSubmitting(true);

    const normalizedAssignee = String(assigneeId ?? "").trim();

    try {

      const { transferChat } = await import("../../services/chatService");

      const ok = await transferChat(chatId, normalizedAssignee);

      if (ok) {

        setShowTransferModal(false);

        const assigneeLabel = assigneeOptions.find(
          (option) => option.value === normalizedAssignee
        )?.label;

        setChatMeta((prev) => {
          if (!prev) return prev;
          return enrichChatFranchiseFromCache(
            chatWithAssignee(prev, normalizedAssignee, assigneeLabel)
          );
        });

        const res = await fetchChatById(chatId, { skipLoader: true });

        if (res.chat) {
          setChatMeta((prev) => {
            const fetched = enrichChatFranchiseFromCache(res.chat!);
            const fetchedAssignee = String(fetched.assignedTo ?? "").trim();
            if (fetchedAssignee === normalizedAssignee) return fetched;
            return enrichChatFranchiseFromCache(
              chatWithAssignee(
                fetched,
                normalizedAssignee,
                assigneeLabel ?? prev?.assignedToUser?.name
              )
            );
          });
        }

        void refreshInbox({ skipLoader: true, force: true });

      }

    } finally {

      setTransferSubmitting(false);

    }

  };

  const handleCloseChat = async () => {
    if (!canCloseChat || chatStatusPending) return;
    setChatStatusPending(true);
    try {
      const ok = await updateChatStatus(chatId, "closed", { skipLoader: true });
      if (ok) {
        const res = await fetchChatById(chatId, { skipLoader: true });
        if (res.chat) setChatMeta(res.chat);
      } else {
        showErrorAlert("Could not close this chat. Please try again.");
      }
    } finally {
      setChatStatusPending(false);
    }
  };

  const handleOpenChat = async () => {
    if (!canOpenChat || chatStatusPending) return;
    setChatStatusPending(true);
    try {
      const ok = await updateChatStatus(chatId, "open", { skipLoader: true });
      if (ok) {
        const res = await fetchChatById(chatId, { skipLoader: true });
        if (res.chat) setChatMeta(res.chat);
      } else {
        showErrorAlert("Could not reopen this chat. Please try again.");
      }
    } finally {
      setChatStatusPending(false);
    }
  };



  const renderMessageBody = (msg: ChatMessageModel) => {

    const label = chatMessageAttachmentLabel(msg);

    const mediaUrl =
      chatMessageMediaKey(msg) ||
      (isPdfAttachment(msg) ? String(msg.content ?? msg.fileUrl ?? "").trim() : "");

    const hasFile = messageHasAttachment(msg) || Boolean(mediaUrl);

    const isImage = hasFile && isImageAttachment(msg);

    const isPdf = isPdfAttachment(msg);

    const text = String(msg.content ?? "").trim();

    const showText =

      Boolean(text) &&

      text !== "[Attachment]" &&

      (!hasFile || (text !== label && !text.match(/^Image$|^File$/i)));



    return (

      <>

        {hasFile && mediaUrl && isImage && (
          <ChatMessageImage
            fileUrl={mediaUrl}
            fileName={chatMessageImageFileName(msg)}
            alt={label}
            onOpenPreview={() =>
              openGalleryForMessage(String(msg._id || msg.clientMessageId || ""))
            }
          />
        )}

        {hasFile && mediaUrl && !isImage && isPdf && (
          <ChatMessageFile fileUrl={mediaUrl} fileName={label} isPdf />
        )}

        {hasFile && mediaUrl && !isImage && !isPdf && (

          <a

            href={resolveChatMediaUrl(mediaUrl)}

            target="_blank"

            rel="noopener noreferrer"

            className="normal-chat-bubble-file"

          >

            <i className="bi bi-file-earmark-text" />

            <span>{label}</span>

          </a>

        )}

        {showText && <p className="mb-0">{text}</p>}

      </>

    );

  };



  const renderMessage = (msg: ChatMessageModel) => {

    const own = isOwnMessage(msg);

    const isSystem = msg.type === "system" || msg.senderUser?.role === "system";

    const senderName = msg.senderUser?.name || "User";

    const avatarUrl = msg.senderUser?.profile_url;

    const bubbleClass = own

      ? "normal-chat-bubble employee"

      : "normal-chat-bubble user";

    if (isSystem) {
      const displayContent =
        chatKind === "dispute"
          ? formatDisputeOpenedSystemContent(msg.content, orderUniqueId)
          : msg.content;

      return (

        <div key={msg._id || msg.clientMessageId} className="normal-chat-system-row">

          <div className="normal-chat-bubble system">

            <p className="mb-0">{displayContent}</p>

          </div>

        </div>

      );

    }



    return (

      <div

        key={msg._id || msg.clientMessageId}

        className={`normal-chat-bubble-row ${own ? "is-own" : "is-other"}`}

      >

        {!own && (

          <ChatAvatar

            name={senderName}

            imageUrl={avatarUrl}

            size="sm"

            className="normal-chat-bubble-avatar"

          />

        )}

        <div className={`normal-chat-bubble ${bubbleClass}`}>

          {!own && showSenderNames && (

            <div className="normal-chat-bubble-sender">{senderName}</div>

          )}

          {renderMessageBody(msg)}

          <div className="normal-chat-bubble-meta">

            <small>{formatMessageTime(msg.createdAt)}</small>

            {own && <ChatMessageTicks status={messageTickStatus(msg, chatParticipantIds)} />}

            {own && msg.sendStatus === "failed" && (

              <button

                type="button"

                className="btn btn-link btn-sm p-0 normal-chat-retry-btn"

                onClick={() =>

                  void retryMessage(

                    msg.clientMessageId || msg.metadata?.clientMessageId || ""

                  )

                }

              >

                Retry

              </button>

            )}

          </div>

        </div>

      </div>

    );

  };



  return (

    <div className="main-page-content">

      <div className="d-flex justify-content-between align-items-center mb-3">

        <div className="d-flex align-items-center gap-2">

          <button

            type="button"

            className="financial-subpage-back text-danger"

            onClick={() => navigate(backPath)}

            aria-label="Back"

          >

            <i className="bi bi-chevron-left" />

          </button>

          <h4 className="m-0 p-0">{title}</h4>

        </div>

        {!socketConnected && (

          <small className="text-warning">

            {socketError ? `Chat offline: ${socketError}` : "Connecting to chat…"}

          </small>

        )}

        {socketConnected && <small className="text-success">Live</small>}

      </div>



      <div className="row g-3 normal-chat-conversation-layout">

        <div className="col-lg-8">

          <div className="border rounded-3 bg-white normal-chat-conversation-card">

            <div className="d-flex align-items-center justify-content-between p-3 border-bottom">

              <div className="d-flex align-items-center gap-2 min-w-0">

                <ChatAvatar

                  name={headerTitle}

                  imageUrl={isGroup ? undefined : customerUser?.profile_url}

                  className="flex-shrink-0"

                />

                <div className="min-w-0">

                  <h6 className="normal-chat-user-name mb-0 text-truncate">{headerTitle}</h6>

                  <small className="normal-chat-time text-truncate d-block">{headerSubtitle}</small>

                </div>

              </div>

              {canCloseChat ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary normal-chat-close-btn flex-shrink-0"
                  disabled={chatStatusPending}
                  onClick={() => void handleCloseChat()}
                >
                  {chatStatusPending ? "Closing…" : "Close chat"}
                </button>
              ) : canOpenChat ? (
                <button
                  type="button"
                  className="btn btn-sm btn-danger normal-chat-open-btn flex-shrink-0"
                  disabled={chatStatusPending}
                  onClick={() => void handleOpenChat()}
                >
                  {chatStatusPending ? "Opening…" : "Open chat"}
                </button>
              ) : null}

            </div>

            <div ref={messageAreaRef} className="normal-chat-message-area">
              {hasMore && (
                <div className="text-center mb-2">
                  <button
                    type="button"
                    className="btn btn-link btn-sm"
                    disabled={loadingMore}
                    onClick={() => void loadOlder()}
                  >
                    {loadingMore ? "Loading…" : "Load older messages"}
                  </button>
                </div>
              )}
              {loading && messages.length === 0 ? (
                <div className="text-center text-muted py-4">Loading messages…</div>
              ) : loadError && messages.length === 0 ? (
                <div className="text-center text-danger py-4">{loadError}</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-muted py-4">No messages yet.</div>

              ) : (
                messages.map((msg, index) => {
                  const dateLabel = chatDateDividerLabel(msg.createdAt);
                  const prevLabel =
                    index > 0
                      ? chatDateDividerLabel(messages[index - 1]?.createdAt)
                      : null;
                  const showDateDivider = Boolean(dateLabel && dateLabel !== prevLabel);

                  return (
                    <React.Fragment key={msg._id || msg.clientMessageId || `msg-${index}`}>
                      {showDateDivider && dateLabel && (
                        <ChatDateDivider label={dateLabel} />
                      )}
                      {renderMessage(msg)}
                    </React.Fragment>
                  );
                })
              )}

              {typingLabel && (

                <ChatTypingIndicator

                  label={

                    typingLabel === "typing"

                      ? "typing"

                      : `${typingLabel} is typing`

                  }

                />

              )}

            </div>



            {pendingFiles.length > 0 && (

              <div className="px-3 pt-2 border-top">

                <div className="d-flex flex-wrap gap-2">

                  {pendingFiles.map((item) => (

                    <div key={item.id} className="normal-chat-selected-file">

                      {item.previewUrl ? (

                        <img

                          src={item.previewUrl}

                          alt={item.file.name}

                          className="normal-chat-selected-file-thumb"

                        />

                      ) : (

                        <i className="bi bi-file-earmark-text" />

                      )}

                      <span className="text-truncate">{item.file.name}</span>

                      <button

                        type="button"

                        className="btn btn-sm p-0 border-0 bg-transparent"

                        onClick={() => removePendingFile(item.id)}

                        aria-label="Remove attachment"

                      >

                        <i className="bi bi-x-circle-fill" />

                      </button>

                    </div>

                  ))}

                </div>

              </div>

            )}

            <div className="normal-chat-composer border-top">
              <input
                ref={fileInputRef}
                type="file"
                className="d-none"
                accept={ACCEPTED_CHAT_FILES}
                multiple
                disabled={composerDisabled || uploadingAttachment}
                onChange={onAttachmentChange}
              />
              <div className="normal-chat-composer-field">
                <button
                  type="button"
                  className="btn btn-link normal-chat-attach-btn p-0 pb-1"
                  onClick={openAttachmentPicker}
                  disabled={composerDisabled || uploadingAttachment}
                  aria-label="Attach image or document"
                >
                  <i className="bi bi-paperclip" />
                </button>

                <textarea
                  ref={composerRef}
                  className="normal-chat-composer-input"
                  rows={1}
                  placeholder={composerPlaceholder}
                  value={messageDraft}
                  disabled={composerDisabled || uploadingAttachment}
                  onChange={(e) => setMessageDraft(e.target.value)}
                  onInput={adjustComposerHeight}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                />

              </div>

              <button

                type="button"

                className="btn btn-danger normal-chat-send-btn"

                disabled={isSendDisabled}

                onClick={() => void handleSend()}

                aria-label="Send message"

              >

                <i className="bi bi-send-fill" />

              </button>

            </div>

          </div>

        </div>



        <div className="col-lg-4">

          <ChatConversationSidebar

            chatMeta={chatMeta}

            isGroup={isGroup}

            disputeSummary={chatKind === "dispute" ? disputeSummary : undefined}

            showTransfer={showTransfer}

            canTransfer={canTransfer}

            transferHistory={transferHistory}

            attachments={sidebarAttachments}

            customerEmail={customerEmail}

            employeeEmail={employeeEmail}

            onTransferClick={() => setShowTransferModal(true)}

          />

        </div>

      </div>



      <TransferChatModal

        show={showTransferModal}

        onClose={() => setShowTransferModal(false)}

        assigneeOptions={assigneeOptions}

        isSubmitting={transferSubmitting}

        onTransfer={async (values) => {

          await handleTransfer(values.transfer_assignee);

          setShowTransferModal(false);

        }}

      />

      <ChatImageLightbox
        show={galleryOpen}
        images={galleryImages}
        currentIndex={galleryIndex}
        onClose={() => setGalleryOpen(false)}
        onIndexChange={setGalleryIndex}
      />

    </div>

  );

};



export default ChatConversationCore;

