import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Col, Form, Modal, Row } from "react-bootstrap";
import { useForm } from "react-hook-form";
import CustomHeader from "../../../components/CustomHeader";
import CustomTable from "../../../components/CustomTable";
import searchIcon from "../../../assets/icons/search.svg";
import CustomSummaryBox from "../../../components/CustomSummaryBox";
import CustomActionColumn from "../../../components/CustomActionColumn";
import { CustomFormInput } from "../../../components/CustomFormInput";
import CustomFormSelect from "../../../components/CustomFormSelect";
import CustomDatePicker from "../../../components/CustomDatePicker";
import { capitalizeString, DetailsRow, formatDate } from "../../../helper/utility";
import { ExpenseCategoryModel } from "../../../lib/models/SettingsModel";
import SettingsNav from "../../../components/SettingsNav";
import {
  ensureSettingsSeedData,
  fetchExpenseCategoriesPage,
  saveExpenseCategoryWithApi,
  voidExpenseCategoryWithApi,
} from "../../../services/settingsService";
import type { ServerTableSortBy } from "../../../lib/global/serverTableSort";
import CustomCloseButton from "../../../components/CustomCloseButton";
import { openConfirmDialog } from "../../../components/CustomConfirmDialog";
import { fetchFranchiseDropDown, FranchiseDropDownOption } from "../../../services/franchiseService";
import { PinCodeHoverPortal } from "../../../components/PinCodeHoverPortal";
import { useFranchiseHeaderForm } from "../../../lib/global/hooks/useFranchiseScopedGetCount";
import { franchiseIdForApiQuery } from "../../../lib/franchise/headerFranchisePreference";

function subCategoryNamesForRow(row: ExpenseCategoryModel): string[] {
  const fromList = (row.subcategories ?? [])
    .map((item) => String(item.subCategoryName ?? "").trim())
    .filter(Boolean);
  if (fromList.length > 0) return fromList;
  const single = String(row.subCategoryName ?? "").trim();
  return single ? [single] : [];
}

function ExpenseSubCategoryTableCell({ row }: { row: { original: ExpenseCategoryModel } }) {
  const items = subCategoryNamesForRow(row.original);
  if (items.length === 0) return <>-</>;

  if (items.length === 1) {
    return (
      <PinCodeHoverPortal items={items} listStyle="ul">
        <span
          className="pin-code-hover-trigger d-inline-block text-truncate w-100 min-w-0"
          style={{ maxWidth: "100%" }}
        >
          {items[0]}
        </span>
      </PinCodeHoverPortal>
    );
  }

  const more = items.length - 1;
  return (
    <PinCodeHoverPortal items={items} listStyle="ul">
      <span className="pin-code-hover-trigger d-flex align-items-center flex-nowrap w-100 min-w-0">
        <span
          className="text-truncate min-w-0"
          style={{ flex: "1 1 0%" }}
        >
          {items[0]}....
        </span>
        <span className="flex-shrink-0" style={{ color: "red", fontWeight: 600 }}>
          +{more}
        </span>
      </span>
    </PinCodeHoverPortal>
  );
}

type ExpenseSubCategoryNamesEditorProps = {
  rowKeyPrefix: string;
  names: string[];
  error?: string;
  removeMode: "add" | "edit";
  onChange: (names: string[]) => void;
  onClearError: () => void;
};

function canRemoveSubCategoryRow(
  index: number,
  names: string[],
  removeMode: "add" | "edit"
): boolean {
  if (removeMode === "edit") return names.length > 1;
  return index > 0;
}

