import { formatCurrency, paymentMethodLabel } from "../global/paymentAndCurrency";
import { formatDate } from "../../helper/dateFormat";
import { ExpenseModel } from "../models/ExpenseModel";

const HEADERS = [
  "SR No",
  "Expense ID",
  "Category",
  "Sub Category",
  "Expense Name",
  "Description / Notes",
  "Expense Amount",
  "Expense Date",
  "Payment done by",
  "Payment mode",
] as const;

function csvEscape(cell: any): string {
  const s = cell === undefined || cell === null ? "" : String(cell);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function money(v: number | string | null | undefined): string {
  if (v === undefined || v === null || v === "") return "-";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "-";
  return formatCurrency(n);
}

function getExpenseId(row: ExpenseModel): string {
  return (row._id ?? row.id ?? (row as any).expense_id ?? "-") as string;
}

function getField(row: ExpenseModel, ...keys: string[]): any {
  for (const k of keys) {
    const v = (row as any)?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
}

function getPaymentModeLabel(row: ExpenseModel): string {
  const label = paymentMethodLabel(
    getField(row, "payment_mode", "paymentMode") ||
      row.payment_mode_id ||
      row.paymentModeId
  );
  return label === "—" ? "-" : label || "-";
}

function getPaymentDoneByLabel(row: ExpenseModel): string {
  return (
    getField(row, "payment_done_by_name", "created_by_name") ||
    getField(row, "payment_done_by", "created_by") ||
    "-"
  );
}

export function expensesModelToExportRow(
  row: ExpenseModel,
  index0: number
): string[] {
  const category = getField(row, "category_name", "categoryName") || "-";
  const subCategory =
    getField(row, "sub_category_name", "subCategoryName") || "-";
  const expenseName = getField(row, "expense_name", "expenseName") || "-";
  const description =
    getField(row, "description", "expense_description", "expenseDescription") ||
    "-";

  const expenseAmount = row.expense_amount ?? row.expenseAmount;
  const expenseDate = getField(row, "expense_date", "expenseDate");

  return [
    String(index0 + 1),
    getExpenseId(row),
    category,
    subCategory,
    expenseName,
    description,
    money(expenseAmount),
    formatDate(expenseDate || ""),
    getPaymentDoneByLabel(row),
    getPaymentModeLabel(row),
  ];
}

export function buildExpensesCsv(rows: ExpenseModel[]): string {
  const lines = [
    HEADERS.join(","),
    ...rows.map((r, i) =>
      expensesModelToExportRow(r, i).map(csvEscape).join(",")
    ),
  ];

  // BOM helps Excel auto-detect UTF-8.
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadExpensesCsv(
  filename: string,
  csvContent: string
): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
