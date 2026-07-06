import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner, Row, Col, Button, Card } from "react-bootstrap";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm, UseFormRegister } from "react-hook-form";
import CustomHeader from "../../../components/CustomHeader";
import { ROUTES } from "../../../routes/Routes";
import CustomUtilityBox from "../../../components/CustomUtilityBox";
import CustomTable from "../../../components/CustomTable";
import CustomFormSelect from "../../../components/CustomFormSelect";
import CustomDatePicker from "../../../components/CustomDatePicker";
import { formatDate } from "../../../helper/utility";
import { showOrderInfoDialog } from "../../../components/order";
import { AppConstant } from "../../../lib/global/AppConstant";
import { fetchPartnerPayoutShow } from "../../../services/partnerPayoutService";
import type {
  PartnerPayoutLedgerRow,
  PartnerPayoutShowPartner,
} from "../../../services/partnerPayoutService";
import { partnerPayoutPaymentMethodLabel } from "../../../lib/financial/partnerPayoutPayment";
import {
  compareIsoDateOnlyAsc,
  parseIsoDateOnly,
  startOfLocalDay,
  toIsoCalendarDate,
} from "../../../lib/quote/quoteHelpers";
import {
  patchPartnerPayoutSearchParams,
  readPartnerPayoutLedgerUrl,
} from "../../../lib/financial/partnerPayoutUrl";

type WalletLedgerEntry = {
  id: string;
  dateLabel: string;
  txType: "credit" | "debit";
  orderIdDisplay: string;
  description: string;
  payment_method: string | null;
  amount: number;
  orderId?: string | null;
};

function absMoney(n: number): string {
  return `${AppConstant.currencySymbol}${Math.abs(Number(n) || 0).toFixed(2)}`;
}

function ledgerDateLabel(raw?: string | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  }
  const formatted = formatDate(s);
  return formatted !== "-" ? formatted : s;
}

function mapLedgerToEntry(row: PartnerPayoutLedgerRow): WalletLedgerEntry {
  const rawDate = row.date ?? row.created_at ?? "";
  const oid =
    row.order_unique_id?.trim() ||
    (row.order_id && !/^[a-f0-9]{24}$/i.test(row.order_id)
      ? String(row.order_id).trim()
      : "");
  return {
    id: row._id,
    dateLabel: ledgerDateLabel(rawDate),
    txType: row.transaction_type,
    orderIdDisplay: oid || "—",
    description:
      row.description?.trim() ||
      (row.transaction_type === "credit" ? "Service earning" : "Withdrawal"),
    payment_method: row.payment_method ?? null,
    amount: row.amount,
    orderId: row.order_mongo_id ?? null,
  };
}

function PartnerPayoutDetailsBackButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="financial-subpage-back"
      onClick={() => navigate(ROUTES.PARTNER_PAYOUT.path)}
      aria-label="Back to Partner Payout"
    >
      <i className="bi bi-chevron-left text-danger"></i>
    </button>
  );
}

