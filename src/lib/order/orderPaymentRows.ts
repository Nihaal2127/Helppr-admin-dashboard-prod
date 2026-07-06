export type OtherChargeRow = {
  id: string;
  amount: number;
  description: string;
  /** Extra service / line item label for this charge */
  serviceName?: string;
};

export type CustomerPaymentRow = {
  id: string;
  date: string;
  amount: number;
  type: string;
  description: string;
  /** In-progress paid amount text (create/edit UI only). */
  amountInput?: string;
};

export type PartnerPaymentRow = {
  id: string;
  date: string;
  amount: number;
  description: string;
  /** In-progress paid amount text (create/edit UI only). */
  amountInput?: string;
};
