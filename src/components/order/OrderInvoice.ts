/**
 * Order tax-invoice PDF (html2pdf). UI layer — not part of lib/order API module.
 */
import html2pdf from "html2pdf.js";
import { formatDate, formatUtcToLocalTime } from "../../helper/utility";
import logoDark from "../../assets/images/helper-logo.png";
import { AppConstant } from "../../lib/global/AppConstant";
import { extractMinDepositTypeKey } from "../../lib/service/serviceMinDepositDisplay";
import {
  fetchOrderById,
  OrderItemModel,
  OrderModel,
  OrderPaymentModeEnum,
  OrderStatusEnum,
} from "../../lib/order/orders";

function orderItemPaymentType(item: OrderItemModel): string {
  const info = item.service_info as
    | (NonNullable<OrderItemModel["service_info"]> & {
        service?: { payment_type?: string; min_deposit_type?: string };
      })
    | undefined
    | null;
  const nested = info?.service;
  return String(
    info?.payment_type ??
      info?.min_deposit_type ??
      nested?.payment_type ??
      nested?.min_deposit_type ??
      ""
  ).trim();
}

function isOrderItemPerConsultancy(item: OrderItemModel): boolean {
  return (
    extractMinDepositTypeKey(orderItemPaymentType(item)) === "per_consultancy"
  );
}

