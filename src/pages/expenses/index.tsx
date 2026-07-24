import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal } from "react-bootstrap";
import { useForm } from "react-hook-form";
import CustomHeader from "../../components/CustomHeader";
import CustomSummaryBox from "../../components/CustomSummaryBox";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import CustomTable from "../../components/CustomTable";
import CustomCloseButton from "../../components/CustomCloseButton";
import CustomActionColumn from "../../components/CustomActionColumn";
import CustomFormSelect from "../../components/CustomFormSelect";
import { CustomFormInput } from "../../components/CustomFormInput";
import CustomDatePicker from "../../components/CustomDatePicker";
import { AppConstant, UserRole } from "../../lib/global/AppConstant";
import {
  paymentMethodApiValue,
  paymentMethodFromExpenseModeId,
  paymentMethodLabel,
  paymentMethodSelectOptions,
  normalizePaymentMethod,
} from "../../lib/global/paymentAndCurrency";
import { DetailsRow, capitalizeString, formatDate } from "../../helper/utility";
import { showErrorAlert } from "../../lib/global/alertHelper";
import {
  ensureSettingsSeedData,
  fetchExpenseCategoriesPage,
  getExpenseCategories,
} from "../../services/settingsService";
import {
  createOrUpdateExpense,
  fetchExpenseById,
  fetchExpenses,
  ExpensesFilters,
} from "../../services/expensesService";
import { ExpenseModel } from "../../lib/models/ExpenseModel";
import { ExpenseCategoryModel } from "../../lib/models/SettingsModel";
import { getLocalStorage } from "../../lib/global/localStorageHelper";
import { readHeaderFranchisePreference } from "../../lib/franchise/headerFranchisePreference";
import { fetchFranchiseDropDown } from "../../services/franchiseService";
import type { ServerTableSortBy } from "../../lib/global/serverTableSort";
import { fetchUserById } from "../../services/userService";
import { normalizeCalendarYmd } from "../../helper/dateFormat";

const toDateInputValue = (iso?: string): string => {
  return normalizeCalendarYmd(iso) ?? "";
};

type ExpenseFormState = {
  franchiseId: string;
  categoryId: string;
  subCategoryId: string;
  categoryName: string;
  subCategoryName: string;
  expenseName: string;
  description: string;
  expenseAmount: string;
  expenseDate: string; // YYYY-MM-DD
  /** Payment method slug — see `PAYMENT_METHODS` in `paymentAndCurrency`. */
  paymentModeId: string;
};

type ExpenseFormErrors = {
  franchiseId?: string;
  categoryId?: string;
  subCategoryId?: string;
  expenseName?: string;
  expenseDate?: string;
  paymentModeId?: string;
  expenseAmount?: string;
};

const emptyForm: ExpenseFormState = {
  franchiseId: "",
  categoryId: "",
  subCategoryId: "",
  categoryName: "",
  subCategoryName: "",
  expenseName: "",
  description: "",
  expenseAmount: "",
  expenseDate: "",
  paymentModeId: "cash",
};

const resolveExpenseCategoryFields = (
  expense: ExpenseModel,
  categories: ExpenseCategoryModel[]
): Pick<ExpenseFormState, "categoryId" | "subCategoryId" | "categoryName" | "subCategoryName"> => {
  const raw = expense as Record<string, unknown>;
  let categoryId = String(raw.category_id ?? raw.categoryId ?? "").trim();
  let categoryName = String(raw.category_name ?? raw.categoryName ?? "").trim();
  let subCategoryId = String(raw.subcategory_id ?? raw.subCategoryId ?? "").trim();
  let subCategoryName = String(raw.sub_category_name ?? raw.subCategoryName ?? "").trim();

  const matchedCategory =
    categories.find((c) => {
      const cid = String(c.categoryId ?? c.id ?? "").trim();
      const rowId = String(c.id ?? "").trim();
      return (
        (categoryId && (cid === categoryId || rowId === categoryId)) ||
        (categoryName && c.categoryName === categoryName)
      );
    }) ?? null;

  if (matchedCategory) {
    categoryId = categoryId || String(matchedCategory.categoryId ?? matchedCategory.id ?? "").trim();
    categoryName = categoryName || matchedCategory.categoryName;
    const matchedSub = matchedCategory.subcategories?.find(
      (s) =>
        (subCategoryId && s.subcategoryId === subCategoryId) ||
        (subCategoryName && s.subCategoryName === subCategoryName)
    );
    if (matchedSub) {
      subCategoryId = subCategoryId || String(matchedSub.subcategoryId ?? "").trim();
      subCategoryName = subCategoryName || matchedSub.subCategoryName;
    }
  }

  return { categoryId, subCategoryId, categoryName, subCategoryName };
};

