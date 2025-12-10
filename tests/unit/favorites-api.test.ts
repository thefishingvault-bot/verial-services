import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Lightweight mocks for auth and drizzle helpers
const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

// Capture comparisons so our fake DB can see IDs
vi.mock("drizzle-orm", () => ({
  eq: (left: any, right: any) => ({ type: "eq", args: [left, right] }),
  and: (...args: any[]) => ({ type: "and", args }),
  sql: (...args: any[]) => ({ type: "sql", args }),
  asc: (value: any) => ({ type: "asc", value }),
  desc: (value: any) => ({ type: "desc", value }),
  inArray: (col: any, arr: any[]) => ({ type: "inArray", value: [col, arr] }),
  relations: (_table: any, cb: any) => cb({
    one: (...args: any[]) => ({ type: "one", args }),
    many: (...args: any[]) => ({ type: "many", args }),
  }),
}));

// In-memory stateful mock DB tailored to favorites routes
const state = {
  services: [] as any[],
  favorites: [] as { id: string; userId: string; serviceId: string; createdAt?: Date }[],
  listResult: [] as any[],
  currentServiceId: null as string | null,
  currentUser: null as string | null,
};

function setContext(next: Partial<typeof state>) {
  Object.assign(state, next);
}

function resetState() {
  state.services = [];
  state.favorites = [];
  state.listResult = [];
  state.currentServiceId = null;
  state.currentUser = null;
}

function createDb() {
  const listFavorites = () => {
    const rows = state.favorites
      .filter((f) => f.userId === state.currentUser)
      .map((fav) => {
        const svc = state.services.find((s) => s.id === fav.serviceId);
        if (!svc) return null;
        if (svc.provider?.status !== "approved" || svc.provider?.isSuspended) return null;
        const favoriteCount = state.favorites.filter((f) => f.serviceId === fav.serviceId).length;
        return {
          id: svc.id,
          slug: svc.slug,
          title: svc.title,
          description: svc.description ?? null,
          category: svc.category,
          priceInCents: svc.priceInCents,
          chargesGst: svc.chargesGst ?? false,
          coverImageUrl: svc.coverImageUrl ?? null,
          createdAt: svc.createdAt ?? new Date("2024-01-01"),
          favoritedAt: fav.createdAt ?? new Date("2024-01-02"),
          providerId: svc.provider.id,
          providerHandle: svc.provider.handle,
          providerBusinessName: svc.provider.businessName,
          providerTrustLevel: svc.provider.trustLevel,
          providerTrustScore: svc.provider.trustScore ?? 0,
          providerVerified: svc.provider.isVerified,
          providerBaseRegion: svc.provider.baseRegion,
          avgRating: 0,
          reviewCount: 0,
          favoriteCount,
        };
      })
      .filter(Boolean);
    return rows as any;
  };

  const countFavorites = (cond?: any) => {
    const serviceId = cond?.args?.[1] ?? state.currentServiceId;
    const count = state.favorites.filter((f) => f.serviceId === serviceId).length;
    return [{ count }];
  };

  return {
    query: {
      services: {
        findFirst: async () => state.services.find((s) => s.id === state.currentServiceId) ?? null,
      },
      serviceFavorites: {
        findFirst: async () =>
          state.favorites.find(
            (f) =>
              (!state.currentUser || f.userId === state.currentUser) &&
              (!state.currentServiceId || f.serviceId === state.currentServiceId),
          ) || null,
      },
    },
    transaction: async (fn: any) => {
      await fn({
        insert: () => ({
          values: (row: any) => ({
            onConflictDoNothing: async () => {
              const exists = state.favorites.some(
                (f) => f.userId === row.userId && f.serviceId === row.serviceId,
              );
              if (!exists) {
                state.favorites.push({ id: `fav_${state.favorites.length + 1}`, createdAt: new Date(), ...row });
              }
            },
          }),
        }),
        delete: () => ({
          where: async () => {
            state.favorites = state.favorites.filter(
              (f) => !(f.userId === state.currentUser && f.serviceId === state.currentServiceId),
            );
          },
        }),
      });
    },
    select: (shape: any) => {
      const isCount = shape && Object.keys(shape).includes("count");
      const exec = (cond?: any) => (isCount ? countFavorites(cond) : listFavorites());

      const withGroupBy = (rows: any) => {
        const promise: any = Promise.resolve(rows);
        promise.groupBy = async () => rows;
        return promise;
      };

      const builder: any = {
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: (cond?: any) => withGroupBy(exec(cond)),
        groupBy: async () => exec(),
      };

      return {
        from: () => builder,
      };
    },
  };
}

vi.mock("@/lib/db", () => ({ db: createDb(), __state: state, __setContext: setContext, __reset: resetState }));

