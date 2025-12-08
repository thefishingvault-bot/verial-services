import { BookingTotals } from "@/lib/invoices/totals";
import { formatPrice } from "@/lib/utils";

interface Props {
  totals: BookingTotals;
  currency?: string;
  chargesGst: boolean;
}

export function ReceiptPriceBreakdown({ totals, currency = "NZD", chargesGst }: Props) {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Service total</span>
        <span className="font-semibold">{formatPrice(totals.gross, currency)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Platform fee (10%)</span>
        <span>{formatPrice(totals.platformFee, currency)}</span>
      </div>
      {chargesGst && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">GST (15%)</span>
          <span>{formatPrice(totals.gstAmount, currency)}</span>
        </div>
      )}
      <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
        <span>Paid</span>
        <span>{formatPrice(totals.totalPaid, currency)}</span>
      </div>
      {totals.refundedAmount > 0 && (
        <div className="flex items-center justify-between text-sm text-destructive">
          <span>Refunded</span>
          <span>-{formatPrice(totals.refundedAmount, currency)}</span>
        </div>
      )}
    </div>
  );
}
