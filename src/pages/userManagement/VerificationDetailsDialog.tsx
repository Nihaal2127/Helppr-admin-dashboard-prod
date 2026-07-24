import React, { useState, useEffect, useRef, useCallback } from "react";
import { Modal, Col, Row, Button } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { UserModel } from "../../lib/models/UserModel";
import { fetchUserById } from "../../services/userService";
import {
  DetailsRow,
  formatDate,
  verificationStatusCell,
} from "../../helper/utility";
import { DocumentModel } from "../../lib/models/DocumentModel";
import { openConfirmDialog } from "../../components/CustomConfirmDialog";
import { updateStatusDocument } from "../../services/partnerDocumentService";
import { AppConstant } from "../../lib/global/AppConstant";
import { CustomImagePreviewDialog } from "../../components/CustomImagePreview";
import RejectDocumentDialog from "./RejectDocumentDialog";
import { openDialog } from "../../lib/global/DialogManager";

type VerificationDetailsDialogProps = {
  userId: string;
  onClose: () => void;
  onRefreshData: () => void;
};

const VerificationDetailsDialog: React.FC<VerificationDetailsDialogProps> & {
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

  const verificationStatusChange = async (
    status: number,
    document: DocumentModel
  ) => {
    openConfirmDialog(
      "Are you sure you want to verify this document?",
      "Verify",
      "Cancel",
      async () => {
        const payload = {
          status: status,
        };
        const response = await updateStatusDocument(payload, document._id);
        if (response) {
          onRefreshUser();
        }
      }
    );
  };

  const rejectDocument = async (document: DocumentModel) => {
    RejectDocumentDialog.show(document, () => onRefreshUser());
  };

  const onRefreshUser = async () => {
    await fetchDataFromApi();
    onRefreshData();
  };
  return (
    <>
      <Modal show={true} onHide={onClose} centered>
        <div className="custom-model-detail">
          <Modal.Header className="py-3 px-4 border-bottom-0">
            <Modal.Title as="h5" className="custom-modal-title">
              Verification Documents
            </Modal.Title>
            <CustomCloseButton onClose={onClose} />
          </Modal.Header>
          <Modal.Body className="px-4 pb-4 pt-0">
            <Row className="custom-helper-row">
              {userDetails?.documents?.map((document) => (
                <section className="custom-other-details">
                  <h3 className="d-flex justify-content-center mt-2">
                    {document.name}
                  </h3>
                  <DetailsRow
                    title="Date"
                    value={formatDate(
                      userDetails?.created_at ? userDetails?.created_at : ""
                    )}
                  />
                  <DetailsRow
                    title="Status"
                    value={verificationStatusCell(document.verification_status)(
                      {}
                    )}
                  />
                  {document.verification_status === 3 && (
                    <DetailsRow
                      title="Reason"
                      value={document.rejected_reasone}
                    />
                  )}
                  {document.document_image === "" ? (
                    <h3 className="d-flex justify-content-center mt-2">
                      {" "}
                      Document Not Provide
                    </h3>
                  ) : (
                    <>
                      <div className="d-flex justify-content-center align-items-center mt-2">
                        <img
                          src={`${AppConstant.IMAGE_BASE_URL}${document.document_image}`}
                          alt="document"
                          className="img-fluid"
                          onClick={() => CustomImagePreviewDialog(document)}
                          style={{ width: "80%", height: "80%" }}
                        />
                      </div>

                      {document.verification_status === 1 && (
                        <Row className="mt-4">
                          <Col
                            xs={12}
                            className="text-center d-flex justify-content-end gap-3"
                          >
                            <Button
                              className="custom-btn-primary"
                              onClick={() => rejectDocument(document)}
                            >
                              Rejected
                            </Button>
                            <Button
                              type="button"
                              className="custom-btn-secondary"
                              onClick={() =>
                                verificationStatusChange(2, document)
                              }
                            >
                              Verified
                            </Button>
                          </Col>
                        </Row>
                      )}
                    </>
                  )}
                </section>
              ))}
            </Row>
          </Modal.Body>
        </div>
      </Modal>
    </>
  );
};

VerificationDetailsDialog.show = (
  userId: string,
  onRefreshData: () => void
) => {
  openDialog("user-details-modal", (close) => (
    <VerificationDetailsDialog
      userId={userId}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default VerificationDetailsDialog;
