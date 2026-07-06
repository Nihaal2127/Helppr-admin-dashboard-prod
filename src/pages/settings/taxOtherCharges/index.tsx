import { useState, useEffect, useCallback, useRef } from "react";
import { Row, Col, Button, Card } from "react-bootstrap";
import { fetchTaxOtherChargesById } from "../../../services/taxOtherChargesService";
import { TaxOtherChargesModel } from "../../../lib/models/TaxOtherChargesModel";
import AddEditTaxOtherChargesDialog from "./AddEditTaxOtherChargesDialog";
import CustomHeader from "../../../components/CustomHeader";
import SettingsNav from "../../../components/SettingsNav";
import { AppConstant } from "../../../lib/global/AppConstant";

const TaxOtherCharges = () => {
  const [taxOtherChargesDetails, setTaxOtherChargesDetails] =
    useState<TaxOtherChargesModel | null>(null);
  const fetchRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    const { response, taxOtherCharges } = await fetchTaxOtherChargesById();
    if (response) {
      setTaxOtherChargesDetails(taxOtherCharges);
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
          title="Tax & Other Charges"
          titlePrefix={<SettingsNav />}
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
                    User Platform Fee:
                  </label>
                  <label className="custom-subtitle-lable">
                    {" "}
                    {`${
                      taxOtherChargesDetails?.user_platform_fee
                        ? taxOtherChargesDetails?.user_platform_fee
                        : 0
                    }${AppConstant.percentageSymbol}`}
                  </label>
                </Col>
              </Row>
              <Row>
                <Col>
                  <label className="custom-title-lable">
                    Partner Platform Fee:
                  </label>
                  <label className="custom-subtitle-lable">{`${
                    taxOtherChargesDetails?.partner_platform_fee
                      ? taxOtherChargesDetails?.partner_platform_fee
                      : 0
                  }${AppConstant.percentageSymbol}`}</label>
                </Col>
              </Row>
              <Row>
                <Col>
                  <label className="custom-title-lable">
                    Partner Commision Fee:
                  </label>
                  <label className="custom-subtitle-lable">{`${
                    taxOtherChargesDetails?.partner_commision_fee
                      ? taxOtherChargesDetails?.partner_commision_fee
                      : 0
                  }${AppConstant.percentageSymbol}`}</label>
                </Col>
              </Row>
              <Row>
                <Col>
                  <label className="custom-title-lable">
                    Tax For Customer:
                  </label>
                  <label className="custom-subtitle-lable">{`${
                    taxOtherChargesDetails?.tax_for_customer
                      ? taxOtherChargesDetails?.tax_for_customer
                      : 0
                  }${AppConstant.percentageSymbol}`}</label>
                </Col>
              </Row>
              <Button
                type="submit"
                className="custom-btn-primary mt-3"
                onClick={(e) => {
                  e.preventDefault();
                  AddEditTaxOtherChargesDialog.show(
                    taxOtherChargesDetails === null ? false : true,
                    taxOtherChargesDetails,
                    () => refreshData()
                  );
                }}
              >
                {taxOtherChargesDetails === null ? "Add" : "Update"}
              </Button>
            </Card.Body>
          </Card>
        </div>
      </div>
    </>
  );
};

export default TaxOtherCharges;
