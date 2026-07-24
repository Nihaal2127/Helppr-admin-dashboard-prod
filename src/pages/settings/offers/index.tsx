import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Col, Form, Modal, Row } from "react-bootstrap";
import { useForm } from "react-hook-form";
import CustomHeader from "../../../components/CustomHeader";
import SettingsNav from "../../../components/SettingsNav";
import CustomTable from "../../../components/CustomTable";
import CustomUtilityBox from "../../../components/CustomUtilityBox";
import CustomActionColumn from "../../../components/CustomActionColumn";
import CustomSummaryBox from "../../../components/CustomSummaryBox";
import { CustomFormInput } from "../../../components/CustomFormInput";
import CustomFormSelect from "../../../components/CustomFormSelect";
import CustomDatePicker from "../../../components/CustomDatePicker";
import {
  capitalizeString,
  DetailsRow,
  formatDate,
} from "../../../helper/utility";
import CustomCloseButton from "../../../components/CustomCloseButton";
import { dateToLocalYmd } from "../../../helper/dateFormat";
import type { ServerTableSortBy } from "../../../lib/global/serverTableSort";
import { showErrorAlert } from "../../../lib/global/alertHelper";
import {
  CouponModel,
  CouponSavePayload,
  createCoupon,
  fetchCouponsPage,
  updateCoupon,
  validateCouponPayload,
} from "./couponService";

type CouponType = "percentage" | "fixed";

type CouponFormState = {
  couponName: string;
  couponType: CouponType | "";
  couponValue: string;
  adminContribution: string;
  partnerContribution: string;
  startDate: string;
  endDate: string;
  status: "active" | "inactive";
};

const emptyForm: CouponFormState = {
  couponName: "",
  couponType: "",
  couponValue: "",
  adminContribution: "",
  partnerContribution: "",
  startDate: "",
  endDate: "",
  status: "active" as "active" | "inactive",
};

const TABLE_PAGE_SIZE = 10;