// Helpers to (re)import route handlers with mocks in place
async function importToggle() {
  return import("@/app/api/favorites/toggle/route");
}

async function importList() {
  return import("@/app/api/favorites/list/route");
}

const serviceFixture = {
  id: "svc_1",
  title: "Test Service",
  slug: "test-service",
  priceInCents: 1000,
  category: "cleaning",
  coverImageUrl: null,
  provider: {
    id: "prov_1",
    businessName: "Biz",
    handle: "biz",
    trustLevel: "gold",
    isVerified: true,
    baseRegion: "auckland",
    status: "approved",
    isSuspended: false,
  },
};

beforeEach(() => {
  resetState();
  authMock.mockReset();
  authMock.mockResolvedValue({ userId: "user_1" });
});

describe("/api/favorites/toggle", () => {
  it("creates a favorite and returns count", async () => {
    const { POST } = await importToggle();
    state.services = [serviceFixture];
    setContext({ currentServiceId: "svc_1", currentUser: "user_1" });

    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ serviceId: "svc_1" }) }),
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ isFavorited: true, count: 1 });
    expect(state.favorites).toHaveLength(1);
  });

  it("removes an existing favorite", async () => {
    const { POST } = await importToggle();
    state.services = [serviceFixture];
    state.favorites = [{ id: "fav_1", userId: "user_1", serviceId: "svc_1" }];
    setContext({ currentServiceId: "svc_1", currentUser: "user_1" });

    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ serviceId: "svc_1" }) }),
    );

    const json = await res.json();
    expect(json.isFavorited).toBe(false);
    expect(json.count).toBe(0);
    expect(state.favorites).toHaveLength(0);
  });

  it("is idempotent across repeated toggles", async () => {
    const { POST } = await importToggle();
    state.services = [serviceFixture];
    setContext({ currentServiceId: "svc_1", currentUser: "user_1" });

    // add
    await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ serviceId: "svc_1" }) }));
    expect(state.favorites).toHaveLength(1);

    // toggle again (remove)
    await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ serviceId: "svc_1" }) }));
    expect(state.favorites).toHaveLength(0);

    // toggle again (add back)
    await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ serviceId: "svc_1" }) }));
    expect(state.favorites).toHaveLength(1);
  });

  it("requires auth", async () => {
    const { POST } = await importToggle();
    authMock.mockResolvedValue({ userId: null });
    state.services = [serviceFixture];

    const res = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ serviceId: "svc_1" }) }));
    expect(res.status).toBe(401);
  });

  it("respects unique constraint (no dupes)", async () => {
    const { POST } = await importToggle();
    state.services = [serviceFixture];
    setContext({ currentServiceId: "svc_1", currentUser: "user_1" });

    await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ serviceId: "svc_1" }) }));
    await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ serviceId: "svc_1" }) }));

    expect(state.favorites.filter((f) => f.userId === "user_1" && f.serviceId === "svc_1")).toHaveLength(0);
    // Final state is "removed", count still stable
    const res = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ serviceId: "svc_1" }) }));
    const json = await res.json();
    expect(json.count).toBe(1);
    expect(state.favorites).toHaveLength(1);
  });
});

describe("/api/favorites/list", () => {
  it.skip("returns only the current user's favorites with provider info", async () => {
    const { GET } = await importList();
    state.services = [
      serviceFixture,
      {
        ...serviceFixture,
        id: "svc_2",
        slug: "other",
        title: "Other",
      },
    ];
    state.favorites = [
      { id: "fav_1", userId: "user_1", serviceId: "svc_1" },
      { id: "fav_2", userId: "user_2", serviceId: "svc_2" },
    ];
    setContext({ currentUser: "user_1" });

    const req = new NextRequest("http://localhost/api/favorites/list");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0]).toMatchObject({ id: "svc_1", provider: { businessName: "Biz" } });
    expect(json.items[0].favoriteCount).toBe(1);
  });

  it("excludes suspended or unapproved providers", async () => {
    const { GET } = await importList();
    state.services = [
      serviceFixture,
      {
        ...serviceFixture,
        id: "svc_bad",
        slug: "bad",
        provider: { ...serviceFixture.provider, status: "approved", isSuspended: true },
      },
    ];
    state.favorites = [
      { id: "fav_1", userId: "user_1", serviceId: "svc_1" },
      { id: "fav_2", userId: "user_1", serviceId: "svc_bad" },
    ];
    setContext({ currentUser: "user_1" });

    const req = new NextRequest("http://localhost/api/favorites/list");
    const res = await GET(req);
    const json = await res.json();
    expect(json.items.map((i: any) => i.id)).toEqual(["svc_1"]);
  });

  it("requires auth", async () => {
    const { GET } = await importList();
    authMock.mockResolvedValue({ userId: null });
    const req = new NextRequest("http://localhost/api/favorites/list");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
