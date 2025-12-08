import { describe, expect, it } from "vitest";
import {
  AdminBookingsSearchSchema,
  AdminProvidersSearchSchema,
  BookingIdParamSchema,
  parseParamsOrNotFound,
  parseSearchParams,
} from "@/lib/validation/admin-loader-schemas";

describe("admin loader validation", () => {
  it("throws notFound for invalid bookingId", () => {
    expect(() => parseParamsOrNotFound(BookingIdParamSchema, { bookingId: "not-a-uuid" })).toThrowError();
  });

  it("normalizes invalid provider search params to safe defaults", () => {
    const result = parseSearchParams(AdminProvidersSearchSchema, {
      page: "abc",
      pageSize: "-5",
      status: "unknown",
      verified: "nope",
    });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.status).toBe("all");
    expect(result.verified).toBe(false);
  });

  it("maps confirmed booking status to accepted and keeps defaults on bad values", () => {
    const result = parseSearchParams(AdminBookingsSearchSchema, {
      status: "confirmed",
      search: "client",
      tab: "confirmed",
    });

    expect(result.status).toBe("accepted");
    expect(result.tab).toBe("confirmed");
    expect(result.search).toBe("client");
  });
});
