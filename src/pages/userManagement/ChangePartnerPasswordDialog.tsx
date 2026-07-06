import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col, Form } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { showErrorAlert } from "../../lib/global/alertHelper";
import { changePassword } from "../../services/adminService";
import { openDialog } from "../../lib/global/DialogManager";

type FormValues = {
  new_password: string;
  confirm_password: string;
};

type Props = {
  userId: string;
  partnerName?: string;
  /** `UserModel.type`: partner = 2, customer user = 4 */
  accountType: number;
  onClose: () => void;
  onSaved: () => void;
};

function ChangePartnerPasswordDialogView({
  userId,
  partnerName,
  accountType,
  onClose,
  onSaved,
}: Props) {
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { new_password: "", confirm_password: "" },
  });

  const onSubmit = async (data: FormValues) => {
    const pw = String(data.new_password ?? "").trim();
    const cf = String(data.confirm_password ?? "").trim();
    if (!pw) {
      showErrorAlert("Please enter a new password.");
      return;
    }
    if (pw !== cf) {
      showErrorAlert("New password and confirmation do not match.");
      return;
    }
    const ok = await changePassword({
      user_id: userId,
      type: accountType,
      new_password: pw,
      confirm_password: cf,
    });
    if (ok) {
      onSaved();
      onClose();
    }
  };

  const titleLabel =
    accountType === 4 ? "Change user password" : "Change partner password";

  return (
    <Modal show centered onHide={onClose}>
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {titleLabel}
          
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Row className="g-3">
            <Col xs={12}>
              <Form.Group>
                <Form.Label>New password</Form.Label>
                <div className="position-relative">
                  <Form.Control
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...register("new_password", { required: "Required" })}
                  />
                  <i
                    className={`bi ${
                      showNewPassword ? "bi-eye-slash" : "bi-eye"
                    }`}
                    role="button"
                    aria-label={
                      showNewPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowNewPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      cursor: "pointer",
                      color: "var(--content-txt-color)",
                    }}
                  />
                </div>
                {errors.new_password && (
                  <Form.Text className="text-danger">
                    {String(errors.new_password.message ?? "")}
                  </Form.Text>
                )}
              </Form.Group>
            </Col>
            <Col xs={12}>
              <Form.Group>
                <Form.Label>Confirm password</Form.Label>
                <div className="position-relative">
                  <Form.Control
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...register("confirm_password", { required: "Required" })}
                  />
                  <i
                    className={`bi ${
                      showConfirmPassword ? "bi-eye-slash" : "bi-eye"
                    }`}
                    role="button"
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      cursor: "pointer",
                      color: "var(--content-txt-color)",
                    }}
                  />
                </div>
                {errors.confirm_password && (
                  <Form.Text className="text-danger">
                    {String(errors.confirm_password.message ?? "")}
                  </Form.Text>
                )}
              </Form.Group>
            </Col>
          </Row>
          <div className="d-flex justify-content-end gap-3 mt-4">
            <Button type="submit" className="custom-btn-primary">
              Save
            </Button>
            <Button type="button" className="custom-btn-secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
}

const ChangePartnerPasswordDialog = Object.assign(ChangePartnerPasswordDialogView, {
  show(
    userId: string,
    displayName: string | undefined,
    onSaved: () => void,
    accountType: number = 2
  ) {
    openDialog("change-partner-password-modal", (close) => (
      <ChangePartnerPasswordDialogView
        userId={userId}
        partnerName={displayName}
        accountType={accountType}
        onClose={close}
        onSaved={onSaved}
      />
    ));
  },
}) as typeof ChangePartnerPasswordDialogView & {
  show: (
    userId: string,
    displayName: string | undefined,
    onSaved: () => void,
    accountType?: number
  ) => void;
};

export default ChangePartnerPasswordDialog;
