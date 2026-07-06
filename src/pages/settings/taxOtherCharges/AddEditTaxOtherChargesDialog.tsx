import React from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../../components/CustomCloseButton";
import { showErrorAlert } from "../../../lib/global/alertHelper";
import CustomTextField from "../../../components/CustomTextField";
import { TaxOtherChargesModel } from "../../../lib/models/TaxOtherChargesModel";
import { createOrUpdateTaxOtherCharges } from "../../../services/taxOtherChargesService";
import { openDialog } from "../../../lib/global/DialogManager";

type AddEditTaxOtherChargesDialogProps = {
  isEditable: boolean;
  taxOtherCharges: TaxOtherChargesModel | null;
  onClose: () => void;
  onRefreshData: () => void;
};

const AddEditTaxOtherChargesDialog: React.FC<AddEditTaxOtherChargesDialogProps> & {
  show: (
    isEditable: boolean,
    user: TaxOtherChargesModel | null,
    onRefreshData: () => void
  ) => void;
} = ({ isEditable, taxOtherCharges, onClose, onRefreshData }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TaxOtherChargesModel>({
    defaultValues: {
      user_platform_fee: taxOtherCharges?.user_platform_fee || 0,
      partner_platform_fee: taxOtherCharges?.partner_platform_fee || 0,
      partner_commision_fee: taxOtherCharges?.partner_commision_fee || 0,
      tax_for_customer: taxOtherCharges?.tax_for_customer || 0,
    },
  });

  const onSubmitEvent = async (data: TaxOtherChargesModel) => {
    const payload = {
      user_platform_fee: data.user_platform_fee,
      partner_platform_fee: data.partner_platform_fee,
      partner_commision_fee: data.partner_commision_fee,
      tax_for_customer: data.tax_for_customer,
    };

    let responseUser;
    if (isEditable) {
      if (!taxOtherCharges?._id) {
        showErrorAlert("Unable to update. ID is missing.");
        return;
      }
      responseUser = await createOrUpdateTaxOtherCharges(
        payload,
        true,
        taxOtherCharges?._id
      );
    } else {
      responseUser = await createOrUpdateTaxOtherCharges(payload, false);
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
            {isEditable ? "Edit" : "Add"} Tax& Other Charges
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
                label="User Platform Fee"
                controlId="user_platform_fee"
                placeholder="Enter user platform fee"
                register={register}
                error={errors.user_platform_fee}
                validation={{ required: "User platform fee is required" }}
              />
              <CustomTextField
                label="Partner Platform Fee"
                controlId="partner_platform_fee"
                placeholder="Enter partner platform fee"
                register={register}
                error={errors.partner_platform_fee}
                validation={{ required: "Partner platform fee is required" }}
              />
              <CustomTextField
                label="Partner Commision Fee"
                controlId="partner_commision_fee"
                placeholder="Enter partner commision fee"
                register={register}
                error={errors.partner_commision_fee}
                validation={{ required: "Partner commision fee is required" }}
              />
              <CustomTextField
                label="Tax For Customer"
                controlId="tax_for_customer"
                placeholder="Enter tax for customer"
                register={register}
                error={errors.tax_for_customer}
                validation={{ required: "Tax for customer is required" }}
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

AddEditTaxOtherChargesDialog.show = (
  isEditable: boolean,
  taxOtherCharges: TaxOtherChargesModel | null,
  onRefreshData: () => void
) => {
  openDialog("add-user-details-modal", (close) => (
    <AddEditTaxOtherChargesDialog
      isEditable={isEditable}
      taxOtherCharges={taxOtherCharges}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default AddEditTaxOtherChargesDialog;
