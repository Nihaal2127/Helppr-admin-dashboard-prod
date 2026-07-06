export const ChatApiPaths = {
  CHAT_INBOX: () => "/api/chat",
  CHAT_BY_ID: (id: string) => `/api/chat/${id}`,
  CHAT_BY_ORDER: (orderId: string) => `/api/chat/by-order/${orderId}`,
  CHAT_SUPPORT: () => "/api/chat/support",
  CHAT_STATUS: (id: string) => `/api/chat/${id}/status`,
  CHAT_TRANSFER: (id: string) => `/api/chat/${id}/transfer`,
  CHAT_MEMBERS: (id: string) => `/api/chat/${id}/members`,
  CHAT_MESSAGES: () => "/api/chat/messages",
  CHAT_MESSAGE_BY_ID: (messageId: string) => `/api/chat/messages/${messageId}`,
  CHAT_MESSAGE_DELIVERED: (messageId: string) =>
    `/api/chat/messages/${messageId}/delivered`,
  CHAT_PRESENCE_USER: (userId: string) => `/api/chat/presence/${userId}`,
  CHAT_PRESENCE: (chatId: string) => `/api/chat/${chatId}/presence`,
};
