import React from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { updateStatusDocument } from "../../services/partnerDocumentService";
import CustomTextField from "../../components/CustomTextField";
import { DocumentModel } from "../../lib/models/DocumentModel";
import { openDialog } from "../../lib/global/DialogManager";

type RejectDocumentDialogProps = {
  documentReject: DocumentModel;
  onClose: () => void;
  onRefreshData: () => void;
};

const RejectDocumentDialog: React.FC<RejectDocumentDialogProps> & {
  show: (documentReject: DocumentModel, onRefreshData: () => void) => void;
} = ({ documentReject, onClose, onRefreshData }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmitEvent = async (data: any) => {
    const payload = {
      rejected_reasone: data.rejected_reasone,
      status: 3,
    };

    let responseUser = await updateStatusDocument(payload, documentReject._id);
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
        size="lg"
      >
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            Document Reject
          </Modal.Title>
          <CustomCloseButton onClose={onClose} />
        </Modal.Header>
        <Modal.Body className="px-4 pb-4 pt-0">
          <form
            noValidate
            name="reject-document-form"
            id="reject-document-form"
            onSubmit={handleSubmit(onSubmitEvent)}
          >
            <Row>
              <CustomTextField
                label="Rejection Reason"
                controlId="rejected_reasone"
                placeholder="Enter rejection reason"
                register={register}
                error={errors.reason}
                validation={{ required: "Rejection reason is required" }}
              />
            </Row>
            <Row className="mt-4">
              <Col
                xs={12}
                className="text-center d-flex justify-content-end gap-3"
              >
                <Button type="submit" className="custom-btn-primary">
                  Reject
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

RejectDocumentDialog.show = (
  documentReject: DocumentModel,
  onRefreshData: () => void
) => {
  openDialog("reject-document-modal", (close) => (
    <RejectDocumentDialog
      documentReject={documentReject}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default RejectDocumentDialog;
