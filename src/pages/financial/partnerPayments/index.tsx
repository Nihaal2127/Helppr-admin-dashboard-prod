import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import CustomHeader from "../../../components/CustomHeader";
import { FinancialSubPageBackButton } from "../../../components/FinancialSubPageNav";
import CustomUtilityBox from "../../../components/CustomUtilityBox";
import {
  formatDate,
  priceCell,
  textUnderlineCell,
} from "../../../helper/utility";
import CustomTable from "../../../components/CustomTable";
import { fetchOrderServiceFinancial } from "../../../services/financialService";
import {
  useFranchiseHeaderForm,
  useFranchiseScopedGetCount,
} from "../../../lib/global/hooks/useFranchiseScopedGetCount";
import { FinancialModel } from "../../../lib/models/FinancialModel";
import { showOrderInfoDialog } from "../../../components/order";
import { ROUTES } from "../../../routes/Routes";
import { exportData } from "../../../services/exportService";
import { ApiPaths } from "../../../lib/global/remote/apiPaths";
import { AppConstant } from "../../../lib/global/AppConstant";

const PartnerPayments = () => {
  const navigate = useNavigate();
  const { register, setValue, franchiseId: headerFranchiseId } =
    useFranchiseHeaderForm();
  const { countModel: financialCountModel } = useFranchiseScopedGetCount({
    type: 5,
    franchiseId: headerFranchiseId,
  });
  const statuses: [number, { value: number; label: string }][] = [
    [1, { value: 2, label: "Pending" }],
    [2, { value: 1, label: "Completed" }],
    [3, { value: 3, label: "Returned" }],
  ];
  const [selectedStatus, setSelectedStatus] = useState(statuses[0][0]);
  const [userData, setUserData] = useState<{
    completed_amount?: number;
    pending_amount?: number;
    returned_amount?: number;
  }>({});
  const [financialList, setFinancialList] = useState<FinancialModel[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const fetchRef = useRef(false);

  useEffect(() => {
    if (!financialCountModel) return;
    setUserData({
      completed_amount: financialCountModel.completed_amount,
      pending_amount: financialCountModel.pending_amount,
      returned_amount: financialCountModel.returned_amount,
    });
  }, [financialCountModel]);

  const fetchData = useCallback(
    async (filters: {
      keyword?: string;
      partner_paid_status?: string;
      service_status?: string;
      sort?: string;
    }) => {
      if (fetchRef.current) return;
      fetchRef.current = true;
      filters.service_status = "3";
      const { response, financials, totalPages } =
        await fetchOrderServiceFinancial(currentPage, pageSize, { ...filters });
      if (response) {
        setFinancialList(financials);
        setTotalPages(totalPages);
      }
      fetchRef.current = false;
    },
    [currentPage, pageSize]
  );

  useEffect(() => {
    void fetchData({ partner_paid_status: selectedStatus.toString() });
  }, [currentPage, pageSize, fetchData, selectedStatus]);

  const handleStatusClick = async (statusKey: number) => {
    setSelectedStatus(statusKey);
    await handleFilterChange({ partner_paid_status: statusKey.toString() });
  };

  const handleFilterChange = async (filters: {
    keyword?: string;
    partner_paid_status?: string;
    service_status?: string;
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

  const financialColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      {
        Header: "Order ID",
        accessor: "order_unique_id",
        Cell: textUnderlineCell("order_unique_id", (row) => {
          showOrderInfoDialog(row.order_id, () => {});
        }),
      },
      {
        Header: "Partner ID",
        accessor: "partner_unique_id",
        Cell: textUnderlineCell("partner_unique_id", (row) => {
          navigate(`${ROUTES.PARTNER_PAYOUT_SHOW.path}?id=${row.partner_id}`);
        }),
      },
      // {
      //     Header: "Partner Name", accessor: "partner_unique_id",
      //     Cell: textUnderlineCell("partner_unique_id", (row) => { navigate(`${ROUTES.PARTNER_PAYOUT_SHOW.path}?id=${row.partner_id}`) }),
      // },
      { Header: "Service Name", accessor: "service_name" },
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
        Header: "Partner Earning",
        accessor: "partner_earning",
        Cell: priceCell("partner_earning"),
      },
      // {
      //     Header: "Balance Amount", accessor: "balance_amount",
      //     Cell: priceCell("balance_amount"),
      // },
      // {
      //     Header: "Paid Amount", accessor: "paid_amount",
      //     Cell: priceCell("paid_amount"),
      // },
    ],
    [currentPage, pageSize, navigate]
  );

  return (
    <>
      <div className="main-page-content">
        <CustomHeader
          title="Financial — Partner Payments"
          titlePrefix={<FinancialSubPageBackButton />}
          register={register}
          setValue={setValue}
        />

        <div className="d-flex gap-2" style={{ width: "100%" }}>
          {statuses.map(
            ([key, status]: [number, { value: number; label: string }]) => (
              <div
                className="custom-box-count"
                key={key}
                style={{
                  borderColor:
                    selectedStatus === key
                      ? "var(--lb-active-border)"
                      : "var(--lb-border)",
                }}
                onClick={() => handleStatusClick(key)}
              >
                <div
                  className={`box-rw-clr${status.value + 1}`}
                  style={{ textDecoration: "none" }}
                >
                  {status.label}
                </div>
                <span className="custom-box-count-span mt-2">
                  {`${AppConstant.currencySymbol}${
                    key === 1
                      ? userData.pending_amount ?? 0
                      : key === 2
                      ? userData.completed_amount ?? 0
                      : userData.returned_amount ?? 0
                  }`}
                </span>
              </div>
            )
          )}
        </div>

        <CustomUtilityBox
          title="Partner Payments"
          searchHint={"Search name, ID, Description etc."}
          onDownloadClick={async () => {
            await exportData(ApiPaths.EXPORT_PARTNER_PAYMENTS, {
              partner_paid_status: selectedStatus,
            });
          }}
          onSortClick={(value) => {
            handleFilterChange({
              sort: value,
              partner_paid_status: selectedStatus.toString(),
            });
          }}
          onMoreClick={() => {}}
          onSearch={(value) => handleFilterChange({ keyword: value })}
        />

        <CustomTable
          columns={financialColumns}
          data={financialList}
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
      </div>
    </>
  );
};

export default PartnerPayments;
