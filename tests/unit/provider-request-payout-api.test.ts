import { describe, expect, it, beforeEach, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

const moneyMock = vi.fn();
vi.mock("@/server/providers/earnings", () => ({
  getProviderMoneySummary: (...args: any[]) => moneyMock(...args),
}));

// Lightweight mock for drizzle helpers used by the route.
// NOTE: schema.ts imports `relations` from drizzle-orm, so it must exist here.
vi.mock("drizzle-orm", () => ({
  eq: (left: any, right: any) => ({ type: "eq", args: [left, right] }),
  and: (...args: any[]) => ({ type: "and", args }),
  relations: (_table: any, cb: any) =>
    cb({
      one: (...args: any[]) => ({ type: "one", args }),
      many: (...args: any[]) => ({ type: "many", args }),
    }),
}));

type ProviderRow = {
  id: string;
  userId: string;
  stripeConnectId: string | null;
  payoutsEnabled: boolean;
  isSuspended: boolean;
  suspensionReason: string | null;
  suspensionStartDate: Date | null;
  suspensionEndDate: Date | null;
};

type PayoutRequestRow = {
  id: string;
  providerId: string;
  amount: number;
  currency: string;
  status: string;
  idempotencyKey: string;
  payoutsDisabled: boolean;
  note: string | null;
};

const state = {
  provider: null as ProviderRow | null,
  payoutRequests: [] as PayoutRequestRow[],
};

function resetState() {
  state.provider = null;
  state.payoutRequests = [];
}

function createDb() {
  const insert = () => ({
    values: (row: any) => ({
      onConflictDoNothing: async () => {
        const exists = state.payoutRequests.some(
          (r) => r.providerId === row.providerId && r.idempotencyKey === row.idempotencyKey,
        );
        if (!exists) {
          state.payoutRequests.push({
            id: row.id,
            providerId: row.providerId,
            amount: row.amount,
            currency: row.currency,
            status: row.status,
            idempotencyKey: row.idempotencyKey,
            payoutsDisabled: row.payoutsDisabled,
            note: row.note ?? null,
          });
        }
      },
    }),
  });

  const query = {
    providers: {
      findFirst: async () => state.provider,
    },
    providerPayoutRequests: {
      findFirst: async (opts: any) => {
        const andArgs = opts?.where?.args ?? [];
        const providerId = andArgs?.[0]?.args?.[1] ?? null;
        const idempotencyKey = andArgs?.[1]?.args?.[1] ?? null;

        const row = state.payoutRequests.find(
          (r) => r.providerId === providerId && r.idempotencyKey === idempotencyKey,
        );
        if (!row) return null;
        return {
          id: row.id,
          amount: row.amount,
          currency: row.currency,
          status: row.status,
          payoutsDisabled: row.payoutsDisabled,
          note: row.note,
        };
      },
    },
  };

  return { insert, query };
}

const dbMock = createDb();
vi.mock("@/lib/db", () => ({ db: dbMock }));

describe("POST /api/provider/payouts/request", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetState();
    delete process.env.DISABLE_PAYOUTS;
  });

  it("returns 401 when not signed in", async () => {
    authMock.mockResolvedValue({ userId: null });

    const { POST } = await import("@/app/api/provider/payouts/request/route");
    const res = await POST(new Request("http://localhost/api/provider/payouts/request", { method: "POST" }));

    expect(res.status).toBe(401);
  });

  it("returns 404 when provider missing", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    state.provider = null;

    const { POST } = await import("@/app/api/provider/payouts/request/route");
    const req = new Request("http://localhost/api/provider/payouts/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "abc" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 403 for suspended provider", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    state.provider = {
      id: "prov_1",
      userId: "user_1",
      stripeConnectId: "acct_1",
      payoutsEnabled: true,
      isSuspended: true,
      suspensionReason: "Policy violation",
      suspensionStartDate: new Date("2025-01-01T00:00:00.000Z"),
      suspensionEndDate: null,
    };
    moneyMock.mockResolvedValue({ pendingNet: 1000 });

    const { POST } = await import("@/app/api/provider/payouts/request/route");
    const req = new Request("http://localhost/api/provider/payouts/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "abc" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("PROVIDER_SUSPENDED");
  });

  it("returns 409 when no pending payout", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    state.provider = {
      id: "prov_1",
      userId: "user_1",
      stripeConnectId: "acct_1",
      payoutsEnabled: true,
      isSuspended: false,
      suspensionReason: null,
      suspensionStartDate: null,
      suspensionEndDate: null,
    };
    moneyMock.mockResolvedValue({ pendingNet: 0 });

    const { POST } = await import("@/app/api/provider/payouts/request/route");
    const req = new Request("http://localhost/api/provider/payouts/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "abc" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("creates a queued request when payouts are disabled by default", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    state.provider = {
      id: "prov_1",
      userId: "user_1",
      stripeConnectId: null,
      payoutsEnabled: false,
      isSuspended: false,
      suspensionReason: null,
      suspensionStartDate: null,
      suspensionEndDate: null,
    };
    moneyMock.mockResolvedValue({ pendingNet: 12345 });

    const { POST } = await import("@/app/api/provider/payouts/request/route");
    const req = new Request("http://localhost/api/provider/payouts/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "idem_1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.request.amount).toBe(12345);
    expect(json.request.status).toBe("queued");
    expect(json.request.payoutsDisabled).toBe(true);
  });

  it("is idempotent for the same provider + idempotencyKey", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    state.provider = {
      id: "prov_1",
      userId: "user_1",
      stripeConnectId: null,
      payoutsEnabled: false,
      isSuspended: false,
      suspensionReason: null,
      suspensionStartDate: null,
      suspensionEndDate: null,
    };
    moneyMock.mockResolvedValue({ pendingNet: 5000 });

    const { POST } = await import("@/app/api/provider/payouts/request/route");

    const req1 = new Request("http://localhost/api/provider/payouts/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "idem_same" }),
    });

    const req2 = new Request("http://localhost/api/provider/payouts/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "idem_same" }),
    });

    const res1 = await POST(req1);
    const res2 = await POST(req2);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(state.payoutRequests.length).toBe(1);
  });
});
