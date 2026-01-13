import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

vi.mock("@/db/schema", () => ({
  services: { __table: "services" },
  serviceCategoryEnum: { enumValues: ["cleaning"] },
}));

vi.mock("@/lib/data/nz-locations", () => ({
  NZ_REGIONS: {
    auckland: ["ponsonby"],
  },
}));

const state = {
  provider: null as any,
  insertedService: null as any,
};

const dbMock = {
  query: {
    providers: {
      findFirst: vi.fn(async () => state.provider),
    },
  },
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(async () => [state.insertedService]),
    })),
  })),
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

describe("provider suspension enforcement: service create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ userId: "user_1" });

    state.provider = {
      id: "prov_1",
      userId: "user_1",
      status: "approved",
      baseRegion: "auckland",
      baseSuburb: "ponsonby",
      chargesGst: true,
      isSuspended: false,
      suspensionReason: null,
      suspensionStartDate: null,
      suspensionEndDate: null,
    };

    state.insertedService = {
      id: "svc_1",
      providerId: "prov_1",
      title: "Test",
      category: "cleaning",
      pricingType: "fixed",
      priceInCents: 1000,
      isPublished: false,
    };
  });

  it("returns 403 with JSON payload when provider is suspended", async () => {
    state.provider = {
      ...state.provider,
      isSuspended: true,
      suspensionReason: "Policy violation",
      suspensionStartDate: new Date("2025-01-01T00:00:00.000Z"),
      suspensionEndDate: null,
    };

    const { POST } = await import("@/app/api/services/create/route");

    const res = await POST(
      new Request("http://localhost/api/services/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Test",
          category: "cleaning",
          pricingType: "fixed",
          priceInCents: 1000,
        }),
      }),
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("PROVIDER_SUSPENDED");
    expect(json.status).toBe("limited");
    expect(json.reason).toBe("Policy violation");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("allows service creation when provider is active", async () => {
    const { POST } = await import("@/app/api/services/create/route");

    const res = await POST(
      new Request("http://localhost/api/services/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Test",
          category: "cleaning",
          pricingType: "fixed",
          priceInCents: 1000,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("svc_1");
    expect(dbMock.insert).toHaveBeenCalled();
  });
});