function ExpenseSubCategoryNamesEditor({
  rowKeyPrefix,
  names,
  error,
  removeMode,
  onChange,
  onClearError,
}: ExpenseSubCategoryNamesEditorProps) {

  return (
    <div>
      <Form.Label className="fw-medium mb-2 d-block">
        Sub Category Name{" "}
        <span className="text-danger" aria-hidden>
          *
        </span>
      </Form.Label>
      {names.map((subCategoryName, index) => (
        <div
          key={`${rowKeyPrefix}-${index}`}
          className="d-flex align-items-center gap-2 mb-2"
        >
          <Form.Control
            className="custom-form-input flex-grow-1"
            type="text"
            placeholder="Enter Sub Category Name"
            value={subCategoryName}
            isInvalid={index === 0 && Boolean(error)}
            style={subCategoryFieldInputStyle}
            onChange={(e) => {
              const value = e.target.value;
              onChange(
                names.map((item, itemIndex) =>
                  itemIndex === index ? value : item
                )
              );
              onClearError();
            }}
          />
          <button
            type="button"
            aria-label="Add sub category row"
            title="Add sub category"
            style={subCategoryAddIconBtnStyle}
            onClick={() => {
              const next = [...names];
              next.splice(index + 1, 0, "");
              onChange(next);
            }}
          >
            <i className="bi bi-plus fs-6" aria-hidden />
          </button>
          {canRemoveSubCategoryRow(index, names, removeMode) ? (
            <button
              type="button"
              aria-label="Remove sub category row"
              title="Remove sub category"
              style={subCategoryRemoveIconBtnStyle}
              onClick={() => {
                onChange(names.filter((_, itemIndex) => itemIndex !== index));
              }}
            >
              <i className="bi bi-dash-lg fs-6" aria-hidden />
            </button>
          ) : null}
        </div>
      ))}
      {error ? <div className="text-danger small">{error}</div> : null}
    </div>
  );
}

const emptyForm = {
  franchiseId: "",
  categoryName: "",
  subCategoryName: "",
  description: "",
};

type ExpenseCategoryFormErrors = {
  franchiseId?: string;
  categoryName?: string;
  subCategoryName?: string;
  subCategoryNames?: string;
};

const emptyAddSubCategoryNames = [""];

const subCategoryFieldInputStyle: React.CSSProperties = {
  boxShadow: "none",
  borderRadius: "8px",
  borderColor: "var(--primary-color)",
  fontSize: "14px",
  fontWeight: "normal",
  height: "35px",
  lineHeight: "18px",
  backgroundColor: "var(--bg-color)",
  fontFamily: "Inter",
  color: "var(--content-txt-color)",
  marginBottom: 0,
};

const subCategoryAddIconBtnStyle: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  border: "1px solid var(--primary-color)",
  backgroundColor: "transparent",
  color: "var(--primary-color)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  padding: 0,
};

const subCategoryRemoveIconBtnStyle: React.CSSProperties = {
  ...subCategoryAddIconBtnStyle,
  border: "1px solid #dc3545",
  color: "#dc3545",
};

const TABLE_PAGE_SIZE = 10;

