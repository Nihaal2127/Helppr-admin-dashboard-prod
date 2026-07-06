import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Modal, Row, Col, Table } from "react-bootstrap";
import { OrderModel } from "../../lib/order/orders";
import {
  DetailsRow,
  formatDate,
  DetailsOrderStatusRow,
  InfoDetailInlineRow,
} from "../../helper/utility";
import { fetchOrderById } from "../../lib/order/orders";
import { AppConstant } from "../../lib/global/AppConstant";
import QuoteInfoPersonSection from "../quote/QuoteInfoPersonSection";
import { showOrderInfoDialog as openOrderInfoDialog } from "./showOrderInfoDialog";
import {
  formatServiceScheduleLine,
  getCustomerPaymentStatusLabel,
  isCompletedOrderLimitedPaymentEdit,
  getOrderCategoryName,
  getOrderPartnerDisplayName,
  getOrderPartnerRef,
  getOrderServiceAddressDisplay,
  getPartnerPaymentStatusLabel,
  getPrimaryServiceItem,
  orderPaymentSummaryServiceAmount,
  resolveOrderOfferBreakdown,
  roundMoney,
  serviceNamesJoined,
} from "../../lib/order/orders";
import {
  computeOrderPaymentLineTotals,
  customerPaidBalanceHeadline,
  getServiceTaxCommissionPercents,
  otherChargesTotal,
  partnerPaidBalanceHeadline,
  resolvePaymentExtension,
} from "../../lib/order/orders";
import { buildOrderAmountSummaryFromOrder } from "../../lib/order/orderAmountSummary";
import { applyOrderPaymentPreviewDummy } from "../../lib/order/orders";
import {
  QUOTE_MODAL_LAYOUT,
  QUOTE_SECTION_TITLE_CLASS,
} from "../../lib/quote/quoteHelpers";
import { OrderInfoDialogHeaderActions } from "./OrderInfoDialogHeaderActions";
import OrderAmountSummaryPanel from "./OrderAmountSummaryPanel";

type OrderInfoDialogProps = {
  orderId: string;
  onClose: () => void;
  onRefreshData: () => void;
};

const viewPaymentSectionShell: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: "10px",
  border: "1px solid var(--txtfld-border, rgba(0, 0, 0, 0.08))",
  backgroundColor: "var(--bg-color)",
};

