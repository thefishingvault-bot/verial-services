import { describe, it, expect, beforeEach, vi } from "vitest";

import { POST as payBooking } from "@/app/api/bookings/[bookingId]/pay/route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: "user_1" }),
}));

const stripeMocks = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: stripeMocks.sessionsCreate,
      },
    },
  },
}));

const dbMocks = vi.hoisted(() => ({
  findBooking: vi.fn(),
  findProvider: vi.fn(),
  findService: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      bookings: { findFirst: dbMocks.findBooking },
      providers: { findFirst: dbMocks.findProvider },
      services: { findFirst: dbMocks.findService },
    },
  },
}));

describe("POST /api/bookings/[bookingId]/pay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "";
    process.env.NEXT_PUBLIC_APP_URL = "";
    process.env.VERCEL_URL = "";
  });

  it("returns 404 when booking not found / not owned", async () => {
    dbMocks.findBooking.mockResolvedValue(null);

    const req = new Request("http://localhost/api/bookings/bk_1/pay", { method: "POST" });
    const res = await payBooking(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(404);
  });

  it("returns 400 when booking is not accepted", async () => {
    dbMocks.findBooking.mockResolvedValue({
      id: "bk_1",
      status: "paid",
      priceAtBooking: 5000,
      providerId: "prov_1",
      serviceId: "svc_1",
    });

    const req = new Request("http://localhost/api/bookings/bk_1/pay", { method: "POST" });
    const res = await payBooking(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Cannot pay for booking/);
  });

  it("creates a checkout session and returns url", async () => {
    dbMocks.findBooking.mockResolvedValue({
      id: "bk_1",
      status: "accepted",
      priceAtBooking: 5000,
      providerId: "prov_1",
      serviceId: "svc_1",
    });

    dbMocks.findProvider.mockResolvedValue({ id: "prov_1", stripeConnectId: "acct_123" });
    dbMocks.findService.mockResolvedValue({ title: "House clean" });

    stripeMocks.sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session_123" });

    const req = new Request("http://localhost/api/bookings/bk_1/pay", { method: "POST" });
    const res = await payBooking(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(200);
    expect(stripeMocks.sessionsCreate).toHaveBeenCalledTimes(1);

    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\//);
  });
});
