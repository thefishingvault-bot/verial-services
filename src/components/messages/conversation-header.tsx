"use client";

import { FC, useMemo } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CalendarDays,
  DollarSign,
  ShieldCheck,
  Star,
} from "lucide-react";

type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

interface ConversationHeaderProps {
  listHref?: string;

  counterpartName: string;
  counterpartHandle: string;
  counterpartAvatarUrl?: string | null;
  counterpartRole: "provider" | "customer";

  serviceTitle: string;
  bookingRef?: string | null;
  scheduledAt?: string | null;
  amountInCents?: number | null;
  includesGst?: boolean | null;
  status?: BookingStatus | null;

  serviceAreaSuburb?: string | null;
  serviceAreaRegion?: string | null;
  serviceAreaRadiusKm?: number | null;

  rating?: number;
  jobsCompleted?: number;
  isVerified?: boolean;

  bookingUrl?: string | null;
  profileUrl: string;
}

export const ConversationHeader: FC<ConversationHeaderProps> = ({
  listHref = "/dashboard/messages",
  counterpartName,
  counterpartHandle,
  counterpartAvatarUrl,
  counterpartRole,
  serviceTitle,
  bookingRef,
  scheduledAt,
  amountInCents,
  includesGst,
  status,
  rating,
  jobsCompleted,
  isVerified,
  serviceAreaSuburb,
  serviceAreaRegion,
  serviceAreaRadiusKm,
  bookingUrl,
  profileUrl,
}) => {
  const hasBooking = Boolean(bookingRef);

  const formattedWhen = useMemo(() => {
    if (!scheduledAt) {
      return null;
    }
    try {
      return new Intl.DateTimeFormat("en-NZ", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(scheduledAt));
    } catch {
      return null;
    }
  }, [scheduledAt]);

  const formattedAmount = useMemo(() => {
    if (amountInCents == null) {
      return null;
    }
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: "NZD",
      minimumFractionDigits: 2,
    }).format(amountInCents / 100);
  }, [amountInCents]);

  const statusLabel: Record<BookingStatus, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  const statusColour: Record<BookingStatus, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    completed: "bg-sky-50 text-sky-700 border-sky-200",
    cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  };

  const initial = counterpartName?.charAt(0)?.toUpperCase() ?? "?";

  return (
    <header className="flex items-center justify-between border-b bg-white px-4 py-3 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">
        <div className="flex items-center">
          <Link
            href={listHref}
            className="mr-1 inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white text-muted-foreground hover:bg-muted"
            aria-label="Back to messages"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        <Link
          href={profileUrl}
          className="flex min-w-0 items-center gap-3 hover:opacity-90"
        >
          <Avatar className="h-9 w-9 md:h-10 md:w-10">
            {counterpartAvatarUrl && (
              <AvatarImage src={counterpartAvatarUrl} alt={counterpartName} />
            )}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1">
              <p className="truncate text-sm font-medium md:text-base">
                {counterpartName}
              </p>
              <span className="hidden text-xs text-muted-foreground md:inline">
                · {counterpartHandle}
              </span>

              {counterpartRole === "provider" ? (
                <Badge variant="outline" className="ml-1 h-5 text-[11px]">
                  Provider
                </Badge>
              ) : (
                <Badge variant="outline" className="ml-1 h-5 text-[11px]">
                  Customer
                </Badge>
              )}

              {isVerified && (
                <Badge
                  variant="outline"
                  className="ml-1 flex h-5 items-center gap-1 text-[11px]"
                >
                  <ShieldCheck className="h-3 w-3" />
                  Verified
                </Badge>
              )}
            </div>

            <p className="truncate text-xs text-muted-foreground md:text-sm">
              {serviceTitle}
            </p>

            {serviceAreaRadiusKm && (serviceAreaSuburb || serviceAreaRegion) && (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground md:text-xs">
                Service area: up to {serviceAreaRadiusKm} km{" "}
                {serviceAreaSuburb
                  ? `from ${serviceAreaSuburb}`
                  : `in ${serviceAreaRegion}`}
              </p>
            )}

            {rating !== undefined && jobsCompleted !== undefined && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground md:text-xs">
                <Star className="h-3 w-3 fill-current" />
                {rating.toFixed(1)} · {jobsCompleted} jobs on Verial
              </p>
            )}
          </div>
        </Link>
      </div>

      <div className="ml-4 flex shrink-0 flex-col items-end gap-1 text-right">
        {hasBooking && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {formattedWhen && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground md:text-sm">
                <CalendarDays className="h-3 w-3 md:h-4 md:w-4" />
                <span>{formattedWhen}</span>
              </div>
            )}

            {formattedAmount && (
              <div className="flex items-center gap-1 text-xs font-medium md:text-sm">
                <DollarSign className="h-3 w-3 md:h-4 md:w-4" />
                <span>
                  {formattedAmount}
                  {includesGst && (
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      incl. GST
                    </span>
                  )}
                </span>
              </div>
            )}

            {status && (
              <span
                className={[
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium md:text-xs",
                  statusColour[status],
                ].join(" ")}
              >
                {statusLabel[status]}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {hasBooking && bookingUrl && (
            <Link href={bookingUrl}>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs md:text-sm"
              >
                View booking
              </Button>
            </Link>
          )}
          <Link href={profileUrl}>
            <Button size="sm" className="h-8 text-xs md:text-sm">
              View profile
            </Button>
          </Link>
        </div>
        {hasBooking ? (
          <p className="hidden text-[11px] text-muted-foreground md:block">
            Booking #{bookingRef}
          </p>
        ) : (
          <p className="hidden text-[11px] text-muted-foreground md:block">
            No booking linked yet
          </p>
        )}
      </div>
    </header>
  );
};