import React, { useState, useEffect, useRef, useCallback } from "react";
import { Modal, Col, Row } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { UserModel } from "../../lib/models/UserModel";
import { fetchUserById } from "../../services/userService";
import editIcon from "../../assets/icons/edit_red.svg";
import profileIcon from "../../assets/icons/profile.svg";
import { DetailsRow, formatDate, DetailsRowStatus } from "../../helper/utility";
import { formatGenderLabel } from "../../lib/user/genderOptions";
import AddEditUserDialog from "./AddEditUserDialog";
import { AppConstant } from "../../lib/global/AppConstant";
import { RoleEnum } from "../../lib/global/RoleEnum";
import PasswordChangeDialog from "./PasswordChangeDialog";
import { openDialog } from "../../lib/global/DialogManager";

type EmployeeDetailsDialogProps = {
  userId: string;
  onClose: () => void;
  onRefreshData: () => void;
};

const EmployeeDetailsDialog: React.FC<EmployeeDetailsDialogProps> & {
  show: (userId: string, onRefreshData: () => void) => void;
} = ({ userId, onClose, onRefreshData }) => {
  const [userDetails, setUserDetails] = useState<UserModel>();
  const fetchRef = useRef(false);

  const fetchDataFromApi = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const { response, user } = await fetchUserById(userId);
      if (response) {
        setUserDetails(user!!);
      }
    } finally {
      fetchRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    void fetchDataFromApi();
  }, [fetchDataFromApi]);

  const onRefreshuser = async () => {
    await fetchDataFromApi();
    onRefreshData();
  };
  return (
    <>
      <Modal show={true} onHide={onClose} centered>
        <div className="custom-model-detail">
          <Modal.Header className="py-3 px-4 border-bottom-0">
            <Modal.Title as="h5" className="custom-modal-title">
              Employee Information
            </Modal.Title>
            <CustomCloseButton onClose={onClose} />
          </Modal.Header>
          <Modal.Body className="px-4 pb-4 pt-0">
            <div className="custom-info">
              <div>
                <p>Personal</p>
                <img
                  src={
                    userDetails?.profile_url
                      ? `${AppConstant.IMAGE_BASE_URL}${
                          userDetails?.profile_url
                        }?t=${Date.now()}`
                      : profileIcon
                  }
                  alt="User profile"
                  width="160px"
                  height="160px"
                />
              </div>

              <div className="custom-personal-details">
                <Col className="custom-helper-column">
                  <DetailsRow title="User ID" value={userDetails?.user_id} />
                  <DetailsRow title="User Name" value={userDetails?.name} />
                  <DetailsRow
                    title="Gender"
                    value={formatGenderLabel(userDetails?.gender)}
                  />
                  <DetailsRow
                    title="Date of Birth"
                    value={
                      userDetails?.date_of_birth
                        ? formatDate(String(userDetails.date_of_birth))
                        : "-"
                    }
                  />
                  <DetailsRow title="Email ID" value={userDetails?.email} />
                  <DetailsRow
                    title="Phone No"
                    value={userDetails?.phone_number}
                  />
                </Col>
                <Col className="custom-helper-column">
                  <DetailsRow title="Address" value={userDetails?.address} />
                  <DetailsRow title="State" value={userDetails?.state_name} />
                  <DetailsRow title="City" value={userDetails?.city_name} />
                  <DetailsRow
                    title="Postal Code"
                    value={userDetails?.pincode}
                  />
                </Col>
              </div>
              <img
                src={editIcon}
                alt="edit"
                onClick={() => {
                  AddEditUserDialog.show(3, true, userDetails!!, onRefreshuser);
                }}
              />
            </div>
            <Row className="custom-helper-row">
              <section
                className="custom-other-details"
                style={{ paddingBottom: "30px" }}
              >
                <h3>Login Details</h3>
                <DetailsRow title="Login ID" value={userDetails?.user_id} />
                {/* <DetailsRow title="Password" value="**********" /> */}
                <Row className="row custom-personal-row">
                  <label className="col custom-personal-row-title">
                    Password
                  </label>

                  <Row className="col custom-personal-row-value">
                    <label
                      className="col"
                      style={{
                        width: "250px",
                        display: "inline-block",
                        textAlign: "center",
                      }}
                    >
                      **********
                    </label>

                    <span
                      className="col"
                      style={{
                        fontFamily: "Inter",
                        fontSize: "14px",
                        fontWeight: "normal",
                        color: "var(--primary-txt-color)",
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        PasswordChangeDialog.show(userDetails!!, onRefreshuser);
                      }}
                    >
                      Change
                    </span>
                  </Row>
                </Row>
                <DetailsRow
                  title="Registered Date"
                  value={formatDate(
                    userDetails?.created_at ? userDetails?.created_at : ""
                  )}
                />
                <DetailsRowStatus
                  title="Status"
                  isActive={
                    userDetails?.is_active ? userDetails?.is_active : false
                  }
                />
              </section>
              <section className="custom-other-details">
                <h3>Role</h3>
                <div className="col custom-personal-row-value custom-radio-button mt-2">
                  {Array.from(RoleEnum.entries()).map(([key, { label }]) => (
                    <label key={key} className="custom-radio">
                      <input
                        type="radio"
                        name="role"
                        value={key}
                        checked={userDetails?.type === key}
                        readOnly
                      />
                      <span className="checkmark"></span> {label}
                    </label>
                  ))}
                </div>
              </section>
            </Row>
          </Modal.Body>
        </div>
      </Modal>
    </>
  );
};

EmployeeDetailsDialog.show = (userId: string, onRefreshData: () => void) => {
  openDialog("employee-details-modal", (close) => (
    <EmployeeDetailsDialog
      userId={userId}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default EmployeeDetailsDialog;
