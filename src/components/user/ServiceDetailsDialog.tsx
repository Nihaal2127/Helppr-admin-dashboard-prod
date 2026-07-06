import React, { useEffect, useState, useCallback, useRef } from "react";
import { Modal } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { ServiceStatusEnum } from "../../lib/user/ServiceStatusEnum";
import CustomServiceUtilityBox from "../../components/CustomServiceUtilityBox";
import CustomServiceTable from "../../components/CustomServiceTable";
import { FinancialModel } from "../../lib/models/FinancialModel";
import { fetchOrderServiceFinancial } from "../../services/financialService";
import { formatDate, priceCell } from "../../helper/utility";
import {
  customerPaymentStatusLabelFromSlug,
  partnerPaymentStatusLabelFromSlug,
} from "../../lib/financial/paymentStatus";
import { AppConstant } from "../../lib/global/AppConstant";
import { openDialog } from "../../lib/global/DialogManager";

type ServiceDetailsDialogProps = {
  user_id: string;
  is_partner: boolean;
  status: number | null;
  onClose: () => void;
};

function servicePaymentStatusLabel(
  row: FinancialModel & { payment_status?: string | null }
): string {
  const raw =
    row.payment_status ??
    (row.is_paid ? "paid" : "unpaid");
  const label =
    customerPaymentStatusLabelFromSlug(raw) ||
    partnerPaymentStatusLabelFromSlug(raw);
  if (label === "Partially paid") return "Partially Paid";
  if (label) return label;
  const slug = String(raw ?? "").trim().toLowerCase();
  if (slug === "paid" || row.is_paid) return "Paid";
  return "Unpaid";
}