const formatLocalDateYmd = (date: Date | null): string => {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const ExpenseCategoryManagement = () => {
  const {
    register: headerRegister,
    setValue: setHeaderValue,
    franchiseId: headerFranchiseId,
  } = useFranchiseHeaderForm();
  const { register, setValue } = useForm<any>();
  const [items, setItems] = useState<ExpenseCategoryModel[]>([]);
  const [keyword, setKeyword] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategoryModel | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<ExpenseCategoryFormErrors>({});
  const [isViewMode, setIsViewMode] = useState(false);
  const [selectedBox, setSelectedBox] = useState("box-expense-category");
  const [isLoading, setIsLoading] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const [tableTotalPages, setTableTotalPages] = useState(1);
  const [tableTotalItems, setTableTotalItems] = useState(0);
  const [sortBy, setSortBy] = useState<ServerTableSortBy>([]);
  const [franchiseOptions, setFranchiseOptions] = useState<FranchiseDropDownOption[]>([]);
  const [addFormKey, setAddFormKey] = useState(0);
  const [addSubCategoryNames, setAddSubCategoryNames] = useState<string[]>(
    emptyAddSubCategoryNames
  );
  const [editSubCategoryNames, setEditSubCategoryNames] = useState<string[]>(
    emptyAddSubCategoryNames
  );

  const resetAddFormFields = useCallback(() => {
    setForm(emptyForm);
    setFormErrors({});
    setAddSubCategoryNames([...emptyAddSubCategoryNames]);
    setValue("expense_category_franchise_id", "", { shouldValidate: false });
    setValue("expense_category_name", "", { shouldValidate: false });
    setValue("expense_category_description", "", { shouldValidate: false });
  }, [setValue]);

  const syncEditFormWithRhf = useCallback(
    (item: ExpenseCategoryModel) => {
      setValue("expense_category_franchise_id", item.franchiseId || "", {
        shouldValidate: false,
      });
      setValue("expense_category_name", item.categoryName || "", {
        shouldValidate: false,
      });
      setValue("expense_category_description", item.description || "", {
        shouldValidate: false,
      });
    },
    [setValue]
  );

  const closeFormModal = () => {
    setShowForm(false);
    setIsViewMode(false);
    setEditing(null);
    setForm(emptyForm);
    setFormErrors({});
    setAddSubCategoryNames([...emptyAddSubCategoryNames]);
    setEditSubCategoryNames([...emptyAddSubCategoryNames]);
  };

  const hydrateEditSubCategoryNames = useCallback((item: ExpenseCategoryModel) => {
    const names = subCategoryNamesForRow(item);
    setEditSubCategoryNames(names.length > 0 ? names : [...emptyAddSubCategoryNames]);
  }, []);

  const openAddForm = () => {
    setEditing(null);
    setIsViewMode(false);
    setAddFormKey((k) => k + 1);
    resetAddFormFields();
    setShowForm(true);
  };

  const openFormWithData = (item?: ExpenseCategoryModel, viewMode = false) => {
    if (!item) {
      setEditing(null);
      setForm(emptyForm);
      setIsViewMode(false);
      setFormErrors({});
      setShowForm(true);
      return;
    }
    setEditing(item);
    setIsViewMode(viewMode);
    setForm({
      franchiseId: item.franchiseId || "",
      categoryName: item.categoryName,
      subCategoryName: item.subCategoryName,
      description: item.description || "",
    });
    hydrateEditSubCategoryNames(item);
    syncEditFormWithRhf(item);
    setFormErrors({});
    setShowForm(true);
  };

  useEffect(() => {
    if (!showForm || isViewMode || !editing) return;
    // Keep edit form always in sync with the latest selected table row.
    setForm({
      franchiseId: editing.franchiseId || "",
      categoryName: editing.categoryName || "",
      subCategoryName: editing.subCategoryName || "",
      description: editing.description || "",
    });
    hydrateEditSubCategoryNames(editing);
    syncEditFormWithRhf(editing);
  }, [editing, hydrateEditSubCategoryNames, isViewMode, showForm, syncEditFormWithRhf]);

  const listFilters = useMemo(() => {
    const fid = franchiseIdForApiQuery(headerFranchiseId);
    return fid ? { franchiseId: fid } : {};
  }, [headerFranchiseId]);

  useEffect(() => {
    setTablePage(1);
  }, [headerFranchiseId]);

  const refresh = useCallback(async () => {
    const primarySort = sortBy[0];
    const sortField =
      primarySort?.id === "categoryName"
        ? "category_name"
        : primarySort?.id === "subCategoryName"
          ? "sub_category_name"
          : primarySort?.id === "franchiseName"
            ? "franchise_name"
          : primarySort?.id === "createdDate"
            ? "created_at"
            : undefined;
    const trimmedStart = startDate.trim();
    const trimmedEnd = endDate.trim();
    const normalizedStartDate = trimmedStart
      ? trimmedStart
      : trimmedEnd
        ? undefined
        : undefined;
    const normalizedEndDate = trimmedEnd
      ? trimmedEnd
      : trimmedStart
        ? trimmedStart
        : undefined;
    setIsLoading(true);
    const pageData = await fetchExpenseCategoriesPage(tablePage, TABLE_PAGE_SIZE, {
      search: keyword.trim(),
      sort: sortField,
      sortOrder: primarySort ? (primarySort.desc ? "desc" : "asc") : undefined,
      startDate: normalizedStartDate || undefined,
      endDate: normalizedEndDate || undefined,
      ...listFilters,
    });
    setIsLoading(false);
    if (!pageData) return;
    setItems(pageData.rows);
    setTableTotalPages(Math.max(1, pageData.totalPages || 1));
    setTableTotalItems(pageData.totalItems ?? pageData.rows.length);
  }, [endDate, keyword, listFilters, sortBy, startDate, tablePage]);

  useEffect(() => {
    ensureSettingsSeedData();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchFranchiseDropDown();
      if (!cancelled) setFranchiseOptions(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const expenseSummaryData = useMemo(
    () => ({
      Total: tableTotalItems,
    }),
    [tableTotalItems]
  );

  const franchiseIdToName = useMemo(() => {
    const map = new Map<string, string>();
    franchiseOptions.forEach((opt) => {
      const id = String(opt.value ?? "").trim();
      if (!id) return;
      map.set(id, opt.label);
    });
    return map;
  }, [franchiseOptions]);

  const columns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "sr",
        Cell: ({ row }: any) => (Math.max(1, tablePage) - 1) * TABLE_PAGE_SIZE + row.index + 1,
      },
      {
        Header: "Category Name",
        accessor: "categoryName",
        sort: true,
      },
      {
        Header: "Sub Category Name",
        accessor: "subCategoryName",
        sort: true,
        Cell: ExpenseSubCategoryTableCell,
      },
      {
        Header: "Franchise Name",
        accessor: "franchiseName",
        sort: true,
        Cell: ({ row }: any) => {
          const o = row.original;
          const fromApi = String(o.franchiseName ?? "").trim();
          if (fromApi) return fromApi;
          const fid = String(o.franchiseId ?? "").trim();
          return (fid && franchiseIdToName.get(fid)) || "-";
        },
      },
      // { Header: "Description", accessor: "description" },
      {
        Header: "Created Date",
        accessor: "createdDate",
        sort: true,
        sortDescFirst: true,
        Cell: ({ row }: any) => formatDate(row.original.createdDate),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: any) => (
          <CustomActionColumn
            row={row}
            onView={() => openFormWithData(row.original, true)}
            onEdit={() => openFormWithData(row.original, false)}
            onDelete={() => {
              openConfirmDialog(
                "Are you sure you want to void this expense category?",
                "Void",
                "Cancel",
                async () => {
                  const ok = await voidExpenseCategoryWithApi(row.original.id);
                  if (!ok) return;
                  refresh();
                }
              );
            }}
          />
        ),
      },
    ],
    [franchiseIdToName, refresh, tablePage]
  );

  const applySearch = () => {
    setKeyword(searchDraft);
    setTablePage(1);
  };

  const clearExpenseCategorySearch = () => {
    setSearchDraft("");
    setKeyword("");
    setTablePage(1);
  };

  const filterControls = (
    <Row className="row-cols-1 row-cols-sm-2 row-cols-md-auto gx-3 gy-2 mt-3 mb-3 align-items-end justify-content-end">
     
      <Col xs={12} sm={6} md="auto">
        <CustomDatePicker
          label="Start Date"
          controlId="expense_category_start_date_filter"
          selectedDate={startDate || null}
          onChange={(date) => {
            const next = formatLocalDateYmd(date);
            setStartDate(next);
            setTablePage(1);
          }}
          register={register}
          setValue={setValue}
          asCol={false}
          groupClassName="mb-0 w-100 fw-medium"
          placeholderText="Start Date"
          filterDate={() => true}
        />
      </Col>
      <Col xs={12} sm={6} md="auto">
        <CustomDatePicker
          label="End Date"
          controlId="expense_category_end_date_filter"
          selectedDate={endDate || null}
          onChange={(date) => {
            const next = formatLocalDateYmd(date);
            setEndDate(next);
            setTablePage(1);
          }}
          register={register}
          setValue={setValue}
          asCol={false}
          groupClassName="mb-0 w-100 fw-medium"
          placeholderText="End Date"
          filterDate={() => true}
        />
      </Col>
       <Col xs={12} md="auto" className="order-0" style={{ minWidth: "min(100%, 16rem)" }}>
        <div className="d-flex flex-column">
          <label className="fw-medium" htmlFor="expense_category_search">
            Search
          </label>
          <div className="custom-search-container">
            <Form.Control
              id="expense_category_search"
              className="custom-form-input"
              type="text"
              placeholder="Category / Sub Category"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              style={{
                width: "100%",
                maxWidth: "24.25rem",
                fontSize: "14px",
                fontWeight: "normal",
                fontFamily: "Inter",
                paddingRight:
                  searchDraft.trim() || keyword.trim() ? "4.5rem" : "2.75rem",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applySearch();
                }
              }}
            />
            {searchDraft.trim() || keyword.trim() ? (
              <button
                type="button"
                className="custom-search-clear-btn"
                aria-label="Clear search"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearExpenseCategorySearch();
                }}
              >
                ×
              </button>
            ) : null}
            <img
              src={searchIcon}
              alt="search"
              className="custom-search-icon"
              onClick={() => {
                applySearch();
              }}
            />
          </div>
        </div>
      </Col>
      <Col xs="auto" className="d-flex align-items-end">
        <Button
          variant="outline-secondary"
          size="sm"
          className="custom-btn-secondary px-3"
          type="button"
          disabled={!keyword.trim() && !searchDraft.trim() && !startDate && !endDate && sortBy.length === 0}
          onClick={() => {
            setKeyword("");
            setSearchDraft("");
            setStartDate("");
            setEndDate("");
            setSortBy([]);
            setTablePage(1);
            setValue("expense_category_start_date_filter", "", { shouldValidate: false });
            setValue("expense_category_end_date_filter", "", { shouldValidate: false });
          }}
        >
          Clear
        </Button>
      </Col>
    </Row>
  );

  return (
    <div className="main-page-content">
      <CustomHeader title="Expense Category Management"
       titlePrefix={<SettingsNav />}
       register={headerRegister}
       setValue={setHeaderValue}
        />

      <div className="box-container">
        <CustomSummaryBox
          divId="box-expense-category"
          title={capitalizeString("expense category")}
          data={expenseSummaryData}
          onSelect={(divId) => setSelectedBox(divId)}
          isSelected={selectedBox === "box-expense-category"}
          onFilterChange={() => {}}
          isAddShow={true}
          addButtonLable="Add Category"
          onAddClick={openAddForm}
        />
      </div>

      {filterControls}

      <CustomTable
        columns={columns}
        data={items}
        currentPage={Math.max(1, tablePage)}
        totalPages={tableTotalPages}
        pageSize={TABLE_PAGE_SIZE}
        onPageChange={(page) => setTablePage(page)}
        isPagination={tableTotalItems > 0}
        isLoading={isLoading}
        manualSortBy
        sortBy={sortBy}
        onSortChange={(next) => {
          setSortBy(next);
          setTablePage(1);
        }}
      />

      <Modal show={showForm} onHide={closeFormModal} centered>
          <Modal.Header className="py-3 px-4 border-bottom-0">
            <Modal.Title as="h5" className="custom-modal-title">
              {editing ? (isViewMode ? "Expense Category Information" : "Edit Expense Category") : "Add Expense Category"}
            </Modal.Title>
            <CustomCloseButton onClose={closeFormModal} />
          </Modal.Header>
          <Modal.Body className="px-4 pb-4 pt-0" style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {isViewMode && editing ? (
              <section className="custom-other-details" style={{ padding: "10px" }}>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h3 className="mb-0">Expense Category</h3>
                  <i
                    className="bi bi-pencil-fill fs-6 text-danger"
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setForm({
                        franchiseId: editing.franchiseId || "",
                        categoryName: editing.categoryName,
                        subCategoryName: editing.subCategoryName,
                        description: editing.description || "",
                      });
                      hydrateEditSubCategoryNames(editing);
                      syncEditFormWithRhf(editing);
                      setFormErrors({});
                      setIsViewMode(false);
                    }}
                  />
                </div>
                <div className="row">
                  <div className="custom-helper-column">
                    <DetailsRow title="Category Name" value={editing.categoryName} />
                   
                  </div>
                  <div className="custom-helper-column">
                    <div className="info-detail-inline-row">
                      <span className="info-detail-inline-label custom-personal-row-title">
                        Sub Category Name
                      </span>
                      <div className="info-detail-inline-value custom-personal-row-value text-break">
                        {subCategoryNamesForRow(editing).length > 0 ? (
                          <ul className="mb-0 ps-3">
                            {subCategoryNamesForRow(editing).map((name, idx) => (
                              <li key={`${name}-${idx}`}>{name}</li>
                            ))}
                          </ul>
                        ) : (
                          "-"
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="custom-helper-column">
                    <DetailsRow
                      title="Franchise Name"
                      value={
                        String(editing.franchiseName ?? "").trim() ||
                        (String(editing.franchiseId ?? "").trim() &&
                          franchiseIdToName.get(
                            String(editing.franchiseId).trim()
                          )) ||
                        "-"
                      }
                    />
                  </div>
                  <div className="custom-helper-column">
                    <DetailsRow title="Created Date" value={formatDate(editing.createdDate)} />
                  </div>   
                </div>
                <div className="mt-3 p-3 border rounded">
                  <div className="custom-personal-row-title mb-2">Description</div>
                  <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--txt-color)" }}>
                    {editing.description?.trim() || "-"}
                  </div>
                </div>
              </section>
            ) : (
              <div className="row g-2">
                <div className="col-md-12">
                  <CustomFormSelect
                    key={`expense-category-franchise-${editing?.id ?? `add-${addFormKey}`}`}
                    label="Franchise"
                    controlId="expense_category_franchise_id"
                    showRequiredMark
                    options={[
                      { value: "", label: "Select Franchise" },
                      ...franchiseOptions.map((item) => ({ value: item.value, label: item.label })),
                    ]}
                    register={register}
                    fieldName="expense_category_franchise_id"
                    asCol={false}
                    defaultValue={form.franchiseId}
                    error={
                      formErrors.franchiseId
                        ? ({ message: formErrors.franchiseId } as any)
                        : undefined
                    }
                    setValue={setValue}
                    onChange={(e) => {
                      setForm((p: typeof emptyForm) => ({ ...p, franchiseId: e.target.value }));
                      setFormErrors((prev) => ({ ...prev, franchiseId: undefined }));
                    }}
                    menuPortal
                  />
                </div>
                <div className="col-md-12">
                  <CustomFormInput
                    key={`expense-category-name-${editing?.id ?? `add-${addFormKey}`}`}
                    label="Category Name"
                    controlId="expense_category_name"
                    showRequiredMark
                    placeholder="Enter Category Name"
                    register={register}
                    asCol={false}
                    error={
                      formErrors.categoryName
                        ? ({ message: formErrors.categoryName } as any)
                        : undefined
                    }
                    value={form.categoryName}
                    onChange={(value: string) => {
                      setForm((p) => ({ ...p, categoryName: value }));
                      setFormErrors((prev) => ({ ...prev, categoryName: undefined }));
                    }}
                  />
                </div>
                <div className="col-md-12">
                  {editing ? (
                    <ExpenseSubCategoryNamesEditor
                      rowKeyPrefix={`edit-sub-category-${editing.id}`}
                      names={editSubCategoryNames}
                      error={formErrors.subCategoryNames}
                      removeMode="edit"
                      onChange={setEditSubCategoryNames}
                      onClearError={() =>
                        setFormErrors((prev) => ({
                          ...prev,
                          subCategoryNames: undefined,
                        }))
                      }
                    />
                  ) : (
                    <ExpenseSubCategoryNamesEditor
                      rowKeyPrefix={`add-sub-category-${addFormKey}`}
                      names={addSubCategoryNames}
                      error={formErrors.subCategoryNames}
                      removeMode="add"
                      onChange={setAddSubCategoryNames}
                      onClearError={() =>
                        setFormErrors((prev) => ({
                          ...prev,
                          subCategoryNames: undefined,
                        }))
                      }
                    />
                  )}
                </div>
                <div className="col-md-12">
                  <CustomFormInput
                    key={`expense-description-${editing?.id ?? `add-${addFormKey}`}`}
                    label="Description"
                    controlId="expense_category_description"
                    placeholder="Enter Description"
                    register={register}
                    showRequiredMark
                    asCol={false}
                    as="textarea"
                    rows={3}
                    value={form.description}
                    onChange={(value: string) => setForm((p) => ({ ...p, description: value }))}
                  />
                </div>
              </div>
            )}
          </Modal.Body>
          {!isViewMode && (
            <Modal.Footer>
              <Button variant="secondary" onClick={closeFormModal}>Cancel</Button>
              <Button
                className="btn-danger"
                onClick={async () => {
                  const nextErrors: ExpenseCategoryFormErrors = {};
                  if (!form.franchiseId.trim()) nextErrors.franchiseId = "Franchise is required";
                  if (!form.categoryName.trim()) nextErrors.categoryName = "Category Name is required";
                  const trimmedAddSubCategories = addSubCategoryNames
                    .map((name) => name.trim())
                    .filter(Boolean);
                  const trimmedEditSubCategories = editSubCategoryNames
                    .map((name) => name.trim())
                    .filter(Boolean);
                  if (editing) {
                    if (trimmedEditSubCategories.length === 0) {
                      nextErrors.subCategoryNames =
                        "At least one Sub Category Name is required";
                    }
                  } else if (trimmedAddSubCategories.length === 0) {
                    nextErrors.subCategoryNames =
                      "At least one Sub Category Name is required";
                  }
                  setFormErrors(nextErrors);
                  if (Object.keys(nextErrors).length > 0) {
                    return;
                  }
                  const selectedFranchise = franchiseOptions.find((item) => item.value === form.franchiseId);
                  const ok = await saveExpenseCategoryWithApi(
                    editing
                      ? {
                          franchiseId: form.franchiseId,
                          franchiseName: selectedFranchise?.label || "",
                          categoryName: form.categoryName,
                          subCategoryName: trimmedEditSubCategories[0] || "",
                          subCategoryNames: trimmedEditSubCategories,
                          description: form.description,
                        }
                      : {
                          franchiseId: form.franchiseId,
                          franchiseName: selectedFranchise?.label || "",
                          categoryName: form.categoryName,
                          subCategoryName: "",
                          subCategoryNames: trimmedAddSubCategories,
                          description: form.description,
                        },
                    editing?.id
                  );
                  if (!ok) return;
                  setForm(emptyForm);
                  setAddSubCategoryNames([...emptyAddSubCategoryNames]);
                  setEditSubCategoryNames([...emptyAddSubCategoryNames]);
                  setEditing(null);
                  setIsViewMode(false);
                  setShowForm(false);
                  setFormErrors({});
                  refresh();
                }}
              >
                {editing ? "Update" : "Save"}
              </Button>
            </Modal.Footer>
          )}
      </Modal>
    </div>
  );
};

export default ExpenseCategoryManagement;
