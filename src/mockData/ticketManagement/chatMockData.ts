export type ChatThreadKind = "general" | "order";

export type NormalChatConversation = {
  id: string;
  userId: string;
  userName: string;
  avatarColor: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  online?: boolean;
  threadKind: ChatThreadKind;
};

export type NormalChatTransferEntry = {
  employeeName: string;
  date: string;
  note?: string;
};

export type NormalChatMessageSender = "user" | "employee" | "admin" | "partner";

export type NormalChatMessage = {
  id: string;
  sender: NormalChatMessageSender;
  text: string;
  sentAt: string;
};

export type NormalChatParticipants = {
  admin: { id: string; name: string; phone: string; email: string };
  employee: { id: string; name: string; phone: string; email: string };
  partner: { id: string; name: string; phone: string; email: string };
  user: { id: string; name: string; phone: string; email: string };
};

export type NormalChatDetails = {
  chatId: string;
  threadKind: ChatThreadKind;
  user: {
    id: string;
    name: string;
    phone: string;
    email: string;
  };
  employee: {
    id: string;
    name: string;
    phone: string;
    email: string;
  };
  participants?: NormalChatParticipants;
  attachments: { id: string; fileName: string; imageUrl: string }[];
  messages: NormalChatMessage[];
  transferHistory: NormalChatTransferEntry[];
  currentEmployeeName: string;
};

export const normalChatConversations: NormalChatConversation[] = [
  {
    id: "chat-1",
    userId: "USR-1001",
    userName: "Aarav Shah",
    avatarColor: "#7f1d1d",
    lastMessage: "Thanks for helping with my account question.",
    lastMessageAt: "10:05 AM",
    unreadCount: 2,
    online: true,
    threadKind: "general",
  },
  {
    id: "chat-2",
    userId: "USR-1002",
    userName: "Priya Joshi",
    avatarColor: "#991b1b",
    lastMessage: "Can you confirm if my payment is received?",
    lastMessageAt: "09:42 AM",
    unreadCount: 0,
    online: false,
    threadKind: "general",
  },
  {
    id: "chat-3",
    userId: "USR-1003",
    userName: "Karan Mehta",
    avatarColor: "#b91c1c",
    lastMessage: "Please update service partner for this booking.",
    lastMessageAt: "Yesterday",
    unreadCount: 1,
    online: true,
    threadKind: "general",
  },
  {
    id: "chat-4",
    userId: "ORD-88204",
    userName: "Nisha Patel",
    avatarColor: "#dc2626",
    lastMessage: "Thanks, issue resolved.",
    lastMessageAt: "Yesterday",
    unreadCount: 0,
    online: false,
    threadKind: "order",
  },
  {
    id: "chat-5",
    userId: "USR-1005",
    userName: "Rahul Verma",
    avatarColor: "#ef4444",
    lastMessage: "I have shared screenshots in chat.",
    lastMessageAt: "Mon",
    unreadCount: 3,
    online: false,
    threadKind: "general",
  },
];

const defaultTransfers = (current: string): NormalChatTransferEntry[] => [
  {
    employeeName: "Employee 1",
    date: "8 Mar 2026",
    note: "Initial assignment",
  },
  { employeeName: "Employee 2", date: "11 Mar 2026", note: "Follow-up" },
];

