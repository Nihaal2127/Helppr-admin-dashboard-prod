import { useForm } from "react-hook-form";
import { Modal, Row, Col, Button } from "react-bootstrap";
import { UserModel } from "../../lib/models/UserModel";
import { CustomFormInput } from "../../components/CustomFormInput";
import { showErrorAlert } from "../../lib/global/alertHelper";
import {
  createOrUpdateUser,
  changePassword,
} from "../../services/adminService";
import { resolveWebManagementUserType } from "../../services/userService";
import CustomCloseButton from "../../components/CustomCloseButton";

interface EditProfileProps {
  isOpen?: boolean;
  isChangePassword: boolean;
  onClose: () => void;
  user: UserModel | null;
}

const EditProfile = ({
  isOpen,
  isChangePassword,
  onClose,
  user,
}: EditProfileProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<UserModel>({
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
    },
  });

  const onSubmitEvent = async (data: UserModel) => {
    onClose && onClose();

    if (isChangePassword) {
      if (!user?._id) {
        showErrorAlert("Unable to update. ID is missing.");
        return;
      }

      const payload = {
        new_password: data.new_password,
        user_id: user._id,
        type: resolveWebManagementUserType(user.type),
      };

      let response = await changePassword(payload);
      if (response) {
        onClose && onClose();
      }
    } else {
      const payload = {
        name: data.name,
        email: data.email,
      };
      if (!user?._id) {
        showErrorAlert("Unable to update. ID is missing.");
        return;
      }
      let response = await createOrUpdateUser(payload, true, user._id);
      if (response) {
        onClose && onClose();
      }
    }
  };

  return (
    <Modal
      show={isOpen}
      onHide={onClose}
      centered
      dialogClassName="custom-big-modal"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" id="modal-title" className="custom-modal-title">
          {isChangePassword ? "Change Password" : "Edit User Details"}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        <form
          noValidate
          name="profile-form"
          id="profile-form"
          onSubmit={handleSubmit(onSubmitEvent)}
        >
          <Row>
            {isChangePassword ? (
              <>
                <Row className="align-items-center m-0 p-0">
                  <Col sm={4} className="mt-3 ms-2">
                    <label className="custom-profile-lable">New Password</label>
                  </Col>
                  <Col sm={7}>
                    <CustomFormInput
                      label=""
                      controlId="new_password"
                      placeholder="Enter New Password"
                      register={register}
                      error={errors.new_password}
                      asCol={false}
                      inputType="password"
                      validation={{ required: "New password required" }}
                    />
                  </Col>
                </Row>
                <Row className="align-items-center m-0 p-0">
                  <Col sm={4} className="mt-3 ms-2">
                    <label className="custom-profile-lable">
                      Re Enter Password
                    </label>
                  </Col>
                  <Col sm={7}>
                    <CustomFormInput
                      label=""
                      controlId="confirm_password"
                      placeholder="Enter Confirm Password"
                      register={register}
                      error={errors.confirm_password}
                      asCol={false}
                      inputType="password"
                      validation={{
                        required: "Confirm password is required",
                        validate: (value: string) =>
                          value === watch("new_password") ||
                          "New passwords do not match",
                      }}
                    />
                  </Col>
                </Row>
              </>
            ) : (
              <>
                <Row className="align-items-center m-0 p-0">
                  <Col sm={4} className="mt-3 ms-2">
                    <label className="custom-profile-lable">Name</label>
                  </Col>
                  <Col sm={7}>
                    <CustomFormInput
                      label=""
                      controlId="name"
                      placeholder="Enter Username"
                      register={register}
                      error={errors.name}
                      asCol={false}
                      validation={{ required: "Username is required" }}
                    />
                  </Col>
                </Row>

                <Row className="align-items-center m-0 p-0">
                  <Col sm={4} className="mt-3 ms-2">
                    <label className="custom-profile-lable">Email</label>
                  </Col>
                  <Col sm={7}>
                    <CustomFormInput
                      label=""
                      controlId="email"
                      placeholder="Enter Email"
                      register={register}
                      error={errors.email}
                      asCol={false}
                      isEditable={false}
                      validation={{ required: "Email is required" }}
                    />
                  </Col>
                </Row>
              </>
            )}
          </Row>
          <Row className="mt-4">
            <Col
              xs={12}
              className="text-center d-flex justify-content-end gap-3"
            >
              <Button type="submit" className="custom-btn-primary">
                Add
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

export default EditProfile;
