import React, { useMemo } from "react";
import { Modal, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../../components/CustomCloseButton";
import { openDialog } from "../../../lib/global/DialogManager";
import { DetailsRow } from "../../../helper/utility";

type PortfolioModel = {
  _id?: string;
  partner_id: string;
  partner_name: string;
  franchise_name?: string;
  category: string;
  service: string;
  category_names?: string[];
  service_names?: string[];
  total_posts: string;
  total_images: string;
  total_videos: string;
  likes_count: string;
  comments_count: string;
  saves_count: string;
  ratings: string;
  location: string;
};

type ViewPortfolioManagementDialogProps = {
  portfolio: PortfolioModel | null;
  onClose: () => void;
  onRefreshData: () => void;
};

function BulletValueList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="text-muted">—</span>;
  }
  return (
    <ul className="mb-0 ps-3">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

const ViewPortfolioManagementDialog: React.FC<ViewPortfolioManagementDialogProps> & {
  show: (portfolio: PortfolioModel | null, onRefreshData: () => void) => void;
} = ({ portfolio, onClose }) => {
  const categoryItems = useMemo(() => {
    if (portfolio?.category_names?.length) return portfolio.category_names;
    const single = String(portfolio?.category ?? "").trim();
    return single ? [single] : [];
  }, [portfolio?.category, portfolio?.category_names]);

  const serviceItems = useMemo(() => {
    if (portfolio?.service_names?.length) return portfolio.service_names;
    const single = String(portfolio?.service ?? "").trim();
    return single ? [single] : [];
  }, [portfolio?.service, portfolio?.service_names]);

  return (
    <Modal show={true} onHide={onClose} centered>
      <div className="custom-order-model-detail">
        <Modal.Header className="py-3 px-4 border-bottom-0">
          <Modal.Title as="h5" className="custom-modal-title">
            Portfolio Information
          </Modal.Title>
          <CustomCloseButton onClose={onClose} />
        </Modal.Header>

        <Modal.Body
          className="px-4 pb-4 pt-0"
          style={{ maxHeight: "70vh", overflowY: "auto" }}
        >
          <section className="custom-other-details" style={{ padding: "10px" }}>
            <Row className="mb-2">
              <Col>
                <h3 className="mb-0">Portfolio Details</h3>
              </Col>
            </Row>

            <Row className="mb-2">
              <Col md={4} className="custom-helper-column">
                <DetailsRow
                  title="Partner Name"
                  value={portfolio?.partner_name}
                />
              </Col>
              <Col md={4} className="custom-helper-column">
                <DetailsRow
                  title="Franchise"
                  value={portfolio?.franchise_name}
                />
              </Col>
              <Col md={4} className="custom-helper-column">
                <DetailsRow
                  title="Total Posts"
                  value={portfolio?.total_posts}
                />
              </Col>
            </Row>

            <Row className="mb-2">
              <Col md={4} className="custom-helper-column">
                <DetailsRow
                  title="Total Images"
                  value={portfolio?.total_images}
                />
              </Col>
              <Col md={4} className="custom-helper-column">
                <DetailsRow
                  title="Total Videos"
                  value={portfolio?.total_videos}
                />
              </Col>
              <Col md={4} className="custom-helper-column">
                <DetailsRow
                  title="Likes Count"
                  value={portfolio?.likes_count}
                />
              </Col>
            </Row>

            <Row className="mb-2">
              <Col md={4} className="custom-helper-column">
                <DetailsRow
                  title="Saves Count"
                  value={portfolio?.saves_count}
                />
              </Col>
              <Col md={4} className="custom-helper-column">
                <DetailsRow title="Ratings" value={portfolio?.ratings} />
              </Col>
            </Row>

            <Row className="mb-2">
              <Col md={4} className="custom-helper-column">
                <DetailsRow
                  title="Categories"
                  value={<BulletValueList items={categoryItems} />}
                />
              </Col>
              <Col md={4} className="custom-helper-column">
                <DetailsRow
                  title="Services"
                  value={<BulletValueList items={serviceItems} />}
                />
              </Col>
            </Row>
          </section>
        </Modal.Body>
      </div>
    </Modal>
  );
};

ViewPortfolioManagementDialog.show = (
  portfolio: PortfolioModel | null,
  onRefreshData: () => void
) => {
  openDialog("portfolio-details-modal", (close: () => void) => (
    <ViewPortfolioManagementDialog
      portfolio={portfolio}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default ViewPortfolioManagementDialog;
