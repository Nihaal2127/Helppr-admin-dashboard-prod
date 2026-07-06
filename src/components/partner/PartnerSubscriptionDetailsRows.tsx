import React, { useMemo } from "react";
import { Col, Row } from "react-bootstrap";
import { DetailsRow } from "../../helper/utility";
import { formatDate } from "../../helper/dateFormat";
import { UserModel } from "../../lib/models/UserModel";
import {
  partnerSubscriptionDisplayFromUser,
  partnerSubscriptionPriceLabel,
} from "../../lib/partner/partnerSubscriptionView";

type PartnerSubscriptionDetailsRowsProps = {
  user?: UserModel | null;
};

/** Read-only subscription plan / price / dates for partner view dialogs. */
const PartnerSubscriptionDetailsRows: React.FC<
  PartnerSubscriptionDetailsRowsProps
> = ({ user }) => {
  const sub = useMemo(() => partnerSubscriptionDisplayFromUser(user), [user]);

  if (!sub) {
    return (
      <p className="text-muted small mb-0 py-1">No subscription</p>
    );
  }

  return (
    <Row className="g-2 mt-1">
      <Col xs={12} md={6}>
        <DetailsRow title="Plan" value={sub.planLabel} />
      </Col>
      <Col xs={12} md={6}>
        <DetailsRow title="Price" value={partnerSubscriptionPriceLabel(sub)} />
      </Col>
      <Col xs={12} md={6}>
        <DetailsRow
          title="Start Date"
          value={sub.startDate ? formatDate(sub.startDate) : "—"}
        />
      </Col>
      <Col xs={12} md={6}>
        <DetailsRow
          title="End Date"
          value={sub.endDate ? formatDate(sub.endDate) : "—"}
        />
      </Col>
    </Row>
  );
};

export default PartnerSubscriptionDetailsRows;
