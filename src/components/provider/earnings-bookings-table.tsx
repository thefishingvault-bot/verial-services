import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EarningsBookingRow = {
  bookingId: string;
  serviceTitle: string | null;
  bookingStatus: string | null;
  payoutStatus: string | null;
  grossAmount: number;
  platformFeeAmount: number;
  gstAmount: number;
  netAmount: number;
  payoutDate: string | null;
  paidAt: string | null;
};

type EarningsBookingsTableProps = {
  currency: string;
  recentBookings: EarningsBookingRow[];
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function statusColor(status: string | null): string {
  if (!status) return "bg-muted text-muted-foreground";
  switch (status) {
    case "awaiting_payout":
      return "bg-amber-100 text-amber-800";
    case "paid_out":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function EarningsBookingsTable({ currency, recentBookings }: EarningsBookingsTableProps) {
  if (!recentBookings.length) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        No earnings yet. As soon as you complete jobs, they&apos;ll appear here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium">Recent earnings</h2>
      <div className="overflow-x-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Gross</TableHead>
              <TableHead>Fees</TableHead>
              <TableHead>GST</TableHead>
              <TableHead>Net</TableHead>
              <TableHead>Payout status</TableHead>
              <TableHead>Payout date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentBookings.map((row) => (
              <TableRow key={row.bookingId}>
                <TableCell>
                  <Link
                    href={`/dashboard/provider/bookings/${row.bookingId}`}
                    className="text-xs font-medium underline-offset-2 hover:underline"
                  >
                    #{row.bookingId}
                  </Link>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.serviceTitle ?? "Service"}
                </TableCell>
                <TableCell className="text-xs">
                  {formatPrice(row.grossAmount, currency)}
                </TableCell>
                <TableCell className="text-xs">
                  -{formatPrice(row.platformFeeAmount, currency)}
                </TableCell>
                <TableCell className="text-xs">
                  {formatPrice(row.gstAmount, currency)}
                </TableCell>
                <TableCell className="text-xs font-medium">
                  {formatPrice(row.netAmount, currency)}
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs ${statusColor(row.payoutStatus)}`}>
                    {row.payoutStatus ?? "-"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {formatDate(row.payoutDate ?? row.paidAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
