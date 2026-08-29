import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Spinner } from "react-bootstrap";
import CustomCloseButton from "../CustomCloseButton";
import CustomPagination from "../CustomPagination";
import { openDialog } from "../../lib/global/DialogManager";
import { showOrderInfoDialog } from "../order";
import { fetchPartnerRatings } from "../../services/partnerRatingsService";
import type {
  PartnerRatingRow,
  PartnerRatingsSummary,
} from "../../services/partnerRatingsService";
import {
  PartnerReviewCard,
  PartnerReviewStars,
} from "./PartnerReviewCard";

type PartnerRatingsDialogProps = {
  partnerId: string;
  partnerName?: string;
  onClose: () => void;
};

const PAGE_SIZE = 10;

function formatAvg(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const PartnerRatingsDialog: React.FC<PartnerRatingsDialogProps> & {
  show: (partnerId: string, partnerName?: string) => void;
} = ({ partnerId, partnerName, onClose }) => {
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PartnerRatingsSummary | null>(null);
  const [records, setRecords] = useState<PartnerRatingRow[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loadError, setLoadError] = useState("");
  const fetchSeqRef = useRef(0);

  const loadPage = useCallback(
    async (nextPage: number) => {
      const seq = (fetchSeqRef.current += 1);
      setLoading(true);
      setLoadError("");
      const res = await fetchPartnerRatings(partnerId, nextPage, PAGE_SIZE);
      if (seq !== fetchSeqRef.current) return;
      setLoading(false);
      if (!res.ok) {
        setLoadError("Could not load reviews for this partner.");
        setSummary(null);
        setRecords([]);
        setTotalPages(0);
        return;
      }
      setSummary(res.summary);
      setRecords(res.records);
      setTotalPages(res.totalPages);
      setPage(res.currentPage || nextPage);
    },
    [partnerId]
  );

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const titleName =
    String(summary?.partner_name || partnerName || "").trim() || "Partner";

  const handleOrderClick = useCallback(
    (orderMongoId: string) => {
      showOrderInfoDialog(orderMongoId, () => {
        void loadPage(page);
      });
    },
    [loadPage, page]
  );

  return (
    <Modal
      show
      onHide={onClose}
      centered
      scrollable
      size="lg"
      dialogClassName="partner-ratings-dialog"
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title">
          Reviews — {titleName}
        </Modal.Title>
        <CustomCloseButton onClose={onClose} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        <div className="partner-ratings-dialog__summary mb-3">
          <span className="partner-ratings-dialog__summary-avg">
            {formatAvg(summary?.average_rating)}
          </span>
          <PartnerReviewStars rating={Number(summary?.average_rating) || 0} />
          <span className="text-muted small">
            {Number(summary?.rating_count) || records.length} review
            {(Number(summary?.rating_count) || records.length) === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <div className="d-flex justify-content-center py-5">
            <Spinner animation="border" role="status" />
          </div>
        ) : loadError ? (
          <p className="text-danger mb-0">{loadError}</p>
        ) : records.length === 0 ? (
          <p className="text-muted mb-0">No reviews yet.</p>
        ) : (
          <div className="partner-ratings-dialog__list d-flex flex-column gap-3">
            {records.map((row, index) => (
              <PartnerReviewCard
                key={`${row.order_id || row.order_unique_id}-${index}`}
                row={row}
                onOrderClick={handleOrderClick}
              />
            ))}
          </div>
        )}

        {!loading && totalPages > 1 ? (
          <div className="d-flex justify-content-center mt-3">
            <CustomPagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(p) => {
                void loadPage(p);
              }}
            />
          </div>
        ) : null}
      </Modal.Body>
    </Modal>
  );
};

PartnerRatingsDialog.show = (partnerId: string, partnerName?: string) => {
  const id = String(partnerId ?? "").trim();
  if (!id) return;
  openDialog("partner-ratings-modal", (close) => (
    <PartnerRatingsDialog
      partnerId={id}
      partnerName={partnerName}
      onClose={close}
    />
  ));
};

export default PartnerRatingsDialog;
