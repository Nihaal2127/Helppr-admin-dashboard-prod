import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "./CustomCloseButton";
import Logo from "../assets/images/helper-logo.png";
import { openDialog } from "../lib/global/DialogManager";

export const openConfirmDialog = (
  title: string,
  confirmButtonText: string,
  cancleButtonText: string,
  onConfirm: () => void,
  iconName?: string
) => {
  openDialog("custom-confirm-modal", (close) => (
    <Modal
      show={true}
      onHide={close}
      centered
      dialogClassName="custom-big-modal"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <CustomCloseButton onClose={close} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-1 pt-0 mt-3">
        <img
          src={iconName ? iconName : Logo}
          alt="logo"
          width="70px"
          height="70px"
          style={{ display: "block", margin: "0 auto" }}
        />
        <label className="custom-dialog-title mt-6">{title}</label>
        <Row className="mt-5">
          <Col
            xs={12}
            className="text-center d-flex justify-content-end gap-3 "
          >
            <Button
              type="submit"
              className="custom-btn-primary"
              onClick={() => {
                close();
                onConfirm();
              }}
            >
              {confirmButtonText}
            </Button>

            <Button className="custom-btn-secondary" onClick={close}>
              {cancleButtonText}
            </Button>
          </Col>
        </Row>
      </Modal.Body>
    </Modal>
  ));
};
