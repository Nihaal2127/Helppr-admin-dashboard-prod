import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Button, Row, Col } from "react-bootstrap";
import CustomCloseButton from "../../components/CustomCloseButton";
import { DetailsRow, InfoDetailInlineRow } from "../../helper/utility";
import { openDialog } from "../../lib/global/DialogManager";
import type { QuoteRow } from "../../lib/types/quoteTypes";
import {
  computeQuotePriceBreakdown,
  formatQuoteRupees,
  formatQuoteScheduleForView,
  quotePriceBreakdownFromRow,
  getQuoteServiceAddressDisplay,
  mergeQuoteViewData,
  QUOTE_MODAL_LAYOUT,
  QUOTE_SECTION_TITLE_CLASS,
  toQuoteViewData,
} from "../../lib/quote/quoteHelpers";
import type { QuoteViewData } from "../../lib/quote/quoteHelpers";
import type { ServiceDropDownOption } from "../../services/servicesService";
import {
  convertQuoteToOrder,
  fetchQuoteDetailById,
} from "../../services/quoteService";
import { openConfirmDialog } from "../../components/CustomConfirmDialog";
import { showErrorAlert, showSuccessAlert } from "../../lib/global/alertHelper";
import QuotePriceBreakdownPanel from "../../components/quote/QuotePriceBreakdownPanel";
import QuoteInfoPersonSection from "../../components/quote/QuoteInfoPersonSection";
import editIcon from "../../assets/icons/edit_red.svg";

export type { QuoteViewData };

type QuoteInfoDialogProps = {
  quote: QuoteViewData;
  onClose: () => void;
  onRefreshData?: () => void;
};

const STATUS_TEXT_CLASS: Record<string, string> = {
  new: "text-secondary",
  pending: "text-warning",
  accepted: "text-success",
  success: "text-success",
  failed: "text-danger",
};

