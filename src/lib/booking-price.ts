export type BookingPriceLike = {
  providerQuotedPrice: number | null | undefined;
  priceAtBooking: number | null | undefined;
};

export function getFinalBookingAmountCents(booking: BookingPriceLike): number | null {
  const candidate = booking.providerQuotedPrice ?? booking.priceAtBooking ?? null;
  if (typeof candidate !== "number") return null;
  if (!Number.isFinite(candidate)) return null;
  if (candidate <= 0) return null;
  return candidate;
}
