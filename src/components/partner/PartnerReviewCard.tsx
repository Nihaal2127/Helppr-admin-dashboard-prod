import React from "react";
import { AppConstant } from "../../lib/global/AppConstant";
import { formatDate } from "../../helper/utility";
import profileIcon from "../../assets/icons/profile.svg";
import type { PartnerRatingRow } from "../../services/partnerRatingsService";

export function PartnerReviewStars({ rating }: { rating: number }) {
  const value = Number(rating);
  const clamped = Number.isFinite(value)
    ? Math.max(0, Math.min(5, value))
    : 0;

  return (
    <span
      className="order-completed-review__stars"
      aria-label={`${clamped} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        let icon = "bi-star";
        if (clamped >= n) icon = "bi-star-fill";
        else if (clamped >= n - 0.5) icon = "bi-star-half";
        return <i key={n} className={`bi ${icon}`} aria-hidden />;
      })}
    </span>
  );
}

function PartnerReviewText({ text }: { text: string }) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return (
      <p className="order-completed-review__text order-completed-review__text--muted mb-0">
        No written review
      </p>
    );
  }
  return (
    <div className="order-completed-review__scroll">
      <p className="order-completed-review__text mb-0">{trimmed}</p>
    </div>
  );
}

function resolveAvatarSrc(url?: string | null): string {
  const raw = String(url ?? "").trim();
  if (!raw) return profileIcon;
  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:")
  ) {
    return raw;
  }
  return `${AppConstant.IMAGE_BASE_URL}${raw.replace(/^\//, "")}`;
}

type PartnerReviewCardProps = {
  row: PartnerRatingRow;
  onOrderClick: (orderMongoId: string) => void;
  /** `grid` = stacked layout for 3-column Partner Information cards */
  variant?: "list" | "grid";
};

export function PartnerReviewCard({
  row,
  onOrderClick,
  variant = "list",
}: PartnerReviewCardProps) {
  const orderLabel = String(row.order_unique_id || row.order_id || "").trim();
  const orderMongoId = String(row.order_id || "").trim();
  const reviewedAt = String(row.reviewed_at || "").trim();
  const serviceName = String(row.service_name ?? "").trim();
  const isGrid = variant === "grid";

  const orderValue =
    orderLabel && orderMongoId ? (
      <button
        type="button"
        className="partner-ratings-dialog__order-link btn btn-link p-0 align-baseline"
        onClick={() => onOrderClick(orderMongoId)}
      >
        {orderLabel}
      </button>
    ) : (
      orderLabel || "—"
    );

  const kvBlock = (
    <div className="partner-ratings-dialog__kv" aria-label="Order details">
      <div className="partner-ratings-dialog__kv-row">
        <span className="partner-ratings-dialog__kv-label">Order ID</span>
        <span className="partner-ratings-dialog__kv-colon">:</span>
        <span className="partner-ratings-dialog__kv-value text-truncate">
          {orderValue}
        </span>
      </div>
      <div className="partner-ratings-dialog__kv-row">
        <span className="partner-ratings-dialog__kv-label">Service</span>
        <span className="partner-ratings-dialog__kv-colon">:</span>
        <span className="partner-ratings-dialog__kv-value text-truncate">
          {serviceName || "—"}
        </span>
      </div>
    </div>
  );

  return (
    <div
      className={[
        "order-completed-review",
        "partner-ratings-dialog__card",
        isGrid ? "partner-review-card--grid" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="order-completed-review__header">
        <img
          src={resolveAvatarSrc(row.customer_profile_url)}
          alt=""
          className="order-completed-review__avatar"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src !== profileIcon) img.src = profileIcon;
          }}
        />
        <div className="order-completed-review__meta min-w-0">
          {isGrid ? (
            <>
              <div className="order-completed-review__name text-truncate">
                {row.customer_name || "—"}
              </div>
              <div className="d-flex align-items-center gap-2 flex-wrap mt-1">
                <PartnerReviewStars rating={row.rating} />
                {reviewedAt ? (
                  <span className="order-completed-review__date mb-0">
                    {formatDate(reviewedAt)}
                  </span>
                ) : null}
              </div>
              <div className="partner-review-card__kv-wrap mt-2">{kvBlock}</div>
            </>
          ) : (
            <div className="partner-ratings-dialog__row">
              <div className="partner-ratings-dialog__left min-w-0">
                <div className="order-completed-review__name text-truncate">
                  {row.customer_name || "—"}
                </div>
                <div className="d-flex align-items-center gap-2 flex-wrap mt-1">
                  <PartnerReviewStars rating={row.rating} />
                  {reviewedAt ? (
                    <span className="order-completed-review__date mb-0">
                      {formatDate(reviewedAt)}
                    </span>
                  ) : null}
                </div>
              </div>
              {kvBlock}
            </div>
          )}
        </div>
      </div>
      <PartnerReviewText text={row.review_text} />
    </div>
  );
}
