import { describe, expect, it, beforeEach, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

vi.mock("@/lib/user-sync", () => ({
  ensureUserExistsInDb: vi.fn(async () => undefined),
}));

// Minimal drizzle helpers used by the route
vi.mock("drizzle-orm", () => ({
  eq: (left: any, right: any) => ({ type: "eq", args: [left, right] }),
  and: (...args: any[]) => ({ type: "and", args }),
  relations: (_table: any, cb: any) =>
    cb({
      one: (...args: any[]) => ({ type: "one", args }),
      many: (...args: any[]) => ({ type: "many", args }),
    }),
}));

type InviteRow = { status: "pending" | "redeemed" | "revoked" } | null;

type UpdateResult = Array<{ id: string }>;

const state = {
  updateResult: [] as UpdateResult,
  inviteRow: null as InviteRow,
};

function createDb() {
  const update = () => ({
    set: () => ({
      where: () => ({
        returning: async () => state.updateResult,
      }),
    }),
  });

  const query = {
    providerInvites: {
      findFirst: async () => state.inviteRow,
    },
  };

  return {
    update,
    query,
  };
}

const dbMock = createDb();
vi.mock("@/lib/db", () => ({ db: dbMock }));

describe("/invite/provider/redeem", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    state.updateResult = [];
    state.inviteRow = null;
  });

  it("GET redirects to /invite/provider (does not redeem)", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });

    const { GET } = await import("@/app/invite/provider/redeem/route");
    const url = "http://localhost/invite/provider/redeem?token=tok123";
    const req = { url, nextUrl: new URL(url) } as any;

    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/invite/provider?token=tok123");
  });

  it("POST invalid token redirects back with error=invalid", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    state.updateResult = [];
    state.inviteRow = null;

    const { POST } = await import("@/app/invite/provider/redeem/route");
    const url = "http://localhost/invite/provider/redeem?token=bad";
    const req = { url, nextUrl: new URL(url) } as any;

    const res = await POST(req);
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") || "";
    expect(loc).toContain("/invite/provider");
    expect(loc).toContain("token=bad");
    expect(loc).toContain("error=invalid");
  });

  it("POST already redeemed token redirects back with error=redeemed", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    state.updateResult = [];
    state.inviteRow = { status: "redeemed" };

    const { POST } = await import("@/app/invite/provider/redeem/route");
    const url = "http://localhost/invite/provider/redeem?token=used";
    const req = { url, nextUrl: new URL(url) } as any;

    const res = await POST(req);
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") || "";
    expect(loc).toContain("/invite/provider");
    expect(loc).toContain("token=used");
    expect(loc).toContain("error=redeemed");
  });

  it("POST success marks redeemed and redirects to register-provider", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    state.updateResult = [{ id: "inv_1" }];

    const { POST } = await import("@/app/invite/provider/redeem/route");
    const url = "http://localhost/invite/provider/redeem?token=ok";
    const req = { url, nextUrl: new URL(url) } as any;

    const res = await POST(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard/register-provider");

    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("verial_early_provider_access=1");
  });
});
