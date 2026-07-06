import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Row, Col, Button, Form } from "react-bootstrap";
import CustomMultiSelect from "../../components/CustomMultiSelect";
import CustomDatePicker from "../../components/CustomDatePicker";
import { useForm, UseFormRegister } from "react-hook-form";
import { fetchCategoryDropDown } from "../../services/categoryService";
import { fetchServiceDropDown } from "../../services/servicesService";
import type { ServiceDropDownOption } from "../../services/servicesService";
import { UserModel } from "../../lib/models/UserModel";
import { exportData } from "../../services/exportService";
import { ApiPaths } from "../../lib/global/remote/apiPaths";
import { buildOrderReportExportPayload } from "../../lib/reports/reportExportPayload";
import {
  reportAllOption as allOption,
  reportFilterLabelClass as filterLabelClass,
  reportMultiSelectChipsMaxHeight as multiSelectChipsMaxHeight,
  reportToIsoCalendarDate as toIsoCalendarDate,
  CUSTOMER_USER_TYPE,
  PARTNER_USER_TYPE,
} from "../../lib/reports/reportFilterConstants";
import type { ReportOptionType } from "../../lib/reports/reportFilterConstants";

type OptionType = ReportOptionType;

type OrderReportsPageProps = {
  franchiseId?: string;
};

const PARTNER_PAYMENT_FILTER_OPTIONS: OptionType[] = [
  allOption,
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "completed", label: "Completed" },
];

const CUSTOMER_PAYMENT_FILTER_OPTIONS: OptionType[] = [
  allOption,
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "refund", label: "Refund" },
  { value: "partially_refund", label: "Partially Refund" },
  { value: "completed", label: "Completed" },
];

function userToOption(u: UserModel): OptionType | null {
  const id = String(u._id ?? "").trim();
  if (!id) return null;
  const label =
    (u.name && String(u.name).trim()) ||
    u.user_id ||
    u.phone_number ||
    id;
  return { value: id, label: String(label) };
}

function partnerCategoryIds(partner: UserModel): string[] {
  const ids = new Set<string>();
  for (const raw of partner.category_ids ?? []) {
    const id = String(raw ?? "").trim();
    if (id) ids.add(id);
  }
  for (const ps of partner.partner_services ?? []) {
    const ref = ps.category_id;
    let cid = "";
    if (ref != null && typeof ref === "object") {
      cid = String((ref as { _id?: string })._id ?? "").trim();
    } else if (ref != null) {
      cid = String(ref).trim();
    }
    if (cid) ids.add(cid);
  }
  return Array.from(ids);
}

async function loadAllPartnerRows(
  franchiseId: string
): Promise<UserModel[]> {
  const { fetchUser } = await import("../../services/userService");
  const pageSize = 250;
  const first = await fetchUser(false, PARTNER_USER_TYPE, 1, pageSize, {
    status: "true",
    franchise_id: franchiseId,
  });
  if (!first.response) return [];
  let all = [...first.users];
  for (let page = 2; page <= first.totalPages; page++) {
    const next = await fetchUser(false, PARTNER_USER_TYPE, page, pageSize, {
      status: "true",
      franchise_id: franchiseId,
    });
    if (next.response) {
      all = all.concat(next.users);
    }
  }
  return all;
}

