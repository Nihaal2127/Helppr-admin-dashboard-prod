import React from "react";
import { useForm } from "react-hook-form";
import { Modal, Button, Row, Col, Form } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { TicketModel } from "../../lib/models/TicketModel";
import CustomTextField from "../../components/CustomTextField";
import CustomTextFieldRadio from "../../components/CustomTextFieldRadio";
import { showErrorAlert } from "../../lib/global/alertHelper";
import { createOrUpdateTicket } from "../../services/ticketService";
import { getLocalStorage } from "../../lib/global/localStorageHelper";
import { AppConstant } from "../../lib/global/AppConstant";
import { openDialog } from "../../lib/global/DialogManager";
import {
  disputeRecordToStatusUi,
  disputeStatusUiToApi,
  disputeStatusUiToApiStatus,
  ticketToDisputeStatusUi,
} from "../../lib/ticket/ticketDisputeHelpers";
import { DisputeRecordModel } from "../../lib/models/ChatModel";
import { updateDisputeStatus } from "../../services/disputeService";

type EditTicketDialogProps = {
  isEditable: boolean;
  ticket: TicketModel | null;
  onClose: () => void;
  onRefreshData: () => void;
  /** Dispute chat list: only Status + Contact Type; other fields preserved from ticket on save */
  disputeFieldsOnly?: boolean;
};

function EditTicketDialogModal({
  isEditable,
  ticket,
  onClose,
  onRefreshData,
  disputeFieldsOnly,
}: EditTicketDialogProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    defaultValues: disputeFieldsOnly
      ? {
          disputeStatus: ticketToDisputeStatusUi(ticket),
          contact_type: String(ticket?.contact_type ?? 1),
        }
      : {
          status: ticket?.status || 1,
          resolve_status: ticket?.resolve_status || 1,
          description: ticket?.description || "",
          contact_type: ticket?.contact_type ?? 1,
        },
  });

  const status = [
    { label: "Open", value: "1" },
    { label: "Close", value: "2" },
  ];
  const resolveStatus = [
    { label: "Pending", value: "1" },
    { label: "Resolve", value: "2" },
    { label: "Unresolve", value: "3" },
  ];
  const onSubmitEvent = async (data: Record<string, unknown>) => {
    const payload = disputeFieldsOnly
      ? (() => {
          const { status: st, resolve_status: rs } = disputeStatusUiToApi(
            String(data.disputeStatus) as "open" | "pending" | "closed",
            ticket
          );
          return {
            resolve_by_id: getLocalStorage(AppConstant.createdById),
            status: st,
            resolve_status: rs,
            contact_type: Number(data.contact_type ?? ticket?.contact_type ?? 1),
            description: ticket?.description ?? "",
          };
        })()
      : {
          resolve_by_id: getLocalStorage(AppConstant.createdById),
          status: Number(data.status),
          resolve_status: Number(data.resolve_status),
          description: data.description as string,
        };

    let response;
    if (isEditable) {
      if (!ticket?._id) {
        showErrorAlert("Unable to update. ID is missing.");
        return;
      }

      response = await createOrUpdateTicket(payload, true, ticket?._id);
    } else {
      response = await createOrUpdateTicket(payload, false);
    }

    if (response) {
      onClose && onClose();
      onRefreshData();
    }
  };

  return (
    <Modal
      show={true}
      onHide={onClose}
      centered
      dialogClassName="custom-big-modal"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          {isEditable ? "Update" : "Add"} Ticket
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
            {!disputeFieldsOnly && (
              <CustomTextField
                label="Description"
                controlId="description"
                placeholder="Enter Description"
                as="textarea"
                rows={5}
                register={register}
                error={errors.description}
                validation={{ required: "Description is required" }}
              />
            )}
            {disputeFieldsOnly ? (
              <>
                <Row className="align-items-center">
                  <Col sm={4} className="mt-2">
                    <label className="custom-profile-lable">Status</label>
                  </Col>
                  <Col>
                    <Form.Select
                      {...register("disputeStatus")}
                      className="mt-2"
                      disabled={!isEditable}
                    >
                      <option value="open">Open</option>
                      <option value="pending">Pending</option>
                      <option value="closed">Closed</option>
                    </Form.Select>
                  </Col>
                </Row>
                <Row className="align-items-center">
                  <Col sm={4} className="mt-2">
                    <label className="custom-profile-lable">Contact Type</label>
                  </Col>
                  <Col>
                    <Form.Select
                      {...register("contact_type")}
                      className="mt-2"
                      disabled={!isEditable}
                    >
                      <option value="1">Mail</option>
                      <option value="2">Call</option>
                      <option value="3">Chat</option>
                    </Form.Select>
                  </Col>
                </Row>
              </>
            ) : (
              <>
                <CustomTextFieldRadio
                  label="Status"
                  name="status"
                  options={status}
                  defaultValue={isEditable ? String(ticket?.status) : "1"}
                  isEditable={isEditable}
                  setValue={setValue}
                />
                <CustomTextFieldRadio
                  label="Resolve Status"
                  name="resolve_status"
                  options={resolveStatus}
                  defaultValue={
                    isEditable ? String(ticket?.resolve_status) : "1"
                  }
                  isEditable={isEditable}
                  setValue={setValue}
                />
              </>
            )}
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
  );
}

