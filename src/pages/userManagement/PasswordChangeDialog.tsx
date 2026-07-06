import React from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { UserModel } from "../../lib/models/UserModel";
import { createOrUpdateUser } from "../../services/userService";
import CustomTextField from "../../components/CustomTextField";
import { openDialog } from "../../lib/global/DialogManager";

type PasswordChangeDialogProps = {
  user: UserModel;
  onClose: () => void;
  onRefreshData: () => void;
};

const PasswordChangeDialog: React.FC<PasswordChangeDialogProps> & {
  show: (user: UserModel, onRefreshData: () => void) => void;
} = ({ user, onClose, onRefreshData }) => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<UserModel>();

  const onSubmitEvent = async (data: any) => {
    const payload = {
      type: user.type,
      password: data.password,
      confirm_password: data.confirm_password,
    };

    let responseUser = await createOrUpdateUser(payload, true, user?._id);

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
        centered
        dialogClassName="custom-big-modal"
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            Change Password
          </Modal.Title>
          <CustomCloseButton onClose={onClose} />
        </Modal.Header>
        <Modal.Body className="px-4 pb-4 pt-0">
          <form
            noValidate
            name="change-password-form"
            id="change-password-form"
            onSubmit={handleSubmit(onSubmitEvent)}
          >
            <Row>
              <CustomTextField
                label="New Password"
                controlId="password"
                placeholder="Enter New Password"
                register={register}
                error={errors.password}
                validation={{ required: "New password is required" }}
                inputType="password"
                asCol={false}
              />
              <CustomTextField
                label="Confirm Password"
                controlId="confirm_password"
                placeholder="Enter Confirm Password"
                register={register}
                error={errors.confirm_password}
                validation={{
                  required: "Confirm password is required",
                  validate: (value: string) =>
                    value === watch("password") || "Passwords do not match",
                }}
                inputType="password"
                asCol={false}
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
    </>
  );
};

PasswordChangeDialog.show = (user: UserModel, onRefreshData: () => void) => {
  openDialog("password-change-modal", (close) => (
    <PasswordChangeDialog
      user={user}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default PasswordChangeDialog;
