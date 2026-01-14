export type AdminBookingsSortBy = "createdAt" | "amount" | "status" | "scheduledAt" | "id";
export type SortDir = "asc" | "desc";

export function computeBookingsListControls(args: {
  page: number;
  pageSize: number;
  sortBy: AdminBookingsSortBy;
  sortDir: SortDir;
}) {
  const page = Math.max(1, Math.floor(args.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(args.pageSize)));
  const offset = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    offset,
    limit: pageSize,
    sortBy: args.sortBy,
    sortDir: args.sortDir,
  };
}
