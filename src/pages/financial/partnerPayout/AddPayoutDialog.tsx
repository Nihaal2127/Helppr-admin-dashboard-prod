import React, { useState, useEffect } from "react";
import { Modal, Button, Row, Col, Spinner } from "react-bootstrap";
import { useForm, UseFormRegister } from "react-hook-form";
import CustomCloseButton from "../../../components/CustomCloseButton";
import { CustomFormInput } from "../../../components/CustomFormInput";
import CustomFormSelect from "../../../components/CustomFormSelect";
import { openDialog } from "../../../lib/global/DialogManager";
import {
  createPartnerPayout,
  fetchPartnerPayoutPartners,
} from "../../../services/partnerPayoutService";
import type { PartnerPayoutPartnerOption } from "../../../services/partnerPayoutService";
import { PARTNER_PAYOUT_CREATE_METHODS } from "../../../lib/financial/partnerPayoutPayment";
import type { PartnerPayoutPaymentMethod } from "../../../lib/financial/partnerPayoutPayment";
import { AppConstant } from "../../../lib/global/AppConstant";
import { showErrorAlert } from "../../../lib/global/alertHelper";

type AddPayoutDialogProps = {
  onClose: () => void;
  onSuccess: () => void;
  franchiseId?: string;
};

const AddPayoutDialog: React.FC<AddPayoutDialogProps> & {
  show: (onSuccess: () => void, franchiseId?: string) => void;
} = ({ onClose, onSuccess, franchiseId }) => {
  const { register, setValue } = useForm();
  const [partners, setPartners] = useState<PartnerPayoutPartnerOption[]>([]);
  const [partnerMongoId, setPartnerMongoId] = useState("");
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] =
    useState<PartnerPayoutPaymentMethod>("cash");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selected = partners.find((p) => p._id === partnerMongoId);
  const payableBalance = Number(selected?.payable_balance ?? 0);
  const enterParsed = Number.isFinite(amount) && amount >= 0 ? amount : 0;
  const balanceAfter = Math.max(0, payableBalance - enterParsed);
  const amountExceedsBalance =
    payableBalance > 0 && enterParsed > payableBalance + 0.0001;
  const payNowInvalid =
    enterParsed <= 0 || payableBalance <= 0 || amountExceedsBalance;

  useEffect(() => {
    setAmount((prev) => {
      if (prev > payableBalance + 0.0001) {
        return Math.max(0, payableBalance);
      }
      return prev;
    });
  }, [partnerMongoId, payableBalance]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPartners(true);
      const { response, partners: list } = await fetchPartnerPayoutPartners({
        franchise_id: franchiseId,
        limit: 250,
      });
      if (cancelled) return;
      setPartners(response ? list : []);
      setLoadingPartners(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [franchiseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerMongoId) {
      showErrorAlert("Please select a partner.");
      return;
    }
    const num = amount;
    if (!Number.isFinite(num) || num <= 0) {
      showErrorAlert("Please enter a valid amount greater than zero.");
      return;
    }
    if (payableBalance <= 0) {
      showErrorAlert("No payable balance for this partner.");
      return;
    }
    if (num > payableBalance + 0.0001) {
      showErrorAlert(
        `Amount cannot exceed payable balance (${
          AppConstant.currencySymbol
        }${payableBalance.toFixed(2)}).`
      );
      return;
    }
    const desc = description.trim();
    if (!desc) {
      showErrorAlert("Description is required.");
      return;
    }

    setSubmitting(true);
    try {
      const ok = await createPartnerPayout({
        partner_id: partnerMongoId,
        pay_now_amount: num,
        payment_method: paymentMethod,
        description: desc,
        franchise_id: franchiseId,
      });
      if (ok) {
        onClose();
        onSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const sym = AppConstant.currencySymbol;
  const partnerOptions = partners.map((p) => ({
    value: p._id,
    label: `${p.partner_id || p._id}${p.partner_name ? ` — ${p.partner_name}` : ""}`,
  }));
  const paymentMethodOptions = [...PARTNER_PAYOUT_CREATE_METHODS];

  return (
    <Modal show size="lg" onHide={onClose} centered scrollable>
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Add Payout
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0" style={{ maxHeight: "75vh" }}>
        <form noValidate onSubmit={handleSubmit}>
          <Row className="mt-2 g-3">
            <Col xs={12}>
              {loadingPartners ? (
                <Spinner animation="border" size="sm" />
              ) : (
                <CustomFormSelect
                  label="Partner"
                  controlId="partner_id"
                  register={register as unknown as UseFormRegister<any>}
                  options={partnerOptions}
                  fieldName="partner_id"
                  defaultValue={partnerMongoId}
                  setValue={
                    setValue as (
                      name: string,
                      value: any,
                      options?: { shouldValidate?: boolean }
                    ) => void
                  }
                  asCol={false}
                  menuPortal
                  onChange={(e) => setPartnerMongoId(e.target.value)}
                />
              )}
            </Col>

            {partnerMongoId ? (
              <>
                <Col xs={12}>
                  <div className="border rounded p-3 bg-light mb-2">
                    <div className="fw-semibold mb-2">Payable balance</div>
                    <div
                      className="fs-5"
                      style={{ color: "var(--primary-txt-color)" }}
                    >
                      {sym}
                      {payableBalance.toFixed(2)}
                    </div>
                  </div>
                </Col>

                <Col xs={12}>
                  <Row className="g-3 align-items-end">
                    <Col xs={12} md={4}>
                      <CustomFormInput
                        label="Pay Now"
                        controlId="pay_now"
                        placeholder="0.00"
                        register={register}
                        asCol={false}
                        inputType="text"
                        value={amount === 0 ? "" : String(amount)}
                        onChange={(val) => {
                          const t = val.trim();
                          if (t === "") {
                            setAmount(0);
                            return;
                          }
                          const n = parseFloat(t);
                          if (!Number.isNaN(n) && n >= 0) {
                            const capped =
                              payableBalance > 0
                                ? Math.min(n, payableBalance)
                                : 0;
                            setAmount(capped);
                          }
                        }}
                        error={
                          amountExceedsBalance
                            ? {
                                message: `Pay Now cannot exceed payable balance (${sym}${payableBalance.toFixed(2)}).`,
                              }
                            : undefined
                        }
                      />
                    </Col>
                    <Col xs={12} md={4}>
                      <CustomFormInput
                        label="Balance"
                        controlId="balance_amount"
                        placeholder="Balance"
                        register={register}
                        asCol={false}
                        value={`${sym}${balanceAfter.toFixed(2)}`}
                        isEditable={false}
                        inputClassName="custom-form-input--read-only"
                      />
                    </Col>
                    <Col xs={12} md={4}>
                      <CustomFormSelect
                        label="Payment method"
                        controlId="payment_method"
                        register={register as unknown as UseFormRegister<any>}
                        options={paymentMethodOptions}
                        fieldName="payment_method"
                        defaultValue={paymentMethod}
                        setValue={
                          setValue as (
                            name: string,
                            value: any,
                            options?: { shouldValidate?: boolean }
                          ) => void
                        }
                        asCol={false}
                        menuPortal
                        onChange={(e) =>
                          setPaymentMethod(
                            e.target.value as PartnerPayoutPaymentMethod
                          )
                        }
                      />
                    </Col>
                  </Row>
                </Col>
                <Col xs={12}>
                  <CustomFormInput
                    label="Description"
                    controlId="description"
                    placeholder="Notes for this payout"
                    register={register}
                    asCol={false}
                    as="textarea"
                    rows={2}
                    value={description}
                    onChange={(value) => setDescription(value)}
                  />
                </Col>
              </>
            ) : null}
          </Row>

          <Row className="mt-4">
            <Col xs={12} className="d-flex justify-content-end gap-3">
              <Button
                type="button"
                variant="light"
                className="custom-btn-secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>

              {partnerMongoId ? (
                <Button
                  type="submit"
                  className="custom-btn-primary"
                  disabled={
                    submitting || loadingPartners || payNowInvalid
                  }
                >
                  {submitting ? "Submitting…" : "Submit"}
                </Button>
              ) : null}
            </Col>
          </Row>
        </form>
      </Modal.Body>
    </Modal>
  );
};

AddPayoutDialog.show = (onSuccess: () => void, franchiseId?: string) => {
  openDialog("add-partner-payout-modal", (close) => (
    <AddPayoutDialog
      onClose={close}
      onSuccess={onSuccess}
      franchiseId={franchiseId}
    />
  ));
};

export default AddPayoutDialog;
