export type QuoteChatConversation = {
  id: string;
  userId: string;
  userName: string;
  avatarColor: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  online?: boolean;
};

export type QuoteChatTransferEntry = {
  employeeName: string;
  date: string;
  note?: string;
};

export type QuoteChatDetails = {
  chatId: string;
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
  attachments: { id: string; fileName: string; imageUrl: string }[];
  messages: {
    id: string;
    sender: "user" | "employee";
    text: string;
    sentAt: string;
  }[];
  transferHistory: QuoteChatTransferEntry[];
  currentEmployeeName: string;
};

export const quoteChatConversations: QuoteChatConversation[] = [
  {
    id: "quote-1",
    userId: "USR-3001",
    userName: "Aarav Shah",
    avatarColor: "#7f1d1d",
    lastMessage: "Can you share the updated quote for next week?",
    lastMessageAt: "10:05 AM",
    unreadCount: 2,
    online: true,
  },
  {
    id: "quote-2",
    userId: "USR-3002",
    userName: "Priya Joshi",
    avatarColor: "#991b1b",
    lastMessage: "Looks good. Please confirm delivery timeline.",
    lastMessageAt: "09:42 AM",
    unreadCount: 0,
    online: false,
  },
  {
    id: "quote-3",
    userId: "USR-3003",
    userName: "Karan Mehta",
    avatarColor: "#b91c1c",
    lastMessage: "I need a minor revision in service pricing.",
    lastMessageAt: "Yesterday",
    unreadCount: 1,
    online: true,
  },
];

export const quoteChatDetails: Record<string, QuoteChatDetails> = {
  "quote-1": {
    chatId: "quote-1",
    user: {
      id: "USR-3001",
      name: "Aarav Shah",
      phone: "+91 98765 30001",
      email: "aarav.quote@example.com",
    },
    employee: {
      id: "EMP-2008",
      name: "Ritika Sharma",
      phone: "+91 98989 22008",
      email: "ritika.quote@example.com",
    },
    attachments: [
      {
        id: "qa1",
        fileName: "quote-summary.png",
        imageUrl: "https://picsum.photos/seed/quote-1/320/220",
      },
    ],
    messages: [
      {
        id: "qm1",
        sender: "user",
        text: "Hi, I want to confirm the quote for next week services.",
        sentAt: "10:02 AM",
      },
      {
        id: "qm2",
        sender: "employee",
        text: "Sure. I’ll share the revised quote shortly.",
        sentAt: "10:03 AM",
      },
      {
        id: "qm3",
        sender: "user",
        text: "Can you share the updated quote for next week?",
        sentAt: "10:05 AM",
      },
    ],
    transferHistory: [
      { employeeName: "Employee 1", date: "9 Mar 2026", note: "dfgdfg" },
      { employeeName: "Employee 2", date: "10 Mar 2026", note: "dgfdfg" },
    ],
    currentEmployeeName: "Ritika Sharma",
  },
  "quote-2": {
    chatId: "quote-2",
    user: {
      id: "USR-3002",
      name: "Priya Joshi",
      phone: "+91 98765 30002",
      email: "priya.quote@example.com",
    },
    employee: {
      id: "EMP-2012",
      name: "Ankit Verma",
      phone: "+91 98989 22012",
      email: "ankit.quote@example.com",
    },
    attachments: [],
    messages: [
      {
        id: "qm1",
        sender: "user",
        text: "Looks good. Please confirm delivery timeline.",
        sentAt: "09:42 AM",
      },
    ],
    transferHistory: [
      { employeeName: "Employee 1", date: "6 Mar 2026", note: "Quote review" },
    ],
    currentEmployeeName: "Ankit Verma",
  },
  "quote-3": {
    chatId: "quote-3",
    user: {
      id: "USR-3003",
      name: "Karan Mehta",
      phone: "+91 98765 30003",
      email: "karan.quote@example.com",
    },
    employee: {
      id: "EMP-2004",
      name: "Sameer Khan",
      phone: "+91 98989 22004",
      email: "sameer.quote@example.com",
    },
    attachments: [
      {
        id: "qa1",
        fileName: "pricing-breakup.jpg",
        imageUrl: "https://picsum.photos/seed/quote-3/320/220",
      },
    ],
    messages: [
      {
        id: "qm1",
        sender: "user",
        text: "I need a minor revision in service pricing.",
        sentAt: "Yesterday",
      },
      {
        id: "qm2",
        sender: "employee",
        text: "Got it. I’ll update and send the revised pricing.",
        sentAt: "Yesterday",
      },
    ],
    transferHistory: [
      { employeeName: "Employee 1", date: "4 Mar 2026", note: "Handoff" },
      { employeeName: "Employee 2", date: "5 Mar 2026", note: "Pricing check" },
    ],
    currentEmployeeName: "Sameer Khan",
  },
};

