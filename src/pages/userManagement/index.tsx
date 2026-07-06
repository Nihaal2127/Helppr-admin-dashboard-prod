import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import CustomHeader from "../../components/CustomHeader";
import CustomSummaryBox from "../../components/CustomSummaryBox";
import CustomUtilityBox from "../../components/CustomUtilityBox";
import {
  capitalizeString,
  statusCell,
  priceCell,
  formatDate,
} from "../../helper/utility";
import {
  partnerSubscriptionDisplayFromUser,
  partnerSubscriptionPriceLabel,
} from "../../lib/partner/partnerSubscriptionView";
import { AppConstant } from "../../lib/global/AppConstant";
import CustomTable from "../../components/CustomTable";
import AddEditUserDialog from "./AddEditUserDialog";
import {
  deleteUser,
  fetchUser,
} from "../../services/userService";
import {
  PARTNER_VERIFICATION,
  partnerVerificationLabel,
} from "../../lib/partner/partnerVerification";
import {
  useFranchiseHeaderForm,
  useFranchiseScopedGetCount,
} from "../../lib/global/hooks/useFranchiseScopedGetCount";
import { franchiseIdForUserGetAll } from "../../lib/franchise/headerFranchisePreference";
import { UserModel } from "../../lib/models/UserModel";
import { showUserDetailsDialog } from "../../components/user";
import { PartnerDetailsDialog } from "../../components/partner";
import PartnerVerificationReviewModal from "./PartnerVerificationReviewModal";
import CustomActionColumn from "../../components/CustomActionColumn";
import { openConfirmDialog } from "../../components/CustomConfirmDialog";
import type { ServerTableSortBy } from "../../lib/global/serverTableSort";
import ChangePartnerPasswordDialog from "./ChangePartnerPasswordDialog";

