import React, { Suspense, lazy, useState } from "react";
import { Button, Spinner } from "react-bootstrap";
import CustomHeader from "../../components/CustomHeader";
import { useFranchiseHeaderForm } from "../../lib/global/hooks/useFranchiseScopedGetCount";

const OrderReportsPage = lazy(() => import("./OrderReports"));
const QuotationReportsPage = lazy(() => import("./QuotationReports"));
const PartnerReportsPage = lazy(() => import("./PartnerReports"));

type ReportTabKey = "order_reports" | "quotation_reports" | "partner_reports";

const reportTabs: { key: ReportTabKey; label: string }[] = [
  { key: "order_reports", label: "Order Reports" },
  { key: "quotation_reports", label: "Quotation Reports" },
  { key: "partner_reports", label: "Partner Reports" },
];

const Reports = () => {
  const [selectedTab, setSelectedTab] = useState<ReportTabKey>("order_reports");
  const { register, setValue, franchiseId } = useFranchiseHeaderForm();

  const renderTabContent = () => {
    switch (selectedTab) {
      case "order_reports":
        return (
          <OrderReportsPage franchiseId={franchiseId} />
        );

      case "quotation_reports":
        return <QuotationReportsPage franchiseId={franchiseId} />;

      case "partner_reports":
        return <PartnerReportsPage franchiseId={franchiseId} />;

      default:
        return null;
    }
  };

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Reports & Analytics"
        register={register}
        setValue={setValue}
      />

      <div className="d-flex gap-2 mb-3">
        {reportTabs.map((tab) => (
          <Button
            key={tab.key}
            className={
              selectedTab === tab.key
                ? "custom-btn-primary"
                : "custom-btn-secondary"
            }
            onClick={() => setSelectedTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <Suspense
        fallback={
          <div className="d-flex justify-content-center py-5">
            <Spinner animation="border" size="sm" role="status" />
          </div>
        }
      >
        {renderTabContent()}
      </Suspense>
    </div>
  );
};

export default Reports;