const OrderReportsPage = ({ franchiseId = "all" }: OrderReportsPageProps) => {
  const [orderFromDate, setOrderFromDate] = useState("");
  const [orderToDate, setOrderToDate] = useState("");
  const { register: reportFilterRegister, setValue: setReportFilterValue } =
    useForm<{
      order_from_date: string;
      order_to_date: string;
    }>({
      defaultValues: {
        order_from_date: "",
        order_to_date: "",
      },
    });

  const [userSelections, setUserSelections] = useState<OptionType[]>([]);
  const [orderStatus, setOrderStatus] = useState<OptionType[]>([]);
  const [partnerPaymentStatus, setPartnerPaymentStatus] = useState<
    OptionType[]
  >([]);
  const [customerPaymentStatus, setCustomerPaymentStatus] = useState<
    OptionType[]
  >([]);
  const [services, setServices] = useState<OptionType[]>([]);
  const [categories, setCategories] = useState<OptionType[]>([]);
  const [partners, setPartners] = useState<OptionType[]>([]);

  const [allCategoryOptions, setAllCategoryOptions] = useState<OptionType[]>(
    []
  );
  const [allServiceRows, setAllServiceRows] = useState<ServiceDropDownOption[]>(
    []
  );
  const [allPartnerRows, setAllPartnerRows] = useState<UserModel[]>([]);
  const [allUserRows, setAllUserRows] = useState<UserModel[]>([]);

  const optionsLoadedRef = useRef({
    categories: false,
    services: false,
    partners: false,
    users: false,
  });
  const partnersFranchiseKeyRef = useRef("");
  const usersFranchiseKeyRef = useRef("");

  const orderStatusOptions = useMemo((): OptionType[] => {
    return [
      allOption,
      { value: "2", label: "In Progress" },
      { value: "3", label: "Completed" },
      { value: "4", label: "Cancelled" },
      { value: "5", label: "Refunded" },
    ];
  }, []);

  const partnerOptions = useMemo((): OptionType[] => {
    const opts = allPartnerRows
      .map(userToOption)
      .filter((x): x is OptionType => x != null);
    opts.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
    return [allOption, ...opts];
  }, [allPartnerRows]);

  const userOptions = useMemo((): OptionType[] => {
    const opts = allUserRows
      .map(userToOption)
      .filter((x): x is OptionType => x != null);
    opts.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
    return [allOption, ...opts];
  }, [allUserRows]);

  const categoryOptions = useMemo((): OptionType[] => {
    const selectedPartnerIds = partners
      .filter((p) => p.value !== "all")
      .map((p) => p.value);

    if (selectedPartnerIds.length === 0) {
      return [allOption, ...allCategoryOptions];
    }

    const allowed = new Set<string>();
    for (const pid of selectedPartnerIds) {
      const partner = allPartnerRows.find((r) => String(r._id) === pid);
      if (partner) {
        partnerCategoryIds(partner).forEach((id) => allowed.add(id));
      }
    }

    const byId = new Map(allCategoryOptions.map((c) => [c.value, c]));
    const filtered: OptionType[] = [];
    allowed.forEach((id) => {
      const hit = byId.get(id);
      if (hit) filtered.push(hit);
    });

    for (const sel of categories) {
      if (sel.value === "all") continue;
      if (!filtered.some((c) => c.value === sel.value)) {
        const hit = byId.get(sel.value);
        if (hit) filtered.push(hit);
      }
    }

    filtered.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
    return [allOption, ...filtered];
  }, [partners, allPartnerRows, allCategoryOptions, categories]);

  const serviceOptions = useMemo((): OptionType[] => {
    const selectedCategoryIds = categories
      .filter((c) => c.value !== "all")
      .map((c) => c.value);

    let rows = allServiceRows;
    if (selectedCategoryIds.length > 0) {
      const allowed = new Set(selectedCategoryIds);
      rows = allServiceRows.filter(
        (s) => s.category_id && allowed.has(String(s.category_id))
      );
    }

    const opts = rows
      .filter((s) => s?.value)
      .map((s) => ({ value: s.value, label: s.label }));

    for (const sel of services) {
      if (sel.value === "all") continue;
      if (!opts.some((o) => o.value === sel.value)) {
        const hit = allServiceRows.find((s) => s.value === sel.value);
        if (hit) opts.push({ value: hit.value, label: hit.label });
      }
    }

    opts.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
    return [allOption, ...opts];
  }, [categories, allServiceRows, services]);

  const handleSelectWithAll = (
    selected: OptionType[],
    setter: (val: OptionType[]) => void
  ) => {
    const hasAll = selected.some((item) => item.value === "all");
    if (hasAll) {
      setter([allOption]);
    } else {
      setter(selected.filter((item) => item.value !== "all"));
    }
  };

  useEffect(() => {
    optionsLoadedRef.current.partners = false;
    optionsLoadedRef.current.users = false;
    partnersFranchiseKeyRef.current = "";
    usersFranchiseKeyRef.current = "";
    setAllPartnerRows([]);
    setAllUserRows([]);
    setPartners([]);
    setUserSelections([]);
  }, [franchiseId]);

  const loadCategoryOptions = useCallback(async () => {
    if (optionsLoadedRef.current.categories) return;
    optionsLoadedRef.current.categories = true;
    try {
      const rows = await fetchCategoryDropDown();
      setAllCategoryOptions(
        rows
          .filter((c) => c?.value)
          .map((c) => ({ value: c.value, label: c.label }))
      );
    } catch {
      optionsLoadedRef.current.categories = false;
    }
  }, []);

  const loadServiceOptions = useCallback(async () => {
    if (optionsLoadedRef.current.services) return;
    optionsLoadedRef.current.services = true;
    try {
      const rows = await fetchServiceDropDown();
      setAllServiceRows(rows.filter((s) => s?.value));
    } catch {
      optionsLoadedRef.current.services = false;
      setAllServiceRows([]);
    }
  }, []);

  const loadPartnerOptions = useCallback(async () => {
    const key = String(franchiseId ?? "all");
    if (
      optionsLoadedRef.current.partners &&
      partnersFranchiseKeyRef.current === key
    ) {
      return;
    }
    optionsLoadedRef.current.partners = true;
    partnersFranchiseKeyRef.current = key;
    try {
      const rows = await loadAllPartnerRows(franchiseId);
      setAllPartnerRows(rows);
    } catch {
      optionsLoadedRef.current.partners = false;
      partnersFranchiseKeyRef.current = "";
      setAllPartnerRows([]);
    }
  }, [franchiseId]);

  const loadUserOptions = useCallback(async () => {
    const key = String(franchiseId ?? "all");
    if (
      optionsLoadedRef.current.users &&
      usersFranchiseKeyRef.current === key
    ) {
      return;
    }
    optionsLoadedRef.current.users = true;
    usersFranchiseKeyRef.current = key;
    try {
      const { fetchUserDropDown } = await import("../../services/userService");
      const userDrop = await fetchUserDropDown(CUSTOMER_USER_TYPE, undefined, {
        franchise_id: franchiseId,
      });
      setAllUserRows(userDrop.users.filter((u) => u?._id));
    } catch {
      optionsLoadedRef.current.users = false;
      usersFranchiseKeyRef.current = "";
      setAllUserRows([]);
    }
  }, [franchiseId]);

  useEffect(() => {
    setCategories((prev) => {
      const valid = new Set(categoryOptions.map((o) => o.value));
      if (prev.every((p) => p.value === "all" || valid.has(p.value))) {
        return prev;
      }
      return prev.filter((p) => p.value === "all" || valid.has(p.value));
    });
  }, [categoryOptions]);

  useEffect(() => {
    setServices((prev) => {
      const valid = new Set(serviceOptions.map((o) => o.value));
      if (prev.every((p) => p.value === "all" || valid.has(p.value))) {
        return prev;
      }
      return prev.filter((p) => p.value === "all" || valid.has(p.value));
    });
  }, [serviceOptions]);

  useEffect(() => {
    setPartners((prev) => {
      const valid = new Set(partnerOptions.map((o) => o.value));
      if (prev.every((p) => p.value === "all" || valid.has(p.value))) {
        return prev;
      }
      return prev.filter((p) => p.value === "all" || valid.has(p.value));
    });
  }, [partnerOptions]);

  useEffect(() => {
    setUserSelections((prev) => {
      const valid = new Set(userOptions.map((o) => o.value));
      if (prev.every((p) => p.value === "all" || valid.has(p.value))) {
        return prev;
      }
      return prev.filter((p) => p.value === "all" || valid.has(p.value));
    });
  }, [userOptions]);

  const handleExport = async () => {
    await exportData(
      ApiPaths.EXPORT_ORDER_REPORT,
      buildOrderReportExportPayload({
        fromDate: orderFromDate,
        toDate: orderToDate,
        franchiseId,
        orderStatus,
        partnerPaymentStatus,
        customerPaymentStatus,
        categories,
        services,
        partners,
        users: userSelections,
      })
    );
  };

  const handleReset = () => {
    setOrderFromDate("");
    setOrderToDate("");
    setReportFilterValue("order_from_date", "");
    setReportFilterValue("order_to_date", "");
    setUserSelections([]);
    setOrderStatus([]);
    setPartnerPaymentStatus([]);
    setCustomerPaymentStatus([]);
    setServices([]);
    setCategories([]);
    setPartners([]);
  };

  return (
    <div className="mt-4">
      <div className="card border-0 shadow-sm rounded-3">
        <div className="card-body p-3 p-md-4">
          <Row className="align-items-center justify-content-between g-3 mb-3">
            <Col md={5} lg={4}>
              <h5 className="custom-utilty-box-title mb-1">Order Reports</h5>
              <small className="text-muted">
                Used to generate reports related to orders, payments, and
                services.
              </small>
            </Col>
            <Col md={6} lg={6}>
              <Row className="g-2 g-md-3">
                <Col sm={6}>
                  <Form.Label className="small fw-semibold mb-1">
                    From
                  </Form.Label>
                  <CustomDatePicker
                    label=""
                    controlId="order_from_date"
                    selectedDate={orderFromDate || null}
                    onChange={(date) =>
                      setOrderFromDate(toIsoCalendarDate(date))
                    }
                    register={
                      reportFilterRegister as unknown as UseFormRegister<any>
                    }
                    setValue={
                      setReportFilterValue as (name: string, value: any) => void
                    }
                    asCol={false}
                    groupClassName="mb-0 w-100"
                    filterDate={() => true}
                  />
                </Col>
                <Col sm={6}>
                  <Form.Label className="small fw-semibold mb-1">To</Form.Label>
                  <CustomDatePicker
                    label=""
                    controlId="order_to_date"
                    selectedDate={orderToDate || null}
                    onChange={(date) => setOrderToDate(toIsoCalendarDate(date))}
                    register={
                      reportFilterRegister as unknown as UseFormRegister<any>
                    }
                    setValue={
                      setReportFilterValue as (name: string, value: any) => void
                    }
                    asCol={false}
                    groupClassName="mb-0 w-100"
                    filterDate={() => true}
                  />
                </Col>
              </Row>
            </Col>
          </Row>

          <div className="border rounded-3 p-3 bg-light">
            <h6
              style={{ color: "var(--primary-txt-color)" }}
              className="fw-semibold mb-3"
            >
              Order filters
            </h6>
            <Row className="g-3">
              <Col md={6}>
                <Form.Label className={filterLabelClass}>
                  Order status
                </Form.Label>
                <CustomMultiSelect
                  label=""
                  controlId="Order status"
                  options={orderStatusOptions}
                  value={orderStatus}
                  onChange={(selectedOptions) =>
                    handleSelectWithAll(
                      selectedOptions as OptionType[],
                      setOrderStatus
                    )
                  }
                  asCol={false}
                  selectedChipsMaxHeight={multiSelectChipsMaxHeight}
                />
              </Col>

              <Col md={6}>
                <Form.Label className={filterLabelClass}>Partner</Form.Label>
                <CustomMultiSelect
                  label=""
                  controlId="Partner"
                  options={partnerOptions}
                  value={partners}
                  onChange={(selectedOptions) =>
                    handleSelectWithAll(
                      selectedOptions as OptionType[],
                      setPartners
                    )
                  }
                  onMenuOpen={() => void loadPartnerOptions()}
                  asCol={false}
                  selectedChipsMaxHeight={multiSelectChipsMaxHeight}
                />
              </Col>

              <Col md={6}>
                <Form.Label className={filterLabelClass}>Category</Form.Label>
                <CustomMultiSelect
                  label=""
                  controlId="Category"
                  options={categoryOptions}
                  value={categories}
                  onChange={(selectedOptions) =>
                    handleSelectWithAll(
                      selectedOptions as OptionType[],
                      setCategories
                    )
                  }
                  onMenuOpen={() => void loadCategoryOptions()}
                  asCol={false}
                  selectedChipsMaxHeight={multiSelectChipsMaxHeight}
                />
              </Col>

              <Col md={6}>
                <Form.Label className={filterLabelClass}>Service</Form.Label>
                <CustomMultiSelect
                  label=""
                  controlId="Service"
                  options={serviceOptions}
                  value={services}
                  onChange={(selectedOptions) =>
                    handleSelectWithAll(
                      selectedOptions as OptionType[],
                      setServices
                    )
                  }
                  onMenuOpen={() => void loadServiceOptions()}
                  asCol={false}
                  selectedChipsMaxHeight={multiSelectChipsMaxHeight}
                />
              </Col>

              <Col md={6}>
                <Form.Label className={filterLabelClass}>User</Form.Label>
                <CustomMultiSelect
                  label=""
                  controlId="User"
                  options={userOptions}
                  value={userSelections}
                  onChange={(selectedOptions) =>
                    handleSelectWithAll(
                      selectedOptions as OptionType[],
                      setUserSelections
                    )
                  }
                  onMenuOpen={() => void loadUserOptions()}
                  asCol={false}
                  selectedChipsMaxHeight={multiSelectChipsMaxHeight}
                />
              </Col>

              <Col md={6}>
                <Form.Label className={filterLabelClass}>
                  Partner payment status
                </Form.Label>
                <CustomMultiSelect
                  label=""
                  controlId="Partner payment status"
                  options={PARTNER_PAYMENT_FILTER_OPTIONS}
                  value={partnerPaymentStatus}
                  onChange={(selectedOptions) =>
                    handleSelectWithAll(
                      selectedOptions as OptionType[],
                      setPartnerPaymentStatus
                    )
                  }
                  asCol={false}
                  selectedChipsMaxHeight={multiSelectChipsMaxHeight}
                />
              </Col>

              <Col md={6}>
                <Form.Label className={filterLabelClass}>
                  Customer payment status
                </Form.Label>
                <CustomMultiSelect
                  label=""
                  controlId="Customer payment status"
                  options={CUSTOMER_PAYMENT_FILTER_OPTIONS}
                  value={customerPaymentStatus}
                  onChange={(selectedOptions) =>
                    handleSelectWithAll(
                      selectedOptions as OptionType[],
                      setCustomerPaymentStatus
                    )
                  }
                  asCol={false}
                  selectedChipsMaxHeight={multiSelectChipsMaxHeight}
                />
              </Col>
            </Row>

            <Row className="mt-4 justify-content-end">
              <Col xs={6}>
                <div className="d-flex justify-content-end gap-2 mt-2">
                  <Button
                    size="sm"
                    className="custom-btn-secondary px-3"
                    onClick={handleReset}
                    style={{ minWidth: "30px" }}
                  >
                    Reset
                  </Button>

                  <Button
                    size="sm"
                    className="custom-btn-primary px-3"
                    style={{ width: "50px" }}
                    onClick={() => void handleExport()}
                  >
                    Export
                  </Button>
                </div>
              </Col>
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderReportsPage;
