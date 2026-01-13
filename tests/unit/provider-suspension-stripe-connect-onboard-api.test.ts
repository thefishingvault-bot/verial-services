import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: vi.fn(async () => ({
    users: { getUser: vi.fn(async () => ({ emailAddresses: [{ emailAddress: "test@example.com" }] })) },
  })),
}));

const stripeAccountsCreate = vi.fn();
const stripeAccountsUpdate = vi.fn();
const stripeAccountsRetrieve = vi.fn();
const stripeAccountLinksCreate = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: {
      create: stripeAccountsCreate,
      update: stripeAccountsUpdate,
      retrieve: stripeAccountsRetrieve,
    },
    accountLinks: {
      create: stripeAccountLinksCreate,
    },
  },
}));

vi.mock("@/db/schema", () => ({
  providers: { __table: "providers", userId: "userId", id: "id" },
}));

const state = {
  provider: null as any,
};

const dbMock = {
  query: {
    providers: {
      findFirst: vi.fn(async () => state.provider),
    },
  },
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => []) })) })),
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

describe("provider suspension enforcement: stripe connect onboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ userId: "user_1" });

    state.provider = {
      id: "prov_1",
      userId: "user_1",
      stripeConnectId: null,
      isSuspended: false,
      suspensionReason: null,
      suspensionStartDate: null,
      suspensionEndDate: null,
    };

    stripeAccountsCreate.mockResolvedValue({ id: "acct_1" });
    stripeAccountsUpdate.mockResolvedValue({});
    stripeAccountsRetrieve.mockResolvedValue({
      type: "express",
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    });
    stripeAccountLinksCreate.mockResolvedValue({ url: "https://stripe.test/link" });
  });

  it("returns 403 when provider is suspended (and does not call Stripe)", async () => {
    state.provider = {
      ...state.provider,
      isSuspended: true,
      suspensionReason: "Policy violation",
      suspensionStartDate: new Date("2025-01-01T00:00:00.000Z"),
      suspensionEndDate: null,
    };

    const { POST } = await import("@/app/api/provider/stripe/connect/onboard/route");
    const res = await POST();

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("PROVIDER_SUSPENDED");
    expect(stripeAccountsCreate).not.toHaveBeenCalled();
    expect(stripeAccountLinksCreate).not.toHaveBeenCalled();
  });

  it("allows onboarding when provider is active", async () => {
    const { POST } = await import("@/app/api/provider/stripe/connect/onboard/route");
    const res = await POST();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toContain("https://");
    expect(stripeAccountLinksCreate).toHaveBeenCalled();
  });
});
