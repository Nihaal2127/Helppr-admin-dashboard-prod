/**
 * Order view / edit modals (info dialog): partner, user, employee, status, payment.
 */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col, Form, Table } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import OrderAmountSummaryPanel from "../../components/order/OrderAmountSummaryPanel";
import { buildOrderAmountSummaryFromOrder } from "../../lib/order/orderAmountSummary";
import {
  buildOrderEmployeeUpdatePayload,
  buildOrderHeaderPatchPayload,
  buildOrderPaymentUpdatePayload,
  buildOrderUserUpdatePayload,
  canAddAnotherCustomerPayment,
  canAddAnotherPartnerPayment,
  createOrUpdateOrder,
  isCustomerPaymentRowComplete,
  isPartnerPaymentRowComplete,
  roundMoney,
  updateOrderService,
} from "../../lib/order/orders";
import { fetchPartnerDropDown, fetchUserDropDown, APP_USER_TYPE } from "../../services/userService";
import CustomTextFieldSelect from "../../components/CustomTextFieldSelect";
import CustomFormSelect from "../../components/CustomFormSelect";
import { openDialog } from "../../lib/global/DialogManager";
import { OrderModel, OrderStatusEnum } from "../../lib/order/orders";
import { UserModel } from "../../lib/models/UserModel";
import { AppConstant } from "../../lib/global/AppConstant";
import {
  formatMoney2,
  normalizePaymentMethod,
  parseMoneyInput,
  paymentAmountFieldValue,
  paymentRowEffectiveAmount,
  paymentMethodSelectOptions,
  sanitizeMoneyInput,
} from "../../lib/global/paymentAndCurrency";
import { formatDate } from "../../helper/utility";
import CustomDatePicker from "../../components/CustomDatePicker";
import { CustomFormInput } from "../../components/CustomFormInput";
import { showErrorAlert } from "../../lib/global/alertHelper";
import { openConfirmDialog } from "../../components/CustomConfirmDialog";
import type {
  CustomerPaymentRow,
  OtherChargeRow,
  PartnerPaymentRow,
} from "../../lib/order/orderPaymentRows";
import type { OrderPaymentExtV1 } from "../../lib/order/orders";
import {
  computeOrderPaymentLineTotals,
  otherChargesTotal,
  sumCustomerAmounts,
  sumPartnerAmounts,
  resolvePaymentExtension,
  getServiceTaxCommissionPercents,
  customerPaidBalanceForEdit,
  validatePaymentExtAgainstCaps,
  hasRecordedOrderPayments,
  partnerPaidBalanceForEdit,
  getPrimaryServiceItem,
  orderRefundAmount,
  partnerPaymentsEditLocked,
  resolveOrderOfferBreakdown,
  getCustomerPaymentStatusLabel,
  getPartnerPaymentStatusLabel,
} from "../../lib/order/orders";
import { QUOTE_MODAL_LAYOUT } from "../../lib/quote/quoteHelpers";

/** --- AssignPartnerDialog --- */

type AssignPartnerDialogProps = {
  serviceId: string;
  selectedServiceId: string;
  onClose: () => void;
  onRefreshData: () => void;
};

const AssignPartnerDialog: React.FC<AssignPartnerDialogProps> & {
  show: (
    serviceId: string,
    selectedServiceId: string,
    onRefreshData: () => void
  ) => void;
} = ({ serviceId, selectedServiceId, onClose, onRefreshData }) => {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm();

  const [partners, setPartner] = useState<{ value: string; label: string }[]>(
    []
  );
  const fetchRef = useRef(false);

  const fetchPartnerFromApi = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const { partners } = await fetchPartnerDropDown(serviceId);
      setPartner(
        partners.map((partner: any) => ({
          value: partner.partner_id,
          label: partner.partner_name,
        }))
      );
    } finally {
      fetchRef.current = false;
    }
  }, [serviceId]);

  useEffect(() => {
    void fetchPartnerFromApi();
  }, [fetchPartnerFromApi]);

  const onSubmitEvent = async (data: any) => {
    const payload = {
      partner_id: data.partner_id,
    };

    const responseUser = await updateOrderService(payload, selectedServiceId);

    if (responseUser) {
      onClose && onClose();
      onRefreshData();
    }
  };

  return (
    <>
      <Modal
        show={true}
        onHide={onClose}
        {...QUOTE_MODAL_LAYOUT}
        enforceFocus={false}
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            Reassign Partner
          </Modal.Title>
          <CustomCloseButton onClose={onClose} />
        </Modal.Header>
        <Modal.Body className="add-quote-modal-body pt-0">
          <form
            noValidate
            name="assign-partner-form"
            id="assign-partner-form"
            onSubmit={handleSubmit(onSubmitEvent)}
          >
            <Row>
              <CustomTextFieldSelect
                label="Partner"
                controlId="Partner"
                options={partners}
                register={register}
                fieldName="partner_id"
                error={errors.partner_id}
                requiredMessage="Please select partner"
                setValue={setValue as (name: string, value: any) => void}
              />
            </Row>
            <Row className="mt-4">
              <Col
                xs={12}
                className="text-center d-flex justify-content-end gap-3"
              >
                <Button type="submit" className="custom-btn-primary">
                  Assign
                </Button>
                <Button
                  type="button"
                  className="custom-btn-secondary"
                  onClick={onClose}
                >
                  Cancel
                </Button>
              </Col>
            </Row>
          </form>
        </Modal.Body>
      </Modal>
    </>
  );
};

