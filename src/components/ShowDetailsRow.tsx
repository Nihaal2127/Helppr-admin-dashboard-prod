import { Col, Row } from "react-bootstrap";

/** Profile / order form read-only field (label + value). */
export const ShowDetailsRow = ({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) => {
  return (
    <Col xs={4}>
      <Row>
        <Col sm={4}>
          <label className="custom-profile-lable">{title}</label>
        </Col>
        <Col>
          <label className="custom-personal-row-value">
            {value === undefined || value === "" || value === null
              ? "-"
              : String(value)}
          </label>
        </Col>
      </Row>
    </Col>
  );
};

export default ShowDetailsRow;