const CouponManagement = () => {
  const { register, setValue } = useForm<any>();
  const [coupons, setCoupons] = useState<CouponModel[]>([]);
  const [keyword, setKeyword] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchClearVersion, setSearchClearVersion] = useState(0);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState<ServerTableSortBy>([
    { id: "couponName", desc: false },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CouponModel | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isViewMode, setIsViewMode] = useState(false);
  const [selectedBox, setSelectedBox] = useState("box-coupons");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const [tableTotalPages, setTableTotalPages] = useState(1);
  const [tableTotalItems, setTableTotalItems] = useState(0);
  const [formInstanceKey, setFormInstanceKey] = useState(0);

  const toFiniteNumber = useCallback((value: string) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }, []);

  const capByCouponValue = useCallback(
    (value: string, couponValue: string) => {
      if (String(value ?? "").trim() === "") return "";
      const coupon = Math.max(0, toFiniteNumber(couponValue));
      const next = Math.max(0, toFiniteNumber(value));
      return Math.min(next, coupon);
    },
    [toFiniteNumber]
  );

  const clampPercentageField = useCallback(
    (value: string) => {
      if (form.couponType !== "percentage") return value;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return value;
      return String(Math.min(100, Math.max(0, parsed)));
    },
    [form.couponType]
  );

  const closeFormModal = () => {
    setFormInstanceKey((k) => k + 1);
    setShowForm(false);
    setIsViewMode(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const mapCouponToForm = (item: CouponModel): CouponFormState => ({
    couponName: item.offerName,
    couponType: item.offerType,
    couponValue: String(item.totalOfferValue),
    adminContribution: String(item.adminContribution),
    partnerContribution: String(item.partnerContribution),
    startDate: item.startDate ? item.startDate.split("T")[0] : "",
    endDate: item.endDate ? item.endDate.split("T")[0] : "",
    status: item.status,
  });

  const syncFormWithRHF = useCallback(
    (nextForm: CouponFormState) => {
      console.debug("[CouponManagement] syncFormWithRHF", {
        editingId: editing?.id ?? null,
        isViewMode,
        nextForm,
      });
      setForm(nextForm);
      setValue("coupon_name", nextForm.couponName, { shouldValidate: false });
      setValue("coupon_type", nextForm.couponType, { shouldValidate: false });
      setValue("coupon_value", nextForm.couponValue, { shouldValidate: false });
      setValue("admin_contribution", nextForm.adminContribution, {
        shouldValidate: false,
      });
      setValue("partner_contribution", nextForm.partnerContribution, {
        shouldValidate: false,
      });
      setValue("coupon_start_date", nextForm.startDate, { shouldValidate: false });
      setValue("coupon_end_date", nextForm.endDate, { shouldValidate: false });
      setValue("coupon_status", nextForm.status, { shouldValidate: false });
    },
    [editing?.id, isViewMode, setValue]
  );

  useEffect(() => {
    if (!showForm || !editing || isViewMode) return;
    syncFormWithRHF(mapCouponToForm(editing));
  }, [editing, isViewMode, showForm, syncFormWithRHF]);

  useEffect(() => {
    if (!showForm) return;
    console.debug("[CouponManagement] modal state", {
      showForm,
      isViewMode,
      editingId: editing?.id ?? null,
      editingName: editing?.offerName ?? null,
      formSnapshot: form,
    });
  }, [editing?.id, editing?.offerName, form, isViewMode, showForm]);

  const openFormWithData = (item?: CouponModel, viewMode = false) => {
    setFormInstanceKey((k) => k + 1);

    if (!item) {
      setEditing(null);
      syncFormWithRHF(emptyForm);
      setIsViewMode(false);
      setShowForm(true);
      return;
    }

    setIsViewMode(viewMode);
    setShowForm(true);
    setEditing(item);
    syncFormWithRHF(mapCouponToForm(item));
  };

  const listSort = useMemo(() => {
    const primary = sortBy[0];
    const sortField =
      primary?.id === "totalOfferValue" || primary?.id === "couponValue"
        ? "value"
        : "name";
    return {
      sortBy: sortField as "name" | "value",
      sortOrder: (primary?.desc ? "desc" : "asc") as "asc" | "desc",
    };
  }, [sortBy]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const pageData = await fetchCouponsPage(tablePage, TABLE_PAGE_SIZE, {
      name: keyword.trim(),
      status: statusFilter,
      startDate: fromDate.trim() || undefined,
      endDate: toDate.trim() || undefined,
      sortBy: listSort.sortBy,
      sortOrder: listSort.sortOrder,
    });
    setIsLoading(false);
    if (!pageData) return;
    const safeTotalPages = Math.max(1, Number(pageData.totalPages) || 1);
    const safeCurrentPage = Math.min(
      safeTotalPages,
      Math.max(1, Number(pageData.currentPage) || 1)
    );
    setCoupons(pageData.rows);
    setTableTotalPages(safeTotalPages);
    setTableTotalItems(pageData.totalItems);
    if (safeCurrentPage !== tablePage) {
      setTablePage(safeCurrentPage);
    }
  }, [fromDate, keyword, listSort.sortBy, listSort.sortOrder, statusFilter, tablePage, toDate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const couponSummaryData = useMemo(
    () => ({
      Total: tableTotalItems,
    }),
    [tableTotalItems]
  );

  const downloadCsv = () => {
    const header = [
      "Coupon ID",
      "Coupon Name",
      "Coupon Type",
      "Coupon Value",
      "Admin Contribution",
      "Partner Contribution",
      "Start Date",
      "End Date",
      "Status",
    ];
    const rows = coupons.map((item) => [
      item.offerId,
      item.offerName,
      item.offerType,
      item.totalOfferValue,
      item.adminContribution,
      item.partnerContribution,
      item.startDate,
      item.endDate,
      item.status,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "coupons.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!form.couponType) {
      showErrorAlert("Coupon type is required.");
      return;
    }

    const payload: CouponSavePayload = {
      offerName: form.couponName.trim(),
      offerType: form.couponType,
      totalOfferValue: Number(form.couponValue || 0),
      adminContribution: Number(form.adminContribution || 0),
      partnerContribution: Number(form.partnerContribution || 0),
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
    };

    const validationError = validateCouponPayload(payload);
    if (validationError) {
      showErrorAlert(validationError);
      return;
    }

    setIsSaving(true);
    const saved = editing
      ? await updateCoupon(editing.id, payload)
      : await createCoupon(payload);
    setIsSaving(false);

    if (!saved) return;
    closeFormModal();
    await refresh();
  };

  const columns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "sr",
        Cell: ({ row }: any) =>
          (Math.max(1, tablePage) - 1) * TABLE_PAGE_SIZE + row.index + 1,
      },
      {
        Header: "Coupon ID",
        accessor: "offerId",
        id: "couponId",
      },
      { Header: "Coupon Name", accessor: "offerName", id: "couponName" },
      {
        Header: "Coupon Type",
        accessor: "offerType",
        id: "couponType",
        Cell: ({ row }: any) =>
          row.original.offerType === "percentage"
            ? "Percentage (%)"
            : "Fixed Amount (Rs)",
      },
      {
        Header: "Coupon Value",
        accessor: "totalOfferValue",
        id: "totalOfferValue",
      },
      { Header: "Admin Contribution", accessor: "adminContribution" },
      { Header: "Partner Contribution", accessor: "partnerContribution" },
      {
        Header: "Start Date",
        accessor: "startDate",
        Cell: ({ row }: any) => formatDate(row.original.startDate),
      },
      {
        Header: "End Date",
        accessor: "endDate",
        Cell: ({ row }: any) => formatDate(row.original.endDate),
      },
      {
        Header: "Status",
        accessor: "status",
        Cell: ({ row }: any) => (
          <span
            className={
              row.original.status === "active"
                ? "custom-active"
                : "custom-inactive"
            }
          >
            {row.original.status === "active" ? "Active" : "Inactive"}
          </span>
        ),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: any) => (
          <CustomActionColumn
            row={row}
            onView={() => openFormWithData(row.original, true)}
          />
        ),
      },
    ],
    [refresh, tablePage]
  );

  const filterControls = (
    <Row className="row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 gx-3 gy-1 mt-2 mb-3 align-items-end">
      <Col>
        <CustomFormSelect
          label="Status"
          controlId="coupons_status_filter"
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
          register={register}
          fieldName="coupons_status_filter"
          asCol={false}
          noBottomMargin
          defaultValue={statusFilter}
          setValue={setValue}
          onChange={(e) => {
            setStatusFilter(e.target.value as "all" | "active" | "inactive");
            setTablePage(1);
          }}
        />
      </Col>
      <Col>
        <CustomDatePicker
          label="Start Date"
          controlId="coupons_start_date_filter"
          selectedDate={fromDate || null}
          onChange={(date) => {
            setFromDate(date ? dateToLocalYmd(date) : "");
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
      <Col>
        <CustomDatePicker
          label="End Date"
          controlId="coupons_end_date_filter"
          selectedDate={toDate || null}
          onChange={(date) => {
            setToDate(date ? dateToLocalYmd(date) : "");
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
      <Col xs="auto" className="d-flex align-items-end">
        <Button
          variant="outline-secondary"
          size="sm"
          className="custom-btn-secondary px-3"
          type="button"
          disabled={
            statusFilter === "all" &&
            !fromDate &&
            !toDate &&
            !keyword.trim() &&
            !searchDraft.trim()
          }
          onClick={() => {
            setStatusFilter("all");
            setFromDate("");
            setToDate("");
            setKeyword("");
            setSearchDraft("");
            setSearchClearVersion((v) => v + 1);
            setTablePage(1);
            setValue("coupons_status_filter", "all", { shouldValidate: false });
            setValue("coupons_start_date_filter", "", {
              shouldValidate: false,
            });
            setValue("coupons_end_date_filter", "", { shouldValidate: false });
          }}
        >
          Clear
        </Button>
      </Col>
    </Row>
  );

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Coupon Management"
        titlePrefix={<SettingsNav />}
        register={register}
        setValue={setValue}
      />

      <div className="box-container">
        <CustomSummaryBox
          divId="box-coupons"
          title={capitalizeString("coupons")}
          data={couponSummaryData}
          onSelect={(divId) => setSelectedBox(divId)}
          isSelected={selectedBox === "box-coupons"}
          onFilterChange={(filter) => {
            if (filter.status === "true") setStatusFilter("active");
            else if (filter.status === "false") setStatusFilter("inactive");
            else setStatusFilter("all");
            setTablePage(1);
          }}
          isAddShow={true}
          addButtonLable="Add Coupon"
          onAddClick={() => openFormWithData()}
        />
      </div>

      <CustomUtilityBox
        title="Coupons"
        searchHint="Search Coupon Name / Coupon ID"
        searchOnlyToolbar
        onSearch={(value) => {
          setKeyword(value);
          setSearchDraft(value);
          setTablePage(1);
        }}
        onSearchInputChange={setSearchDraft}
        syncKeyword={keyword}
        searchClearVersion={searchClearVersion}
        onSortClick={(value) => {
          setSortBy([{ id: "couponName", desc: value === "-1" }]);
          setTablePage(1);
        }}
        onDownloadClick={downloadCsv}
        onMoreClick={() => {}}
      />

      {filterControls}

      <CustomTable
        columns={columns}
        data={coupons}
        currentPage={tablePage}
        totalPages={tableTotalPages}
        pageSize={TABLE_PAGE_SIZE}
        onPageChange={setTablePage}
        
        isLoading={isLoading}
      />

      <Modal
        key={`coupon-modal-${editing?.id ?? "new"}-${isViewMode ? "view" : "edit"}-${formInstanceKey}`}
        show={showForm}
        onHide={closeFormModal}
        centered
        size="lg"
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            {editing
              ? isViewMode
                ? "Coupon Information"
                : "Edit Coupon"
              : "Add Coupon"}
          </Modal.Title>
          <CustomCloseButton onClose={closeFormModal} />
        </Modal.Header>
        <Modal.Body
          className="px-4 pb-4 pt-0"
          style={{ maxHeight: "70vh", overflowY: "auto" }}
        >
          {isViewMode && editing ? (
            <section
              className="custom-other-details"
              style={{ padding: "10px" }}
            >
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h3 className="mb-0">Coupon</h3>
                <i
                  className="bi bi-pencil-fill fs-6 text-danger"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setFormInstanceKey((k) => k + 1);
                    setIsViewMode(false);
                  }}
                />
              </div>
              <div className="row">
                <div className="col-md-6 custom-helper-column">
                  <DetailsRow title="Coupon ID" value={editing.offerId} />
                  <DetailsRow title="Coupon Name" value={editing.offerName} />
                  <DetailsRow
                    title="Coupon Type"
                    value={
                      editing.offerType === "percentage"
                        ? "Percentage (%)"
                        : "Fixed Amount (Rs)"
                    }
                  />
                  <DetailsRow
                    title="Start Date"
                    value={formatDate(editing.startDate)}
                  />
                </div>
                <div className="col-md-6 custom-helper-column">
                  <DetailsRow
                    title="Coupon Value"
                    value={String(editing.totalOfferValue)}
                  />
                  <DetailsRow
                    title="Admin Contribution"
                    value={String(editing.adminContribution)}
                  />
                  <DetailsRow
                    title="Partner Contribution"
                    value={String(editing.partnerContribution)}
                  />
                  <DetailsRow
                    title="Status"
                    value={editing.status === "active" ? "Active" : "Inactive"}
                  />
                  <DetailsRow
                    title="End Date"
                    value={formatDate(editing.endDate)}
                  />
                </div>
              </div>
            </section>
          ) : (
            <div className="row gx-3 gy-2" key={`coupon-form-${formInstanceKey}`}>
              <div className="col-md-12">
                <CustomFormInput
                  label="Coupon Name"
                  controlId="coupon_name"
                  placeholder="Enter Coupon Name"
                  register={register}
                  asCol={false}
                  value={form.couponName}
                  onChange={(value: string) =>
                    setForm((p) => ({ ...p, couponName: value }))
                  }
                />
              </div>
              <div className="col-md-6">
                <CustomFormSelect
                  label="Coupon Type"
                  controlId="coupon_type"
                  options={[
                    { value: "percentage", label: "Percentage" },
                    { value: "fixed", label: "Fixed" },
                  ]}
                  register={register}
                  fieldName="coupon_type"
                  asCol={false}
                  placeholder="Select type"
                  defaultValue={form.couponType}
                  setValue={setValue}
                  onChange={(e) => {
                    const nextType = e.target.value as CouponType | "";
                    const nextCouponValue =
                      nextType === "percentage"
                        ? clampPercentageField(form.couponValue)
                        : form.couponValue;
                    setForm((p) => ({
                      ...p,
                      couponType: nextType,
                      couponValue: nextCouponValue,
                      adminContribution:
                        String(
                          capByCouponValue(
                            nextType === "percentage"
                              ? clampPercentageField(p.adminContribution)
                              : p.adminContribution,
                            nextCouponValue
                          )
                        ),
                      partnerContribution:
                        String(
                          capByCouponValue(
                            nextType === "percentage"
                              ? clampPercentageField(p.partnerContribution)
                              : p.partnerContribution,
                            nextCouponValue
                          )
                        ),
                    }));
                  }}
                />
              </div>
              <div className="col-md-6">
                <CustomFormInput
                  label="Coupon Value"
                  controlId="coupon_value"
                  placeholder="Enter Coupon Value"
                  register={register}
                  asCol={false}
                  inputType="number"
                  value={form.couponValue}
                  onChange={(value: string) => {
                    const nextCouponValue = clampPercentageField(value);
                    setForm((p) => {
                      const nextAdmin = capByCouponValue(
                        p.adminContribution,
                        nextCouponValue
                      );
                      let nextPartner = capByCouponValue(
                        p.partnerContribution,
                        nextCouponValue
                      );
                      const coupon = Math.max(0, toFiniteNumber(nextCouponValue));
                      const adminN =
                        String(nextAdmin).trim() === ""
                          ? 0
                          : toFiniteNumber(String(nextAdmin));
                      const partnerN =
                        String(nextPartner).trim() === ""
                          ? 0
                          : toFiniteNumber(String(nextPartner));
                      if (adminN + partnerN > coupon && String(nextPartner).trim() !== "") {
                        nextPartner = Math.max(0, coupon - adminN);
                      }
                      return {
                        ...p,
                        couponValue: nextCouponValue,
                        adminContribution:
                          String(nextAdmin).trim() === ""
                            ? ""
                            : String(nextAdmin),
                        partnerContribution:
                          String(nextPartner).trim() === ""
                            ? ""
                            : String(nextPartner),
                      };
                    });
                  }}
                />
              </div>
              <div className="col-md-6">
                <CustomFormInput
                  label="Admin Contribution"
                  controlId="admin_contribution"
                  placeholder="Enter Admin Contribution"
                  register={register}
                  asCol={false}
                  inputType="number"
                  value={form.adminContribution}
                  onChange={(value: string) => {
                    const nextAdmin = clampPercentageField(value);
                    const couponValue = Math.max(0, toFiniteNumber(form.couponValue));
                    const partnerCurrent = toFiniteNumber(form.partnerContribution);
                    const maxAdmin = Math.max(0, couponValue - partnerCurrent);
                    const adminValue =
                      String(nextAdmin).trim() === ""
                        ? ""
                        : String(Math.min(Math.max(0, toFiniteNumber(nextAdmin)), maxAdmin));
                    setForm((p) => ({ ...p, adminContribution: adminValue }));
                  }}
                />
              </div>
              <div className="col-md-6">
                <CustomFormInput
                  label="Partner Contribution"
                  controlId="partner_contribution"
                  placeholder="Enter Partner Contribution"
                  register={register}
                  asCol={false}
                  inputType="number"
                  value={form.partnerContribution}
                  onChange={(value: string) => {
                    const nextPartner = clampPercentageField(value);
                    const couponValue = Math.max(0, toFiniteNumber(form.couponValue));
                    const adminCurrent = toFiniteNumber(form.adminContribution);
                    const maxPartner = Math.max(0, couponValue - adminCurrent);
                    const partnerValue =
                      String(nextPartner).trim() === ""
                        ? ""
                        : String(
                            Math.min(
                              Math.max(0, toFiniteNumber(nextPartner)),
                              maxPartner
                            )
                          );
                    setForm((p) => ({ ...p, partnerContribution: partnerValue }));
                  }}
                />
              </div>
              <div className="col-md-6">
                <Form.Label className="mb-1 fw-medium">Start Date</Form.Label>
                <CustomDatePicker
                  label=""
                  controlId="coupon_start_date"
                  selectedDate={form.startDate || null}
                  onChange={(date) => {
                    const next = date ? dateToLocalYmd(date) : "";
                    setForm((p) => ({ ...p, startDate: next }));
                  }}
                  register={register}
                  setValue={setValue}
                  asCol={false}
                  groupClassName="mb-0 w-100 "
                  placeholderText="Start Date"
                  filterDate={() => true}
                />
              </div>
              <div className="col-md-6">
                <Form.Label className="mb-1 fw-medium">End Date</Form.Label>
                <CustomDatePicker
                  label=""
                  controlId="coupon_end_date"
                  selectedDate={form.endDate || null}
                  onChange={(date) => {
                    const next = date ? dateToLocalYmd(date) : "";
                    setForm((p) => ({ ...p, endDate: next }));
                  }}
                  register={register}
                  setValue={setValue}
                  asCol={false}
                  groupClassName="mb-0 w-100"
                  placeholderText="End Date"
                  filterDate={() => true}
                />
              </div>
              <div className="col-md-6">
                <Form.Group style={{ marginTop: "10px" }}>
                  <Form.Label className="fw-medium mb-1">Status</Form.Label>
                  <div
                    className="d-flex"
                    style={{ flexDirection: "row", gap: "8px" }}
                  >
                    <Form.Check
                      type="radio"
                      id="coupon_status_active"
                      label={<span className="custom-radio-text">Active</span>}
                      value="active"
                      checked={form.status === "active"}
                      onChange={() =>
                        setForm((p) => ({ ...p, status: "active" }))
                      }
                      className="custom-radio-check"
                    />
                    <Form.Check
                      type="radio"
                      id="coupon_status_inactive"
                      label={
                        <span className="custom-radio-text">Inactive</span>
                      }
                      value="inactive"
                      checked={form.status === "inactive"}
                      onChange={() =>
                        setForm((p) => ({ ...p, status: "inactive" }))
                      }
                      className="custom-radio-check"
                    />
                  </div>
                </Form.Group>
              </div>
            </div>
          )}
        </Modal.Body>
        {!isViewMode && (
          <Modal.Footer>
            <Button variant="secondary" onClick={closeFormModal}>
              Cancel
            </Button>
            <Button
              className="btn-danger"
              disabled={isSaving}
              onClick={() => void handleSave()}
            >
              {isSaving ? "Saving…" : editing ? "Update" : "Save"}
            </Button>
          </Modal.Footer>
        )}
      </Modal>
    </div>
  );
};

export default CouponManagement;
