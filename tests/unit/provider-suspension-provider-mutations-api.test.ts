import { describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

const dbMock = {
  query: {
    providers: {
      findFirst: vi.fn(),
    },
    bookings: {
      findFirst: vi.fn(),
    },
  },
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

describe("provider suspension enforcement: provider mutations", () => {
  it("returns 403 for suspended provider settings update", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });

    dbMock.query.providers.findFirst.mockResolvedValue({
      id: "prov_1",
      userId: "user_1",
      isSuspended: true,
      suspensionReason: "Policy violation",
      suspensionStartDate: new Date("2025-01-01T00:00:00.000Z"),
      suspensionEndDate: null,
    });

    const { PATCH } = await import("@/app/api/provider/settings/update/route");

    const req = new Request("http://localhost/api/provider/settings/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chargesGst: false,
        baseSuburb: null,
        baseRegion: null,
        serviceRadiusKm: null,
        coverageSuburbs: [],
        gstNumber: null,
      }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("PROVIDER_SUSPENDED");

    expect(dbMock.update).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("returns 403 for suspended provider booking accept", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });

    dbMock.query.providers.findFirst.mockResolvedValue({
      id: "prov_1",
      userId: "user_1",
      stripeConnectId: "acct_1",
      isSuspended: true,
      suspensionReason: "Policy violation",
      suspensionStartDate: new Date("2025-01-01T00:00:00.000Z"),
      suspensionEndDate: null,
    });

    const { PATCH } = await import("@/app/api/provider/bookings/update-status/route");

    const req = new Request("http://localhost/api/provider/bookings/update-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: "book_1",
        action: "accept",
      }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("PROVIDER_SUSPENDED");

    // Should return before touching bookings.
    expect(dbMock.query.bookings.findFirst).not.toHaveBeenCalled();
  });
});
