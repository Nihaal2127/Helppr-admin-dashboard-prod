import { useState, useEffect, useCallback, useRef } from "react";
import { Row, Col, Card, Button } from "react-bootstrap";
import CustomHeader from "../../../components/CustomHeader";
import SettingsNav from "../../../components/SettingsNav";
import AddEditGeneralSettingsDialog from "./AddEditGeneralSettingsDialog";
import { fetchQuoteSettings } from "../../../services/quoteSettingsService";
import { QuoteSettingsModel } from "../../../lib/models/QuoteSettingsModel";
import { AppConstant } from "../../../lib/global/AppConstant";

const GeneralSettings = () => {
  const [quoteSettings, setQuoteSettings] = useState<QuoteSettingsModel | null>(
    null
  );
  const fetchRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    const { response, quoteSettings: record } = await fetchQuoteSettings();
    if (response) {
      setQuoteSettings(record);
    } else {
      setQuoteSettings(null);
    }
    fetchRef.current = false;
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refreshData = async () => {
    await fetchData();
  };

  return (
    <div className="main-page-content">
      <CustomHeader
        title="General Settings"
        titlePrefix={<SettingsNav />}
        hideFranchiseDropdown
      />

      <div
        className="d-flex justify-content-center align-items-center"
        style={{ minHeight: "80vh" }}
      >
        <Card
          className="border rounded shadow-sm"
          style={{
            width: "400px",
            backgroundColor: "var(--bg-color)",
          }}
        >
          <Card.Body className="p-3">
            <div className="mb-3">
              <h6 className="text-danger fw-medium mb-2">Free Quote Limit</h6>
              <Row className="align-items-center">
                <Col xs={7}>
                  <span className="fw-medium">Free Quotes per User</span>
                </Col>
                <Col xs={5} className="text-end">
                  <span className="text-muted">
                    {quoteSettings?.free_quotes_per_user ?? 0}
                  </span>
                </Col>
              </Row>
            </div>

            <div className="mb-3">
              <h6 className="text-danger fw-medium mb-2">Paid Quotes</h6>
              <Row className="align-items-center mb-2">
                <Col xs={7}>
                  <span className="fw-medium">No of Quotes</span>
                </Col>
                <Col xs={5} className="text-end">
                  <span className="text-muted">
                    {quoteSettings?.no_of_quotes ?? 0}
                  </span>
                </Col>
              </Row>
              <Row className="align-items-center">
                <Col xs={7}>
                  <span className="fw-medium">Price</span>
                </Col>
                <Col xs={5} className="text-end">
                  <span className="text-muted">
                    {AppConstant.currencySymbol}
                    {quoteSettings?.quotes_price ?? 0}
                  </span>
                </Col>
              </Row>
            </div>

            <div className="text-end">
              <Button
                className="custom-btn-primary"
                onClick={(e) => {
                  e.preventDefault();
                  AddEditGeneralSettingsDialog.show(
                    Boolean(quoteSettings?._id),
                    quoteSettings,
                    () => {
                      void refreshData();
                    }
                  );
                }}
              >
                {quoteSettings?._id ? "Update" : "Add"}
              </Button>
            </div>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
};

export default GeneralSettings;
