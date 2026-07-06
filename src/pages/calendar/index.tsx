import React from "react";
import { Row, Col, Button } from "react-bootstrap";
import CustomHeader from "../../components/CustomHeader";
import MyCalendar from "../../components/MyCalendar";
import { useFranchiseHeaderForm } from "../../lib/global/hooks/useFranchiseScopedGetCount";

const CalendarPage: React.FC = () => {
  const { register, setValue, franchiseId } = useFranchiseHeaderForm();

  return (
    <div className="main-page-content">
      <CustomHeader title="Calendar" register={register} setValue={setValue} />

      <div className="custom-dashboard-card d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h3 className="custom-dashboard-title mb-0">Appointments</h3>
        <Button
          className="btn-danger d-md-none"
          type="button"
          onClick={() =>
            document.getElementById("openScheduleModalBtn")?.click()
          }
        >
          <i className="bi bi-plus-lg me-1" />
          Schedule
        </Button>
      </div>

      <Row>
        <Col md={12}>
          <div className="custom-dashboard-card calendar-wrapper">
            <MyCalendar franchiseId={franchiseId} />
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default CalendarPage;
