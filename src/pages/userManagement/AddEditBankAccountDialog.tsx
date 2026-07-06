import React from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { showErrorAlert } from "../../lib/global/alertHelper";
import { createOrUpdateBankAccount } from "../../services/bankAccountService";
import CustomTextField from "../../components/CustomTextField";
import { REQUIRED_FIELD_RULE } from "../../components/RequiredFieldMark";
import CustomTextFieldRadio from "../../components/CustomTextFieldRadio";
import { BankAccountModel } from "../../lib/models/BankAccountModel";
import { openDialog } from "../../lib/global/DialogManager";
import { getStatusOptions } from "../../helper/utility";

type AddEditBankAccountDialogProps = {
  partnerId: string;
  isEditable: boolean;
  bankAccount: BankAccountModel | null;
  onClose: () => void;
  onRefreshData: () => void;
};

const AddEditBankAccountDialog: React.FC<AddEditBankAccountDialogProps> & {
  show: (
    partnerId: string,
    isEditable: boolean,
    user: BankAccountModel | null,
    onRefreshData: () => void
  ) => void;
} = ({ partnerId, isEditable, bankAccount, onClose, onRefreshData }) => {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<BankAccountModel>({
    defaultValues: {
      account_holder_name: bankAccount?.account_holder_name || "",
      account_number: bankAccount?.account_number || "",
      ifsc_code: bankAccount?.ifsc_code || "",
      branch_name: bankAccount?.branch_name || "",
      bank_name: bankAccount?.bank_name || "",
      is_active: bankAccount?.is_active ?? true,
    },
  });

  const onSubmitEvent = async (data: BankAccountModel) => {
    const isActive =
      typeof data.is_active === "string"
        ? data.is_active === "true"
        : Boolean(data.is_active);

    const payload = {
      partner_id: partnerId,
      account_holder_name: data.account_holder_name,
      account_number: data.account_number,
      ifsc_code: data.ifsc_code,
      bank_name: data.bank_name,
      branch_name: data.branch_name,
      is_primary: true,
      is_active: isActive,
    };

    let responseUser;
    if (isEditable) {
      if (!bankAccount?._id) {
        showErrorAlert("Unable to update. ID is missing.");
        return;
      }
      responseUser = await createOrUpdateBankAccount(
        payload,
        true,
        bankAccount?._id
      );
    } else {
      responseUser = await createOrUpdateBankAccount(payload, false);
    }

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
            {isEditable ? "Update" : "Add"} Bank
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
              <CustomTextField
                label="Account Name"
                controlId="account_holder_name"
                placeholder="Enter Account Name"
                register={register}
                error={errors.account_holder_name}
                validation={REQUIRED_FIELD_RULE}
                hideValidationFeedback
              />
              <CustomTextField
                label="Account Number"
                controlId="account_number"
                placeholder="Enter Account Number"
                register={register}
                error={errors.account_number}
                validation={REQUIRED_FIELD_RULE}
                hideValidationFeedback
              />
              <CustomTextField
                label="IFSC Code"
                controlId="ifsc_code"
                placeholder="Enter IFSC Code"
                register={register}
                error={errors.ifsc_code}
                validation={REQUIRED_FIELD_RULE}
                hideValidationFeedback
              />
              <CustomTextField
                label="Bank Name"
                controlId="bank_name"
                placeholder="Enter Bank Name"
                register={register}
                error={errors.bank_name}
                validation={REQUIRED_FIELD_RULE}
                hideValidationFeedback
              />
              <CustomTextField
                label="Branch Name"
                controlId="branch_name"
                placeholder="Enter Branch Name"
                register={register}
                error={errors.branch_name}
                validation={REQUIRED_FIELD_RULE}
                hideValidationFeedback
              />
              <CustomTextFieldRadio
                label="Account Status"
                name="is_active"
                options={getStatusOptions()}
                defaultValue={String(bankAccount?.is_active ?? true)}
                isEditable={true}
                setValue={setValue}
              />
            </Row>
            <Row className="mt-4">
              <Col
                xs={12}
                className="text-center d-flex justify-content-end gap-3"
              >
                <Button type="submit" className="custom-btn-primary">
                  {isEditable ? "Update" : "Add"}
                </Button>

                <Button className="custom-btn-secondary" onClick={onClose}>
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

AddEditBankAccountDialog.show = (
  partnerId: string,
  isEditable: boolean,
  bankAccount: BankAccountModel | null,
  onRefreshData: () => void
) => {
  openDialog("details-modal", (close) => (
    <AddEditBankAccountDialog
      partnerId={partnerId}
      isEditable={isEditable}
      bankAccount={bankAccount}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default AddEditBankAccountDialog;
