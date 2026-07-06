import React, { useState, useEffect, useRef, useCallback } from "react";
import { Modal, Col, Row } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { TicketModel } from "../../lib/models/TicketModel";
import { fetchTicketById } from "../../services/ticketService";
import editIcon from "../../assets/icons/edit_red.svg";
import {
  DetailsRow,
  formatDate,
  DetailsResolveStatusRow,
  FullDetailsRow,
} from "../../helper/utility";
import EditTicketDialog from "./EditTicketDialog";
import { openDialog } from "../../lib/global/DialogManager";

type TicketDetailsDialogProps = {
  ticketId: string;
  onClose: () => void;
  onRefreshData: () => void;
};

const TicketDetailsDialog: React.FC<TicketDetailsDialogProps> & {
  show: (ticketId: string, onRefreshData: () => void) => void;
} = ({ ticketId, onClose, onRefreshData }) => {
  const [ticketDetails, setTicketDetails] = useState<TicketModel>();
  const fetchRef = useRef(false);

  const fetchDataFromApi = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const { response, ticket } = await fetchTicketById(ticketId);
      if (response) {
        setTicketDetails(ticket!!);
      }
    } finally {
      fetchRef.current = false;
    }
  }, [ticketId]);

  useEffect(() => {
    void fetchDataFromApi();
  }, [fetchDataFromApi]);

  const onRefreshTicket = async () => {
    await fetchDataFromApi();
    onRefreshData();
  };
  return (
    <>
      <Modal show={true} onHide={onClose} centered>
        <div className="custom-model-detail">
          <Modal.Header className="py-3 px-4 border-bottom-0">
            <Modal.Title as="h5" className="custom-modal-title">
              Ticket Information
            </Modal.Title>
            <CustomCloseButton onClose={onClose} />
          </Modal.Header>
          <Modal.Body className="px-4 pb-4 pt-0">
            <Row className="custom-helper-row">
              <section
                className="custom-other-details"
                style={{ padding: "10px" }}
              >
                <h3>Ticket Details</h3>
                <DetailsRow
                  title="Created Date"
                  value={formatDate(
                    ticketDetails?.created_at ? ticketDetails?.created_at : ""
                  )}
                />
                <DetailsRow
                  title="Status"
                  value={ticketDetails?.status === 1 ? "Open" : "Close"}
                />
                <DetailsRow
                  title="Contact Type"
                  value={ticketDetails?.contact_type === 1 ? "Mail" : "Call"}
                />
                <FullDetailsRow title="Query" value={ticketDetails?.query} />
              </section>
              <section
                className="custom-other-details"
                style={{ padding: "10px" }}
              >
                <Row className="d-flex justify-content-between align-items-center mb-2">
                  <Col>
                    <h3 className="mb-0">Resolved Details</h3>
                  </Col>
                  {ticketDetails?.status === 1 && (
                    <Col className="text-end">
                      <img
                        src={editIcon}
                        alt="edit"
                        onClick={() => {
                          EditTicketDialog.show(true, ticketDetails!!, () =>
                            onRefreshTicket()
                          );
                        }}
                      />
                    </Col>
                  )}
                </Row>
                <DetailsRow
                  title="Close Date"
                  value={formatDate(
                    ticketDetails?.close_date ? ticketDetails?.close_date : ""
                  )}
                />
                <DetailsRow
                  title="Resolved Name"
                  value={ticketDetails?.resolved_by_name}
                />
                <DetailsResolveStatusRow
                  title="Resolved Status"
                  value={ticketDetails?.resolve_status}
                />
                <FullDetailsRow
                  title="Description"
                  value={ticketDetails?.description}
                />
              </section>
            </Row>

            <section
              className="custom-other-details mt-3"
              style={{ padding: "10px" }}
            >
              <h3>User</h3>
              <Row>
                <Col className="custom-helper-column">
                  <DetailsRow
                    title="User ID"
                    value={ticketDetails?.user_unique_id}
                  />
                  <DetailsRow title="Email ID" value={ticketDetails?.email} />
                </Col>
                <Col className="custom-helper-column">
                  <DetailsRow
                    title="User Name"
                    value={ticketDetails?.created_by_name}
                  />
                  <DetailsRow
                    title="Phone No"
                    value={ticketDetails?.phone_number}
                  />
                </Col>
              </Row>
            </section>
          </Modal.Body>
        </div>
      </Modal>
    </>
  );
};

TicketDetailsDialog.show = (ticketId: string, onRefreshData: () => void) => {
  openDialog("ticket-details-modal", (close) => (
    <TicketDetailsDialog
      ticketId={ticketId}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default TicketDetailsDialog;
