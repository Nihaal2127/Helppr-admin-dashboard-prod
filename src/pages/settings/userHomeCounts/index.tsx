import { useState, useEffect, useCallback, useRef } from "react";
import { Row, Col, Button, Card } from "react-bootstrap";
import { fetchUserHomeCountsById } from "../../../services/userHomeCountsService";
import { UserHomeCountsModel } from "../../../lib/models/UserHomeCountsModel";
import AddEditUserHomeCountsDialog from "./AddEditUserHomeCountsDialog";
import CustomHeader from "../../../components/CustomHeader";
import SettingsNav from "../../../components/SettingsNav";
const UserHomeCounts = () => {
  const [userHomeCounts, setUserHomeCounts] =
    useState<UserHomeCountsModel | null>(null);
  const fetchRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    const { response, userHomeCounts } = await fetchUserHomeCountsById();
    if (response) {
      setUserHomeCounts(userHomeCounts);
    }
    fetchRef.current = false;
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refreshData = async () => {
    await fetchData();
  };

  return (
    <>
      <div className="main-page-content">
        <CustomHeader
          title="User Home Counts"
          titlePrefix={<SettingsNav />}
          hideFranchiseDropdown
        />
        <div
          className="d-flex justify-content-center align-items-center"
          style={{ minHeight: "80vh" }}
        >
          <Card
            style={{
              width: "60%",
              padding: "20px",
              borderRadius: "16px",
              backgroundColor: "var(--bg-color)",
              boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.1)",
            }}
          >
            <Card.Body>
              <Row>
                <Col>
                  <label className="custom-title-lable">
                    Total Distance Travelled:
                  </label>
                  <label className="custom-subtitle-lable">
                    {" "}
                    {`${
                      userHomeCounts?.total_distance_travelled
                        ? userHomeCounts?.total_distance_travelled
                        : 0
                    }`}
                  </label>
                </Col>
              </Row>
              <Row>
                <Col>
                  <label className="custom-title-lable">Services Served:</label>
                  <label className="custom-subtitle-lable">{`${
                    userHomeCounts?.served ? userHomeCounts?.served : 0
                  }`}</label>
                </Col>
              </Row>
              <Row>
                <Col>
                  <label className="custom-title-lable">
                    Consultations Done:
                  </label>
                  <label className="custom-subtitle-lable">{`${
                    userHomeCounts?.consulted ? userHomeCounts?.consulted : 0
                  }`}</label>
                </Col>
              </Row>
              <Row>
                <Col>
                  <label className="custom-title-lable">Leads Captured:</label>
                  <label className="custom-subtitle-lable">{`${
                    userHomeCounts?.captured ? userHomeCounts?.captured : 0
                  }`}</label>
                </Col>
              </Row>
              <Button
                type="submit"
                className="custom-btn-primary mt-3"
                onClick={(e) => {
                  e.preventDefault();
                  AddEditUserHomeCountsDialog.show(
                    userHomeCounts === null ? false : true,
                    userHomeCounts,
                    () => refreshData()
                  );
                }}
              >
                {userHomeCounts === null ? "Add" : "Update"}
              </Button>
            </Card.Body>
          </Card>
        </div>
      </div>
    </>
  );
};

export default UserHomeCounts;