export const normalChatDetails: Record<string, NormalChatDetails> = {
  "chat-1": {
    chatId: "chat-1",
    threadKind: "general",
    user: {
      id: "USR-1001",
      name: "Aarav Shah",
      phone: "+91 98765 10001",
      email: "aarav.shah@example.com",
    },
    employee: {
      id: "EMP-2008",
      name: "Ritika Sharma",
      phone: "+91 98989 22008",
      email: "ritika.sharma@example.com",
    },
    attachments: [
      {
        id: "a1",
        fileName: "order-screen.png",
        imageUrl: "https://picsum.photos/seed/normal-chat-1/320/220",
      },
      {
        id: "a2",
        fileName: "invoice-apr.png",
        imageUrl: "https://picsum.photos/seed/normal-chat-2/320/220",
      },
    ],
    messages: [
      {
        id: "m1",
        sender: "user",
        text: "Hi team, I have a question about my account settings.",
        sentAt: "10:02 AM",
      },
      {
        id: "m2",
        sender: "employee",
        text: "Hi Aarav, happy to help. What would you like to change?",
        sentAt: "10:03 AM",
      },
      {
        id: "m3",
        sender: "user",
        text: "Thanks for helping with my account question.",
        sentAt: "10:05 AM",
      },
      {
        id: "m4",
        sender: "employee",
        text: "Anytime — let us know if you need anything else.",
        sentAt: "10:09 AM",
      },
    ],
    transferHistory: defaultTransfers("Ritika Sharma"),
    currentEmployeeName: "Ritika Sharma",
  },
  "chat-2": {
    chatId: "chat-2",
    threadKind: "general",
    user: {
      id: "USR-1002",
      name: "Priya Joshi",
      phone: "+91 98765 10002",
      email: "priya.joshi@example.com",
    },
    employee: {
      id: "EMP-2012",
      name: "Ankit Verma",
      phone: "+91 98989 22012",
      email: "ankit.verma@example.com",
    },
    attachments: [
      {
        id: "a1",
        fileName: "payment-proof.jpg",
        imageUrl: "https://picsum.photos/seed/normal-chat-3/320/220",
      },
      {
        id: "a2",
        fileName: "receipt-photo.jpg",
        imageUrl: "https://picsum.photos/seed/normal-chat-4/320/220",
      },
    ],
    messages: [
      {
        id: "m1",
        sender: "user",
        text: "Can you confirm if my payment is received?",
        sentAt: "09:42 AM",
      },
      {
        id: "m2",
        sender: "employee",
        text: "Checking now. Please hold for a minute.",
        sentAt: "09:43 AM",
      },
    ],
    transferHistory: [
      { employeeName: "Employee 1", date: "5 Mar 2026", note: "dfgdfg" },
      { employeeName: "Employee 2", date: "7 Mar 2026", note: "dgfdfg" },
    ],
    currentEmployeeName: "Ankit Verma",
  },
  "chat-3": {
    chatId: "chat-3",
    threadKind: "general",
    user: {
      id: "USR-1003",
      name: "Karan Mehta",
      phone: "+91 98765 10003",
      email: "karan.mehta@example.com",
    },
    employee: {
      id: "EMP-2015",
      name: "Sneha Kulkarni",
      phone: "+91 98989 22015",
      email: "sneha.kulkarni@example.com",
    },
    attachments: [
      {
        id: "a1",
        fileName: "booking-note.png",
        imageUrl: "https://picsum.photos/seed/normal-chat-5/320/220",
      },
    ],
    messages: [
      {
        id: "m1",
        sender: "user",
        text: "Please update service partner for this booking.",
        sentAt: "Yesterday 4:10 PM",
      },
      {
        id: "m2",
        sender: "employee",
        text: "Noted. We will reassign and notify you.",
        sentAt: "Yesterday 4:22 PM",
      },
    ],
    transferHistory: defaultTransfers("Sneha Kulkarni"),
    currentEmployeeName: "Sneha Kulkarni",
  },
  "chat-4": {
    chatId: "chat-4",
    threadKind: "order",
    user: {
      id: "USR-1004",
      name: "Nisha Patel",
      phone: "+91 98765 10004",
      email: "nisha.patel@example.com",
    },
    employee: {
      id: "EMP-2008",
      name: "Ritika Sharma",
      phone: "+91 98989 22008",
      email: "ritika.sharma@example.com",
    },
    participants: {
      admin: {
        id: "ADM-0101",
        name: "Rohit Mehta",
        phone: "+91 90000 10101",
        email: "rohit.admin@example.com",
      },
      employee: {
        id: "EMP-2008",
        name: "Ritika Sharma",
        phone: "+91 98989 22008",
        email: "ritika.sharma@example.com",
      },
      partner: {
        id: "PAR-0402",
        name: "QuickServe Partner",
        phone: "+91 90000 40402",
        email: "ops@quickserve.example.com",
      },
      user: {
        id: "USR-1004",
        name: "Nisha Patel",
        phone: "+91 98765 10004",
        email: "nisha.patel@example.com",
      },
    },
    attachments: [
      {
        id: "o1",
        fileName: "order-summary.png",
        imageUrl: "https://picsum.photos/seed/order-chat-1/320/220",
      },
      {
        id: "o2",
        fileName: "delivery-proof.jpg",
        imageUrl: "https://picsum.photos/seed/order-chat-2/320/220",
      },
    ],
    messages: [
      {
        id: "o1",
        sender: "user",
        text: "Order ORD-88204 — slot was missed yesterday.",
        sentAt: "Yesterday 9:00 AM",
      },
      {
        id: "o2",
        sender: "admin",
        text: "Admin coordinating with partner for reschedule.",
        sentAt: "Yesterday 9:15 AM",
      },
      {
        id: "o3",
        sender: "partner",
        text: "Partner assigned a new slot today 2–4 PM.",
        sentAt: "Yesterday 10:02 AM",
      },
      {
        id: "o4",
        sender: "employee",
        text: "We’ve updated your booking. Please confirm.",
        sentAt: "Yesterday 10:30 AM",
      },
      {
        id: "o5",
        sender: "user",
        text: "Thanks, issue resolved.",
        sentAt: "Yesterday 11:00 AM",
      },
    ],
    transferHistory: [
      { employeeName: "Employee 1", date: "6 Mar 2026", note: "dfgdfg" },
      { employeeName: "Employee 2", date: "8 Mar 2026", note: "dgfdfg" },
    ],
    currentEmployeeName: "Ritika Sharma",
  },
  "chat-5": {
    chatId: "chat-5",
    threadKind: "general",
    user: {
      id: "USR-1005",
      name: "Rahul Verma",
      phone: "+91 98765 10005",
      email: "rahul.verma@example.com",
    },
    employee: {
      id: "EMP-2020",
      name: "Vikram Singh",
      phone: "+91 98989 22020",
      email: "vikram.singh@example.com",
    },
    attachments: [
      {
        id: "a1",
        fileName: "screenshot-1.png",
        imageUrl: "https://picsum.photos/seed/normal-chat-6/320/220",
      },
    ],
    messages: [
      {
        id: "m1",
        sender: "user",
        text: "I have shared screenshots in chat.",
        sentAt: "Mon 3:12 PM",
      },
      {
        id: "m2",
        sender: "employee",
        text: "Received. Reviewing and will reply shortly.",
        sentAt: "Mon 3:20 PM",
      },
    ],
    transferHistory: defaultTransfers("Vikram Singh"),
    currentEmployeeName: "Vikram Singh",
  },
};
