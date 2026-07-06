/**
 * Order tax-invoice PDF (html2pdf). UI layer — not part of lib/order API module.
 */
import html2pdf from "html2pdf.js";
import { formatDate, formatUtcToLocalTime } from "../../helper/utility";
import logoDark from "../../assets/icons/login_logo.svg";
import { AppConstant } from "../../lib/global/AppConstant";
import {
  fetchOrderById,
  OrderModel,
  OrderPaymentModeEnum,
  OrderStatusEnum,
} from "../../lib/order/orders";

export function orderInvoiceHtml(invoiceData: OrderModel): string {
  return `
  <html>
    <head>
      <style>
        .invoice-container {
          font-family: 'Arial, sans-serif';
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
        }
        .items-table th, .items-table td {
          padding: 12px 10px;
          text-align: center;
          border: 1px solid #E8E8E8;
        }
        .items-table th {
          background-color: #740909;
          color: #F7F7F7;
        }
        .items-table tr:nth-child(even) td {
          background-color: #F7F7F7;
          color: #1A1A1A;
        }
        .items-table tr:nth-child(odd) td {
          background-color: #F7F7F7;
          color: #1A1A1A;
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
          <table class="items-table striped">
            <thead>
              <tr>
                <th>#</th>
                <th>Service Date</th>
                <th>Service Name</th>
                <th>From Time</th>
                <th>To Time</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              ${invoiceData.service_items
                .map(
                  (item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${formatDate(item.service_date ? item.service_date : "")}</td>
                  <td>${item.service_info?.name ?? ""}</td>
                  <td>${formatUtcToLocalTime(item.service_from_time)}</td>
                  <td>${formatUtcToLocalTime(item.service_to_time)}</td>
                  <td>${AppConstant.currencySymbol} ${item.sub_total.toFixed(2)}</td>
                </tr>
              `
                )
                .join("")}
              <tr>
                <td colSpan="3">
                  <strong>${AppConstant.companyName}</strong><br />
                  <strong>Helpline Number:</strong> ${AppConstant.helplineNumber}<br />
                  <strong>Support Email:</strong> ${AppConstant.supportEmail}<br />
                  <strong>Location:</strong> ${AppConstant.companyLocation}<br />
                </td>
                <td colSpan="3" style="text-align: right;">
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
                  <strong>Total Price:</strong> ${AppConstant.currencySymbol} ${
                    invoiceData?.total_price ? invoiceData.total_price.toFixed(2) : 0
                  }
                </td>
              </tr>
            </tbody>
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