const ServiceDetailsDialog: React.FC<ServiceDetailsDialogProps> & {
  show: (
    user_id: string,
    is_partner: boolean,
    status: number | null,
    onRefreshData: () => void
  ) => void;
} = ({ user_id, is_partner, status, onClose }) => {
  const statusLabel = status
    ? `${ServiceStatusEnum.get(status)?.label} Services`
    : "Total Services";

  const [serviceList, setServiceList] = useState<FinancialModel[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [appliedSearchKeyword, setAppliedSearchKeyword] = useState("");
  const fetchRef = useRef(false);

  const fetchData = useCallback(
    async (filters: {
      keyword?: string;
      service_status?: string;
      user_id?: string;
      partner_id?: string;
      is_paid?: string;
      is_partner_paid?: string;
      sort?: string;
    }) => {
      if (fetchRef.current) return;
      fetchRef.current = true;
      if (status !== null && status !== undefined) {
        filters.service_status = String(status);
      }
      if (is_partner !== undefined && is_partner === true) {
        filters.partner_id = user_id;
      }
      if (is_partner !== undefined && is_partner === false) {
        filters.user_id = user_id;
      }
      const { response, financials, totalPages } =
        await fetchOrderServiceFinancial(currentPage, pageSize, { ...filters });
      if (response) {
        setServiceList(financials);
        setTotalPages(totalPages);
      }
      fetchRef.current = false;
    },
    [currentPage, pageSize, is_partner, status, user_id]
  );

  useEffect(() => {
    void fetchData({});
  }, [fetchData]);

  const handleFilterChange = async (filters: {
    keyword?: string;
    sort?: string;
  }) => {
    setCurrentPage(1);
    setTotalPages(0);
    if (Object.keys(filters).length === 0) {
      fetchRef.current = false;
    } else {
      await fetchData(filters);
    }
  };

  const serviceColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      { Header: "Order ID", accessor: "order_unique_id" },
      { Header: "Service Name", accessor: "service_name" },
      { Header: "Category", accessor: "category_name" },
      {
        Header: "Service Date",
        accessor: "service_date",
        Cell: ({ row }) =>
          formatDate(
            row.original.service_date ? row.original.service_date : ""
          ),
      },
      {
        Header: "Total Amount",
        accessor: "total_price",
        Cell: priceCell("total_price"),
      },
      {
        Header: "Paid Amount",
        // accessor: is_partner ? "paid_to_partner" : "customer_paid_amount",
        // Cell: ({ row }: { row: any }) => {
        //   const o = row.original ?? {};
        //   const v = is_partner
        //     ? o.paid_to_partner
        //     : o.customer_paid_amount ?? (o.is_paid ? o.total_price : undefined);
        //   return (
        //     <span>
        //       {v !== undefined && v !== null
        //         ? `${AppConstant.currencySymbol}${v}`
        //         : "-"}
        //     </span>
        //   );
        // },
        accessor: "paid_amount",
        Cell: priceCell("paid_amount"),
      },
      {
        Header: "Pending Amount",
        // accessor: is_partner ? "pending_to_partner" : "customer_pending_amount",
        // Cell: ({ row }: { row: any }) => {
        //   const o = row.original ?? {};
        //   const v = is_partner
        //     ? o.pending_to_partner
        //     : o.customer_pending_amount ??
        //       (!o.is_paid ? o.total_price : undefined);
        //   return (
        //     <span>
        //       {v !== undefined && v !== null
        //         ? `${AppConstant.currencySymbol}${v}`
        //         : "-"}
        //     </span>
        //   );
        // },
        accessor: "pending_amount",
        Cell: priceCell("pending_amount"),
      },
      {
        Header: "Payment Status",
        accessor: "payment_status",
        Cell: ({ row }: { row: { original: FinancialModel } }) => {
          const label = servicePaymentStatusLabel(
            row.original as FinancialModel & { payment_status?: string | null }
          );
          const normalized = label.toLowerCase();
          const className =
            normalized === "partially paid"
              ? "text-warning fw-semibold"
              : normalized === "unpaid"
              ? "custom-inactive"
              : "custom-active";
          return <span className={className}>{label}</span>;
        },
      },
      // {
      //   Header: "Status",
      //   accessor: "service_status",
      //   Cell: ({ row }: { row: any }) => {
      //     const raw = row.original?.service_status;
      //     const code = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
      //     const label =
      //       typeof code === "number" && !Number.isNaN(code)
      //         ? ServiceStatusEnum.get(code)?.label
      //         : undefined;
      //     if (label) return label;
      //     if (raw !== undefined && raw !== null && raw !== "")
      //       return String(raw);
      //     return "-";
      //   },
      // },
      // {
      //   Header: "Refund",
      //   accessor: "refund",
      //   Cell: ({ row }: { row: any }) => {
      //     const record = row.original ?? {};
      //     const refunded =
      //       record.refund === true ||
      //       record.refund === 1 ||
      //       String(record.refund).toLowerCase() === "yes";
      //     const refundedAmount =
      //       record.refunded_amount ??
      //       record.refund_amount ??
      //       record.refund_price ??
      //       0;

      //     if (!refunded) {
      //       return <span className="custom-inactive">No</span>;
      //     }

      //     return (
      //       <div className="pin-code-hover-wrapper">
      //         <span className="custom-active">Yes</span>
      //         <div className="pin-code-hover-card">
      //           <div className="pin-code-hover-item">
      //             Refunded amount: {refundedAmount}
      //           </div>
      //         </div>
      //       </div>
      //     );
      //   },
      // },
    ],
    [currentPage, pageSize, is_partner]
  );

  return (
    <>
      <Modal show={true} onHide={onClose} centered>
        <div className="custom-model-detail">
          <Modal.Header className="py-3 px-4 border-bottom-0">
            <Modal.Title as="h5" className="custom-modal-title">
              {statusLabel}
            </Modal.Title>
            <CustomCloseButton onClose={onClose} />
          </Modal.Header>
          <Modal.Body className="px-4 pb-4 pt-0">
            <CustomServiceUtilityBox
              searchHint={"Search ID, Service Name"}
              showExtraActions={false}
              syncKeyword={appliedSearchKeyword}
              onSearch={(value) => {
                setAppliedSearchKeyword(value);
                void handleFilterChange({ keyword: value });
              }}
            />
            <CustomServiceTable
              columns={serviceColumns}
              data={serviceList}
              pageSize={pageSize}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={(page: number) => setCurrentPage(page)}
              onLimitChange={(pageSize: number) => {
                setPageSize(pageSize);
                setCurrentPage(1);
              }}
              theadClass="table-light"
            />
          </Modal.Body>
        </div>
      </Modal>
    </>
  );
};

ServiceDetailsDialog.show = (
  user_id: string,
  is_partner: boolean,
  status: number | null,
  _onRefreshData?: () => void
) => {
  openDialog("service-details-modal", (close) => (
    <ServiceDetailsDialog
      user_id={user_id}
      is_partner={is_partner}
      status={status}
      onClose={close}
    />
  ));
};

export default ServiceDetailsDialog;
