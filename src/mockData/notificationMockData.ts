import type { NotificationModel } from "../lib/models/NotificationModel";

export const notificationsMockSeed: Array<
  Omit<NotificationModel, "id" | "createdAt">
> = [
  {
    title: "New Order Created",
    message: "A new order was created and is waiting for assignments.",
    module: "order",
    eventType: "order.new",
    status: "unread",
    audience: "admin",
  },
  {
    title: "Partner Accepted Quote",
    message: "Quote #QT-1002 has been accepted by a partner.",
    module: "quote",
    eventType: "quote.accepted",
    status: "unread",
    audience: "admin",
  },
  {
    title: "Payment Received",
    message: "Order #ORD-443 payment has been received successfully.",
    module: "payment",
    eventType: "payment.received",
    status: "read",
    audience: "admin",
  },
  {
    title: "New Message Received",
    message: "You received a new chat message from partner.",
    module: "chat",
    eventType: "chat.message",
    status: "unread",
    audience: "admin",
  },
];
