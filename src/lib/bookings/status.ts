export type BookingStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "paid"
  | "completed"
  | "canceled_customer"
  | "canceled_provider"
  | "disputed"
  | "refunded";

export type StatusBadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const getBookingStatusLabel = (status: BookingStatus | string): string => {
  const normalized = String(status);
  switch (normalized) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "paid":
      return "Paid";
    case "completed":
      return "Completed";
    case "refunded":
      return "Refunded";
    case "disputed":
      return "In dispute";
    case "canceled_customer":
      return "Cancelled by customer";
    case "canceled_provider":
      return "Cancelled by provider";
    case "declined":
      return "Declined";
    default:
      return normalized.replace(/_/g, " ");
  }
};

export const getBookingStatusVariant = (status: BookingStatus | string): StatusBadgeVariant => {
  switch (status) {
    case "paid":
    case "completed":
      return "default";
    case "accepted":
      return "secondary";
    case "pending":
      return "outline";
    case "refunded":
    case "disputed":
      return "secondary";
    case "declined":
    case "canceled_customer":
    case "canceled_provider":
      return "destructive";
    default:
      return "secondary";
  }
};