export function orderInvoiceHtml(invoiceData: OrderModel): string {
  const items = Array.isArray(invoiceData.service_items)
    ? invoiceData.service_items
    : [];
  /** Per-consultancy: single Schedule column (date + start time), no To Time. */
  const isPerConsultancyInvoice =
    items.length > 0 && items.every((item) => isOrderItemPerConsultancy(item));

  const itemRowsHtml = items
    .map((item, index) => {
      const dateLabel = formatDate(item.service_date ? item.service_date : "");
      const fromLabel = formatUtcToLocalTime(item.service_from_time);
      const priceLabel = `${AppConstant.currencySymbol} ${Number(
        item.sub_total ?? 0
      ).toFixed(2)}`;
      const name = item.service_info?.name ?? "";

      if (isPerConsultancyInvoice) {
        const schedule =
          dateLabel && fromLabel && fromLabel !== "-"
            ? `${dateLabel}, ${fromLabel}`
            : dateLabel || fromLabel || "-";
        return `
                <tr>
                  <td class="col-num">${index + 1}</td>
                  <td class="col-schedule">${schedule}</td>
                  <td class="col-name">${name}</td>
                  <td class="col-price">${priceLabel}</td>
                </tr>`;
      }

      const omitTo = isOrderItemPerConsultancy(item);
      return `
                <tr>
                  <td class="col-num">${index + 1}</td>
                  <td class="col-date">${dateLabel}</td>
                  <td class="col-name">${name}</td>
                  <td class="col-time">${fromLabel}</td>
                  <td class="col-time">${
                    omitTo ? "-" : formatUtcToLocalTime(item.service_to_time)
                  }</td>
                  <td class="col-price">${priceLabel}</td>
                </tr>`;
    })
    .join("");

  const tableHeadHtml = isPerConsultancyInvoice
    ? `
              <tr>
                <th class="col-num">#</th>
                <th class="col-schedule">Schedule</th>
                <th class="col-name">Service Name</th>
                <th class="col-price">Price</th>
              </tr>`
    : `
              <tr>
                <th class="col-num">#</th>
                <th class="col-date">Service Date</th>
                <th class="col-name">Service Name</th>
                <th class="col-time">From Time</th>
                <th class="col-time">To Time</th>
                <th class="col-price">Price</th>
              </tr>`;

  return `
  <html>
    <head>
      <style>
        .invoice-container {
          font-family: Arial, Helvetica, sans-serif;
          max-width: 800px;
          margin: auto;
          padding: 20px;
          background-color: white;
          color: #1A1A1A;
        }
        .invoice-header {
          text-align: center;
          margin-bottom: 20px;
        }
        .invoice-header img {
          max-width: 150px;
          height: auto;
        }
        .invoice-header h1 {
          margin: 0;
          color: #880B0B;
        }
        .invoice-section {
          margin-bottom: 8px;
          border: 1px solid #740909;
          padding: 8px;
          border-radius: 4px;
        }
        .invoice-section h2 {
          color: #740909;
          text-align: center;
          margin: 0;
          padding: 6px 0;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .items-table th, .items-table td {
          padding: 10px 8px;
          border: 1px solid #E8E8E8;
          vertical-align: middle;
          word-wrap: break-word;
        }
        .items-table th {
          background-color: #740909;
          color: #F7F7F7;
          font-weight: 700;
          white-space: nowrap;
          text-align: center;
        }
        .items-table td {
          text-align: center;
          background-color: #F7F7F7;
          color: #1A1A1A;
        }
        .items-table .col-num { width: 8%; }
        .items-table .col-date { width: 18%; }
        .items-table .col-schedule { width: 32%; }
        .items-table .col-name { width: ${isPerConsultancyInvoice ? "40%" : "22%"}; text-align: left; }
        .items-table .col-time { width: 14%; white-space: nowrap; }
        .items-table .col-price { width: ${isPerConsultancyInvoice ? "20%" : "14%"}; text-align: right; white-space: nowrap; }
        .items-table th.col-name,
        .items-table th.col-price { text-align: center; }
        .summary-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 0;
          table-layout: fixed;
        }
        .summary-table td {
          border: 1px solid #E8E8E8;
          background-color: #F7F7F7;
          padding: 12px 10px;
          vertical-align: top;
          font-size: 12px;
          line-height: 1.55;
        }
        .summary-company {
          width: 58%;
          text-align: left;
        }
        .summary-totals {
          width: 42%;
          text-align: right;
        }
        .summary-totals .total-line {
          font-weight: 700;
          margin-top: 4px;
        }
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .invoice-container {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background-color: transparent !important;
          }
          body {
            font-size: 12px !important;
            line-height: 1.5 !important;
          }
          .items-table th, .items-table td {
            padding: 8px !important;
          }
          @page {
            margin: 10mm;
          }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <header class="invoice-header">
          <img src="${logoDark}" alt="Logo" />
          <h1>Tax Invoice</h1>
        </header>
        <section style="margin-bottom: 8px;">
          <div style="margin-bottom: 8px;">
            <div style="float: left; text-align: left; width: 50%;">
              <strong>Order Id:</strong> ${invoiceData?.unique_id}<br />
              <strong>Order Date:</strong> ${
                invoiceData?.order_date
                  ? formatDate(invoiceData?.order_date ?? "")
                  : "-"
              }<br />
              <strong>Order Status:</strong> ${
                OrderStatusEnum.get(invoiceData.order_status)?.label ?? "-"
              }<br />
            </div>
            <div style="float: right; text-align: right; width: 50%;">
              <strong>Payment Status:</strong>
              ${
                invoiceData.is_paid
                  ? '<span style="color: green;">Paid</span>'
                  : '<span style="color: red;">Unpaid</span>'
              }<br />
              <strong>Payment Method:</strong> ${
                OrderPaymentModeEnum.get(Number(invoiceData.payment_mode_id))
                  ?.label ?? "-"
              }<br />
            </div>
            <div style="clear: both;"></div>
          </div>
        </section>
        <section class="invoice-section">
          <h2>Service Address</h2>
          ${invoiceData?.address ?? "-"}<br />
        </section>
        <section class="invoice-section">
          <h2>User Information</h2>
          <strong>User Name:</strong> ${invoiceData?.user_info?.name ?? "-"}<br />
          <strong>Phone Number:</strong> ${
            invoiceData?.user_info?.phone_number ?? "-"
          }<br />
          <strong>Location:</strong> ${
            invoiceData?.user_info?.city_name ?? "-"
          }<br />
        </section>
        <section style="margin-bottom: 8px;">
          <table class="items-table">
            <thead>
              ${tableHeadHtml}
            </thead>
            <tbody>
              ${itemRowsHtml}
            </tbody>
          </table>
          <table class="summary-table">
            <tr>
              <td class="summary-company">
                <strong>${AppConstant.companyName}</strong><br />
                <strong>Helpline Number:</strong> ${AppConstant.helplineNumber}<br />
                <strong>Support Email:</strong> ${AppConstant.supportEmail}<br />
                <strong>Location:</strong> ${AppConstant.companyLocation}
              </td>
              <td class="summary-totals">
                <strong>Service Amount:</strong> ${AppConstant.currencySymbol} ${
                  invoiceData?.sub_total ? invoiceData.sub_total.toFixed(2) : 0
                }<br />
                <strong>User Platform Fee:</strong> ${AppConstant.currencySymbol} ${
                  invoiceData?.user_paltform_fee
                    ? invoiceData.user_paltform_fee.toFixed(2)
                    : 0
                }<br />
                <strong>Taxes:</strong> ${AppConstant.currencySymbol} ${
                  invoiceData?.tax ? invoiceData.tax.toFixed(2) : 0
                }<br />
                <div class="total-line">
                  <strong>Total Price:</strong> ${AppConstant.currencySymbol} ${
                    invoiceData?.total_price ? invoiceData.total_price.toFixed(2) : 0
                  }
                </div>
              </td>
            </tr>
          </table>
        </section>
      </div>
    </body>
  </html>
`;
}

/** Fetches order detail and saves invoice PDF (used from order list actions). */
export async function downloadOrderInvoice(orderId: string): Promise<void> {
  const { response, order } = await fetchOrderById(orderId);
  if (!response || !order) return;

  const html2pdfOptions = {
    margin: 0,
    filename: `invoice_${order.unique_id}.pdf`,
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };
  html2pdf().from(orderInvoiceHtml(order)).set(html2pdfOptions).save();
}