export type GroupChatConversation = {
  id: string;
  groupId: string;
  groupName: string;
  avatarColor: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  online?: boolean;
};

export type GroupParticipant = {
  id: string;
  name: string;
  phone: string;
  email: string;
};

export type GroupChatDetails = {
  chatId: string;
  participants: {
    admin: GroupParticipant;
    employee: GroupParticipant;
    partner: GroupParticipant;
    user: GroupParticipant;
  };
  messages: {
    id: string;
    sender: "admin" | "employee" | "partner" | "user";
    text: string;
    sentAt: string;
  }[];
  attachments: { id: string; fileName: string; imageUrl: string }[];
  transferHistory: QuoteChatTransferEntry[];
  currentEmployeeName: string;
};

export const groupChatConversations: GroupChatConversation[] = [
  {
    id: "group-1",
    groupId: "GRP-9001",
    groupName: "Quote Team - HQ",
    avatarColor: "#991b1b",
    lastMessage: "All set. We’ll share the final package soon.",
    lastMessageAt: "Today",
    unreadCount: 1,
    online: false,
  },
];

export const groupChatDetails: Record<string, GroupChatDetails> = {
  "group-1": {
    chatId: "group-1",
    participants: {
      admin: {
        id: "ADM-0101",
        name: "Rohit Admin",
        phone: "-",
        email: "admin@demo.com",
      },
      employee: {
        id: "EMP-2008",
        name: "Ritika Sharma",
        phone: "+91 98989 22008",
        email: "ritika@demo.com",
      },
      partner: {
        id: "PAR-0301",
        name: "GreenStone Partner",
        phone: "-",
        email: "partner@demo.com",
      },
      user: {
        id: "USR-3001",
        name: "Aarav Shah",
        phone: "+91 98765 30001",
        email: "aarav@demo.com",
      },
    },
    messages: [
      {
        id: "g1m1",
        sender: "user",
        text: "Please align pricing and delivery timeline for next week.",
        sentAt: "10:02 AM",
      },
      {
        id: "g1m2",
        sender: "admin",
        text: "Noted. Admin team will coordinate internally.",
        sentAt: "10:03 AM",
      },
      {
        id: "g1m3",
        sender: "employee",
        text: "We’re updating the quote and will confirm shortly.",
        sentAt: "10:06 AM",
      },
      {
        id: "g1m4",
        sender: "partner",
        text: "Partner confirmed availability. Proceeding as planned.",
        sentAt: "10:09 AM",
      },
      {
        id: "g1m5",
        sender: "admin",
        text: "All set. We’ll share the final package soon.",
        sentAt: "10:12 AM",
      },
    ],
    attachments: [
      {
        id: "ga1",
        fileName: "quote-pack.png",
        imageUrl: "https://picsum.photos/seed/group-chat-1/320/220",
      },
      {
        id: "ga2",
        fileName: "timeline.jpg",
        imageUrl: "https://picsum.photos/seed/group-chat-2/320/220",
      },
    ],
    transferHistory: [
      { employeeName: "Employee 1", date: "7 Mar 2026", note: "dfgdfg" },
      { employeeName: "Employee 2", date: "9 Mar 2026", note: "dgfdfg" },
    ],
    currentEmployeeName: "Ritika Sharma",
  },
};