const UserManagement = () => {
  const location = useLocation();
  const [selectedBox, setSelectedBox] = useState<string>("box-user");
  const [userData, setUserData] = useState<{}>({});
  const [partnerData, setParnterData] = useState<{}>({});
  const [verificationData, setVerificationData] = useState<{}>({});
  const [userList, setUserList] = useState<UserModel[]>([]);
  const [verificationList, setVerificationList] = useState<UserModel[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined
  );
  /** `pending` | `rejected` | undefined (Total = both pending + rejected). */
  const [partnerIsVerifiedFilter, setPartnerIsVerifiedFilter] = useState<
    string | undefined
  >(undefined);
  const [sortBy, setSortBy] = useState<ServerTableSortBy>([]);
  const { register, setValue, franchiseId: headerFranchiseId } =
    useFranchiseHeaderForm();
  const { countModel: userCountModel, refresh: refreshUserManagementCounts } =
    useFranchiseScopedGetCount({
      type: "user-management",
      franchiseId: headerFranchiseId,
    });

  useEffect(() => {
    if (!userCountModel) return;
    setUserData({
      Total: userCountModel.total_user,
      Active: userCountModel.active_user,
      Inactive: userCountModel.inactive_user,
    });
    setParnterData({
      Total: userCountModel.total_partner ?? 0,
      Active: userCountModel.active_partner ?? 0,
      Inactive: userCountModel.inactive_partner ?? 0,
      Blocked: Number(userCountModel.blocked_partner ?? 0),
    });
    setVerificationData({
      Total: userCountModel.total_document,
      Pending: userCountModel.pending_document,
      Rejected: userCountModel.reject_document ?? 0,
    });
  }, [userCountModel]);

  useEffect(() => {
    const tab = (location.state as { initialTab?: string } | null)?.initialTab;
    if (tab !== "partners") return;
    setSelectedBox("box-partner");
    setCurrentPage(1);
    setSearchKeyword("");
    setStatusFilter(undefined);
    setPartnerIsVerifiedFilter(undefined);
    setSortBy([]);
    setUtilitySearchKey((k) => k + 1);
  }, [location.state]);

  /** Summary boxes: `POST /getCount` `{ type: "user-management", franchise_id? }` — refetches when header franchise changes. */

  const fetchData = useCallback(
    async (listPage?: number) => {
      const page =
        typeof listPage === "number" && listPage >= 1 ? listPage : currentPage;

    const franchiseScope =
      franchiseIdForUserGetAll(headerFranchiseId) || undefined;

    const filters = {
      keyword: searchKeyword || undefined,
      status: statusFilter,
      ...(franchiseScope ? { franchise_id: franchiseScope } : {}),
    };

    if (selectedBox === "box-verification") {
      const verificationFilters = {
        ...filters,
        ...(partnerIsVerifiedFilter
          ? { is_verified: partnerIsVerifiedFilter }
          : {}),
      };

      if (partnerIsVerifiedFilter) {
        const { response, users, totalPages } = await fetchUser(
          false,
          2,
          page,
          pageSize,
          verificationFilters,
          sortBy
        );
        if (response) {
          setVerificationList(users);
          setTotalPages(totalPages);
        } else {
          setVerificationList([]);
          setTotalPages(0);
        }
      } else {
        const fetchLimit = Math.max(page * pageSize, pageSize);
        const [pendingRes, rejectedRes] = await Promise.all([
          fetchUser(
            false,
            2,
            1,
            fetchLimit,
            { ...filters, is_verified: PARTNER_VERIFICATION.PENDING },
            sortBy
          ),
          fetchUser(
            false,
            2,
            1,
            fetchLimit,
            { ...filters, is_verified: PARTNER_VERIFICATION.REJECTED },
            sortBy
          ),
        ]);

        const mergedById = new Map<string, UserModel>();
        for (const u of [
          ...(pendingRes.response ? pendingRes.users : []),
          ...(rejectedRes.response ? rejectedRes.users : []),
        ]) {
          const id = String(u._id ?? "");
          if (id) mergedById.set(id, u);
        }
        const merged = Array.from(mergedById.values());
        const start = (page - 1) * pageSize;
        const pageSlice = merged.slice(start, start + pageSize);
        setVerificationList(pageSlice);
        setTotalPages(Math.max(1, Math.ceil(merged.length / pageSize)));
      }
    } else {
      const type = selectedBox === "box-user" ? 4 : 2;
      const partnerFilters =
        selectedBox === "box-partner"
          ? { ...filters, is_verified: PARTNER_VERIFICATION.APPROVED }
          : filters;
      const { response, users, totalPages } = await fetchUser(
        false,
        type,
        page,
        pageSize,
        partnerFilters,
        sortBy
      );
      if (response) {
        const list = Array.isArray(users) ? users : [];
        const blockedOnly =
          selectedBox === "box-partner" &&
          String(statusFilter ?? "").trim().toLowerCase() === "blocked";
        const normalized = blockedOnly
          ? list.filter((u: any) => Boolean((u as any)?.is_blocked))
          : list;
        setUserList(normalized);
        setTotalPages(blockedOnly ? 1 : totalPages);
      } else {
        setUserList([]);
        setTotalPages(0);
      }
    }
  },
  [
    currentPage,
    pageSize,
    searchKeyword,
    selectedBox,
    sortBy,
    statusFilter,
    partnerIsVerifiedFilter,
    headerFranchiseId,
  ]
);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refreshData = useCallback(
    async (_selected: string) => {
      await fetchData();
    },
    [fetchData]
  );

  /** After creating a user/partner: page 1 + explicit fetch (avoids stale `currentPage` closure) + summary counts. */
  const refreshListAfterCreate = useCallback(async () => {
    setCurrentPage(1);
    await fetchData(1);
    await refreshUserManagementCounts();
  }, [fetchData, refreshUserManagementCounts]);

  const handleSortChange = useCallback(
    (next: { id: string; desc: boolean }[]) => {
      setSortBy(next);
      setCurrentPage(1);
    },
    []
  );

  const partnerShow = useCallback(
    (userId: string) => {
      PartnerDetailsDialog.show(userId, () => {
        void refreshData("box-partner");
      });
    },
    [refreshData]
  );

  const userShow = useCallback(
    (userId: string) => {
      showUserDetailsDialog(userId, () => {
        void refreshData("box-user");
      });
    },
    [refreshData]
  );

  const openPartnerVerification = useCallback(
    (userId: string) => {
      PartnerVerificationReviewModal.show(userId, () => {
        void refreshData("box-verification");
        void refreshUserManagementCounts();
      });
    },
    [refreshData, refreshUserManagementCounts]
  );

  const partnerChangePassword = useCallback((row: { original: UserModel }) => {
    const u = row.original;
    ChangePartnerPasswordDialog.show(
      String(u._id),
      u.name ?? undefined,
      () => {
        void refreshData("box-partner");
      },
      2
    );
  }, [refreshData]);

  const userChangePassword = useCallback(
    (row: { original: UserModel }) => {
      const u = row.original;
      ChangePartnerPasswordDialog.show(
        String(u._id),
        u.name ?? undefined,
        () => {
          void refreshData("box-user");
        },
        4
      );
    },
    [refreshData]
  );

  const handleUserDelete = useCallback(
    (id: string, selected: "box-user" | "box-partner") => {
      openConfirmDialog(
        "Are you sure you want to void this user? ",
        "Void",
        "Cancel",
        async () => {
          const response = await deleteUser(id);
          if (response) {
            void refreshData(selected);
          }
        }
      );
    },
    [refreshData]
  );

  const userColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
      // {
      //     Header: "User ID", accessor: "user_id",
      //     sort: true,
      //     Cell: textUnderlineCell("user_id", (row) => userShow(row._id)),
      // },
      {
        Header: "User Name",
        accessor: "name",
        sort: true,
      },
      {
        Header: "Email",
        accessor: "email",
        Cell: ({ row }: { row: { original: Record<string, unknown> } }) =>
          String(row.original?.email ?? "").trim() || "—",
      },
      { Header: "Service Taken", accessor: "total_service" },
      // { Header: "Service Paid", accessor: "service_paid" },
      // { Header: "Service Unpaid", accessor: "service_unpaid" },
      {
        Header: "Total Amount",
        accessor: "total_amount",
        Cell: priceCell("total_amount"),
      },
      {
        Header: "Paid Amount",
        accessor: "paid_amount",
        Cell: ({ row }: { row: { original: Record<string, unknown> } }) => {
          const v = row.original?.paid_amount;
          const n =
            v === undefined || v === null || v === ""
              ? 0
              : v;
          return (
            <span>
              {`${AppConstant.currencySymbol}${n}`}
            </span>
          );
        },
      },
      {
        Header: "Balance Amount",
        accessor: "balance_amount",
        Cell: priceCell("balance_amount"),
      },
      {
        Header: "Status",
        accessor: "is_active",
        Cell: ({ row }: { row: any }) =>
          statusCell("is_active")({
            row: {
              ...row,
              original: {
                ...row.original,

                is_active: Boolean((row.original as any)?.is_blocked)
                  ? false
                  : row.original?.is_active,
              },
            },
          } as any),
      },
     
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={() => userShow(row.original._id)}
            onChangePassword={() => userChangePassword(row)}
            onDelete={() => handleUserDelete(row.original._id, "box-user")}
          />
        ),
      },
    ],
    [currentPage, pageSize, handleUserDelete, userShow, userChangePassword]
  );

  const partnerColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },
     
      {
        Header: "Partner Name",
        accessor: "name",
        sort: true,
      },
      {
        Header: "Email",
        accessor: "email",
        Cell: ({ row }: { row: { original: Record<string, unknown> } }) =>
          String(row.original?.email ?? "").trim() || "—",
      },
      { Header: "No. of services", accessor: "no_of_services" },
      {
        Header: "Plan",
        id: "subscription_plan",
        Cell: ({ row }: { row: { original: UserModel } }) =>
          partnerSubscriptionDisplayFromUser(row.original)?.planLabel ?? "—",
      },
      {
        Header: "Price",
        id: "subscription_price",
        Cell: ({ row }: { row: { original: UserModel } }) =>
          partnerSubscriptionPriceLabel(
            partnerSubscriptionDisplayFromUser(row.original)
          ),
      },
      {
        Header: "Start Date",
        id: "subscription_start_date",
        Cell: ({ row }: { row: { original: UserModel } }) => {
          const d = partnerSubscriptionDisplayFromUser(row.original)?.startDate;
          return d ? formatDate(d) : "—";
        },
      },
      {
        Header: "End Date",
        id: "subscription_end_date",
        Cell: ({ row }: { row: { original: UserModel } }) => {
          const d = partnerSubscriptionDisplayFromUser(row.original)?.endDate;
          return d ? formatDate(d) : "—";
        },
      },
      {
        Header: "Total Earnings",
        accessor: "total_amount",
        Cell: priceCell("total_amount"),
      },
      {
        Header: "Bal Payment",
        accessor: "balance_amount",
        Cell: priceCell("balance_amount"),
      },
      {
        Header: "Paid Amount",
        accessor: "paid_amount",
        Cell: priceCell("paid_amount"),
      },
      { Header: "Rating", accessor: "rating" },
      {
        Header: "Status",
        accessor: "is_active",
        Cell: statusCell("is_active"),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={() => partnerShow(row.original._id)}
            onChangePassword={() => partnerChangePassword(row)}
            onDelete={() => handleUserDelete(row.original._id, "box-partner")}
          />
        ),
      },
    ],
    [
      currentPage,
      pageSize,
      handleUserDelete,
      partnerShow,
      partnerChangePassword,
    ]
  );

  const verificationColumns = React.useMemo(
    () => [
      {
        Header: "SR No",
        accessor: "serial_no",
        Cell: ({ row }: { row: any }) =>
          (currentPage - 1) * pageSize + row.index + 1,
      },

      { Header: "Name", accessor: "name", sort: true },
      {
        Header: "Email",
        accessor: "email",
        Cell: ({ row }) => row.original.email || "-----",
      },
      {
        Header: "Phone",
        accessor: "phone_number",
        Cell: ({ row }) => row.original.phone_number || "-----",
      },
      {
        Header: "Plan",
        id: "subscription_plan",
        Cell: ({ row }: { row: { original: UserModel } }) =>
          partnerSubscriptionDisplayFromUser(row.original)?.planLabel ?? "—",
      },
      {
        Header: "Price",
        id: "subscription_price",
        Cell: ({ row }: { row: { original: UserModel } }) =>
          partnerSubscriptionPriceLabel(
            partnerSubscriptionDisplayFromUser(row.original)
          ),
      },
      {
        Header: "Start Date",
        id: "subscription_start_date",
        Cell: ({ row }: { row: { original: UserModel } }) => {
          const d = partnerSubscriptionDisplayFromUser(row.original)?.startDate;
          return d ? formatDate(d) : "—";
        },
      },
      {
        Header: "End Date",
        id: "subscription_end_date",
        Cell: ({ row }: { row: { original: UserModel } }) => {
          const d = partnerSubscriptionDisplayFromUser(row.original)?.endDate;
          return d ? formatDate(d) : "—";
        },
      },
      {
        Header: "Status",
        accessor: "is_verified",
        Cell: ({ row }: { row: any }) =>
          partnerVerificationLabel(row.original?.is_verified),
      },
      {
        Header: "Action",
        accessor: "action",
        Cell: ({ row }: { row: any }) => (
          <CustomActionColumn
            row={row}
            onView={() => openPartnerVerification(row.original._id)}
          />
        ),
      },
    ],
    [currentPage, pageSize, openPartnerVerification]
  );

  return (
    <>
      <div className="main-page-content">
        <CustomHeader
          title="User Management"
          register={register}
          setValue={setValue}
        />

        <div className="box-container">
          {["box-user", "box-partner", "box-verification"].map((id) => (
            <CustomSummaryBox
              key={id}
              divId={id}
              title={capitalizeString(id.replace("box-", "").replace("-", " "))}
              data={
                id === "box-user"
                  ? userData
                  : id === "box-partner"
                  ? partnerData
                  : verificationData
              }
              onSelect={(divId) => {
                setSelectedBox(divId);
                setCurrentPage(1);
                setSearchKeyword("");
                setStatusFilter(undefined);
                setPartnerIsVerifiedFilter(undefined);
                setSortBy([]);
                setUtilitySearchKey((k) => k + 1);
              }}
              isSelected={selectedBox === id}
              onFilterChange={(filter) => {
                setStatusFilter(filter.status);
                setCurrentPage(1);
              }}
              onItemClick={
                id === "box-verification"
                  ? (key) => {
                      if (key === "Pending") {
                        setPartnerIsVerifiedFilter(PARTNER_VERIFICATION.PENDING);
                      } else if (key === "Rejected") {
                        setPartnerIsVerifiedFilter(
                          PARTNER_VERIFICATION.REJECTED
                        );
                      } else if (key === "Total") {
                        setPartnerIsVerifiedFilter(undefined);
                      }
                      setCurrentPage(1);
                    }
                  : undefined
              }
              isAddShow={id === "box-verification" ? false : true}
              addButtonLable={capitalizeString(
                id.replace("box-", "Add ").replace("-", " ")
              )}
              onAddClick={() => {
                id === "box-user"
                  ? AddEditUserDialog.show(4, false, null, () =>
                      void refreshListAfterCreate()
                    )
                  : AddEditUserDialog.show(2, false, null, () =>
                      void refreshListAfterCreate()
                    );
              }}
            />
          ))}
        </div>

        <CustomUtilityBox
          key={utilitySearchKey}
          title={
            selectedBox === "box-user"
              ? "Users"
              : selectedBox === "box-partner"
              ? "Partners"
              : "Verifications"
          }
          searchHint={"Search name "}
        
          onSearch={(value) => {
            setSearchKeyword(value);
            setCurrentPage(1);
          }}
          syncKeyword={searchKeyword}
        />

        <CustomTable
          columns={
            selectedBox === "box-verification"
              ? verificationColumns
              : selectedBox === "box-user"
              ? userColumns
              : partnerColumns
          }
          data={
            selectedBox === "box-verification" ? verificationList : userList
          }
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page: number) => setCurrentPage(page)}
          onLimitChange={(pageSize: number) => {
            setPageSize(pageSize);
            setCurrentPage(1);
          }}
          manualSortBy={
            selectedBox === "box-user" ||
            selectedBox === "box-partner" ||
            selectedBox === "box-verification"
          }
          sortBy={sortBy}
          onSortChange={handleSortChange}
          theadClass="table-light"
        />
      </div>
    </>
  );
};

export default UserManagement;
