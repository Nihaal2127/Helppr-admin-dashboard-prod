import { BankAccountModel } from "../models/BankAccountModel";
import { DocumentModel } from "../models/DocumentModel";
import { UserModel } from "../models/UserModel";

/** Form keys in Add Partner UI → multipart field names on `POST /user/create`. */
export const PARTNER_CREATE_DOCUMENT_FIELDS = {
  vehicle_registration: "vehicle_registration",
  police_verification: "police_verification_certificate",
  pan_card: "pan_card",
  driving_license: "driving_license",
  aadhar_card: "aadhar_card",
} as const;

export type PartnerCreateDocumentKey = keyof typeof PARTNER_CREATE_DOCUMENT_FIELDS;

export const PARTNER_CREATE_DOCUMENT_SLOTS: {
  key: PartnerCreateDocumentKey;
  title: string;
}[] = [
  { key: "pan_card", title: "PAN Card" },
  { key: "aadhar_card", title: "Aadhar Card" },
  { key: "driving_license", title: "Driving License" },
  { key: "vehicle_registration", title: "Vehicle Registration" },
  {
    key: "police_verification",
    title: "Others",
  },
];

export type PartnerVerificationDocSlot = {
  id: PartnerCreateDocumentKey;
  title: string;
  match: (normalizedName: string) => boolean;
};

/** Fixed rows; matched to `documents[].name` from the API (case-insensitive). */
export const PARTNER_VERIFICATION_DOCUMENT_SLOTS: PartnerVerificationDocSlot[] =
  [
    {
      id: "vehicle_registration",
      title: "Vehicle Registration",
      match: (n) =>
        (n.includes("vehicle") && n.includes("registration")) ||
        n.includes("vehicle_registration"),
    },
    {
      id: "police_verification",
      title: "Others",
      match: (n) => isPartnerOthersDocumentName(n),
    },
    {
      id: "pan_card",
      title: "PAN Card",
      match: (n) =>
        (n.includes("pan") && n.includes("card")) || n.includes("pan_card"),
    },
    {
      id: "driving_license",
      title: "Driving License",
      match: (n) =>
        (n.includes("driving") && n.includes("license")) ||
        n.includes("driving_license"),
    },
    {
      id: "aadhar_card",
      title: "Aadhar Card",
      match: (n) =>
        n.includes("aadhar") ||
        n.includes("aadhaar") ||
        n.includes("aadhar_card"),
    },
  ];

export function normalizePartnerDocumentName(
  name: string | null | undefined
): string {
  return String(name ?? "")
    .trim()
    .toLowerCase();
}

/** Mobile/API may send `others`; legacy web uses police verification naming. */
export function isPartnerOthersDocumentName(
  name: string | null | undefined
): boolean {
  const n = normalizePartnerDocumentName(name);
  if (!n) return false;
  return (
    n === "others" ||
    n === "other" ||
    (n.includes("police") && n.includes("verification")) ||
    n.includes("police_verification_certificate")
  );
}

export function partnerDocumentHasUploadedImage(
  doc: { document_image?: string | null } | null | undefined
): boolean {
  return Boolean(String(doc?.document_image ?? "").trim());
}

export function findPartnerDocumentForSlot(
  documents: DocumentModel[] | undefined,
  slot: PartnerVerificationDocSlot
): DocumentModel | undefined {
  if (!documents?.length) return undefined;
  return documents.find((d) => {
    const n = normalizePartnerDocumentName(d.name);
    return Boolean(n) && slot.match(n);
  });
}

/** Map API `documents[].name` to UI label (e.g. police verification → Others). */
export function partnerDocumentDisplayTitle(
  name: string | null | undefined
): string {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "";
  if (isPartnerOthersDocumentName(trimmed)) {
    return "Others";
  }
  const n = trimmed.toLowerCase();
  if (
    (n.includes("aadhar") && n.includes("card")) ||
    n.includes("aadhar_card")
  ) {
    return "Aadhar Card";
  }
  if ((n.includes("pan") && n.includes("card")) || n.includes("pan_card")) {
    return "PAN Card";
  }
  if (
    (n.includes("driving") && n.includes("license")) ||
    n.includes("driving_license")
  ) {
    return "Driving License";
  }
  if (
    (n.includes("vehicle") && n.includes("registration")) ||
    n.includes("vehicle_registration")
  ) {
    return "Vehicle Registration";
  }
  return trimmed;
}

export function partnerBankAccountsFromUser(
  user: UserModel | undefined
): BankAccountModel[] {
  if (!user) return [];
  const multi = user.bank_accounts;
  if (Array.isArray(multi) && multi.length > 0) {
    return sortPartnerBankAccountsActiveFirst(
      multi.filter(
        (a) =>
          a &&
          (String(a._id ?? "").trim() ||
            String(a.account_number ?? "").trim() ||
            String(a.ifsc_code ?? "").trim())
      )
    );
  }
  const single = user.bank_account;
  if (
    single &&
    (String(single._id ?? "").trim() ||
      String(single.account_number ?? "").trim() ||
      String(single.ifsc_code ?? "").trim())
  ) {
    return sortPartnerBankAccountsActiveFirst([single]);
  }
  return [];
}

/** Active accounts first; only one should be active in normal partner flows. */
export function sortPartnerBankAccountsActiveFirst(
  accounts: BankAccountModel[]
): BankAccountModel[] {
  return [...accounts].sort((a, b) => {
    const aScore = a.is_active !== false ? 1 : 0;
    const bScore = b.is_active !== false ? 1 : 0;
    return bScore - aScore;
  });
}
