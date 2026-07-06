export interface ExpenseModel {
  _id?: string;
  id?: string;

  /** Franchise scope (list/detail responses; required for get/delete by id on the API). */
  franchise_id?: string;
  franchiseId?: string;
  franchise_name?: string;
  franchiseName?: string;

  category_name?: string;
  categoryName?: string;

  sub_category_name?: string;
  subCategoryName?: string;

  expense_name?: string;
  expenseName?: string;

  description?: string;
  expense_description?: string;

  expense_amount?: number;
  expenseAmount?: number;

  expense_date?: string;
  expenseDate?: string;

  payment_mode_id?: number | string;
  paymentModeId?: number | string;
  payment_mode?: string;
  paymentMode?: string;

  // Backend may return one or both of these.
  payment_done_by_name?: string;
  created_by_name?: string;
  payment_done_by?: string;
  created_by?: string;

  // Optional fields if backend returns them.
  created_by_id?: string;
  createdById?: string;
}
