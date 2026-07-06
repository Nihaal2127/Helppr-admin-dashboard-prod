import React from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../../components/CustomCloseButton";
import CustomTextField from "../../../components/CustomTextField";
import { openDialog } from "../../../lib/global/DialogManager";
import { QuoteSettingsModel } from "../../../lib/models/QuoteSettingsModel";
import { saveQuoteSettings } from "../../../services/quoteSettingsService";

type AddEditGeneralSettingsDialogProps = {
  isEditable: boolean;
  quoteSettings: QuoteSettingsModel | null;
  onClose: () => void;
  onRefreshData: () => void;
};

const AddEditGeneralSettingsDialog: React.FC<AddEditGeneralSettingsDialogProps> & {
  show: (
    isEditable: boolean,
    quoteSettings: QuoteSettingsModel | null,
    onRefreshData: () => void
  ) => void;
} = ({ isEditable, quoteSettings, onClose, onRefreshData }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Pick<
    QuoteSettingsModel,
    "free_quotes_per_user" | "no_of_quotes" | "quotes_price"
  >>({
    defaultValues: {
      free_quotes_per_user: quoteSettings?.free_quotes_per_user ?? 0,
      no_of_quotes: quoteSettings?.no_of_quotes ?? 0,
      quotes_price: quoteSettings?.quotes_price ?? 0,
    },
  });

  const onSubmitEvent = async (
    data: Pick<
      QuoteSettingsModel,
      "free_quotes_per_user" | "no_of_quotes" | "quotes_price"
    >
  ) => {
    const payload = {
      free_quotes_per_user: Number(data.free_quotes_per_user),
      no_of_quotes: Number(data.no_of_quotes),
      quotes_price: Number(data.quotes_price),
    };

    const ok = await saveQuoteSettings(payload, quoteSettings);

    if (ok) {
      onClose?.();
      onRefreshData();
    }
  };

  return (
    <Modal
      show
      onHide={onClose}
      centered
      dialogClassName="custom-big-modal"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {isEditable ? "Update" : "Add"} General Settings
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>

      <Modal.Body className="px-4 pb-4 pt-0">
        <form
          noValidate
          name="general-settings-form"
          id="general-settings-form"
          onSubmit={handleSubmit(onSubmitEvent)}
        >
          <Row>
            <CustomTextField
              label="Free Quotes per User"
              controlId="free_quotes_per_user"
              placeholder="Enter free quotes per user"
              register={register}
              error={errors.free_quotes_per_user}
              validation={{ required: "Free quotes per user is required" }}
            />

            <CustomTextField
              label="No of Quotes"
              controlId="no_of_quotes"
              placeholder="Enter number of quotes"
              register={register}
              error={errors.no_of_quotes}
              validation={{ required: "No of quotes is required" }}
            />

            <CustomTextField
              label="Price"
              controlId="quotes_price"
              placeholder="Enter price"
              register={register}
              error={errors.quotes_price}
              validation={{ required: "Price is required" }}
            />
          </Row>

          <Row className="mt-4">
            <Col
              xs={12}
              className="text-center d-flex justify-content-end gap-3"
            >
              <Button type="submit" className="custom-btn-primary px-4">
                {isEditable ? "Update" : "Add"}
              </Button>
              <Button
                type="button"
                className="custom-btn-secondary px-4"
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

AddEditGeneralSettingsDialog.show = (
  isEditable: boolean,
  quoteSettings: QuoteSettingsModel | null,
  onRefreshData: () => void
) => {
  openDialog("general-settings-modal", (close) => (
    <AddEditGeneralSettingsDialog
      isEditable={isEditable}
      quoteSettings={quoteSettings}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default AddEditGeneralSettingsDialog;
