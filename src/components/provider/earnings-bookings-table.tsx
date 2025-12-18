import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { Badge, badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
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

function statusColor(status: string | null): VariantProps<typeof badgeVariants>["variant"] {
  if (!status) return "outline";
  switch (status) {
    case "awaiting_payout":
      return "outline";
    case "paid_out":
      return "secondary";
    default:
      return "outline";
  }
}

function formatPayoutStatus(status: string | null) {
  if (!status) return "-";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
              <TableHead className="hidden md:table-cell">Gross</TableHead>
              <TableHead className="hidden md:table-cell">Fees</TableHead>
              <TableHead className="hidden md:table-cell">GST</TableHead>
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
                <TableCell className="hidden md:table-cell text-xs">
                  {formatPrice(row.grossAmount, currency)}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs">
                  -{formatPrice(row.platformFeeAmount, currency)}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs">
                  {formatPrice(row.gstAmount, currency)}
                </TableCell>
                <TableCell className="text-xs font-medium">
                  {formatPrice(row.netAmount, currency)}
                </TableCell>
                <TableCell>
                  <Badge variant={statusColor(row.payoutStatus)} className="text-xs">
                    {formatPayoutStatus(row.payoutStatus)}
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