const OrderInfoDialog: React.FC<OrderInfoDialogProps> & {
  show: (orderId: string, onRefreshData: () => void) => void;
} = ({ orderId, onClose, onRefreshData }) => {
  const [orderDetails, setOrderDetails] = useState<OrderModel>();
  const fetchSeqRef = useRef(0);

  const fetchDataFromApi = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const { response, order } = await fetchOrderById(orderId);
    if (seq !== fetchSeqRef.current) return;
    if (response && order) {
      setOrderDetails(applyOrderPaymentPreviewDummy(order));
    }
  }, [orderId]);

  useEffect(() => {
    void fetchDataFromApi();
  }, [fetchDataFromApi]);

  const refreshInfoData = async () => {
    await fetchDataFromApi();
    onRefreshData();
  };

  const primary = getPrimaryServiceItem(orderDetails);
  const partnerRef = getOrderPartnerRef(orderDetails);
  const serviceAddress = useMemo(
    () => getOrderServiceAddressDisplay(orderDetails),
    [orderDetails]
  );

  const paymentExt = useMemo(() => {
    if (!orderDetails) return null;
    return resolvePaymentExtension(orderDetails, primary);
  }, [orderDetails, primary]);

  const taxCommFromService = useMemo(() => {
    if (!orderDetails) return { taxPct: 0, commissionPct: 0 };
    return getServiceTaxCommissionPercents(
      getPrimaryServiceItem(orderDetails),
      orderDetails
    );
  }, [orderDetails]);

  const { viewTax, viewComm } = useMemo(() => {
    if (!paymentExt) return { viewTax: 0, viewComm: 0 };
    const other = otherChargesTotal(paymentExt.otherCharges);
    const line = computeOrderPaymentLineTotals(
      paymentExt.serviceAmount,
      other,
      taxCommFromService.taxPct,
      taxCommFromService.commissionPct
    );
    return { viewTax: line.taxAmount, viewComm: line.commissionAmount };
  }, [paymentExt, taxCommFromService]);

  const offerBreakdown = useMemo(
    () => resolveOrderOfferBreakdown(orderDetails),
    [orderDetails]
  );

  const amountSummaryDisplay = useMemo(() => {
    if (!orderDetails) return null;
    const ext =
      paymentExt ?? resolvePaymentExtension(orderDetails, primary);
    return buildOrderAmountSummaryFromOrder(orderDetails, {
      primary,
      paymentExt: ext,
      finalTotal: roundMoney(Number(orderDetails.total_price ?? 0)),
    });
  }, [orderDetails, paymentExt, primary]);

  const paymentHeadlines = useMemo(() => {
    if (!paymentExt || !orderDetails) return null;
    /** User price = `total_price`; partner price = `service_price`. */
    const userPrice = roundMoney(
      Math.max(0, Number(orderDetails.total_price ?? 0))
    );
    const partnerLine = Number(primary?.service_price ?? 0);
    const partnerOrder = Number(orderDetails.service_price ?? 0);
    const partnerCharge = Number(orderDetails.total_service_charge ?? 0);
    const partnerPrice = roundMoney(
      partnerLine > 0
        ? partnerLine
        : partnerOrder > 0
          ? partnerOrder
          : Math.max(0, partnerCharge)
    );
    const userInvoice =
      userPrice > 0
        ? userPrice
        : Math.max(0, Number(orderDetails.customer_due_amount ?? 0));
    const partnerInvoice = Math.max(
      0,
      partnerPrice - offerBreakdown.partnerContribution
    );
    const serviceAmt = orderPaymentSummaryServiceAmount(
      orderDetails,
      primary
    );
    return {
      user: customerPaidBalanceHeadline(
        paymentExt,
        userInvoice,
        !!orderDetails.is_paid,
        orderDetails
      ),
      partner: partnerPaidBalanceHeadline(
        paymentExt,
        partnerInvoice,
        serviceAmt,
        !!orderDetails.is_paid,
        orderDetails
      ),
      /** User price (`total_price`) — beside User payments heading. */
      userAmount: userInvoice,
      /** Partner price (`service_price`) — beside Partner payments heading. */
      partnerAmount: partnerPrice > 0 ? partnerPrice : partnerInvoice,
      serviceAmt,
      taxAmt: Number(orderDetails.tax ?? viewTax),
      commAmt: Number(orderDetails.partner_commison_platform_fee ?? viewComm),
      totalPriceDisp: Number(orderDetails.total_price ?? 0),
    };
  }, [
    paymentExt,
    orderDetails,
    primary,
    offerBreakdown.partnerContribution,
    viewTax,
    viewComm,
  ]);

  /** User payments table — exclude `order_payments` rows with `payment_method: refund`. */
  const userPaymentsForView = useMemo(() => {
    const rows = paymentExt?.customerPayments ?? [];
    const ledger = orderDetails?.order_payments ?? [];
    if (!ledger.length) return rows;
    const refundIds = new Set(
      ledger
        .filter((p) => {
          const payer = String(p.payer_type ?? "").trim().toLowerCase();
          const method = String(p.payment_method ?? "").trim().toLowerCase();
          return payer === "customer" && method === "refund";
        })
        .map((p) => String(p._id ?? "").trim())
        .filter(Boolean)
    );
    if (!refundIds.size) return rows;
    return rows.filter((r) => !refundIds.has(r.id));
  }, [paymentExt, orderDetails?.order_payments]);

  const canEditOrderHeader =
    orderDetails?.order_status === 1 ||
    orderDetails?.order_status === 2 ||
    isCompletedOrderLimitedPaymentEdit(orderDetails);
  const canEditOrderAll = Boolean(orderDetails?._id) && canEditOrderHeader;
  const employeeInfo = orderDetails?.employee_info ?? null;

  const openEditAll = () => {
    if (!orderDetails?._id) return;
    void import("../../pages/orderManagement/OrderEditAllDialog").then(
      ({ default: OrderEditAllDialog }) => {
        OrderEditAllDialog.show(orderDetails._id, () => {
          void refreshInfoData();
        });
      }
    );
  };

  const sym = AppConstant.currencySymbol;

  const payLineDate = (d: string) => (d ? formatDate(d) : "—");

  return (
    <Modal
      show
      onHide={onClose}
      {...QUOTE_MODAL_LAYOUT}
      enforceFocus={false}
    >
      <Modal.Header className="py-3 px-4 border-bottom-0 d-flex align-items-center flex-shrink-0">
        <Modal.Title as="h5" className="custom-modal-title mb-0 me-auto">
          Order information
        </Modal.Title>
        <OrderInfoDialogHeaderActions
          canEditOrderAll={canEditOrderAll}
          onEditAll={openEditAll}
          onClose={onClose}
        />
      </Modal.Header>
      <Modal.Body className="add-quote-modal-body pt-0">
          {/* Order */}
          <section className="border rounded p-3 mb-3">
            <h6 className={QUOTE_SECTION_TITLE_CLASS}>Order</h6>
            <Row className="g-2">
              <Col xs={12} md={6} className="info-detail-fields-col">
                <DetailsRow title="Order ID" value={orderDetails?.unique_id} />
                <DetailsRow
                  title="Order Date"
                  value={formatDate(orderDetails?.order_date ?? "")}
                />
                <DetailsRow
                  title="Category Name"
                  value={getOrderCategoryName(orderDetails)}
                />
                <DetailsRow
                  title="Franchise"
                  value={
                    orderDetails?.franchise_info?.name ??
                    orderDetails?.franchise_name ??
                    undefined
                  }
                />
                <DetailsRow
                  title="Service Name"
                  value={serviceNamesJoined(orderDetails)}
                />
              </Col>
              <Col xs={12} md={6} className="info-detail-fields-col">
                <DetailsRow
                  title="Schedule Date/time"
                  value={formatServiceScheduleLine(primary, orderDetails)}
                />
                <DetailsRow
                  title="Partner Payment Status"
                  value={getPartnerPaymentStatusLabel(orderDetails)}
                />
                <DetailsRow
                  title="User Payment Status"
                  value={getCustomerPaymentStatusLabel(orderDetails)}
                />
                <DetailsOrderStatusRow
                  title="Order Status"
                  value={orderDetails?.order_status!}
                />
              </Col>
              <Col xs={12} className="info-detail-fields-col">
                <DetailsRow
                  title="User description"
                  value={
                    (orderDetails?.customer_description ?? "").trim() || undefined
                  }
                />
              </Col>
              <Col xs={12} className="info-detail-fields-col">
                <DetailsRow
                  title="Admin description"
                  value={
                    (
                      orderDetails?.order_description ??
                      orderDetails?.comment ??
                      ""
                    ).trim() || undefined
                  }
                />
              </Col>
            </Row>
          </section>

          {/* Service address — inline rows so label|value gaps match across pairs + full Address row */}
          <section className="border rounded p-3 mb-3">
            <h6 className={QUOTE_SECTION_TITLE_CLASS}>Service address</h6>
            <Row className="g-2 mb-0">
              <Col xs={12} md={6} className="info-detail-fields-col">
                <InfoDetailInlineRow label="State" value={serviceAddress.state} />
              </Col>
              <Col xs={12} md={6} className="info-detail-fields-col">
                <InfoDetailInlineRow label="Area" value={serviceAddress.area} />
              </Col>
            </Row>
            <Row className="g-2 mb-0">
              <Col xs={12} md={6} className="info-detail-fields-col">
                <InfoDetailInlineRow label="City" value={serviceAddress.city} />
              </Col>
              <Col xs={12} md={6} className="info-detail-fields-col">
                <InfoDetailInlineRow
                  label="Pin code"
                  value={serviceAddress.pincode}
                />
              </Col>
            </Row>
            <div className="info-detail-fields-col">
              <InfoDetailInlineRow
                label="Address"
                value={serviceAddress.addressLine}
                className="mb-0"
              />
            </div>
          </section>

          <QuoteInfoPersonSection
            title="User"
            role="customer"
            profileUrl={orderDetails?.user_info?.profile_url}
            fields={[
              {
                label: "Name",
                value:
                  orderDetails?.user_info?.name ?? orderDetails?.user_name,
                column: "left",
              },
              {
                label: "Phone number",
                value: orderDetails?.user_info?.phone_number,
                column: "right",
              },
              {
                label: "Email",
                value: orderDetails?.user_info?.email,
                fullWidth: true,
              },
            ]}
          />

          <QuoteInfoPersonSection
            title="Partner"
            role="partner"
            profileUrl={
              primary?.partner_info?.profile_url ??
              (partnerRef as { profile_url?: string } | undefined)?.profile_url
            }
            fields={[
              {
                label: "Name",
                value: getOrderPartnerDisplayName(orderDetails),
                column: "left",
              },
              {
                label: "Phone number",
                value:
                  String(
                    partnerRef?.phone_number ??
                      primary?.partner_info?.phone_number ??
                      ""
                  ).trim() || "-",
                column: "right",
              },
              {
                label: "Email",
                value:
                  String(
                    partnerRef?.email ?? primary?.partner_info?.email ?? ""
                  ).trim() || "-",
                fullWidth: true,
              },
              ...(String(
                partnerRef?.address ?? primary?.partner_info?.address ?? ""
              ).trim()
                ? [
                    {
                      label: "Address",
                      value: String(
                        partnerRef?.address ??
                          primary?.partner_info?.address ??
                          ""
                      ).trim(),
                      fullWidth: true as const,
                    },
                  ]
                : []),
            ]}
          />

          <QuoteInfoPersonSection
            title="Employee"
            role="employee"
            profileUrl={employeeInfo?.profile_url}
            fields={[
              {
                label: "Name",
                value: employeeInfo?.name ?? "-",
                column: "left",
              },
              {
                label: "Phone number",
                value: employeeInfo?.phone_number ?? "-",
                column: "right",
              },
              {
                label: "Email",
                value: employeeInfo?.email ?? "-",
                fullWidth: true,
              },
            ]}
          />

          {amountSummaryDisplay ? (
            <section className="border rounded p-3 mb-3 order-payment-info-section">
              <h3 className="mb-3 pb-2 border-bottom">Payment information</h3>
              <OrderAmountSummaryPanel
                display={amountSummaryDisplay}
                variant="view"
                style={{
                  marginTop: 0,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                }}
              />
            </section>
          ) : null}

          <section
            className="custom-other-details mb-3"
            style={viewPaymentSectionShell}
          >
            <h3 className="mb-3 pb-2 border-bottom">User payments</h3>
            <div>
                  <div className="fw-semibold mb-2 text-secondary small">
                    {paymentHeadlines ? (
                      <span>
                        Final total {sym}
                        {paymentHeadlines.userAmount.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                  {userPaymentsForView.length > 0 ? (
                  <Table
                    responsive
                    bordered
                    size="sm"
                    className="mb-0 align-middle"
                  >
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: "26%" }}>Date</th>
                        <th style={{ width: "22%" }}>Paid amount</th>
                        <th style={{ width: "22%" }}>Type</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userPaymentsForView.map((r) => (
                        <tr key={r.id}>
                          <td>{payLineDate(r.date)}</td>
                          <td>
                            {sym}
                            {Number(r.amount || 0).toFixed(2)}
                          </td>
                          <td>{r.type?.trim() || "—"}</td>
                          <td>{r.description?.trim() || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  ) : null}
                  {paymentHeadlines && (
                    <div className="mt-3 pt-3 border-top">
                      <div className="d-flex justify-content-between align-items-center py-1">
                        <span className="text-secondary">Total Paid</span>
                        <span className="fw-semibold">
                          {sym}
                          {paymentHeadlines.user.totalPaid.toFixed(2)}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between align-items-center py-1">
                        <span className="text-secondary">Balance</span>
                        <span className="fw-semibold">
                          {sym}
                          {paymentHeadlines.user.balance.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
            </div>
          </section>

          <section
            className="custom-other-details mb-3"
            style={viewPaymentSectionShell}
          >
            <h3 className="mb-3 pb-2 border-bottom">Partner payments</h3>
            <div>
                  <div className="fw-semibold mb-2 text-secondary small">
                    {paymentHeadlines ? (
                      <span>
                        Partner total {sym}
                        {paymentHeadlines.partnerAmount.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                  {(paymentExt?.partnerPayments ?? []).length > 0 ? (
                  <Table
                    responsive
                    bordered
                    size="sm"
                    className="mb-0 align-middle"
                  >
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: "30%" }}>Date</th>
                        <th style={{ width: "28%" }}>Paid amount</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(paymentExt?.partnerPayments ?? []).map((r) => (
                        <tr key={r.id}>
                          <td>{payLineDate(r.date)}</td>
                          <td>
                            {sym}
                            {Number(r.amount || 0).toFixed(2)}
                          </td>
                          <td>{r.description?.trim() || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  ) : null}
                  {paymentHeadlines && (
                    <div className="mt-3 pt-3 border-top">
                      <div className="d-flex justify-content-between align-items-center py-1">
                        <span className="text-secondary">Total Paid</span>
                        <span className="fw-semibold">
                          {sym}
                          {paymentHeadlines.partner.totalPaid.toFixed(2)}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between align-items-center py-1">
                        <span className="text-secondary">Balance</span>
                        <span className="fw-semibold">
                          {sym}
                          {paymentHeadlines.partner.balance.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
            </div>
          </section>
        </Modal.Body>
    </Modal>
  );
};

OrderInfoDialog.show = openOrderInfoDialog;

export default OrderInfoDialog;