AssignPartnerDialog.show = (
  serviceId: string,
  selectedServiceId: string,
  onRefreshData: () => void
) => {
  openDialog("assign-partner-modal", (close) => (
    <AssignPartnerDialog
      serviceId={serviceId}
      selectedServiceId={selectedServiceId}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

/** --- EditOrderDialog --- */

type EditOrderDialogProps = {
  orderDetails: OrderModel;
  onClose: () => void;
  onRefreshData: () => void;
};

const EditOrderDialog: React.FC<EditOrderDialogProps> & {
  show: (orderDetails: OrderModel, onRefreshData: () => void) => void;
} = ({ orderDetails, onClose, onRefreshData }) => {
  const customerPaymentLabelOptions = [
    { value: "Paid", label: "Paid" },
    { value: "Unpaid", label: "Unpaid" },
    { value: "Partially paid", label: "Partially paid" },
    { value: "Refund", label: "Refund" },
    { value: "Partially Refund", label: "Partially Refund" },
    { value: "Completed", label: "Completed" },
  ];
  const partnerPaymentLabelOptions = [
    { value: "Paid", label: "Paid" },
    { value: "Unpaid", label: "Unpaid" },
    { value: "Partially paid", label: "Partially paid" },
    { value: "Completed", label: "Completed" },
  ];

  const { register, handleSubmit, setValue } = useForm<
    OrderModel & {
      customer_payment_status: string;
      partner_payment_status: string;
    }
  >({
    defaultValues: {
      is_paid: orderDetails.is_paid ?? false,
      payment_mode_id: orderDetails.payment_mode_id ?? "2",
      order_status: orderDetails.order_status,
      customer_payment_status: getCustomerPaymentStatusLabel(orderDetails),
      partner_payment_status: getPartnerPaymentStatusLabel(orderDetails),
    },
  });

  const statuses: { value: string; label: string }[] = Array.from(
    OrderStatusEnum.entries()
  )
    .filter(([key]) => key !== 5)
    .map(([key, value]) => ({
      value: key.toString(),
      label: key === 1 ? "Refunded" : value.label,
    }));

  const onSubmitEvent = async (
    data: OrderModel & {
      customer_payment_status: string;
      partner_payment_status: string;
    }
  ) => {
    const payload = buildOrderHeaderPatchPayload({
      orderStatus: Number(data.order_status),
      customerPaymentStatus: (data.customer_payment_status || "").trim(),
      partnerPaymentStatus: (data.partner_payment_status || "").trim(),
    });

    const responseUser = await createOrUpdateOrder(
      payload,
      true,
      orderDetails._id
    );

    if (responseUser) {
      onClose && onClose();
      onRefreshData();
    }
  };

  return (
    <>
      <Modal
        show={true}
        onHide={onClose}
        {...QUOTE_MODAL_LAYOUT}
        enforceFocus={false}
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            Update Order
          </Modal.Title>
          <CustomCloseButton onClose={onClose} />
        </Modal.Header>
        <Modal.Body className="add-quote-modal-body pt-0">
          <form
            noValidate
            name="assign-partner-form"
            id="assign-partner-form"
            onSubmit={handleSubmit(onSubmitEvent)}
          >
            <Row className="g-3">
              <Col xs={12}>
                <CustomTextFieldSelect
                  label="Order Status"
                  controlId="order_status"
                  options={statuses}
                  register={register}
                  fieldName="order_status"
                  error="order_status"
                  requiredMessage="Please select order Status"
                  defaultValue={
                    orderDetails?.order_status
                      ? String(orderDetails?.order_status)
                      : "1"
                  }
                  setValue={setValue as (name: string, value: any) => void}
                />
              </Col>
              <Col xs={12}>
                <CustomTextFieldSelect
                  label="Customer Payment Status"
                  controlId="Customer Payment Status"
                  options={customerPaymentLabelOptions}
                  register={register}
                  fieldName="customer_payment_status"
                  error="customer_payment_status"
                  requiredMessage="Please select customer payment status"
                  defaultValue={getCustomerPaymentStatusLabel(orderDetails)}
                  setValue={setValue as (name: string, value: any) => void}
                />
              </Col>
              <Col xs={12}>
                <CustomTextFieldSelect
                  label="Partner Payment Status"
                  controlId="partner Payment Status"
                  options={partnerPaymentLabelOptions}
                  register={register}
                  fieldName="partner_payment_status"
                  error="partner_payment_status"
                  requiredMessage="Please select partner payment status"
                  defaultValue={getPartnerPaymentStatusLabel(orderDetails)}
                  setValue={setValue as (name: string, value: any) => void}
                />
              </Col>
              {/* <Col xs={12} md={6}>
                                <CustomTextFieldSelect
                                    label="Payment model"
                                    controlId="payment_mode_id"
                                    options={paymentStatusOptions}
                                    register={register}
                                    fieldName="payment_mode_id"
                                    requiredMessage="Please select payment mode"
                                    defaultValue={
                                        orderDetails?.payment_mode_id
                                            ? String(orderDetails.payment_mode_id)
                                            : "2"
                                    }
                                    setValue={setValue as (name: string, value: any) => void}
                                />
                            </Col> */}
            </Row>
            <Row className="mt-4">
              <Col
                xs={12}
                className="text-center d-flex justify-content-end gap-3"
              >
                <Button type="submit" className="custom-btn-primary">
                  Update
                </Button>
                <Button
                  type="button"
                  className="custom-btn-secondary"
                  onClick={onClose}
                >
                  Cancel
                </Button>
              </Col>
            </Row>
          </form>
        </Modal.Body>
      </Modal>
    </>
  );
};

EditOrderDialog.show = (
  orderDetails: OrderModel,
  onRefreshData: () => void
) => {
  openDialog("edit-order-modal", (close) => (
    <EditOrderDialog
      orderDetails={orderDetails}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

/** --- EditOrderUserDialog --- */

/** End-user / customer list (same as create order flow). */
const CUSTOMER_USER_TYPE = 4;

type EditOrderUserDialogProps = {
  orderDetails: OrderModel;
  onClose: () => void;
  onRefreshData: () => void;
};

const EditOrderUserDialog: React.FC<EditOrderUserDialogProps> & {
  show: (orderDetails: OrderModel, onRefreshData: () => void) => void;
} = ({ orderDetails, onClose, onRefreshData }) => {
  const currentUserId =
    orderDetails.user_info?._id ?? orderDetails.user_id ?? "";

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<{ user_id: string }>({
    defaultValues: {
      user_id: currentUserId,
    },
  });
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
  const [userRecords, setUserRecords] = useState<UserModel[]>([]);
  const fetchRef = useRef(false);

  const loadUsers = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const { users: list } = await fetchUserDropDown(CUSTOMER_USER_TYPE);
      const uid = orderDetails.user_info?._id ?? orderDetails.user_id ?? "";
      let records = [...list];
      if (uid && !list.some((u) => u._id === uid) && orderDetails.user_info) {
        records = [orderDetails.user_info as UserModel, ...list];
      }
      setUserRecords(records);
      const mapped = records.map((u) => ({
        value: u._id,
        label: (u.name && String(u.name).trim()) || u.user_id || "Unnamed user",
      }));
      setUsers(mapped);
    } finally {
      fetchRef.current = false;
    }
  }, [orderDetails.user_id, orderDetails.user_info]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const onSubmit = async (data: { user_id: string }) => {
    const selected = userRecords.find((u) => u._id === data.user_id);
    if (!selected) {
      return;
    }
    const payload = buildOrderUserUpdatePayload(selected, orderDetails);
    const ok = await createOrUpdateOrder(payload, true, orderDetails._id);
    if (ok) {
      onClose?.();
      onRefreshData();
    }
  };

  return (
    <Modal
      show
      onHide={onClose}
      {...QUOTE_MODAL_LAYOUT}
      enforceFocus={false}
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Change order user
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="add-quote-modal-body pt-0">
        <form noValidate onSubmit={handleSubmit(onSubmit)}>
          <Row>
            <CustomTextFieldSelect
              label="User"
              controlId="user_id"
              options={users}
              register={register}
              fieldName="user_id"
              error={errors.user_id as unknown as string}
              requiredMessage="Please select a user"
              defaultValue={currentUserId}
              setValue={setValue as (name: string, value: any) => void}
              placeholder="Select user"
              menuPortal
            />
          </Row>
          <Row className="mt-4">
            <Col
              xs={12}
              className="text-center d-flex justify-content-end gap-3"
            >
              <Button type="submit" className="custom-btn-primary">
                Save
              </Button>
              <Button
                type="button"
                className="custom-btn-secondary"
                onClick={onClose}
              >
                Cancel
              </Button>
            </Col>
          </Row>
        </form>
      </Modal.Body>
    </Modal>
  );
};

EditOrderUserDialog.show = (
  orderDetails: OrderModel,
  onRefreshData: () => void
) => {
  openDialog("edit-order-user-modal", (close) => (
    <EditOrderUserDialog
      orderDetails={orderDetails}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

/** --- EditOrderEmployeeDialog --- */

const EMPLOYEE_USER_TYPE = APP_USER_TYPE.FRANCHISE_EMPLOYEE;

type EditOrderEmployeeDialogProps = {
  orderDetails: OrderModel;
  onClose: () => void;
  onRefreshData: () => void;
};

const EditOrderEmployeeDialog: React.FC<EditOrderEmployeeDialogProps> & {
  show: (orderDetails: OrderModel, onRefreshData: () => void) => void;
} = ({ orderDetails, onClose, onRefreshData }) => {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<{ created_by_id: string }>({
    defaultValues: {
      created_by_id: orderDetails.created_by_id ?? "",
    },
  });
  const [employees, setEmployees] = useState<
    { value: string; label: string }[]
  >([]);
  const fetchRef = useRef(false);

  const loadEmployees = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const { users } = await fetchUserDropDown(EMPLOYEE_USER_TYPE);
      const mapped = users.map((u) => ({
        value: u._id,
        label: (u.name && String(u.name).trim()) || u.user_id || "Unnamed",
      }));
      const currentId = orderDetails.created_by_id ?? "";
      if (currentId && !mapped.some((o) => o.value === currentId)) {
        mapped.unshift({
          value: currentId,
          label:
            (orderDetails.created_by_name &&
              String(orderDetails.created_by_name).trim()) ||
            "Current assignee",
        });
      }
      setEmployees(mapped);
    } finally {
      fetchRef.current = false;
    }
  }, [orderDetails.created_by_id, orderDetails.created_by_name]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const onSubmit = async (data: { created_by_id: string }) => {
    const ok = await createOrUpdateOrder(
      buildOrderEmployeeUpdatePayload(data.created_by_id),
      true,
      orderDetails._id
    );
    if (ok) {
      onClose?.();
      onRefreshData();
    }
  };

  return (
    <Modal
      show
      onHide={onClose}
      {...QUOTE_MODAL_LAYOUT}
      enforceFocus={false}
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Change employee
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="add-quote-modal-body pt-0">
        <form noValidate onSubmit={handleSubmit(onSubmit)}>
          <Row>
            <CustomTextFieldSelect
              label="Employee"
              controlId="created_by_id"
              options={employees}
              register={register}
              fieldName="created_by_id"
              error={errors.created_by_id as unknown as string}
              requiredMessage="Please select an employee"
              defaultValue={orderDetails.created_by_id ?? ""}
              setValue={setValue as (name: string, value: any) => void}
              placeholder="Select employee"
              menuPortal
            />
          </Row>
          <Row className="mt-4">
            <Col
              xs={12}
              className="text-center d-flex justify-content-end gap-3"
            >
              <Button type="submit" className="custom-btn-primary">
                Save
              </Button>
              <Button
                type="button"
                className="custom-btn-secondary"
                onClick={onClose}
              >
                Cancel
              </Button>
            </Col>
          </Row>
        </form>
      </Modal.Body>
    </Modal>
  );
};

EditOrderEmployeeDialog.show = (
  orderDetails: OrderModel,
  onRefreshData: () => void
) => {
  openDialog("edit-order-employee-modal", (close) => (
    <EditOrderEmployeeDialog
      orderDetails={orderDetails}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

/** --- OrderPaymentEditModal --- */

const PAYMENT_METHOD_OPTIONS = paymentMethodSelectOptions();

type OrderPaymentEditModalProps = {
  order: OrderModel;
  onClose: () => void;
  onSaved: () => void;
  /** When true, render inside parent modal (no nested dialog shell). */
  embedded?: boolean;
  /** Parent edit-all validates payment rows before a single combined update. */
  validateRef?: React.MutableRefObject<(() => boolean) | null>;
  /** Live payment rows for a single amount summary in the parent modal. */
  onExtChange?: (ext: OrderPaymentExtV1) => void;
  /** Lock user payment rows (completed orders — partner unpaid only edit). */
  customerPaymentsReadOnly?: boolean;
  /** Lock partner payment rows when not the active edit target. */
  partnerPaymentsReadOnly?: boolean;
  /** Lock service amount / additional charges rows. */
  servicesReadOnly?: boolean;
};

const nid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Shared typography for payment edit (matches order info density). */
const FONT_BODY = "0.9375rem";
const FONT_LABEL = "14px";

const moneyTabular: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

/** Match `OrderInfoDialog` section panels. */
const sectionShell: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: "10px",
  border: "1px solid var(--txtfld-border, rgba(0, 0, 0, 0.08))",
  backgroundColor: "var(--bg-color)",
};

/** Match `OrderInfoDialog` payment sub-cards / bordered tables. */
const paymentSubcard: React.CSSProperties = {
  // borderRadius: "8px",
  // border: "1px solid var(--txtfld-border, rgba(0, 0, 0, 0.1))",
  backgroundColor: "var(--bg-color)",
};

const tableThStyle: React.CSSProperties = {
  color: "var(--primary-txt-color)",
  fontSize: FONT_LABEL,
  // borderColor: "var(--lb1-border, var(--txtfld-border))",
};

const tablePriceInputStyle: React.CSSProperties = {
  ...moneyTabular,
  marginBottom: 0,
  fontSize: FONT_BODY,
  textAlign: "right",
};

const readOnlyPaymentFieldStyle: React.CSSProperties = {
  fontSize: FONT_BODY,
  marginBottom: 0,
};

const readOnlyPaymentFieldClass =
  "custom-form-input custom-form-input--read-only";

const OrderPaymentEditModal: React.FC<OrderPaymentEditModalProps> & {
  show: (order: OrderModel, onSaved: () => void) => void;
} = ({ order, onClose, onSaved, embedded = false, validateRef, onExtChange, customerPaymentsReadOnly = false, partnerPaymentsReadOnly = false, servicesReadOnly = false }) => {
  const primary = getPrimaryServiceItem(order);
  const partnerLock =
    partnerPaymentsEditLocked(order) || partnerPaymentsReadOnly;
  const customerLock = customerPaymentsReadOnly;
  const refundN = orderRefundAmount(order);
  const sym = AppConstant.currencySymbol;

  const [ext, setExt] = useState<OrderPaymentExtV1>(() => {
    const base = resolvePaymentExtension(order, primary);
    const { taxPct, commissionPct } = getServiceTaxCommissionPercents(
      primary,
      order
    );
    return { ...base, taxPercent: taxPct, commissionPercent: commissionPct };
  });
  const [showCustomerPaymentAddHint, setShowCustomerPaymentAddHint] =
    useState(false);
  const [showPartnerPaymentAddHint, setShowPartnerPaymentAddHint] =
    useState(false);
  /** Payment rows present when the modal opened — not editable; new rows use `nid()`. */
  const lockedCustomerPaymentIdsRef = useRef<Set<string>>(new Set());
  const lockedPartnerPaymentIdsRef = useRef<Set<string>>(new Set());
  const { register, setValue } = useForm<any>();

  const paymentFieldRegister = useCallback(
    (name: string) => ({
      onChange: async () => {},
      onBlur: async () => {},
      name: String(name),
      ref: () => {},
    }),
    []
  ) as import("react-hook-form").UseFormRegister<any>;

  useEffect(() => {
    const base = resolvePaymentExtension(order, primary);
    const { taxPct, commissionPct } = getServiceTaxCommissionPercents(
      primary,
      order
    );
    lockedCustomerPaymentIdsRef.current = new Set(
      base.customerPayments.map((r) => r.id)
    );
    lockedPartnerPaymentIdsRef.current = new Set(
      base.partnerPayments.map((r) => r.id)
    );
    setExt({ ...base, taxPercent: taxPct, commissionPercent: commissionPct });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed off payment-driving fields; full `order` would over-fire
  }, [
    order._id,
    order.comment,
    order.sub_total,
    order.tax,
    order.partner_commison_platform_fee,
    order.payment_status,
    order.customer_paid_amount,
    order.customer_net_paid,
    order.customer_due_amount,
    order.order_payments,
    primary,
  ]);

  const { taxPct, commissionPct } = useMemo(
    () => getServiceTaxCommissionPercents(primary, order),
    [primary, order]
  );

  const otherSum = useMemo(
    () => otherChargesTotal(ext.otherCharges),
    [ext.otherCharges]
  );
  const combinedServiceBase = useMemo(
    () => Math.max(0, ext.serviceAmount + otherSum),
    [ext.serviceAmount, otherSum]
  );
  const paymentLineTotals = useMemo(
    () =>
      computeOrderPaymentLineTotals(
        ext.serviceAmount,
        otherSum,
        taxPct,
        commissionPct
      ),
    [ext.serviceAmount, otherSum, taxPct, commissionPct]
  );

  const offerBreakdown = useMemo(
    () => resolveOrderOfferBreakdown(order),
    [order]
  );
  const orderDiscount = useMemo(
    () => Math.max(0, Number(order.discount_amount ?? 0)),
    [order.discount_amount]
  );
  const preAdjustTotal = useMemo(
    () => Math.max(0, paymentLineTotals.totalInclTax - refundN),
    [paymentLineTotals.totalInclTax, refundN]
  );
  const finalTotal = useMemo(
    () =>
      Math.max(
        0,
        preAdjustTotal - offerBreakdown.appliedDiscount - orderDiscount
      ),
    [preAdjustTotal, offerBreakdown.appliedDiscount, orderDiscount]
  );

  const amountSummaryDisplay = useMemo(
    () =>
      buildOrderAmountSummaryFromOrder(order, {
        primary,
        paymentExt: ext,
        finalTotal,
        orderDiscount,
      }),
    [order, primary, ext, finalTotal, orderDiscount]
  );

  useEffect(() => {
    onExtChange?.(ext);
  }, [ext, onExtChange]);

  /** Partner obligation before tax/commission: service + other charges minus partner offer share. */
  const partnerDueTotal = useMemo(
    () => Math.max(0, combinedServiceBase - offerBreakdown.partnerContribution),
    [combinedServiceBase, offerBreakdown.partnerContribution]
  );

  const customerPaidBal = useMemo(
    () => customerPaidBalanceForEdit(ext, finalTotal, !!order.is_paid),
    [ext, finalTotal, order.is_paid]
  );
  const partnerPaidBal = useMemo(
    () =>
      partnerPaidBalanceForEdit(
        ext,
        partnerDueTotal,
        ext.serviceAmount,
        !!order.is_paid
      ),
    [ext, partnerDueTotal, order.is_paid]
  );

  const customerAddPaymentState = useMemo(
    () =>
      canAddAnotherCustomerPayment(
        ext.customerPayments,
        customerPaidBal.balance
      ),
    [ext.customerPayments, customerPaidBal.balance]
  );
  const partnerAddPaymentState = useMemo(
    () =>
      canAddAnotherPartnerPayment(
        ext.partnerPayments,
        partnerPaidBal.balance
      ),
    [ext.partnerPayments, partnerPaidBal.balance]
  );
  const canAddCustomerByBalance = customerPaidBal.balance > 0.009;
  const canAddPartnerByBalance =
    !partnerLock && partnerPaidBal.balance > 0.009;

  useEffect(() => {
    if (
      showCustomerPaymentAddHint &&
      ext.customerPayments.every(isCustomerPaymentRowComplete)
    ) {
      setShowCustomerPaymentAddHint(false);
    }
  }, [ext.customerPayments, showCustomerPaymentAddHint]);

  useEffect(() => {
    if (
      showPartnerPaymentAddHint &&
      ext.partnerPayments.every(isPartnerPaymentRowComplete)
    ) {
      setShowPartnerPaymentAddHint(false);
    }
  }, [ext.partnerPayments, showPartnerPaymentAddHint]);

  const tryAddCustomerPayment = () => {
    if (customerLock) return;
    if (!customerAddPaymentState.allowed) {
      if (customerAddPaymentState.reason) {
        setShowCustomerPaymentAddHint(true);
      }
      return;
    }
    setShowCustomerPaymentAddHint(false);
    setExt((e) => ({
      ...e,
      customerPayments: [
        ...e.customerPayments,
        {
          id: nid(),
          date: "",
          amount: 0,
          type: "cash",
          description: "",
        },
      ],
    }));
  };

  const tryAddPartnerPayment = () => {
    if (!partnerAddPaymentState.allowed) {
      if (partnerAddPaymentState.reason) {
        setShowPartnerPaymentAddHint(true);
      }
      return;
    }
    setShowPartnerPaymentAddHint(false);
    setExt((e) => ({
      ...e,
      partnerPayments: [
        ...e.partnerPayments,
        { id: nid(), date: "", amount: 0, description: "" },
      ],
    }));
  };

  const mainServiceLabel =
    primary?.service_info?.name?.trim() || "Main service";

  const updateCustomer = (id: string, patch: Partial<CustomerPaymentRow>) => {
    setExt((e) => ({
      ...e,
      customerPayments: e.customerPayments.map((r) =>
        r.id === id ? { ...r, ...patch } : r
      ),
    }));
  };

  const updatePartner = (id: string, patch: Partial<PartnerPaymentRow>) => {
    setExt((e) => ({
      ...e,
      partnerPayments: e.partnerPayments.map((r) =>
        r.id === id ? { ...r, ...patch } : r
      ),
    }));
  };

  const updateOther = (id: string, patch: Partial<OtherChargeRow>) => {
    setExt((e) => ({
      ...e,
      otherCharges: e.otherCharges.map((r) =>
        r.id === id ? { ...r, ...patch } : r
      ),
    }));
  };

  const addOtherServiceChargeRow = () => {
    setExt((e) => ({
      ...e,
      otherCharges: [
        ...e.otherCharges,
        { id: nid(), amount: 0, description: "", serviceName: "" },
      ],
    }));
  };

  const removeOtherChargeRow = (id: string) => {
    setExt((e) => ({
      ...e,
      otherCharges: e.otherCharges.filter((r) => r.id !== id),
    }));
  };

  const confirmRemoveOtherChargeRow = (id: string) => {
    openConfirmDialog(
      "Are you sure you want to remove this additional service charge? This cannot be undone.",
      "Delete",
      "Cancel",
      () => removeOtherChargeRow(id)
    );
  };

  const isLockedCustomerPaymentRow = (id: string) =>
    lockedCustomerPaymentIdsRef.current.has(id);

  const isLockedPartnerPaymentRow = (id: string) =>
    lockedPartnerPaymentIdsRef.current.has(id);

  const confirmRemoveCustomerPaymentRow = (id: string) => {
    if (customerLock || isLockedCustomerPaymentRow(id)) return;
    openConfirmDialog(
      "Are you sure you want to delete this user payment entry?",
      "Delete",
      "Cancel",
      () =>
        setExt((e) => ({
          ...e,
          customerPayments: e.customerPayments.filter((r) => r.id !== id),
        }))
    );
  };

  const confirmRemovePartnerPaymentRow = (id: string) => {
    if (isLockedPartnerPaymentRow(id)) return;
    openConfirmDialog(
      "Are you sure you want to delete this partner payment entry?",
      "Delete",
      "Cancel",
      () =>
        setExt((e) => ({
          ...e,
          partnerPayments: e.partnerPayments.filter((r) => r.id !== id),
        }))
    );
  };

  const validatePayment = React.useCallback((): boolean => {
    if (!customerLock && customerAddPaymentState.reason) {
      setShowCustomerPaymentAddHint(true);
      return false;
    }
    if (!partnerLock && partnerAddPaymentState.reason) {
      setShowPartnerPaymentAddHint(true);
      return false;
    }
    if (!servicesReadOnly && ext.serviceAmount < 0) {
      showErrorAlert("Service amount cannot be negative.");
      return false;
    }
    const custSum = sumCustomerAmounts(ext.customerPayments);
    const partSum = sumPartnerAmounts(ext.partnerPayments);
    if (!customerLock && custSum > finalTotal + 0.01) {
      showErrorAlert(
        "Sum of user payment amounts cannot exceed the final total."
      );
      return false;
    }
    if (!partnerLock && partSum > partnerDueTotal + 0.01) {
      showErrorAlert(
        "Sum of partner payment amounts cannot exceed the partner total (service charges minus partner offer share, excluding tax and commission)."
      );
      return false;
    }
    return true;
  }, [
    customerLock,
    partnerLock,
    servicesReadOnly,
    customerAddPaymentState.reason,
    partnerAddPaymentState.reason,
    ext,
    finalTotal,
    partnerDueTotal,
  ]);

  const save = React.useCallback(async (): Promise<boolean> => {
    if (!validatePayment()) return false;

    const ok = await createOrUpdateOrder(
      buildOrderPaymentUpdatePayload({
        order,
        ext,
        totalServiceCharge: ext.serviceAmount,
      }),
      true,
      order._id
    );
    if (!ok) {
      showErrorAlert("Could not save payments and charges.");
      return false;
    }
    if (!embedded) onClose();
    onSaved();
    return true;
  }, [
    validatePayment,
    ext,
    order,
    embedded,
    onClose,
    onSaved,
  ]);

  React.useEffect(() => {
    if (!validateRef) return;
    validateRef.current = validatePayment;
    return () => {
      validateRef.current = null;
    };
  }, [validatePayment, validateRef]);

  const paymentBody = (
    <div
      className={embedded ? undefined : "add-quote-modal-body pt-0"}
      style={{ fontSize: FONT_BODY }}
    >
          {/* Services */}
          <section className="custom-other-details mt-2" style={sectionShell}>
            {!embedded ? (
              <Row className="align-items-center mb-2 pb-2 border-bottom">
                <Col>
                  <h3 className="mb-0">Services</h3>
                  <p className="text-muted small mb-0 mt-1">
                    Here you can add additional service charges as extra line items.
                  </p>
                </Col>
              </Row>
            ) : null}
            <div style={paymentSubcard}>
              <Table
                bordered
                size="sm"
                className="mb-0 align-middle"
                style={{ color: "var(--content-txt-color)", width: "100%" }}
              >
                <colgroup>
                  <col style={{ width: 50 }} />
                  <col style={{ width: 250 }} />
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 44 }} />
                </colgroup>
                <thead className="table-light">
                  <tr
                    style={{
                      borderColor: "var(--lb1-border, var(--txtfld-border))",
                    }}
                  >
                    <th
                      className="text-center fw-semibold"
                      style={tableThStyle}
                    >
                      S.No
                    </th>
                    <th className="text-start fw-semibold" style={tableThStyle}>
                      Service name
                    </th>
                    <th className="text-start fw-semibold" style={tableThStyle}>
                      Description
                    </th>
                    <th className="text-end fw-semibold" style={tableThStyle}>
                      Service amount
                    </th>
                    <th
                      className="text-center fw-semibold"
                      style={tableThStyle}
                      aria-label="Add or remove row"
                    />
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="align-middle text-center fw-medium">1</td>
                    <td
                      className="fw-semibold text-break align-middle text-wrap"
                      style={{ fontSize: FONT_BODY }}
                    >
                      {mainServiceLabel}
                    </td>
                    <td
                      className="text-muted align-middle text-wrap"
                      style={{ fontSize: FONT_BODY }}
                    >
                      —
                    </td>
                    <td className="align-middle">
                      <CustomFormInput
                        label=""
                        controlId="order-payment-main-service-amount"
                        placeholder="0.00"
                        register={register}
                        asCol={false}
                        inputType="text"
                        isEditable={!servicesReadOnly}
                        inputClassName={
                          servicesReadOnly
                            ? "text-end custom-form-input--read-only"
                            : "text-end"
                        }
                        inputStyle={tablePriceInputStyle}
                        value={
                          ext.serviceAmount === 0
                            ? ""
                            : String(ext.serviceAmount)
                        }
                        onChange={(val) => {
                          if (servicesReadOnly) return;
                          const t = val.trim();
                          if (t === "") {
                            if (
                              hasRecordedOrderPayments(ext) &&
                              !validatePaymentExtAgainstCaps(
                                { ...ext, serviceAmount: 0 },
                                finalTotal,
                                partnerDueTotal
                              ).valid
                            ) {
                              showErrorAlert(
                                validatePaymentExtAgainstCaps(
                                  ext,
                                  finalTotal,
                                  partnerDueTotal
                                ).reason ??
                                  "Reduce or remove payment rows before lowering the service amount."
                              );
                              return;
                            }
                            setExt((x) => ({ ...x, serviceAmount: 0 }));
                            return;
                          }
                          const n = parseFloat(t);
                          if (!Number.isNaN(n) && n >= 0) {
                            const other = otherChargesTotal(ext.otherCharges);
                            const lineTotals = computeOrderPaymentLineTotals(
                              n,
                              other,
                              taxPct,
                              commissionPct
                            );
                            const newFinal = Math.max(
                              0,
                              lineTotals.totalInclTax -
                                offerBreakdown.appliedDiscount -
                                orderDiscount -
                                refundN
                            );
                            const newPartnerDue = Math.max(
                              0,
                              n + other - offerBreakdown.partnerContribution
                            );
                            if (hasRecordedOrderPayments(ext)) {
                              const check = validatePaymentExtAgainstCaps(
                                ext,
                                newFinal,
                                newPartnerDue
                              );
                              if (!check.valid) {
                                showErrorAlert(
                                  check.reason ??
                                    "Payment rows exceed the new total. Reduce or remove payments first."
                                );
                                return;
                              }
                            }
                            setExt((x) => ({ ...x, serviceAmount: n }));
                          }
                        }}
                      />
                    </td>
                    <td className="text-center align-middle">
                      {!servicesReadOnly ? (
                      <button
                        type="button"
                        className="btn btn-link p-0 text-success"
                        title="Add other service charge"
                        aria-label="Add other service charge"
                        onClick={addOtherServiceChargeRow}
                      >
                        <i className="bi bi-plus-circle fs-5" aria-hidden />
                      </button>
                      ) : null}
                    </td>
                  </tr>
                  {ext.otherCharges.map((row, idx) => (
                    <tr key={row.id}>
                      <td className="align-middle text-center fw-medium">
                        {idx + 2}
                      </td>
                      <td className="align-middle">
                        <Form.Control
                          size="sm"
                          readOnly={servicesReadOnly}
                          className={
                            servicesReadOnly
                              ? readOnlyPaymentFieldClass
                              : "custom-form-input"
                          }
                          style={{ fontSize: FONT_BODY }}
                          value={row.serviceName ?? ""}
                          onChange={(e) =>
                            updateOther(row.id, { serviceName: e.target.value })
                          }
                        />
                      </td>
                      <td
                        className="align-middle text-wrap"
                        style={{ wordBreak: "break-word" }}
                      >
                        <Form.Control
                          size="sm"
                          readOnly={servicesReadOnly}
                          className={
                            servicesReadOnly
                              ? readOnlyPaymentFieldClass
                              : "custom-form-input"
                          }
                          style={{ fontSize: FONT_BODY }}
                          value={row.description}
                          onChange={(e) =>
                            updateOther(row.id, { description: e.target.value })
                          }
                        />
                      </td>
                      <td className="align-middle">
                        <CustomFormInput
                          label=""
                          controlId={`order-payment-other-amt-${row.id}`}
                          placeholder="0.00"
                          register={register}
                          asCol={false}
                          inputType="text"
                          isEditable={!servicesReadOnly}
                          inputClassName={
                            servicesReadOnly
                              ? "text-end custom-form-input--read-only"
                              : "text-end"
                          }
                          inputStyle={tablePriceInputStyle}
                          value={row.amount === 0 ? "" : String(row.amount)}
                          onChange={(val) => {
                            if (servicesReadOnly) return;
                            const t = val.trim();
                            if (t === "") {
                              updateOther(row.id, { amount: 0 });
                              return;
                            }
                            const n = parseFloat(t);
                            if (!Number.isNaN(n) && n >= 0) {
                              updateOther(row.id, { amount: n });
                            }
                          }}
                        />
                      </td>
                      <td className="text-center align-middle">
                        {!servicesReadOnly ? (
                        <i
                          className="bi bi-trash text-danger fs-6"
                          role="button"
                          tabIndex={0}
                          title="Remove row"
                          aria-label="Remove other service charge row"
                          onClick={() => confirmRemoveOtherChargeRow(row.id)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            confirmRemoveOtherChargeRow(row.id);
                          }}
                        />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </section>

          {!embedded ? (
            <section
              className="custom-other-details mt-3 order-payment-info-section"
              style={sectionShell}
            >
              <h3 className="mb-3 pb-2 border-bottom">Payment information</h3>
              <OrderAmountSummaryPanel
                display={amountSummaryDisplay}
                variant="view"
                style={{
                  marginTop: 0,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                }}
              />
            </section>
          ) : null}

          {/* Customer payments */}
          <section className="custom-other-details mt-3" style={sectionShell}>
            <Row className="align-items-center justify-content-between mb-3 pb-2 border-bottom flex-wrap g-2">
              <Col
                xs="auto"
                className="me-auto d-flex flex-wrap align-items-baseline gap-2 gap-md-3"
              >
                <h3 className="mb-0">User payments</h3>
                <span
                  className="text-secondary"
                  style={{ fontSize: FONT_LABEL }}
                >
                  Final total
                </span>
                <span
                  className="fw-semibold"
                  style={{ ...moneyTabular, fontSize: FONT_BODY }}
                >
                  {sym}
                  {finalTotal.toFixed(2)}
                </span>
              </Col>
              <Col xs="auto">
                {!customerLock ? (
                <Button
                  type="button"
                  className="custom-btn-secondary w-auto"
                  disabled={!canAddCustomerByBalance}
                  onClick={tryAddCustomerPayment}
                >
                  Add User payment
                </Button>
                ) : null}
              </Col>
            </Row>
            <div style={paymentSubcard}>
              {ext.customerPayments.length > 0 ? (
              <Table
                bordered
                size="sm"
                className="mb-0 align-middle order-payment-table"
                style={{ color: "var(--content-txt-color)", width: "100%" }}
              >
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col style={{ width: 170 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 150 }} />
                  <col />
                  <col style={{ width: 44 }} />
                </colgroup>
                <thead className="table-light">
                  <tr
                    style={{
                      borderColor: "var(--lb1-border, var(--txtfld-border))",
                    }}
                  >
                    <th
                      className="text-center fw-semibold"
                      style={tableThStyle}
                    >
                      S.No
                    </th>
                    <th className="text-start fw-semibold" style={tableThStyle}>
                      Date
                    </th>
                    <th className="text-end fw-semibold" style={tableThStyle}>
                      Paid amount
                    </th>
                    <th className="text-start fw-semibold" style={tableThStyle}>
                      Type
                    </th>
                    <th className="text-start fw-semibold" style={tableThStyle}>
                      Description
                    </th>
                    <th
                      className="text-center fw-semibold"
                      style={tableThStyle}
                      aria-label="Remove row"
                    />
                  </tr>
                </thead>
                <tbody>
                  {ext.customerPayments.map((row, idx) => {
                    const rowLocked =
                      customerLock || isLockedCustomerPaymentRow(row.id);
                    const customerRowHighlight =
                      !rowLocked &&
                      showCustomerPaymentAddHint &&
                      !isCustomerPaymentRowComplete(row);
                    return (
                    <tr
                      key={row.id}
                      className={
                        customerRowHighlight ? "payment-row--invalid" : undefined
                      }
                    >
                      <td className="align-middle text-center fw-medium">
                        {idx + 1}
                      </td>
                      <td className="align-middle">
                        {rowLocked ? (
                          <Form.Control
                            size="sm"
                            readOnly
                            className={readOnlyPaymentFieldClass}
                            style={readOnlyPaymentFieldStyle}
                            value={row.date ? formatDate(row.date) : "—"}
                          />
                        ) : (
                          <CustomDatePicker
                            label=""
                            controlId={`cdate-${row.id}`}
                            selectedDate={row.date || null}
                            onChange={(d) => {
                              if (!d) return;
                              const y = d.getFullYear();
                              const m = `${d.getMonth() + 1}`.padStart(2, "0");
                              const day = `${d.getDate()}`.padStart(2, "0");
                              updateCustomer(row.id, {
                                date: `${y}-${m}-${day}`,
                              });
                            }}
                            register={paymentFieldRegister}
                            setValue={setValue}
                            asCol={false}
                            groupClassName="mb-0"
                            filterDate={() => true}
                            suppressHiddenRegister
                          />
                        )}
                      </td>
                      <td className="align-middle">
                        <CustomFormInput
                          label=""
                          controlId={`cust-pay-amt-${row.id}`}
                          placeholder="0.00"
                          register={paymentFieldRegister}
                          asCol={false}
                          inputType="text"
                          isEditable={!rowLocked}
                          inputClassName={
                            rowLocked
                              ? "text-end custom-form-input--read-only"
                              : "text-end"
                          }
                          inputStyle={tablePriceInputStyle}
                          value={paymentAmountFieldValue(row)}
                          onChange={(val) => {
                            if (rowLocked) return;
                            setExt((e) => {
                              const cap = Math.max(0, finalTotal);
                              const otherSum = sumCustomerAmounts(
                                e.customerPayments.filter(
                                  (r) => r.id !== row.id
                                )
                              );
                              const maxForRow = Math.max(0, cap - otherSum);
                              const amountInput = sanitizeMoneyInput(val);
                              const parsed = parseMoneyInput(amountInput);
                              const nextAmount = roundMoney(
                                Math.min(parsed, maxForRow)
                              );
                              const displayInput =
                                parsed > nextAmount + 0.0001
                                  ? formatMoney2(nextAmount)
                                  : amountInput;
                              return {
                                ...e,
                                customerPayments: e.customerPayments.map((r) =>
                                  r.id === row.id
                                    ? {
                                        ...r,
                                        amount: nextAmount,
                                        amountInput: displayInput,
                                      }
                                    : r
                                ),
                              };
                            });
                          }}
                          onBlur={() => {
                            if (rowLocked) return;
                            setExt((e) => {
                              const cap = Math.max(0, finalTotal);
                              const otherSum = sumCustomerAmounts(
                                e.customerPayments.filter(
                                  (r) => r.id !== row.id
                                )
                              );
                              const maxForRow = Math.max(0, cap - otherSum);
                              return {
                                ...e,
                                customerPayments: e.customerPayments.map((r) => {
                                  if (r.id !== row.id) return r;
                                  const amount = roundMoney(
                                    Math.min(
                                      paymentRowEffectiveAmount(r),
                                      maxForRow
                                    )
                                  );
                                  return {
                                    ...r,
                                    amount,
                                    amountInput: undefined,
                                  };
                                }),
                              };
                            });
                          }}
                        />
                      </td>
                      <td className="align-middle">
                        <CustomFormSelect
                          label=""
                          controlId={`cust-pay-type-${row.id}`}
                          register={paymentFieldRegister}
                          fieldName={`custPayType_${row.id}`}
                          options={PAYMENT_METHOD_OPTIONS}
                          defaultValue={
                            normalizePaymentMethod(row.type) || "cash"
                          }
                          setValue={setValue}
                          asCol={false}
                          noBottomMargin
                          menuPortal
                          isDisabled={rowLocked}
                          onChange={(e) =>
                            updateCustomer(row.id, { type: e.target.value })
                          }
                        />
                      </td>
                      <td
                        className="align-middle text-wrap"
                        style={{ wordBreak: "break-word" }}
                      >
                        <Form.Control
                          size="sm"
                          readOnly={rowLocked}
                          className={
                            rowLocked
                              ? readOnlyPaymentFieldClass
                              : "custom-form-input"
                          }
                          style={readOnlyPaymentFieldStyle}
                          value={row.description}
                          onChange={(e) =>
                            updateCustomer(row.id, {
                              description: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="text-center align-middle">
                        {!rowLocked ? (
                          <i
                            className="bi bi-trash text-danger fs-6"
                            role="button"
                            tabIndex={0}
                            title="Remove row"
                            aria-label="Remove user payment row"
                            onClick={() =>
                              confirmRemoveCustomerPaymentRow(row.id)
                            }
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault();
                              confirmRemoveCustomerPaymentRow(row.id);
                            }}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </Table>
              ) : null}
            </div>
            <div
              className={
                ext.customerPayments.length > 0 ? "mt-3 pt-3 border-top" : ""
              }
            >
              <div className="d-flex justify-content-between align-items-center py-1">
                <span className="text-secondary">Total Paid</span>
                <span className="fw-semibold" style={moneyTabular}>
                  {sym}
                  {customerPaidBal.totalPaid.toFixed(2)}
                </span>
              </div>
              <div className="d-flex justify-content-between align-items-center py-1">
                <span className="text-secondary">Balance</span>
                <span className="fw-semibold" style={moneyTabular}>
                  {sym}
                  {customerPaidBal.balance.toFixed(2)}
                </span>
              </div>
            </div>
          </section>

          {/* Partner payments */}
          <section
            className="custom-other-details mt-3 mb-0"
            style={sectionShell}
          >
            <Row className="align-items-center justify-content-between mb-3 pb-2 border-bottom flex-wrap g-2">
              <Col
                xs="auto"
                className="me-auto d-flex flex-wrap align-items-baseline gap-2 gap-md-3"
              >
                <h3 className="mb-0">Partner payments</h3>
                <span
                  className="text-secondary"
                  style={{ fontSize: FONT_LABEL }}
                >
                  Partner total
                </span>
                <span
                  className="fw-semibold"
                  style={{ ...moneyTabular, fontSize: FONT_BODY }}
                >
                  {sym}
                  {partnerDueTotal.toFixed(2)}
                </span>
              </Col>
              {!partnerLock ? (
                <Col xs="auto">
                  <Button
                    type="button"
                    className="custom-btn-secondary w-auto"
                    disabled={!canAddPartnerByBalance}
                    onClick={tryAddPartnerPayment}
                  >
                    Add partner payment
                  </Button>
                </Col>
              ) : null}
            </Row>
            <div style={paymentSubcard}>
              {ext.partnerPayments.length > 0 ? (
              <Table
                bordered
                size="sm"
                className="mb-0 align-middle order-payment-table"
                style={{ color: "var(--content-txt-color)", width: "100%" }}
              >
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col style={{ width: 170 }} />
                  <col style={{ width: 120 }} />
                  <col />
                  <col style={{ width: 44 }} />
                </colgroup>
                <thead className="table-light">
                  <tr
                    style={{
                      borderColor: "var(--lb1-border, var(--txtfld-border))",
                    }}
                  >
                    <th
                      className="text-center fw-semibold"
                      style={tableThStyle}
                    >
                      S.No
                    </th>
                    <th className="text-start fw-semibold" style={tableThStyle}>
                      Date
                    </th>
                    <th className="text-end fw-semibold" style={tableThStyle}>
                      Paid amount
                    </th>
                    <th className="text-start fw-semibold" style={tableThStyle}>
                      Description
                    </th>
                    <th
                      className="text-center fw-semibold"
                      style={tableThStyle}
                      aria-label="Remove row"
                    />
                  </tr>
                </thead>
                <tbody>
                  {ext.partnerPayments.map((row, idx) => {
                    const rowLocked =
                      partnerLock || isLockedPartnerPaymentRow(row.id);
                    return (
                    <tr key={row.id}>
                      <td className="align-middle text-center fw-medium">
                        {idx + 1}
                      </td>
                      <td className="align-middle">
                        {rowLocked ? (
                          <Form.Control
                            size="sm"
                            readOnly
                            className={readOnlyPaymentFieldClass}
                            style={readOnlyPaymentFieldStyle}
                            value={row.date ? formatDate(row.date) : "—"}
                          />
                        ) : (
                          <CustomDatePicker
                            label=""
                            controlId={`pdate-${row.id}`}
                            selectedDate={row.date || null}
                            onChange={(d) => {
                              if (!d) return;
                              const y = d.getFullYear();
                              const m = `${d.getMonth() + 1}`.padStart(2, "0");
                              const day = `${d.getDate()}`.padStart(2, "0");
                              updatePartner(row.id, {
                                date: `${y}-${m}-${day}`,
                              });
                            }}
                            register={paymentFieldRegister}
                            setValue={setValue}
                            asCol={false}
                            groupClassName="mb-0"
                            filterDate={() => true}
                            suppressHiddenRegister
                          />
                        )}
                      </td>
                      <td className="align-middle">
                        <CustomFormInput
                          label=""
                          controlId={`partner-pay-amt-${row.id}`}
                          placeholder="0.00"
                          register={paymentFieldRegister}
                          asCol={false}
                          inputType="text"
                          inputClassName={
                            rowLocked
                              ? "text-end custom-form-input--read-only"
                              : "text-end"
                          }
                          inputStyle={tablePriceInputStyle}
                          isEditable={!rowLocked}
                          value={paymentAmountFieldValue(row)}
                          onChange={(val) => {
                            if (rowLocked) return;
                            setExt((e) => {
                              const cap = Math.max(0, partnerDueTotal);
                              const otherSum = sumPartnerAmounts(
                                e.partnerPayments.filter((r) => r.id !== row.id)
                              );
                              const maxForRow = Math.max(0, cap - otherSum);
                              const amountInput = sanitizeMoneyInput(val);
                              const parsed = parseMoneyInput(amountInput);
                              const nextAmount = roundMoney(
                                Math.min(parsed, maxForRow)
                              );
                              const displayInput =
                                parsed > nextAmount + 0.0001
                                  ? formatMoney2(nextAmount)
                                  : amountInput;
                              return {
                                ...e,
                                partnerPayments: e.partnerPayments.map((r) =>
                                  r.id === row.id
                                    ? {
                                        ...r,
                                        amount: nextAmount,
                                        amountInput: displayInput,
                                      }
                                    : r
                                ),
                              };
                            });
                          }}
                          onBlur={() => {
                            if (rowLocked) return;
                            setExt((e) => {
                              const cap = Math.max(0, partnerDueTotal);
                              const otherSum = sumPartnerAmounts(
                                e.partnerPayments.filter((r) => r.id !== row.id)
                              );
                              const maxForRow = Math.max(0, cap - otherSum);
                              return {
                                ...e,
                                partnerPayments: e.partnerPayments.map((r) => {
                                  if (r.id !== row.id) return r;
                                  const amount = roundMoney(
                                    Math.min(
                                      paymentRowEffectiveAmount(r),
                                      maxForRow
                                    )
                                  );
                                  return {
                                    ...r,
                                    amount,
                                    amountInput: undefined,
                                  };
                                }),
                              };
                            });
                          }}
                        />
                      </td>
                      <td
                        className="align-middle text-wrap"
                        style={{ wordBreak: "break-word" }}
                      >
                        <Form.Control
                          size="sm"
                          readOnly={rowLocked}
                          className={
                            rowLocked
                              ? readOnlyPaymentFieldClass
                              : "custom-form-input"
                          }
                          style={readOnlyPaymentFieldStyle}
                          value={row.description}
                          onChange={(e) =>
                            updatePartner(row.id, {
                              description: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="text-center align-middle">
                        {!rowLocked ? (
                          <i
                            className="bi bi-trash text-danger fs-6"
                            role="button"
                            tabIndex={0}
                            title="Remove row"
                            aria-label="Remove partner payment row"
                            onClick={() =>
                              confirmRemovePartnerPaymentRow(row.id)
                            }
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault();
                              confirmRemovePartnerPaymentRow(row.id);
                            }}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </Table>
              ) : null}
            </div>
            <div
              className={
                ext.partnerPayments.length > 0 ? "mt-3 pt-3 border-top" : ""
              }
            >
              <div className="d-flex justify-content-between align-items-center py-1">
                <span className="text-secondary">Total Paid</span>
                <span className="fw-semibold" style={moneyTabular}>
                  {sym}
                  {partnerPaidBal.totalPaid.toFixed(2)}
                </span>
              </div>
              <div className="d-flex justify-content-between align-items-center py-1">
                <span className="text-secondary">Balance</span>
                <span className="fw-semibold" style={moneyTabular}>
                  {sym}
                  {partnerPaidBal.balance.toFixed(2)}
                </span>
              </div>
            </div>
          </section>

          {!embedded ? (
            <Row className="mt-4">
              <Col
                xs={12}
                className="text-center d-flex justify-content-end gap-3"
              >
                <Button
                  type="button"
                  className="custom-btn-primary"
                  onClick={() => void save()}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  className="custom-btn-secondary"
                  onClick={onClose}
                >
                  Cancel
                </Button>
              </Col>
            </Row>
          ) : null}
    </div>
  );

  if (embedded) return paymentBody;

  return (
    <Modal
      show
      onHide={onClose}
      {...QUOTE_MODAL_LAYOUT}
      enforceFocus={false}
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Edit order payments
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="add-quote-modal-body pt-0">{paymentBody}</Modal.Body>
    </Modal>
  );
};

export function showOrderPaymentEditModal(
  order: OrderModel,
  onSaved: () => void
) {
  openDialog("order-payment-edit-modal", (close) => (
    <OrderPaymentEditModal order={order} onClose={close} onSaved={onSaved} />
  ));
}

OrderPaymentEditModal.show = showOrderPaymentEditModal;

export {
  AssignPartnerDialog,
  EditOrderDialog,
  EditOrderEmployeeDialog,
  EditOrderUserDialog,
  OrderPaymentEditModal,
};
export default OrderPaymentEditModal;
