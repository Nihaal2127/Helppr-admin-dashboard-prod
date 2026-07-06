import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Col, Modal, Row } from "react-bootstrap";
import { useForm, UseFormRegister } from "react-hook-form";
import { CustomFormInput } from "../../../components/CustomFormInput";
import CustomFormSelect from "../../../components/CustomFormSelect";
import CustomCloseButton from "../../../components/CustomCloseButton";
import { showErrorAlert } from "../../../lib/global/alertHelper";
import { AppConstant } from "../../../lib/global/AppConstant";
import "./AddEditRefund.scss";
import { todayLocalYmd } from "../../../helper/dateFormat";

export type RefundRow = {
  _id: string;
  order_id: string;
  order_unique_id: string;
  user_name: string;
  total_amount: number;
  user_paid?: number;
  refund_amount?: number;
  from_admin_commission?: number;
  from_partner_wallet?: number;
  created_at?: string | null;
};

/** One row from `GET /api/refund/eligible-orders`. */
export type RefundOrderOption = {
  _id: string;
  order_unique_id: string;
  user_name: string;
  total_amount: number;
  user_paid: number;
  refundable_amount: number;
  admin_payable_amount: number;
  partner_payable_amount: number;
};

export type RefundFormPayload = {
  order_id: string;
  order_unique_id: string;
  user_name: string;
  total_amount: number;
  refund_amount: number;
  from_admin_commission: number;
  from_partner_wallet: number;
  created_at: string;
  refund_type: "total" | "partial" | null;
  notes?: string;
};

type AddEditRefundProps = {
  show: boolean;
  onHide: () => void;
  orderOptions: RefundOrderOption[];
  ordersLoading?: boolean;
  refundData?: RefundRow | null;
  onSave: (payload: RefundFormPayload) => void | Promise<void>;
  isSubmitting?: boolean;
};

const REFUND_TYPE_OPTIONS = [
  { value: "total", label: "Total" },
  { value: "partial", label: "Partial" },
];

function parseAmount(raw: string): number {
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : 0;
}

function formatAmountInput(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  const fixed = n.toFixed(2);
  return fixed.replace(/\.?0+$/, "") || "0";
}