function ShowPartnerPayout() {
  const { register, setValue } = useForm({
    defaultValues: {
      from_date_filter: "",
      to_date_filter: "",
      transaction_type_filter: "all",
    },
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const cleanedLegacyFilterParamsRef = useRef(false);

  const url = useMemo(
    () => readPartnerPayoutLedgerUrl(searchParams),
    [searchParams]
  );

  /** Ledger filters stay in component state — URL keeps partner id + pagination only. */
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [transactionType, setTransactionType] = useState<
    "all" | "credit" | "debit"
  >("all");
  const [utilitySearchKey, setUtilitySearchKey] = useState(0);

  const partnerMongoId = useMemo(() => {
    const raw = url.partnerId;
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [url.partnerId]);

  const patchUrl = useCallback(
    (updates: Record<string, string | number | undefined | null>) => {
      setSearchParams(
        (prev) => patchPartnerPayoutSearchParams(prev, updates),
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (cleanedLegacyFilterParamsRef.current) return;
    cleanedLegacyFilterParamsRef.current = true;
    if (
      searchParams.has("from_date") ||
      searchParams.has("to_date") ||
      searchParams.has("search") ||
      searchParams.has("transaction_type")
    ) {
      setSearchParams(
        (prev) =>
          patchPartnerPayoutSearchParams(prev, {
            from_date: undefined,
            to_date: undefined,
            search: undefined,
            transaction_type: undefined,
          }),
        { replace: true }
      );
    }
  }, [searchParams, setSearchParams]);

  const [partner, setPartner] = useState<PartnerPayoutShowPartner | null>(null);
  const [ledgerRows, setLedgerRows] = useState<WalletLedgerEntry[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!partnerMongoId) {
      setPartner(null);
      setLedgerRows([]);
      setTotalPages(1);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { response, partner: p, rows, totalPages: tp } =
          await fetchPartnerPayoutShow(
            {
              id: partnerMongoId,
              search: ledgerSearch,
              from_date: fromDate,
              to_date: toDate,
              transaction_type:
                transactionType !== "all" ? transactionType : undefined,
              page: url.page,
              limit: url.limit,
            },
            { skipLoader: true }
          );
        if (cancelled) return;
        if (response) {
          setPartner(p);
          setLedgerRows(rows.map(mapLedgerToEntry));
          setTotalPages(Math.max(1, tp || 1));
        } else {
          setPartner(null);
          setLedgerRows([]);
          setTotalPages(1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    partnerMongoId,
    ledgerSearch,
    fromDate,
    toDate,
    transactionType,
    url.page,
    url.limit,
  ]);

  const fromDatePickerMin = useMemo(() => {
    if (!fromDate) return undefined;
    return parseIsoDateOnly(fromDate) ?? undefined;
  }, [fromDate]);

  const ledgerPage = Math.min(url.page, totalPages);

  const walletTxColumns = useMemo(
    () => [
      {
        Header: "SR No",
        id: "sr",
        accessor: "id",
        Cell: ({ row }: { row: { index: number } }) =>
          (ledgerPage - 1) * url.limit + row.index + 1,
      },
      {
        Header: "Date",
        accessor: "dateLabel",
      },
      {
        Header: "Type",
        accessor: "txType",
        Cell: ({ row }: { row: { original: WalletLedgerEntry } }) => {
          const isCredit = row.original.txType === "credit";
          return (
            <span
              className={
                isCredit
                  ? "wallet-tx-table__type-credit"
                  : "wallet-tx-table__type-debit"
              }
            >
              {isCredit ? "CREDIT" : "DEBIT"}
            </span>
          );
        },
      },
      {
        Header: "Order ID",
        accessor: "orderIdDisplay",
        Cell: ({ row }: { row: { original: WalletLedgerEntry } }) => {
          const tx = row.original;
          if (tx.orderId && tx.orderIdDisplay !== "—") {
            return (
              <button
                type="button"
                className="wallet-tx-table__order-link"
                onClick={() => showOrderInfoDialog(tx.orderId!, () => {})}
              >
                {tx.orderIdDisplay}
              </button>
            );
          }
          return tx.orderIdDisplay || "—";
        },
      },
      {
        Header: "Description",
        accessor: "description",
        className: "text-start",
        Cell: ({ row }: { row: { original: WalletLedgerEntry } }) => (
          <span className="wallet-tx-table__desc-cell">
            {row.original.description || "—"}
          </span>
        ),
      },
      {
        Header: "Payment method",
        accessor: "payment_method",
        Cell: ({ row }: { row: { original: WalletLedgerEntry } }) => {
          const method = row.original.payment_method?.trim();
          if (!method) return "—";
          return partnerPayoutPaymentMethodLabel(method);
        },
      },
      {
        Header: "Amount",
        accessor: "amount",
        className: "text-end",
        Cell: ({ row }: { row: { original: WalletLedgerEntry } }) => {
          const isCredit = row.original.txType === "credit";
          return (
            <span
              className={
                isCredit
                  ? "wallet-tx-table__amount--credit"
                  : "wallet-tx-table__amount--debit"
              }
            >
              {isCredit ? "+" : "−"}
              {absMoney(row.original.amount)}
            </span>
          );
        },
      },
    ],
    [ledgerPage, url.limit]
  );

  const ledgerFiltersActive =
    !!fromDate ||
    !!toDate ||
    !!ledgerSearch.trim() ||
    transactionType !== "all";

  const clearLedgerFilters = useCallback(() => {
    setFromDate("");
    setToDate("");
    setLedgerSearch("");
    setTransactionType("all");
    setValue("from_date_filter", "");
    setValue("to_date_filter", "");
    setValue("transaction_type_filter", "all");
    setUtilitySearchKey((k) => k + 1);
    patchUrl({ page: 1 });
  }, [patchUrl, setValue]);

  const filterControls = (
    <Row
      key={`ledger-filters-${fromDate}-${toDate}-${transactionType}-${utilitySearchKey}`}
      className="row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-2 mt-2 mb-2 align-items-end"
    >
      <Col>
        <CustomDatePicker
          label="From Date"
          controlId="from_date_filter"
          selectedDate={fromDate || null}
          onChange={(date) => {
            const next = toIsoCalendarDate(date) ?? "";
            setFromDate(next);
            setValue("from_date_filter", next, { shouldValidate: false });
            if (
              next &&
              toDate &&
              compareIsoDateOnlyAsc(next, toDate) != null &&
              compareIsoDateOnlyAsc(next, toDate)! > 0
            ) {
              setToDate("");
              setValue("to_date_filter", "", { shouldValidate: false });
            }
            patchUrl({ page: 1 });
          }}
          register={register as unknown as UseFormRegister<any>}
          setValue={setValue as (name: string, value: any) => void}
          asCol={false}
          groupClassName="mb-0 w-100"
          placeholderText="From Date"
          filterDate={() => true}
        />
      </Col>
      <Col>
        <CustomDatePicker
          label="To Date"
          controlId="to_date_filter"
          selectedDate={toDate || null}
          onChange={(date) => {
            const next = toIsoCalendarDate(date) ?? "";
            setToDate(next);
            setValue("to_date_filter", next, { shouldValidate: false });
            patchUrl({ page: 1 });
          }}
          register={register as unknown as UseFormRegister<any>}
          setValue={setValue as (name: string, value: any) => void}
          asCol={false}
          groupClassName="mb-0 w-100"
          placeholderText="To Date"
          filterDate={(date) => {
            if (!fromDatePickerMin) return true;
            return startOfLocalDay(date) >= startOfLocalDay(fromDatePickerMin);
          }}
        />
      </Col>
      <Col>
        <CustomFormSelect
          label="Transaction Type"
          controlId="transaction_type_filter"
          register={register as unknown as UseFormRegister<any>}
          options={[
            { value: "all", label: "All types" },
            { value: "credit", label: "Credit" },
            { value: "debit", label: "Debit" },
          ]}
          fieldName="transaction_type_filter"
          defaultValue={transactionType}
          setValue={
            setValue as (
              name: string,
              value: any,
              options?: { shouldValidate?: boolean }
            ) => void
          }
          asCol={false}
          noBottomMargin
          onChange={(e) => {
            const v = e.target.value as "all" | "credit" | "debit";
            setTransactionType(v);
            setValue("transaction_type_filter", v, { shouldValidate: false });
            patchUrl({ page: 1 });
          }}
        />
      </Col>
      <Col xs="auto" className="d-flex align-items-end">
        <Button
          variant="outline-secondary"
          size="sm"
          className="custom-btn-secondary partner-payout-clear-btn px-3"
          disabled={!ledgerFiltersActive}
          onClick={clearLedgerFilters}
        >
          Clear
        </Button>
      </Col>
    </Row>
  );

  const totalWallet = partner?.total_wallet_amount ?? null;

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Financial — Partner Payout Details"
        titlePrefix={<PartnerPayoutDetailsBackButton />}
      />

      {!partnerMongoId ? (
        <p className="text-muted px-1">
          Missing partner ID. Open this screen from Financial — Partner Payout
          and choose View on a partner row.
        </p>
      ) : (
        <>
          {loading && !partner ? (
            <Card className="partner-payout-detail-card border-0 shadow-sm mb-4">
              <Card.Body className="py-5 d-flex justify-content-center align-items-center gap-2 text-muted small">
                <Spinner animation="border" size="sm" />
                Loading partner…
              </Card.Body>
            </Card>
          ) : partner ? (
            <Card className="partner-payout-detail-card border-0 shadow-sm mb-4">
              <Card.Body className="p-3 p-md-4">
                <Row className="align-items-center g-3">
                  <Col className="min-w-0">
                    <h5 className="partner-payout-detail-name mb-1 text-break">
                      {partner.partner_name?.trim() || "—"}
                    </h5>
                    <div className="text-muted small mb-0">
                      Partner ID{" "}
                      <span className="font-monospace user-select-all">
                        {partner.partner_id || "—"}
                      </span>
                    </div>
                  </Col>
                  <Col xs={12} md="auto" className="ms-md-auto">
                    <div className="partner-payout-detail-wallet text-md-end">
                      <div className="partner-payout-detail-wallet-label text-uppercase">
                        Total wallet
                      </div>
                      <div className="partner-payout-detail-wallet-value">
                        {totalWallet === null
                          ? "—"
                          : `${
                              AppConstant.currencySymbol
                            }${Number(totalWallet).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`}
                      </div>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          ) : null}

          <CustomUtilityBox
            key={utilitySearchKey}
            searchOnlyToolbar
            title="Wallet transactions"
            searchHint="Order ID or description…"
            onSearch={(value) => {
              setLedgerSearch(value.trim());
              patchUrl({ page: 1 });
            }}
            syncKeyword={ledgerSearch}
          />

          {filterControls}

          <CustomTable
            columns={walletTxColumns}
            data={ledgerRows}
            pageSize={url.limit}
            currentPage={ledgerPage}
            totalPages={totalPages}
            onPageChange={(page: number) => patchUrl({ page })}
            onLimitChange={(ps: number) => {
              patchUrl({ limit: ps, page: 1 });
            }}
            isLoading={loading}
            theadClass="table-light"
            tableClass="wallet-tx-react-table"
            dynamicRowBackground={false}
            getRowClassName={(row) =>
              row.original.txType === "credit"
                ? "wallet-tx-table__row--credit"
                : "wallet-tx-table__row--debit"
            }
          />
        </>
      )}
    </div>
  );
}

export { ShowPartnerPayout };
export default ShowPartnerPayout;