const QuoteInfoDialog: React.FC<QuoteInfoDialogProps> & {
  show: (quote: QuoteViewData, onRefreshData?: () => void) => void;
} = ({ quote, onClose, onRefreshData }) => {
  const [displayQuote, setDisplayQuote] = useState<QuoteViewData>(quote);
  const [serviceFees, setServiceFees] = useState<
    ServiceDropDownOption | undefined
  >(undefined);
  const baselineQuoteRef = useRef(quote);
  baselineQuoteRef.current = quote;

  const quoteMongoId = String(
    quote._id ?? quote.quote_id ?? ""
  ).trim();

  const applyQuoteDetail = useCallback(
    (row: QuoteRow | null, fees: ServiceDropDownOption | undefined) => {
      if (row) {
        setDisplayQuote((prev) =>
          mergeQuoteViewData(
            toQuoteViewData(row),
            mergeQuoteViewData(prev, baselineQuoteRef.current)
          )
        );
        setServiceFees(fees);
        return;
      }
      setDisplayQuote((prev) =>
        mergeQuoteViewData(prev, baselineQuoteRef.current)
      );
      setServiceFees(undefined);
    },
    []
  );

  /** View: `GET /quote/get/:id` only (not franchise related-catalog). */
  useEffect(() => {
    if (!quoteMongoId) {
      setDisplayQuote(baselineQuoteRef.current);
      setServiceFees(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { quote: row, serviceFees: fees } =
        await fetchQuoteDetailById(quoteMongoId);
      if (cancelled) return;
      applyQuoteDetail(row, fees);
    })();
    return () => {
      cancelled = true;
    };
  }, [quoteMongoId, applyQuoteDetail]);

  const statusKey = String(displayQuote.status ?? "").toLowerCase();
  const statusTextClass =
    STATUS_TEXT_CLASS[statusKey] ?? "text-body-secondary";
  const isSuccess = statusKey === "success";
  const isAccepted = statusKey === "accepted";

  const partnerNameForDisplay = isAccepted
    ? displayQuote.partner_name
    : displayQuote.requested_partner;

  const scheduleDisplay = useMemo(
    () =>
      formatQuoteScheduleForView({
        status: displayQuote.status,
        requested_date: displayQuote.requested_date,
        requested_time: displayQuote.requested_time,
        from_date: displayQuote.from_date,
        to_date: displayQuote.to_date,
        work_start_time: displayQuote.work_start_time,
        work_end_time: displayQuote.work_end_time,
        scheduled_date: displayQuote.scheduled_date,
        scheduled_time_from: displayQuote.scheduled_time_from,
        scheduled_time_to: displayQuote.scheduled_time_to,
      }),
    [
      displayQuote.status,
      displayQuote.requested_date,
      displayQuote.requested_time,
      displayQuote.from_date,
      displayQuote.to_date,
      displayQuote.work_start_time,
      displayQuote.work_end_time,
      displayQuote.scheduled_date,
      displayQuote.scheduled_time_from,
      displayQuote.scheduled_time_to,
    ]
  );

  const serviceLabel = useMemo(() => {
    const candidates = [
      isSuccess || isAccepted
        ? displayQuote.services_summary
        : undefined,
      displayQuote.service_name,
      displayQuote.requested_services,
      serviceFees?.label,
    ];
    for (const c of candidates) {
      const t = String(c ?? "").trim();
      if (t) return t;
    }
    return "-";
  }, [
    displayQuote.service_name,
    displayQuote.requested_services,
    displayQuote.services_summary,
    isSuccess,
    isAccepted,
    serviceFees?.label,
  ]);

  const canEditQuote = !isSuccess && Boolean(quoteMongoId);

  const priceBreakdown = useMemo(() => {
    const fromApi = quotePriceBreakdownFromRow(displayQuote);
    if (fromApi) return fromApi;
    return computeQuotePriceBreakdown(
      displayQuote.total_service_charge ??
        displayQuote.service_price ??
        0,
      serviceFees
    );
  }, [displayQuote, serviceFees]);

  const serviceAddress = useMemo(
    () => getQuoteServiceAddressDisplay(displayQuote),
    [displayQuote]
  );

  const customerProfile = displayQuote.profile_url ?? null;
  const partnerProfile = displayQuote.partner_profile_url ?? null;
  const employeeProfile = displayQuote.employee_profile_url ?? null;

  const refreshQuoteDetail = useCallback(async () => {
    if (!quoteMongoId) return;
    const { quote: row, serviceFees: fees } =
      await fetchQuoteDetailById(quoteMongoId);
    applyQuoteDetail(row, fees);
    onRefreshData?.();
  }, [quoteMongoId, applyQuoteDetail, onRefreshData]);

  const openEditAll = () => {
    if (!quoteMongoId) return;
    void import("./QuoteEditAllDialog").then(({ default: QuoteEditAllDialog }) => {
      QuoteEditAllDialog.show(quoteMongoId, () => {
        void refreshQuoteDetail();
      });
    });
  };

  return (
    <Modal
      show={true}
      onHide={onClose}
      {...QUOTE_MODAL_LAYOUT}
      key={quoteMongoId || "quote-info"}
    >
      <Modal.Header className="py-3 px-4 border-bottom-0 d-flex align-items-center flex-shrink-0">
        <Modal.Title className="mb-0 me-auto">Quote information</Modal.Title>
        <div className="d-flex align-items-center gap-3 ms-3">
          {canEditQuote ? (
            <img
              src={editIcon}
              alt="Edit quote"
              width={22}
              height={22}
              style={{ cursor: "pointer" }}
              role="button"
              onClick={openEditAll}
            />
          ) : null}
          <CustomCloseButton onClose={onClose} inline size={22} />
        </div>
      </Modal.Header>
      <Modal.Body className="add-quote-modal-body pt-0">
        {isSuccess ? (
          <section className="border rounded p-3 mb-3">
            <h6 className={QUOTE_SECTION_TITLE_CLASS}>Order</h6>
            <DetailsRow title="Order ID" value={displayQuote.order_id} />
          </section>
        ) : null}

        <section className="border rounded p-3 mb-3">
          <h6 className={QUOTE_SECTION_TITLE_CLASS}>Quote details</h6>
          <Row className="g-2">
            <Col xs={12} md={6} className="info-detail-fields-col">
              <DetailsRow title="Quote ID" value={displayQuote.quote_id} />
              <DetailsRow title="Service" value={serviceLabel} />
              <DetailsRow
                title="Category"
                value={displayQuote.category_name}
              />
              <DetailsRow
                title="Franchise"
                value={displayQuote.franchise_name}
              />
            </Col>
            <Col xs={12} md={6} className="info-detail-fields-col">
              <DetailsRow
                title="Service charge"
                value={
                  displayQuote.total_service_charge != null &&
                  Number.isFinite(displayQuote.total_service_charge)
                    ? formatQuoteRupees(displayQuote.total_service_charge)
                    : displayQuote.service_price != null &&
                        Number.isFinite(displayQuote.service_price)
                      ? formatQuoteRupees(displayQuote.service_price)
                      : undefined
                }
              />
              <DetailsRow
                title="Total price"
                value={
                  displayQuote.total_price != null &&
                  Number.isFinite(displayQuote.total_price)
                    ? formatQuoteRupees(displayQuote.total_price)
                    : undefined
                }
              />
              <DetailsRow
                title="Quote status"
                value={
                  <span className={`fw-semibold ${statusTextClass}`}>
                    {displayQuote.status}
                  </span>
                }
              />
              <DetailsRow
                title="Schedule date and time"
                value={scheduleDisplay}
              />
            </Col>
          </Row>
          <Row className="g-2 mt-1">
            <Col xs={12} className="info-detail-fields-col">
              <DetailsRow
                title="User description"
                value={(displayQuote.description ?? "").trim() || undefined}
              />
            </Col>
          </Row>
          <Row className="g-2 mt-1">
            <Col xs={12} className="info-detail-fields-col">
              <DetailsRow
                title="Admin description"
                value={
                  (displayQuote.admin_description ?? "").trim() || undefined
                }
              />
            </Col>
          </Row>
        </section>

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
          title="Customer"
          role="customer"
          profileUrl={customerProfile}
          fields={[
            { label: "Name", value: displayQuote.user_name ?? "-", column: "left" },
            { label: "Phone", value: displayQuote.phone_number ?? "-", column: "right" },
            { label: "Email", value: displayQuote.user_email ?? "-", fullWidth: true },
          ]}
        />

        <QuoteInfoPersonSection
          title="Partner"
          role="partner"
          profileUrl={partnerProfile}
          fields={[
            { label: "Name", value: partnerNameForDisplay ?? "-", column: "left" },
            { label: "Phone", value: displayQuote.partner_phone ?? "-", column: "right" },
            { label: "Email", value: displayQuote.partner_email ?? "-", column: "left" },
            ...((displayQuote.partner_city ?? "").trim()
              ? [
                  {
                    label: "Location / service area",
                    value: displayQuote.partner_city,
                    fullWidth: true as const,
                  },
                ]
              : []),
          ]}
        />

        <QuoteInfoPersonSection
          title="Employee"
          role="employee"
          profileUrl={employeeProfile}
          fields={[
            { label: "Name", value: displayQuote.employee_name ?? "-", column: "left" },
            { label: "Phone", value: displayQuote.employee_phone ?? "-", column: "right" },
            { label: "Email", value: displayQuote.employee_email ?? "-", fullWidth: true },
          ]}
        />

        {priceBreakdown ? (
          <div className="mb-3">
            <QuotePriceBreakdownPanel
              breakdown={priceBreakdown}
              variant="view"
            />
          </div>
        ) : null}

        {isAccepted && quoteMongoId ? (
          <div className="mt-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                openConfirmDialog(
                  "Convert this quote to an order?",
                  "Convert",
                  "Cancel",
                  async () => {
                    const result = await convertQuoteToOrder(quoteMongoId);
                    if (result.ok) {
                      const orderLabel = result.orderUniqueId
                        ? ` Order ${result.orderUniqueId}.`
                        : "";
                      showSuccessAlert(
                        result.alreadyLinked
                          ? `Quote is already linked to an order.${orderLabel}`
                          : `Quote converted to order.${orderLabel}`
                      );
                      onRefreshData?.();
                      onClose();
                    } else {
                      showErrorAlert("Could not convert quote.");
                    }
                  }
                );
              }}
            >
              Convert to order
            </Button>
          </div>
        ) : null}
      </Modal.Body>
    </Modal>
  );
};

QuoteInfoDialog.show = (quote: QuoteViewData, onRefreshData?: () => void) => {
  openDialog("quote-details-modal", (close) => (
    <QuoteInfoDialog
      quote={quote}
      onClose={close}
      onRefreshData={onRefreshData}
    />
  ));
};

export default QuoteInfoDialog;
