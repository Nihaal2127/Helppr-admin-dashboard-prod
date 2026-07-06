import React, { useCallback, useEffect, useState } from "react";
import { Modal, Row, Col, Form, Button } from "react-bootstrap";
import CustomCloseButton from "../CustomCloseButton";
import { UserModel } from "../../lib/models/UserModel";
import { updatePartnerVerificationDecision } from "../../services/userService";
import {
  normalizePartnerVerification,
  PARTNER_VERIFICATION,
} from "../../lib/partner/partnerVerification";
import { showErrorAlert, showSuccessAlert } from "../../lib/global/alertHelper";

type PartnerVerificationStatusModalProps = {
  show: boolean;
  userId: string;
  userDetails: UserModel | null | undefined;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

const PartnerVerificationStatusModal: React.FC<
  PartnerVerificationStatusModalProps
> = ({ show, userId, userDetails, onClose, onSaved }) => {
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!show || !userDetails) return;
    const norm = normalizePartnerVerification(userDetails.is_verified);
    if (norm === PARTNER_VERIFICATION.REJECTED) {
      setDecision("reject");
      setRejectReason(
        String(userDetails.verification_rejection_reason ?? "").trim()
      );
    } else {
      setDecision("approve");
      setRejectReason("");
    }
  }, [show, userDetails]);

  const handleClose = useCallback(() => {
    setDecision("approve");
    setRejectReason("");
    setSubmitting(false);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    const id = String(userId ?? "").trim();
    if (!id) return;
    // if (
    //   userDetails &&
    //   normalizePartnerVerification(userDetails.is_verified) ===
    //     PARTNER_VERIFICATION.APPROVED
    // ) {
    //   showErrorAlert("Partner is already approved.");
    //   return;
    // }
    if (decision === "reject" && !rejectReason.trim()) {
      showErrorAlert("Please enter a rejection reason.");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await updatePartnerVerificationDecision(id, {
        approved: decision === "approve",
        ...(decision === "reject"
          ? { verification_rejection_reason: rejectReason.trim() }
          : {}),
      });
      if (ok) {
        showSuccessAlert(
          decision === "approve"
            ? "Partner verified successfully."
            : "Partner verification rejected."
        );
        handleClose();
        await onSaved();
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    userId,
    userDetails,
    decision,
    rejectReason,
    handleClose,
    onSaved,
  ]);

  const approvedLocked =
    userDetails &&
    normalizePartnerVerification(userDetails.is_verified) ===
      PARTNER_VERIFICATION.APPROVED;

  return (
    <Modal
      show={show}
      centered
      onHide={handleClose}
      enforceFocus={false}
      backdrop="static"
      dialogClassName="partner-verification-status-modal"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title mb-0">
          Verification status
        </Modal.Title>
        <CustomCloseButton onClose={handleClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
       
        <Row className="g-3">
          <Col xs={12}>
            <Row className="align-items-start g-2">
              <Col xs={12} sm={5} className="pt-sm-1">
                <label className="custom-profile-lable mb-0 text-nowrap">
                  Verification status
                </label>
              </Col>
              <Col xs={12} sm={7}>
                <div className="d-flex flex-wrap gap-3 align-items-center">
                  <Form.Check
                    type="radio"
                    id={`pvs-approve-${userId}`}
                    name="partner-verification-status"
                    className="custom-radio-check"
                    label={<span className="custom-radio-text">Approve</span>}
                    checked={decision === "approve"}
                    // disabled={Boolean(approvedLocked)}
                    onChange={() => setDecision("approve")}
                  />
                  <Form.Check
                    type="radio"
                    id={`pvs-reject-${userId}`}
                    name="partner-verification-status"
                    className="custom-radio-check"
                    label={<span className="custom-radio-text">Reject</span>}
                    checked={decision === "reject"}
                    // disabled={Boolean(approvedLocked)}
                    onChange={() => setDecision("reject")}
                  />
                </div>
              </Col>
            </Row>
          </Col>
          {decision === "reject" ? (
            <Col xs={12}>
              <Form.Group className="mb-0">
                <Form.Label className="custom-profile-lable mb-1">
                  Rejection reason
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  placeholder="Enter rejection reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </Form.Group>
            </Col>
          ) : null}
          <Col xs={12} className="d-flex justify-content-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline-secondary"
              className="custom-btn-secondary"
              disabled={submitting}
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="custom-btn-primary"
              // disabled={submitting || Boolean(approvedLocked)}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "Updating..." : "Update"}
            </Button>
          </Col>
        </Row>
      </Modal.Body>
    </Modal>
  );
};

export default PartnerVerificationStatusModal;