const buildExpenseFormState = (
  expense: ExpenseModel,
  categories: ExpenseCategoryModel[] = []
): ExpenseFormState => {
  const raw = expense as Record<string, unknown>;
  const categoryFields = resolveExpenseCategoryFields(expense, categories);
  const expenseAmountRaw = raw.expense_amount ?? raw.expenseAmount;

  return {
    franchiseId: String(raw.franchise_id ?? raw.franchiseId ?? "").trim(),
    ...categoryFields,
    expenseName: String(raw.expense_name ?? raw.expenseName ?? "").trim(),
    description: String(raw.description ?? raw.expense_description ?? "").trim(),
    expenseAmount:
      expenseAmountRaw !== undefined && expenseAmountRaw !== null
        ? String(expenseAmountRaw)
        : "",
    expenseDate: toDateInputValue(String(raw.expense_date ?? raw.expenseDate ?? "")),
    paymentModeId:
      normalizePaymentMethod(String(raw.payment_mode ?? raw.paymentMode ?? "")) ||
      paymentMethodFromExpenseModeId(
        (raw.payment_mode_id ?? raw.paymentModeId) as string | number | null | undefined
      ) ||
      "cash",
  };
};

const ExpensesPage = () => {
  const { register, setValue } = useForm<any>();
  const currentUserRole = getLocalStorage(AppConstant.userRole);
  const isSuperAdminOrStaff =
    currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.STAFF;
  const isFranchiseScopedUser =
    currentUserRole === UserRole.FRANCHISE_ADMIN || currentUserRole === UserRole.EMPLOYEE;

  const [expenses, setExpenses] = useState<ExpenseModel[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [keyword, setKeyword] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchClearVersion, setSearchClearVersion] = useState(0);
  const [sort, setSort] = useState<"-1" | "1">("-1");
  const [sortBy, setSortBy] = useState<ServerTableSortBy>([]);
  const [filterEpoch, setFilterEpoch] = useState(0);
  // Forces `CustomUtilityBox` remount so its internal search input clears too.
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);

  const [franchiseId, setFranchiseId] = useState(() =>
    readHeaderFranchisePreference()
  );
  /** Same franchise as login `partnerId` (API `franchise_id`); used to scope list + detail/delete calls for franchise admin & employee. */
  const [sessionFranchiseId, setSessionFranchiseId] = useState(() => {
    const role = getLocalStorage(AppConstant.userRole);
    if (role !== UserRole.FRANCHISE_ADMIN && role !== UserRole.EMPLOYEE) return "";
    return String(getLocalStorage(AppConstant.partnerId) ?? "").trim();
  });
  const [franchiseOptions, setFranchiseOptions] = useState<{ value: string; label: string }[]>([
    { value: "", label: "All Franchises" },
  ]);

  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryModel[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseModel | null>(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<ExpenseFormErrors>({});
  const [addFormKey, setAddFormKey] = useState(0);
  const fetchRef = useRef(false);
  const syncExpenseFormControls = useCallback(
    (next: ExpenseFormState) => {
      setValue("expense_modal_franchise", next.franchiseId, { shouldValidate: false });
      setValue("expense_modal_category", next.categoryId, { shouldValidate: false });
      setValue("expense_modal_sub_category", next.subCategoryId, { shouldValidate: false });
      setValue("expense_modal_expense_name", next.expenseName, { shouldValidate: false });
      setValue("expense_modal_description", next.description, { shouldValidate: false });
      setValue("expense_modal_expense_amount", next.expenseAmount, { shouldValidate: false });
      setValue("expense_modal_expense_date", next.expenseDate, { shouldValidate: false });
      setValue("expense_modal_payment_mode", next.paymentModeId, { shouldValidate: false });
    },
    [setValue]
  );

  const applyExpenseToEditForm = useCallback(
    (expense: ExpenseModel, categories: ExpenseCategoryModel[] = expenseCategories) => {
      const nextForm = buildExpenseFormState(expense, categories);
      setForm(nextForm);
      syncExpenseFormControls(nextForm);
      return nextForm;
    },
    [expenseCategories, syncExpenseFormControls]
  );

  const isExpenseEditMode = Boolean(editingExpense) && !isViewMode && showForm;

  const resetAddExpenseFormFields = useCallback(() => {
    setForm({
      ...emptyForm,
      franchiseId: isSuperAdminOrStaff ? "" : sessionFranchiseId,
    });
    setFormErrors({});
    setValue("expense_modal_franchise", isSuperAdminOrStaff ? "" : sessionFranchiseId, {
      shouldValidate: false,
    });
    setValue("expense_modal_category", "", { shouldValidate: false });
    setValue("expense_modal_sub_category", "", { shouldValidate: false });
    setValue("expense_modal_expense_name", "", { shouldValidate: false });
    setValue("expense_modal_description", "", { shouldValidate: false });
    setValue("expense_modal_expense_amount", "", { shouldValidate: false });
    setValue("expense_modal_expense_date", "", { shouldValidate: false });
    setValue("expense_modal_payment_mode", "cash", { shouldValidate: false });
  }, [isSuperAdminOrStaff, sessionFranchiseId, setValue]);

  const listParamsRef = useRef<ExpensesFilters>({});

  const effectiveFormFranchiseId = useMemo(() => {
    if (isSuperAdminOrStaff) return String(form.franchiseId ?? "").trim();
    return String(sessionFranchiseId ?? "").trim();
  }, [form.franchiseId, isSuperAdminOrStaff, sessionFranchiseId]);

  useEffect(() => {
    let cancelled = false;
    ensureSettingsSeedData();
    const franchiseId = effectiveFormFranchiseId;
    if (!franchiseId) {
      setExpenseCategories([]);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      let page = 1;
      const batch = 100;
      const all: ExpenseCategoryModel[] = [];
      for (;;) {
        const chunk = await fetchExpenseCategoriesPage(page, batch, { franchiseId });
        if (cancelled) return;
        if (!chunk) {
          setExpenseCategories(
            getExpenseCategories().filter(
              (item) => String(item.franchiseId ?? "").trim() === franchiseId
            )
          );
          return;
        }
        if (chunk.rows.length === 0) break;
        all.push(...chunk.rows);
        if (chunk.rows.length < batch) break;
        page += 1;
        if (page > 500) break;
      }
      setExpenseCategories(all);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveFormFranchiseId]);

  useEffect(() => {
    if (!isExpenseEditMode || !editingExpense || expenseCategories.length === 0) return;
    setForm((prev) => {
      const resolved = resolveExpenseCategoryFields(editingExpense, expenseCategories);
      const unchanged =
        prev.categoryId === resolved.categoryId &&
        prev.subCategoryId === resolved.subCategoryId &&
        prev.categoryName === resolved.categoryName &&
        prev.subCategoryName === resolved.subCategoryName;
      if (unchanged) return prev;
      const next = { ...prev, ...resolved };
      syncExpenseFormControls(next);
      return next;
    });
  }, [isExpenseEditMode, editingExpense, expenseCategories, syncExpenseFormControls]);

  const modalCategoryOptions = useMemo(() => {
    const fromCategories = Array.from(
      new Map(
        expenseCategories.map((c) => [
          c.categoryId || c.id,
          { value: c.categoryId || c.id, label: c.categoryName },
        ])
      ).values()
    );
    const options: { value: string; label: string }[] = [
      { value: "", label: "Select Category" },
      ...fromCategories,
    ];
    if (editingExpense && form.categoryId && form.categoryName) {
      if (!options.some((o) => o.value === form.categoryId)) {
        options.push({ value: form.categoryId, label: form.categoryName });
      }
    }
    return options;
  }, [editingExpense, expenseCategories, form.categoryId, form.categoryName]);

  const modalSubCategoryOptions = useMemo(() => {
    const selectedCategory = expenseCategories.find(
      (item) => (item.categoryId || item.id) === form.categoryId
    );
    const fromSubcategories = (selectedCategory?.subcategories ?? [])
      .map((item) => ({
        value: item.subcategoryId || "",
        label: item.subCategoryName,
      }))
      .filter((item) => Boolean(item.value));

    const options: { value: string; label: string }[] = [
      {
        value: "",
        label: form.categoryId ? "Select Sub Category" : "Select Category first",
      },
      ...fromSubcategories,
    ];
    if (editingExpense && form.subCategoryId && form.subCategoryName) {
      if (!options.some((o) => o.value === form.subCategoryId)) {
        options.push({ value: form.subCategoryId, label: form.subCategoryName });
      }
    }
    return options;
  }, [
    editingExpense,
    expenseCategories,
    form.categoryId,
    form.subCategoryId,
    form.subCategoryName,
  ]);

  useEffect(() => {
    if (!isFranchiseScopedUser) {
      setSessionFranchiseId("");
      return;
    }
    let cancelled = false;
    (async () => {
      const currentUserId = String(getLocalStorage(AppConstant.createdById) ?? "").trim();
      if (!currentUserId) return;
      const res = await fetchUserById(currentUserId);
      if (cancelled || !res.response || !res.user) return;
      const fid = String((res.user as any).franchise_id ?? "").trim();
      if (fid) setSessionFranchiseId(fid);
    })();
    return () => {
      cancelled = true;
    };
  }, [isFranchiseScopedUser]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const franchises = await fetchFranchiseDropDown();
        if (cancelled) return;
        setFranchiseOptions([{ value: "", label: "All Franchises" }, ...franchises]);
      } catch {
        // Fallback to the initial static "All Franchises" option.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const franchiseIdToName = useMemo(() => {
    const map = new Map<string, string>();
    franchiseOptions.forEach((opt) => {
      const id = String(opt.value ?? "").trim();
      if (!id) return;
      map.set(id, opt.label);
    });
    return map;
  }, [franchiseOptions]);

  /** `GET/DELETE` expense by id require `franchise_id` query (see expense-management Postman). */
  const franchiseIdForExpenseApi = useCallback(
    (expense: ExpenseModel) => {
      const fromRow = String(expense.franchise_id ?? expense.franchiseId ?? "").trim();
      if (isFranchiseScopedUser) return fromRow;
      if (fromRow) return fromRow;
      return "";
    },
    [isFranchiseScopedUser]
  );

  const effectiveListFranchiseId = useMemo(() => {
    if (isFranchiseScopedUser) {
      return undefined;
    }
    if (!franchiseId || franchiseId === "all") {
      return undefined;
    }
    return franchiseId;
  }, [franchiseId, isFranchiseScopedUser]);

  const refreshListParams = useCallback(() => {
    listParamsRef.current = {
      search: keyword?.trim() ? keyword.trim() : undefined,
      franchiseId: effectiveListFranchiseId,
      sortOrder: sort === "-1" ? "desc" : "asc",
    };
  }, [effectiveListFranchiseId, keyword, sort]);

  useEffect(() => {
    refreshListParams();
  }, [refreshListParams]);

  const fetchData = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const res = await fetchExpenses(currentPage, pageSize, listParamsRef.current, { skipLoader: false }, sortBy);
      if (res.response) {
        setExpenses(res.expenses);
        setTotalPages(Math.max(1, res.totalPages || 1));
        setTotalItems(res.totalItems ?? res.expenses.length);
      } else {
        setExpenses([]);
        setTotalPages(0);
        setTotalItems(0);
      }
    } finally {
      fetchRef.current = false;
    }
  }, [currentPage, pageSize, sortBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData, filterEpoch]);

  const prefillFormFromExpense = useCallback(
    (expense: ExpenseModel): ExpenseFormState => buildExpenseFormState(expense, expenseCategories),
    [expenseCategories]
  );

  const handleOpenEdit = useCallback(
    async (expense?: ExpenseModel | null) => {
      setIsViewMode(false);
      if (!expense) {
        setEditingExpense(null);
        setAddFormKey((k) => k + 1);
        resetAddExpenseFormFields();
        setShowForm(true);
        return;
      }

      const expenseId = (expense._id ?? expense.id ?? (expense as any).expense_id) as string | undefined;
      if (expenseId) {
        const fid = franchiseIdForExpenseApi(expense);
        const latest = await fetchExpenseById(expenseId, {
          skipLoader: true,
          franchiseId: fid || undefined,
        });
        if (latest.response && latest.expense) {
          setEditingExpense(latest.expense);
          applyExpenseToEditForm(latest.expense);
          setFormErrors({});
        } else {
          setEditingExpense(expense);
          applyExpenseToEditForm(expense);
          setFormErrors({});
        }
      } else {
        setEditingExpense(expense);
        applyExpenseToEditForm(expense);
        setFormErrors({});
      }
      setShowForm(true);
    },
    [applyExpenseToEditForm, franchiseIdForExpenseApi, resetAddExpenseFormFields]
  );

  const handleOpenView = useCallback(
    async (expense: ExpenseModel) => {
      setIsViewMode(true);
      const expenseId = (expense._id ?? expense.id ?? (expense as any).expense_id) as string | undefined;
      if (expenseId) {
        const fid = franchiseIdForExpenseApi(expense);
        const latest = await fetchExpenseById(expenseId, {
          skipLoader: true,
          franchiseId: fid || undefined,
        });
        if (latest.response && latest.expense) {
          setEditingExpense(latest.expense);
          setForm(prefillFormFromExpense(latest.expense));
          setFormErrors({});
        } else {
          setEditingExpense(expense);
          setForm(prefillFormFromExpense(expense));
          setFormErrors({});
        }
      } else {
        setEditingExpense(expense);
        setForm(prefillFormFromExpense(expense));
        setFormErrors({});
      }
      setShowForm(true);
    },
    [franchiseIdForExpenseApi, prefillFormFromExpense]
  );

  const paymentModeOptions = useMemo(() => paymentMethodSelectOptions(), []);

  const expensesColumns = useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "sr",
        Cell: ({ row }: any) => (currentPage - 1) * pageSize + row.index + 1,
      },
      {
        Header: "Category",
        accessor: "category",
        sort: true,
        Cell: ({ row }: any) => row.original.category_name ?? row.original.categoryName ?? "-",
      },
      {
        Header: "Sub Category",
        accessor: "subCategory",
        sort: true,
        Cell: ({ row }: any) => row.original.sub_category_name ?? row.original.subCategoryName ?? "-",
      },
      {
        Header: "Expense Name",
        accessor: "expenseName",
        sort: true,
        Cell: ({ row }: any) => row.original.expense_name ?? row.original.expenseName ?? "-",
      },
      ...(isSuperAdminOrStaff
        ? [
            {
              Header: "Franchise Name",
              accessor: "franchiseName",
              sort: true,
              Cell: ({ row }: any) => {
                const fromApi =
                  row.original.franchise_name ?? row.original.franchiseName;
                if (fromApi) return fromApi;
                const fid = String(
                  row.original.franchise_id ?? row.original.franchiseId ?? ""
                ).trim();
                return (fid && franchiseIdToName.get(fid)) || "-";
              },
            },
          ]
        : []),
      // {
      //   Header: "Description / Notes",
      //   accessor: "description",
      //   Cell: ({ row }: any) => row.original.description ?? (row.original as any).expense_description ?? "-",
      // },
      {
        Header: "Expense Amount",
        accessor: "expenseAmount",
        sort: true,
        Cell: ({ row }: any) => {
          const v = row.original.expense_amount ?? row.original.expenseAmount;
          return v !== undefined && v !== null ? `${AppConstant.currencySymbol}${v}` : "-";
        },
      },
      {
        Header: "Expense Date",
        accessor: "expenseDate",
        sort: true,
        Cell: ({ row }: any) =>
          row.original.expense_date ?? row.original.expenseDate ? formatDate(row.original.expense_date ?? row.original.expenseDate) : "-",
      },
      // {
      //   Header: "Payment done by",
      //   accessor: "paymentDoneBy",
      //   Cell: ({ row }: any) => {
      //     return (
      //       row.original.payment_done_by_name ??
      //       row.original.created_by_name ??
      //       row.original.payment_done_by ??
      //       row.original.created_by ??
      //       "-"
      //     );
      //   },
      // },
      {
        Header: "Payment mode",
        accessor: "paymentMode",
        Cell: ({ row }: any) => {
          return (
            paymentMethodLabel(
              row.original.payment_mode ??
                row.original.paymentMode ??
                row.original.payment_mode_id ??
                row.original.paymentModeId
            ) || "-"
          );
        },
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: any) => (
          <CustomActionColumn
            row={row}
            onView={() => handleOpenView(row.original as ExpenseModel)}
            // onEdit={() => handleOpenEdit(row.original as ExpenseModel)}
            // onDelete={() => {
            //   openConfirmDialog(
            //     "Are you sure you want to void this expense?",
            //     "Void",
            //     "Cancel",
            //     async () => {
            //       const rowId =
            //         (row.original?._id ??
            //           row.original?.id ??
            //           (row.original as any)?.expense_id) as string | undefined;
            //       if (!rowId) return showErrorAlert("Invalid expense id.");
            //       const fid = franchiseIdForExpenseApi(row.original as ExpenseModel);
            //       const ok = await deleteExpenseById(rowId, fid || undefined);
            //       if (!ok) return;
            //       refreshListParams();
            //       fetchData();
            //     }
            //   );
            // }}
          />
        ),
      },
    ],
    [currentPage, franchiseIdToName, handleOpenView, isSuperAdminOrStaff, pageSize]
  );

  const handleSaveExpense = async () => {
    const categoryName = form.categoryName.trim();
    const subCategoryName = form.subCategoryName.trim();
    const expenseName = form.expenseName.trim();
    const description = form.description.trim();
    const expenseAmountNum = Number(form.expenseAmount);
    const expenseDateYmd = form.expenseDate || "";
    const paymentSlug = normalizePaymentMethod(form.paymentModeId);

    const nextErrors: ExpenseFormErrors = {};
    if (isSuperAdminOrStaff && !form.franchiseId.trim()) {
      nextErrors.franchiseId = "Franchise is required";
    }
    if (!form.categoryId.trim() || !categoryName) {
      nextErrors.categoryId = "Category is required";
    }
    if (!form.subCategoryId.trim() || !subCategoryName) {
      nextErrors.subCategoryId = "Sub Category is required";
    }
    if (!expenseName) {
      nextErrors.expenseName = "Expense Name is required";
    }
    if (!form.expenseDate) {
      nextErrors.expenseDate = "Expense Date is required";
    }
    if (!form.paymentModeId) {
      nextErrors.paymentModeId = "Payment Mode is required";
    }
    if (Number.isNaN(expenseAmountNum) || expenseAmountNum <= 0) {
      nextErrors.expenseAmount = "Expense Amount must be greater than 0";
    }
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    if (!paymentSlug) {
      return showErrorAlert("Invalid payment method");
    }

    const selectedCategory = expenseCategories.find(
      (item) =>
        item.categoryName === categoryName &&
        item.subCategoryName === subCategoryName
    );

    const categoryId = form.categoryId || selectedCategory?.categoryId || selectedCategory?.id || "";
    const subCategoryId = form.subCategoryId || selectedCategory?.subCategoryId || "";
    const payloadFranchiseId = isSuperAdminOrStaff ? form.franchiseId.trim() : sessionFranchiseId.trim();

    if (!categoryId) return showErrorAlert("Category id not found for selected category.");
    if (!subCategoryId) return showErrorAlert("Sub category id not found for selected sub category.");
    if (!payloadFranchiseId) return showErrorAlert("Franchise not found.");

    const payload = {
      franchise_id: payloadFranchiseId,
      category_id: categoryId,
      subcategory_id: subCategoryId,
      expense_name: expenseName,
      description,
      expense_amount: expenseAmountNum,
      expense_date: expenseDateYmd,
      payment_mode: paymentMethodApiValue(paymentSlug) || "Cash",
    };

    const id = (editingExpense?._id ?? editingExpense?.id ?? (editingExpense as any)?.expense_id) as string | undefined;
    const ok = await createOrUpdateExpense(payload, Boolean(editingExpense), id);
    if (ok) {
      setShowForm(false);
      setIsViewMode(false);
      setEditingExpense(null);
      setFormErrors({});
      // Force refresh even if currentPage/filters stay the same.
      setCurrentPage(1);
      setTotalPages(0);
      setTotalItems(0);
      refreshListParams();
      fetchData();
    }
  };

  const clearExpensesDisabled = !keyword?.trim() && !searchDraft.trim() && sort === "-1";

  const clearExpensesFilters = () => {
    setKeyword("");
    setSearchDraft("");
    setSort("-1");
    setSortBy([]);
    setCurrentPage(1);
    setFilterEpoch((k) => k + 1);
    setSearchClearVersion((v) => v + 1);
    setUtilitySearchKey((k) => k + 1);
  };

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Expenses Management"
        register={register}
        setValue={setValue}
        onLocationChange={(selectedFranchiseId) => {
          setFranchiseId(selectedFranchiseId);
          setCurrentPage(1);
        }}
      />

      <div className="box-container">
        <CustomSummaryBox
          divId="box-expenses"
          title={capitalizeString("expenses")}
          data={{ Total: totalItems }}
          onSelect={() => {}}
          isSelected={true}
          onFilterChange={() => {}}
          isAddShow={true}
          addButtonLable="Add Expense"
          onAddClick={() => handleOpenEdit(null)}
        />
      </div>

      <CustomUtilityBox
        key={`expenses-utility-${utilitySearchKey}`}
        title="Expenses"
        searchHint="Search expense name, category, sub category"
        toolsInlineRow
        toolsInlineClassName="custom-utilty-tools-inline--expenses-wide-search"
        hideMoreIcon
        afterSearchSlot={
          <Button
            variant="outline-secondary"
            size="sm"
            className="custom-btn-secondary partner-payout-clear-btn px-3"
            type="button"
            disabled={clearExpensesDisabled}
            onClick={clearExpensesFilters}
          >
            Clear
          </Button>
        }
        onSearch={(value) => {
          setKeyword(value);
          setSearchDraft(value);
          setCurrentPage(1);
          setFilterEpoch((k) => k + 1);
        }}
        onSearchInputChange={setSearchDraft}
        syncKeyword={keyword}
        searchClearVersion={searchClearVersion}
      />

      <CustomTable
        columns={expensesColumns}
        data={expenses}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page: number) => setCurrentPage(page)}
        onLimitChange={(newPageSize: number) => {
          setPageSize(newPageSize);
          setCurrentPage(1);
        }}
        manualSortBy
        sortBy={sortBy}
        onSortChange={(next) => {
          setSortBy(next);
          setCurrentPage(1);
          setFilterEpoch((k) => k + 1);
        }}
        theadClass="table-light"
      />

      <Modal
        show={showForm}
        onHide={() => {
          setShowForm(false);
          setIsViewMode(false);
          setFormErrors({});
        }}
        centered
        size="lg"
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            {isViewMode ? "Expense Details" : editingExpense ? "Edit Expense" : "Add Expense"}
          </Modal.Title>
          <CustomCloseButton
            onClose={() => {
              setShowForm(false);
              setIsViewMode(false);
              setFormErrors({});
            }}
          />
        </Modal.Header>

        <Modal.Body className="px-4 pb-4 pt-0" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {isViewMode && editingExpense ? (
            <section className="custom-other-details" style={{ padding: "10px" }}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h3 className="mb-0">Expense Information</h3>
                <i
                  className="bi bi-pencil-fill fs-6 text-danger"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    if (editingExpense) {
                      applyExpenseToEditForm(editingExpense);
                    }
                    setIsViewMode(false);
                  }}
                ></i>
              </div>

              <div className="row">
                <div className="col-md-6 custom-helper-column">
                  <DetailsRow title="Category" value={editingExpense.category_name ?? editingExpense.categoryName ?? "-"} />
                  <DetailsRow title="Sub Category" value={editingExpense.sub_category_name ?? editingExpense.subCategoryName ?? "-"} />
                  <DetailsRow title="Expense Name" value={editingExpense.expense_name ?? editingExpense.expenseName ?? "-"} />
                </div>

                <div className="col-md-6 custom-helper-column">
                  <DetailsRow
                    title="Expense Amount"
                    value={
                      (() => {
                        const amt = editingExpense.expense_amount ?? editingExpense.expenseAmount;
                        return amt !== undefined && amt !== null
                          ? `${AppConstant.currencySymbol}${amt}`
                          : "-";
                      })()
                    }
                  />
                  <DetailsRow
                    title="Expense Date"
                    value={formatDate(editingExpense.expense_date ?? (editingExpense as any).expenseDate ?? "")}
                  />
                  {/* <DetailsRow
                    title="Payment done by"
                    value={
                      editingExpense.payment_done_by_name ??
                      editingExpense.created_by_name ??
                      editingExpense.payment_done_by ??
                      editingExpense.created_by ??
                      "-"
                    }
                  /> */}
                  <DetailsRow
                    title="Payment mode"
                    value={
                      paymentMethodLabel(
                        editingExpense.payment_mode ??
                          editingExpense.paymentMode ??
                          editingExpense.payment_mode_id ??
                          editingExpense.paymentModeId
                      ) || "-"
                    }
                  />
                </div>
              </div>

              <div className="mt-3 p-3 border rounded">
                <div className="custom-personal-row-title mb-2">Description / Notes</div>
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--txt-color)" }}>
                  {editingExpense.description ?? (editingExpense as any).expense_description ?? "-" }
                </div>
              </div>
            </section>
          ) : (
            <>
            <div className="row g-2">
              {isSuperAdminOrStaff && (
                <div className="col-md-6">
                  <CustomFormSelect
                    key={
                      editingExpense
                        ? `expense-franchise-${editingExpense._id ?? editingExpense.id}`
                        : `expense-franchise-add-${addFormKey}`
                    }
                    label="Franchise"
                    controlId="expense_modal_franchise"
                    showRequiredMark
                    options={[
                      { value: "", label: "Select Franchise" },
                      ...franchiseOptions
                        // In this modal, do not show "All Franchises" / any non-specific option.
                        .filter((item) => item.value !== "all" && item.value !== "")
                        .map((item) => ({ value: item.value, label: item.label })),
                    ]}
                    register={register}
                    fieldName="expense_modal_franchise"
                    asCol={false}
                    defaultValue={form.franchiseId}
                    error={
                      formErrors.franchiseId
                        ? ({ message: formErrors.franchiseId } as any)
                        : undefined
                    }
                    setValue={setValue}
                    isDisabled={Boolean(editingExpense)}
                    onChange={(e) => {
                      setForm((p) => ({
                        ...p,
                        franchiseId: e.target.value,
                        categoryId: "",
                        categoryName: "",
                        subCategoryId: "",
                        subCategoryName: "",
                      }));
                      setValue("expense_modal_category", "", { shouldValidate: false });
                      setValue("expense_modal_sub_category", "", { shouldValidate: false });
                      setFormErrors((prev) => ({
                        ...prev,
                        franchiseId: undefined,
                        categoryId: undefined,
                        subCategoryId: undefined,
                      }));
                    }}
                    menuPortal
                  />
                </div>
              )}
             </div>
             <div className="row g-2">
              <div className="col-md-6">
                <CustomFormSelect
                  key={
                    editingExpense
                      ? `expense-category-${editingExpense._id ?? editingExpense.id}-${form.categoryId}-${expenseCategories.length}`
                      : `expense-category-add-${addFormKey}`
                  }
                  label="Category"
                  controlId="expense_modal_category"
                  showRequiredMark
                  options={modalCategoryOptions}
                  register={register}
                  fieldName="expense_modal_category"
                  asCol={false}
                  defaultValue={form.categoryId}
                  error={
                    formErrors.categoryId
                      ? ({ message: formErrors.categoryId } as any)
                      : undefined
                  }
                  setValue={setValue}
                  isDisabled={Boolean(editingExpense)}
                  onChange={(e) => {
                    const newCategoryId = e.target.value;
                    const pickedCategory = expenseCategories.find(
                      (item) => (item.categoryId || item.id) === newCategoryId
                    );
                    setForm((p) => ({
                      ...p,
                      categoryId: newCategoryId,
                      categoryName: pickedCategory?.categoryName || "",
                      subCategoryId: "",
                      subCategoryName: "",
                    }));
                    setFormErrors((prev) => ({
                      ...prev,
                      categoryId: undefined,
                      subCategoryId: undefined,
                    }));
                  }}
                />
              </div>

              <div className="col-md-6">
                <div
                  style={{
                    pointerEvents: editingExpense || form.categoryName ? "auto" : "none",
                    opacity: editingExpense || form.categoryName ? 1 : 0.65,
                  }}
                >
                  <CustomFormSelect
                    key={
                      editingExpense
                        ? `expense-sub-category-${editingExpense._id ?? editingExpense.id}-${form.categoryId}-${form.subCategoryId}-${expenseCategories.length}`
                        : `expense-sub-category-add-${addFormKey}-${form.categoryId}`
                    }
                    label="Sub Category"
                    controlId="expense_modal_sub_category"
                    showRequiredMark
                    options={modalSubCategoryOptions}
                    register={register}
                    fieldName="expense_modal_sub_category"
                    asCol={false}
                    defaultValue={form.subCategoryId}
                    error={
                      formErrors.subCategoryId
                        ? ({ message: formErrors.subCategoryId } as any)
                        : undefined
                    }
                    setValue={setValue}
                    isDisabled={Boolean(editingExpense)}
                    onChange={(e) => {
                      const newSubCategoryId = e.target.value;
                      const selectedCategory = expenseCategories.find(
                        (item) => (item.categoryId || item.id) === form.categoryId
                      );
                      const pickedSubCategory = selectedCategory?.subcategories?.find(
                        (item) => (item.subcategoryId || "") === newSubCategoryId
                      );
                      setForm((p) => ({
                        ...p,
                        subCategoryId: newSubCategoryId,
                        subCategoryName: pickedSubCategory?.subCategoryName || "",
                      }));
                      setFormErrors((prev) => ({ ...prev, subCategoryId: undefined }));
                    }}
                  />
                </div>
              </div>

              <div className="col-md-12">
                <CustomFormInput
                  key={
                    editingExpense
                      ? `expense-name-${editingExpense._id ?? editingExpense.id}`
                      : `expense-name-add-${addFormKey}`
                  }
                  label="Expense Name"
                  controlId="expense_modal_expense_name"
                  showRequiredMark
                  placeholder="Enter Expense Name"
                  register={register}
                  asCol={false}
                  error={
                    formErrors.expenseName
                      ? ({ message: formErrors.expenseName } as any)
                      : undefined
                  }
                  value={form.expenseName}
                  onChange={(value) => {
                    setForm((p) => ({ ...p, expenseName: value }));
                    setFormErrors((prev) => ({ ...prev, expenseName: undefined }));
                  }}
                />
              </div>

              <div className="col-md-12">
                <CustomFormInput
                  key={
                    editingExpense
                      ? `expense-description-${editingExpense._id ?? editingExpense.id}`
                      : `expense-description-add-${addFormKey}`
                  }
                  label="Description / Notes"
                  controlId="expense_modal_description"
                  placeholder="Enter Description / Notes"
                  register={register}
                  asCol={false}
                  value={form.description}
                  showRequiredMark
                  as="textarea"
                  rows={4}
                  onChange={(value) => setForm((p) => ({ ...p, description: value }))}
                />
              </div>

              <div className="col-md-6">
                <CustomFormInput
                  key={
                    editingExpense
                      ? `expense-amount-${editingExpense._id ?? editingExpense.id}`
                      : `expense-amount-add-${addFormKey}`
                  }
                  label="Expense Amount"
                  controlId="expense_modal_expense_amount"
                  showRequiredMark
                  placeholder="Enter Expense Amount"
                  register={register}
                  asCol={false}
                  inputType="text"
                  error={
                    formErrors.expenseAmount
                      ? ({ message: formErrors.expenseAmount } as any)
                      : undefined
                  }
                  value={form.expenseAmount}
                  onChange={(value) => {
                    // Only digits; blocks negative sign and non-numeric chars.
                    const cleaned = String(value ?? "").replace(/[^\d]/g, "");
                    setForm((p) => ({ ...p, expenseAmount: cleaned }));
                    setFormErrors((prev) => ({ ...prev, expenseAmount: undefined }));
                  }}
                />
              </div>

              <div className="col-md-6">
                <CustomDatePicker
                  key={
                    editingExpense
                      ? `expense-date-${editingExpense._id ?? editingExpense.id}`
                      : `expense-date-add-${addFormKey}`
                  }
                  label="Expense Date"
                  required
                  controlId="expense_modal_expense_date"
                  selectedDate={form.expenseDate || null}
                  error={formErrors.expenseDate}
                  onChange={(date) => {
                    const value = date
                      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
                          date.getDate()
                        ).padStart(2, "0")}`
                      : "";
                    setForm((p) => ({ ...p, expenseDate: value }));
                    setFormErrors((prev) => ({ ...prev, expenseDate: undefined }));
                  }}
                  register={register}
                  setValue={setValue}
                  asCol={false}
                  groupClassName="mb-0 w-100"
                  placeholderText="Expense Date"
                  filterDate={() => true}
                />
              </div>

              <div className="col-md-12">
                <CustomFormSelect
                  key={
                    editingExpense
                      ? `expense-payment-${editingExpense._id ?? editingExpense.id}`
                      : `expense-payment-add-${addFormKey}`
                  }
                  label="Payment Mode"
                  controlId="expense_modal_payment_mode"
                  showRequiredMark
                  options={paymentModeOptions}
                  register={register}
                  fieldName="expense_modal_payment_mode"
                  asCol={false}
                  defaultValue={form.paymentModeId}
                  error={
                    formErrors.paymentModeId
                      ? ({ message: formErrors.paymentModeId } as any)
                      : undefined
                  }
                  setValue={setValue}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, paymentModeId: e.target.value }));
                    setFormErrors((prev) => ({ ...prev, paymentModeId: undefined }));
                  }}
                />
              </div>
            </div>
            </>
          )}
        </Modal.Body>

        {!isViewMode && (
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setFormErrors({});
              }}
            >
              Cancel
            </Button>
            <Button className="btn-danger" onClick={handleSaveExpense}>
              {editingExpense ? "Update" : "Save"}
            </Button>
          </Modal.Footer>
        )}
      </Modal>
    </div>
  );
};

export default ExpensesPage;

