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
      providerQuotedPrice: null,
      providerId: "prov_1",
      serviceId: "svc_1",
    });

    dbMocks.findProvider.mockResolvedValue({ id: "prov_1", stripeConnectId: "acct_123" });
    dbMocks.findService.mockResolvedValue({ title: "House clean", pricingType: "fixed" });

    stripeMocks.sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session_123" });

    const req = new Request("http://localhost/api/bookings/bk_1/pay", { method: "POST" });
    const res = await payBooking(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(200);
    expect(stripeMocks.sessionsCreate).toHaveBeenCalledTimes(1);

    const call = stripeMocks.sessionsCreate.mock.calls[0]?.[0] as { success_url?: string } | undefined;
    expect(call?.success_url).toMatch(/session_id=\{CHECKOUT_SESSION_ID\}/);

    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\//);
  });

  it("returns 400 for quote bookings when provider quote is missing", async () => {
    dbMocks.findBooking.mockResolvedValue({
      id: "bk_1",
      status: "accepted",
      priceAtBooking: 5000,
      providerQuotedPrice: null,
      providerId: "prov_1",
      serviceId: "svc_1",
    });

    dbMocks.findProvider.mockResolvedValue({ id: "prov_1", stripeConnectId: "acct_123" });
    dbMocks.findService.mockResolvedValue({ title: "Custom job", pricingType: "quote" });

    const req = new Request("http://localhost/api/bookings/bk_1/pay", { method: "POST" });
    const res = await payBooking(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Waiting for provider quote/i);
    expect(stripeMocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it("charges providerQuotedPrice for from bookings when present", async () => {
    dbMocks.findBooking.mockResolvedValue({
      id: "bk_1",
      status: "accepted",
      priceAtBooking: 5000,
      providerQuotedPrice: 7500,
      providerId: "prov_1",
      serviceId: "svc_1",
    });

    dbMocks.findProvider.mockResolvedValue({ id: "prov_1", stripeConnectId: "acct_123" });
    dbMocks.findService.mockResolvedValue({ title: "Lawn mowing", pricingType: "from" });

    stripeMocks.sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session_123" });

    const req = new Request("http://localhost/api/bookings/bk_1/pay", { method: "POST" });
    const res = await payBooking(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(200);

    const call = stripeMocks.sessionsCreate.mock.calls[0]?.[0] as any;
    // Itemized: Service + Service fee
    expect(call?.line_items?.[0]?.price_data?.unit_amount).toBe(7500);
    expect(call?.line_items?.[0]?.price_data?.product_data?.name).toBe("Service");

    // 5% service fee on >= $20 tier: round(7500 * 0.05) = 375
    expect(call?.line_items?.[1]?.price_data?.unit_amount).toBe(375);
    expect(call?.line_items?.[1]?.price_data?.product_data?.name).toBe("Service fee");
  });

  it("charges priceAtBooking for from bookings when provider quote is missing", async () => {
    dbMocks.findBooking.mockResolvedValue({
      id: "bk_1",
      status: "accepted",
      priceAtBooking: 5000,
      providerQuotedPrice: null,
      providerId: "prov_1",
      serviceId: "svc_1",
    });

    dbMocks.findProvider.mockResolvedValue({ id: "prov_1", stripeConnectId: "acct_123" });
    dbMocks.findService.mockResolvedValue({ title: "Lawn mowing", pricingType: "from" });

    stripeMocks.sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session_123" });

    const req = new Request("http://localhost/api/bookings/bk_1/pay", { method: "POST" });
    const res = await payBooking(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(200);

    const call = stripeMocks.sessionsCreate.mock.calls[0]?.[0] as any;
    // Itemized: Service + Service fee
    expect(call?.line_items?.[0]?.price_data?.unit_amount).toBe(5000);
    expect(call?.line_items?.[0]?.price_data?.product_data?.name).toBe("Service");

    // 5% service fee on >= $20 tier: round(5000 * 0.05) = 250
    expect(call?.line_items?.[1]?.price_data?.unit_amount).toBe(250);
    expect(call?.line_items?.[1]?.price_data?.product_data?.name).toBe("Service fee");
  });

  it("applies $3 small-order fee when price < $10", async () => {
    dbMocks.findBooking.mockResolvedValue({
      id: "bk_1",
      status: "accepted",
      priceAtBooking: 900,
      providerQuotedPrice: null,
      providerId: "prov_1",
      serviceId: "svc_1",
    });

    dbMocks.findProvider.mockResolvedValue({ id: "prov_1", stripeConnectId: "acct_123" });
    dbMocks.findService.mockResolvedValue({ title: "Small job", pricingType: "fixed" });

    stripeMocks.sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session_123" });

    const req = new Request("http://localhost/api/bookings/bk_1/pay", { method: "POST" });
    const res = await payBooking(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(200);

    const call = stripeMocks.sessionsCreate.mock.calls[0]?.[0] as any;
    expect(call?.line_items?.[0]?.price_data?.unit_amount).toBe(900);
    expect(call?.line_items?.[0]?.price_data?.product_data?.name).toBe("Service");
    expect(call?.line_items?.[1]?.price_data?.unit_amount).toBe(300);
    expect(call?.line_items?.[1]?.price_data?.product_data?.name).toBe("Small order fee");
    expect(call?.payment_intent_data?.metadata?.serviceFeeCents).toBe("300");
  });

  it("applies $5 small-order fee when $10 <= price < $20", async () => {
    dbMocks.findBooking.mockResolvedValue({
      id: "bk_1",
      status: "accepted",
      priceAtBooking: 1500,
      providerQuotedPrice: null,
      providerId: "prov_1",
      serviceId: "svc_1",
    });

    dbMocks.findProvider.mockResolvedValue({ id: "prov_1", stripeConnectId: "acct_123" });
    dbMocks.findService.mockResolvedValue({ title: "Small job", pricingType: "fixed" });

    stripeMocks.sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session_123" });

    const req = new Request("http://localhost/api/bookings/bk_1/pay", { method: "POST" });
    const res = await payBooking(req, { params: Promise.resolve({ bookingId: "bk_1" }) });

    expect(res.status).toBe(200);

    const call = stripeMocks.sessionsCreate.mock.calls[0]?.[0] as any;
    expect(call?.line_items?.[0]?.price_data?.unit_amount).toBe(1500);
    expect(call?.line_items?.[0]?.price_data?.product_data?.name).toBe("Service");
    expect(call?.line_items?.[1]?.price_data?.unit_amount).toBe(500);
    expect(call?.line_items?.[1]?.price_data?.product_data?.name).toBe("Small order fee");
    expect(call?.payment_intent_data?.metadata?.serviceFeeCents).toBe("500");
  });
});