function clampAmount(value: number, max: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  const cap = Number.isFinite(max) && max > 0 ? max : 0;
  return Math.min(Math.max(0, safe), cap);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Admin + partner recovery cannot exceed the refund paid to the customer. */
function splitExceedsRefund(
  admin: number,
  partner: number,
  refund: number
): boolean {
  if (refund <= 0) return false;
  return roundMoney(admin + partner) > roundMoney(refund) + 0.01;
}

const AddEditRefund: React.FC<AddEditRefundProps> = ({
  show,
  onHide,
  orderOptions,
  ordersLoading = false,
  refundData = null,
  onSave,
  isSubmitting = false,
}) => {
  const { register, setValue } = useForm();
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [refundType, setRefundType] = useState<"total" | "partial" | null>(
    null
  );
  const [partialDraft, setPartialDraft] = useState({
    refund_amount: "",
    from_admin_commission: "",
    from_partner_wallet: "",
  });
  const [date, setDate] = useState("");

  const selectedOrder = useMemo(
    () => orderOptions.find((o) => o._id === selectedOrderId) ?? null,
    [orderOptions, selectedOrderId]
  );

  const maxRefundable = useMemo(() => {
    if (!selectedOrder) return 0;
    return (
      selectedOrder.refundable_amount > 0
        ? selectedOrder.refundable_amount
        : selectedOrder.user_paid
    );
  }, [selectedOrder]);

  const computedAmounts = useMemo(() => {
    if (!selectedOrder) return null;
    return {
      refund_amount: maxRefundable,
      from_admin_commission: selectedOrder.admin_payable_amount,
      from_partner_wallet: selectedOrder.partner_payable_amount,
    };
  }, [selectedOrder, maxRefundable]);

  const sym = AppConstant.currencySymbol;

  const adminCap = selectedOrder?.admin_payable_amount ?? 0;
  const partnerCap = selectedOrder?.partner_payable_amount ?? 0;

  const sanitizeAmountInput = useCallback((raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const [whole = "", ...rest] = cleaned.split(".");
    const fractional = rest.join("").slice(0, 2);
    return rest.length > 0 ? `${whole}.${fractional}` : whole;
  }, []);

  const updatePartialField = useCallback(
    (
      field: "refund_amount" | "from_admin_commission" | "from_partner_wallet",
      raw: string
    ) => {
      if (!selectedOrder) return;

      const sanitized = sanitizeAmountInput(raw);
      if (sanitized === "" || sanitized === ".") {
        setPartialDraft((d) => ({ ...d, [field]: sanitized }));
        return;
      }

      const parsed = parseAmount(sanitized);
      const refundBase = clampAmount(
        parseAmount(partialDraft.refund_amount),
        maxRefundable
      );
      const adminBase =
        partialDraft.from_admin_commission.trim() === ""
          ? 0
          : parseAmount(partialDraft.from_admin_commission);
      const partnerBase =
        partialDraft.from_partner_wallet.trim() === ""
          ? 0
          : parseAmount(partialDraft.from_partner_wallet);

      if (field === "refund_amount") {
        const refund = clampAmount(parsed, maxRefundable);
        let admin = adminBase;
        let partner = partnerBase;
        if (refund > 0) {
          admin = clampAmount(admin, Math.min(adminCap, refund));
          partner = clampAmount(
            partner,
            Math.min(partnerCap, Math.max(0, refund - admin))
          );
        }
        setPartialDraft({
          refund_amount: formatAmountInput(refund),
          from_admin_commission:
            partialDraft.from_admin_commission.trim() !== ""
              ? formatAmountInput(admin)
              : "",
          from_partner_wallet:
            partialDraft.from_partner_wallet.trim() !== ""
              ? formatAmountInput(partner)
              : "",
        });
        return;
      }

      if (field === "from_admin_commission") {
        const refund = refundBase > 0 ? refundBase : maxRefundable;
        const maxAdmin = Math.min(
          adminCap,
          Math.max(0, refund - partnerBase)
        );
        const admin = clampAmount(parsed, maxAdmin);
        setPartialDraft((d) => ({
          ...d,
          from_admin_commission: formatAmountInput(admin),
        }));
        return;
      }

      const refund = refundBase > 0 ? refundBase : maxRefundable;
      const maxPartner = Math.min(
        partnerCap,
        Math.max(0, refund - adminBase)
      );
      const partner = clampAmount(parsed, maxPartner);
      setPartialDraft((d) => ({
        ...d,
        from_partner_wallet: formatAmountInput(partner),
      }));
    },
    [
      selectedOrder,
      sanitizeAmountInput,
      maxRefundable,
      adminCap,
      partnerCap,
      partialDraft.refund_amount,
      partialDraft.from_admin_commission,
      partialDraft.from_partner_wallet,
    ]
  );

  const partialCanSubmit = useMemo(() => {
    if (refundType !== "partial") return true;
    const refund = parseAmount(partialDraft.refund_amount);
    if (refund <= 0 || refund > maxRefundable + 0.0001) return false;

    const admin =
      partialDraft.from_admin_commission.trim() === ""
        ? 0
        : parseAmount(partialDraft.from_admin_commission);
    const partner =
      partialDraft.from_partner_wallet.trim() === ""
        ? 0
        : parseAmount(partialDraft.from_partner_wallet);

    if (admin < 0 || partner < 0) return false;
    if (admin > adminCap + 0.0001 || partner > partnerCap + 0.0001) {
      return false;
    }
    if (splitExceedsRefund(admin, partner, refund)) return false;
    return true;
  }, [
    refundType,
    partialDraft.refund_amount,
    partialDraft.from_admin_commission,
    partialDraft.from_partner_wallet,
    maxRefundable,
    adminCap,
    partnerCap,
  ]);

  const seedPartialFromOrder = useCallback((_order: RefundOrderOption) => {
    setPartialDraft({
      refund_amount: "",
      from_admin_commission: "",
      from_partner_wallet: "",
    });
  }, []);

  const resetForm = useCallback(() => {
    setSelectedOrderId("");
    setRefundType(null);
    setPartialDraft({
      refund_amount: "",
      from_admin_commission: "",
      from_partner_wallet: "",
    });
    setDate("");
    setValue("refund_order_id", "", { shouldValidate: false });
    setValue("refund_type_field", "", { shouldValidate: false });
  }, [setValue]);

  const modalWasOpenRef = useRef(false);

  useEffect(() => {
    if (!show) {
      modalWasOpenRef.current = false;
      return;
    }

    const justOpened = !modalWasOpenRef.current;
    modalWasOpenRef.current = true;

    if (refundData?.order_id || refundData?.order_unique_id) {
      const match = orderOptions.find(
        (o) =>
          o._id === refundData.order_id ||
          o.order_unique_id === refundData.order_unique_id
      );
      if (match) {
        setSelectedOrderId(match._id);
        setRefundType("partial");
        setPartialDraft({
          refund_amount:
            refundData.refund_amount !== undefined
              ? String(refundData.refund_amount)
              : String(match.total_amount),
          from_admin_commission:
            refundData.from_admin_commission !== undefined
              ? String(refundData.from_admin_commission)
              : String(match.admin_payable_amount),
          from_partner_wallet:
            refundData.from_partner_wallet !== undefined
              ? String(refundData.from_partner_wallet)
              : String(match.partner_payable_amount),
        });
        setDate(
          refundData.created_at ? refundData.created_at.slice(0, 10) : ""
        );
        return;
      }
      if (justOpened && orderOptions.length > 0) {
        resetForm();
        setDate(todayLocalYmd());
      }
      return;
    }

    if (justOpened) {
      resetForm();
      setDate(todayLocalYmd());
    }
  }, [show, refundData, orderOptions, resetForm]);

  const handleClose = () => {
    resetForm();
    onHide();
  };

  const syncOrderDetailFields = useCallback(
    (order: RefundOrderOption) => {
      const refundable =
        order.refundable_amount > 0 ? order.refundable_amount : order.user_paid;
      setValue("display_user_name", order.user_name, { shouldValidate: false });
      setValue(
        "display_total_amount",
        `${sym}${order.total_amount.toFixed(2)}`,
        { shouldValidate: false }
      );
      setValue(
        "display_user_paid",
        `${sym}${order.user_paid.toFixed(2)}`,
        { shouldValidate: false }
      );
      setValue(
        "display_refundable",
        `${sym}${refundable.toFixed(2)}`,
        { shouldValidate: false }
      );
    },
    [setValue, sym]
  );

  const handleOrderChange = (orderId: string) => {
    setSelectedOrderId(orderId);
    setRefundType(null);
    setValue("refund_type_field", "", { shouldValidate: false });
    const next = orderOptions.find((o) => o._id === orderId);
    if (next) {
      syncOrderDetailFields(next);
      seedPartialFromOrder(next);
    } else {
      setPartialDraft({
        refund_amount: "",
        from_admin_commission: "",
        from_partner_wallet: "",
      });
    }
  };

  useEffect(() => {
    if (selectedOrder) {
      syncOrderDetailFields(selectedOrder);
    }
  }, [selectedOrder, syncOrderDetailFields]);

  const handleRefundTypeSelectChange = (e: { target: { value: string } }) => {
    const raw = e.target.value;
    const next = raw === "" ? null : (raw as "total" | "partial");
    setRefundType(next);
    if (next === "partial" && selectedOrder) {
      seedPartialFromOrder(selectedOrder);
    }
  };

  const readOnlyAmountProps = {
    register,
    asCol: false,
    isEditable: false,
  };

  const handleSubmit = async () => {
    if (!selectedOrder) {
      showErrorAlert("Please select an order.");
      return;
    }

    if (refundType !== "total" && refundType !== "partial") {
      showErrorAlert("Please select a refund type.");
      return;
    }

    const cap = maxRefundable;
    let refundNum: number;
    let adminNum: number;
    let partnerNum: number;

    if (refundType === "total") {
      if (!computedAmounts) return;
      refundNum = computedAmounts.refund_amount;
      adminNum = computedAmounts.from_admin_commission;
      partnerNum = computedAmounts.from_partner_wallet;
    } else {
      if (!partialDraft.refund_amount.trim()) {
        showErrorAlert("Please enter a refund amount.");
        return;
      }
      refundNum = clampAmount(parseAmount(partialDraft.refund_amount), cap);
      if (refundNum <= 0) {
        showErrorAlert("Please enter a valid refund amount greater than zero.");
        return;
      }

      adminNum =
        partialDraft.from_admin_commission.trim() === ""
          ? 0
          : parseAmount(partialDraft.from_admin_commission);
      partnerNum =
        partialDraft.from_partner_wallet.trim() === ""
          ? 0
          : parseAmount(partialDraft.from_partner_wallet);
      if (
        Number.isNaN(adminNum) ||
        Number.isNaN(partnerNum) ||
        adminNum < 0 ||
        partnerNum < 0
      ) {
        showErrorAlert("Please enter valid numeric amounts.");
        return;
      }

      if (adminNum > selectedOrder.admin_payable_amount + 0.0001) {
        showErrorAlert(
          `Admin contribution cannot exceed ${sym}${selectedOrder.admin_payable_amount.toFixed(
            2
          )}.`
        );
        return;
      }
      if (partnerNum > selectedOrder.partner_payable_amount + 0.0001) {
        showErrorAlert(
          `Partner contribution cannot exceed ${sym}${selectedOrder.partner_payable_amount.toFixed(
            2
          )}.`
        );
        return;
      }
      if (splitExceedsRefund(adminNum, partnerNum, refundNum)) {
        showErrorAlert(
          `Admin (${sym}${adminNum.toFixed(
            2
          )}) + Partner (${sym}${partnerNum.toFixed(
            2
          )}) cannot exceed the refund amount (${sym}${refundNum.toFixed(2)}).`
        );
        return;
      }
    }

    if (refundType === "total") {
      const splitSum = adminNum + partnerNum;
      if (Math.abs(splitSum - refundNum) > 0.01) {
        showErrorAlert("Refund split does not match refundable settlement.");
        return;
      }
    }

    if (!date.trim()) {
      showErrorAlert("Please select Date.");
      return;
    }

    await onSave({
      order_id: selectedOrder._id,
      order_unique_id: selectedOrder.order_unique_id,
      user_name: selectedOrder.user_name,
      total_amount: selectedOrder.total_amount,
      refund_amount: refundNum,
      from_admin_commission: adminNum,
      from_partner_wallet: partnerNum,
      created_at: date,
      refund_type: refundType,
    });

    resetForm();
  };

  const orderSelectOptions = useMemo(
    () =>
      orderOptions.map((o) => {
        const name = (o.user_name ?? "").trim();
        const showName = name.length > 0 && name !== "-";
        return {
          value: o._id,
          label: showName
            ? `${o.order_unique_id} — ${name}`
            : String(o.order_unique_id),
        };
      }),
    [orderOptions]
  );

  const showOrderDetails = Boolean(selectedOrder);
  const showRefundBreakdown = showOrderDetails;

  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      size="lg"
      enforceFocus={false}
      scrollable
    >
      <Modal.Header className="py-3 px-4 border-bottom-0 position-relative">
        <Modal.Title as="h5" className="custom-modal-title fw-bold pe-5">
          Add Refund
        </Modal.Title>
        <CustomCloseButton onClose={handleClose} />
      </Modal.Header>

      <Modal.Body className="px-4 pb-3 pt-0" style={{ maxHeight: "75vh" }}>
        <div className="add-edit-refund-modal">
          <Row className="g-3 mt-1">
            <Col xs={12}>
              {ordersLoading ? (
                <div className="text-muted small">Loading orders…</div>
              ) : orderSelectOptions.length === 0 ? (
                <div className="text-muted small">No orders available.</div>
              ) : (
                <CustomFormSelect
                  label="Order ID"
                  controlId="refund_order_select"
                  register={register as unknown as UseFormRegister<any>}
                  options={orderSelectOptions}
                  fieldName="refund_order_id"
                  defaultValue={selectedOrderId}
                  setValue={
                    setValue as (
                      name: string,
                      value: any,
                      options?: { shouldValidate?: boolean }
                    ) => void
                  }
                  asCol={false}
                  menuPortal
                  placeholder="Select order"
                  onChange={(e) => handleOrderChange(e.target.value)}
                />
              )}
            </Col>

            {showOrderDetails && selectedOrder && (
              <>
                <Col xs={12} key={selectedOrder._id}>
                  <div className="border rounded p-3 bg-light add-edit-refund-inline-fields">
                    <div className="fw-semibold mb-3 small text-uppercase text-muted">
                      Order details
                    </div>
                    <Row className="g-3 align-items-center">
                      {/* <Col xs={12} md={4}>
                      <CustomFormInput
                        label="Order ID"
                        controlId="display_order_unique_id"
                        placeholder=""
                        {...readOnlyAmountProps}
                        value={selectedOrder.order_unique_id}
                      />
                    </Col> */}
                      <Col xs={12} md={4}>
                        <CustomFormInput
                          key={`display_user_name-${selectedOrder._id}`}
                          label="User Name"
                          controlId="display_user_name"
                          placeholder=""
                          {...readOnlyAmountProps}
                          value={selectedOrder.user_name}
                        />
                      </Col>
                      <Col xs={12} md={4}>
                        <CustomFormInput
                          key={`display_total_amount-${selectedOrder._id}`}
                          label="Total Amount"
                          controlId="display_total_amount"
                          placeholder=""
                          {...readOnlyAmountProps}
                          value={`${sym}${selectedOrder.total_amount.toFixed(
                            2
                          )}`}
                        />
                      </Col>
                      <Col xs={12} md={4}>
                        <CustomFormInput
                          key={`display_user_paid-${selectedOrder._id}`}
                          label="User Paid"
                          controlId="display_user_paid"
                          placeholder=""
                          {...readOnlyAmountProps}
                          value={`${sym}${selectedOrder.user_paid.toFixed(2)}`}
                        />
                      </Col>
                      <Col xs={12} md={4}>
                        <CustomFormInput
                          key={`display_refundable-${selectedOrder._id}`}
                          label="Refundable"
                          controlId="display_refundable"
                          placeholder=""
                          {...readOnlyAmountProps}
                          value={`${sym}${maxRefundable.toFixed(2)}`}
                        />
                      </Col>
                      <Col xs={12} md={4}>
                        <CustomFormSelect
                          label="Refund type"
                          controlId="refund_type_select"
                          register={register as unknown as UseFormRegister<any>}
                          options={REFUND_TYPE_OPTIONS}
                          fieldName="refund_type_field"
                          defaultValue={refundType ?? ""}
                          setValue={
                            setValue as (
                              name: string,
                              value: any,
                              options?: { shouldValidate?: boolean }
                            ) => void
                          }
                          asCol={false}
                          menuPortal
                          placeholder="Select type"
                          onChange={handleRefundTypeSelectChange}
                        />
                      </Col>
                    </Row>
                  </div>
                </Col>

                {showRefundBreakdown &&
                  computedAmounts &&
                  refundType != null && (
                    <Col xs={12}>
                      <div className="add-edit-refund-limits border rounded p-3 mb-3">
                        <div className="fw-semibold small text-uppercase text-muted mb-2">
                          Refund limits (this order)
                        </div>
                        <ul className="add-edit-refund-limits-list mb-0 ps-3 small">
                          <li>
                            <span className="text-muted">Maximum refund:</span>{" "}
                            <strong>
                              {sym}
                              {maxRefundable.toFixed(2)}
                            </strong>
                          </li>
                          <li>
                            <span className="text-muted">
                              From admin commission (max):
                            </span>{" "}
                            <strong>
                              {sym}
                              {adminCap.toFixed(2)}
                            </strong>
                          </li>
                          <li>
                            <span className="text-muted">
                              From partner wallet (max):
                            </span>{" "}
                            <strong>
                              {sym}
                              {partnerCap.toFixed(2)}
                            </strong>
                          </li>
                          <li className="text-muted">
                            Partial refund is allowed — enter any refund up to
                            the maximum. Admin + Partner combined cannot exceed
                            the refund amount.
                            {adminCap + partnerCap > 0.0001 && (
                              <>
                                {" "}
                                Full settlement reference: {sym}
                                {(adminCap + partnerCap).toFixed(2)}.
                              </>
                            )}
                          </li>
                        </ul>
                      </div>

                      <div className="border rounded p-3 bg-light add-edit-refund-inline-fields">
                        <div className="fw-semibold mb-3 small text-uppercase text-muted">
                          Refund breakdown
                        </div>
                        <Row className="g-3 align-items-center">
                          <Col xs={12} md={4}>
                            {refundType === "total" ? (
                              <CustomFormInput
                                label="Refund Amount"
                                controlId="refund_amount_ro"
                                placeholder=""
                                {...readOnlyAmountProps}
                                value={`${sym}${computedAmounts.refund_amount.toFixed(
                                  2
                                )}`}
                              />
                            ) : (
                              <CustomFormInput
                                label={`Refund Amount (max ${sym}${maxRefundable.toFixed(2)})`}
                                controlId="refund_amount_edit"
                                placeholder={`Max ${sym}${maxRefundable.toFixed(2)}`}
                                register={register}
                                asCol={false}
                                inputType="text"
                                value={partialDraft.refund_amount}
                                onChange={(v) =>
                                  updatePartialField("refund_amount", v)
                                }
                              />
                            )}
                          </Col>
                          <Col xs={12} md={4}>
                            {refundType === "total" ? (
                              <CustomFormInput
                                label="Admin Commission"
                                controlId="admin_commission_ro"
                                placeholder=""
                                {...readOnlyAmountProps}
                                value={`${sym}${computedAmounts.from_admin_commission.toFixed(
                                  2
                                )}`}
                              />
                            ) : (
                              <CustomFormInput
                                label={`Admin Commission (max ${sym}${adminCap.toFixed(2)})`}
                                controlId="admin_commission_edit"
                                placeholder={`Max ${sym}${adminCap.toFixed(2)}`}
                                register={register}
                                asCol={false}
                                inputType="text"
                                value={partialDraft.from_admin_commission}
                                onChange={(v) =>
                                  updatePartialField("from_admin_commission", v)
                                }
                              />
                            )}
                          </Col>
                          <Col xs={12} md={4}>
                            {refundType === "total" ? (
                              <CustomFormInput
                                label="Partner Wallet"
                                controlId="partner_wallet_ro"
                                placeholder=""
                                {...readOnlyAmountProps}
                                value={`${sym}${computedAmounts.from_partner_wallet.toFixed(
                                  2
                                )}`}
                              />
                            ) : (
                              <CustomFormInput
                                label={`Partner Wallet (max ${sym}${partnerCap.toFixed(2)})`}
                                controlId="partner_wallet_edit"
                                placeholder={`Max ${sym}${partnerCap.toFixed(2)}`}
                                register={register}
                                asCol={false}
                                inputType="text"
                                value={partialDraft.from_partner_wallet}
                                onChange={(v) =>
                                  updatePartialField("from_partner_wallet", v)
                                }
                              />
                            )}
                          </Col>
                        </Row>

                      </div>
                    </Col>
                  )}
              </>
            )}
          </Row>
        </div>
      </Modal.Body>

      {showRefundBreakdown && computedAmounts && refundType != null && (
        <Modal.Footer className="border-top-0 px-4 pb-4 pt-0">
          <Button variant="secondary" type="button" onClick={handleClose}>
            Cancel
          </Button>

          <Button
            className="btn-danger"
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !selectedOrder || !partialCanSubmit}
          >
            {isSubmitting ? "Processing..." : "Refund"}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
};

export default AddEditRefund;
