import { BankAccountModel } from "../models/BankAccountModel";
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

/** Map API `documents[].name` to UI label (e.g. police verification → Others). */
export function partnerDocumentDisplayTitle(
  name: string | null | undefined
): string {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "";
  const n = trimmed.toLowerCase();
  if (
    (n.includes("police") && n.includes("verification")) ||
    n.includes("police_verification_certificate")
  ) {
    return "Others";
  }
   if(n.includes("aadhar") && n.includes("card") || n.includes("aadhar_card")){
    return "Aadhar Card";
   }
   if(n.includes("pan") && n.includes("card") || n.includes("pan_card")){
    return "PAN Card";
   }
   if(n.includes("driving") && n.includes("license") || n.includes("driving_license")){
    return "Driving License";
   }
   if(n.includes("vehicle") && n.includes("registration") || n.includes("vehicle_registration")){
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