function EditDisputeStatusDialogModal({
  dispute,
  onClose,
  onRefreshData,
}: {
  dispute: DisputeRecordModel;
  onClose: () => void;
  onRefreshData: () => void;
}) {
  const { register, handleSubmit } = useForm<{ disputeStatus: string }>({
    defaultValues: {
      disputeStatus: disputeRecordToStatusUi(dispute),
    },
  });

  const onSubmit = async (data: { disputeStatus: string }) => {
    const apiStatus = disputeStatusUiToApiStatus(
      data.disputeStatus as "open" | "pending" | "closed"
    );
    const ok = await updateDisputeStatus(dispute._id, apiStatus);
    if (ok) {
      onClose();
      onRefreshData();
    }
  };

  return (
    <Modal show centered onHide={onClose} dialogClassName="custom-big-modal">
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Update Dispute Status
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Row className="align-items-center">
            <Col sm={4} className="mt-2">
              <label className="custom-profile-lable">Status</label>
            </Col>
            <Col>
              <Form.Select {...register("disputeStatus")} className="mt-2">
                <option value="open">Open</option>
                <option value="pending">In Review</option>
                <option value="closed">Closed</option>
              </Form.Select>
            </Col>
          </Row>
          <Row className="mt-4">
            <Col xs={12} className="text-end d-flex justify-content-end gap-3">
              <Button type="submit" className="custom-btn-primary">
                Update
              </Button>
              <Button type="button" className="custom-btn-secondary" onClick={onClose}>
                Cancel
              </Button>
            </Col>
          </Row>
        </form>
      </Modal.Body>
    </Modal>
  );
}

function showEditDisputeDialog(
  dispute: DisputeRecordModel,
  onRefreshData: () => void
) {
  openDialog("edit-dispute-modal", (close) => (
    <EditDisputeStatusDialogModal
      dispute={dispute}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
}

function showEditTicketDialog(
  isEditable: boolean,
  ticket: TicketModel | null,
  onRefreshData: () => void,
  disputeFieldsOnly?: boolean
) {
  openDialog("edit-ticket-modal", (close) => (
    <EditTicketDialogModal
      isEditable={isEditable}
      ticket={ticket}
      onClose={close}
      onRefreshData={onRefreshData}
      disputeFieldsOnly={disputeFieldsOnly}
    />
  ));
}

type EditTicketDialogWithShow = typeof EditTicketDialogModal & {
  show: typeof showEditTicketDialog;
  showDispute: typeof showEditDisputeDialog;
};

const EditTicketDialog = Object.assign(EditTicketDialogModal, {
  show: showEditTicketDialog,
  showDispute: showEditDisputeDialog,
}) as EditTicketDialogWithShow;

export default EditTicketDialog;
