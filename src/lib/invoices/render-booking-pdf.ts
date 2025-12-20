import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { ReceiptData } from "./get-receipt-data";
import { formatPrice } from "../utils";

type PdfKind = "receipt" | "invoice";

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

export async function renderBookingPdfBytes(data: ReceiptData, kind: PdfKind): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  let y = page.getHeight() - margin;

  const line = (text: string, opts?: { size?: number; bold?: boolean; color?: { r: number; g: number; b: number } }) => {
    const size = opts?.size ?? 11;
    const useBold = opts?.bold ?? false;
    const color = opts?.color ?? { r: 0.1, g: 0.1, b: 0.1 };

    page.drawText(text, {
      x: margin,
      y,
      size,
      font: useBold ? fontBold : font,
      color: rgb(color.r, color.g, color.b),
    });
    y -= size + 6;
  };

  const sectionGap = () => {
    y -= 10;
  };

  const title = kind === "invoice" ? "Tax Invoice" : "Receipt";
  line(title, { size: 20, bold: true });
  line(data.service.title ?? "", { size: 12, color: { r: 0.3, g: 0.3, b: 0.3 } });
  sectionGap();

  line(`Booking ID: ${data.booking.id}`, { bold: true });
  const issuedAt = kind === "invoice" ? data.booking.createdAt : (data.booking.updatedAt ?? data.booking.createdAt);
  line(`Issued: ${formatDateTime(issuedAt)}`);
  if (kind === "invoice") {
    line(`Invoice #: ${data.booking.id}`);
  }

  sectionGap();
  line("Provider", { bold: true, size: 13 });
  line(`Business: ${data.provider.businessName}`);
  const providerLocation = [data.provider.suburb, data.provider.region].filter(Boolean).join(", ");
  if (providerLocation) line(`Location: ${providerLocation}`);
  if (data.provider.chargesGst && data.provider.gstNumber) line(`GST Number: ${data.provider.gstNumber}`);

  sectionGap();
  line("Customer", { bold: true, size: 13 });
  line(`Name: ${data.customer.name}`);
  if (data.customer.email) line(`Email: ${data.customer.email}`);

  sectionGap();
  line("Booking", { bold: true, size: 13 });
  line(`Category: ${data.service.category}`);
  line(`Scheduled: ${data.booking.scheduledDate ? formatDateTime(data.booking.scheduledDate) : "Not scheduled"}`);
  line(`Payment status: ${data.payment.status ?? data.booking.status}`);
  if (data.cancellation) {
    line(
      `Cancellation: ${data.cancellation.actor} on ${formatDateTime(data.cancellation.createdAt)}${data.cancellation.reason ? ` — ${data.cancellation.reason}` : ""}`,
    );
  }

  sectionGap();
  line("Totals", { bold: true, size: 13 });
  const currency = data.payment.currency ?? "NZD";
  line(`Gross: ${formatPrice(data.totals.gross, currency)}`);
  if (data.totals.platformFee > 0) line(`Platform fee: ${formatPrice(data.totals.platformFee, currency)}`);
  if (data.totals.gstAmount > 0) line(`GST: ${formatPrice(data.totals.gstAmount, currency)}`);
  line(`Paid: ${formatPrice(data.totals.totalPaid, currency)}`, { bold: true });
  if (data.totals.refundedAmount > 0) {
    line(`Refunded: ${formatPrice(data.totals.refundedAmount, currency)}`, { color: { r: 0.65, g: 0.1, b: 0.1 } });
  }

  sectionGap();
  line("Payment", { bold: true, size: 13 });
  line(`Payment intent: ${data.payment.intentId ?? "Not created"}`);
  line(`Status: ${data.payment.status ?? data.booking.status}`);
  if (data.payment.refunds.length) {
    sectionGap();
    line("Refunds", { bold: true, size: 12 });
    for (const refund of data.payment.refunds) {
      line(`${refund.id} — ${formatPrice(refund.amount, refund.currency)} on ${formatDate(refund.createdAt)}`, { size: 10 });
    }
  }

  // Footer
  page.drawText("Verial Services", {
    x: margin,
    y: margin - 10,
    size: 10,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return pdfDoc.save();
}
