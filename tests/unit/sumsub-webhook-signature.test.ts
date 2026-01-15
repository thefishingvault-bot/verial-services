// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep this test focused on signature enforcement; avoid touching DB by forcing early returns.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/sumsub", () => ({ sumsubRequest: vi.fn() }));

const headersMock = vi.hoisted(() => ({
  get: vi.fn((_name: string) => null as string | null),
}));

vi.mock("next/headers", () => ({
  headers: () => headersMock,
}));

describe("POST /api/webhooks/sumsub signature enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    headersMock.get.mockImplementation((_name: string) => null);
  });

  it("rejects when NODE_ENV=production and SUMSUB_WEBHOOK_SECRET is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUMSUB_WEBHOOK_SECRET", "");

    const { POST: webhook } = await import("@/app/api/webhooks/sumsub/route");

    const req = new Request("http://localhost/api/webhooks/sumsub", {
      method: "POST",
      body: "{}",
    });

    const res = await webhook(req);
    expect(res.status).toBe(401);
  });

  it("rejects when NODE_ENV=production and signature header is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUMSUB_WEBHOOK_SECRET", "sumsub_secret");

    // No x-payload-digest header present.
    headersMock.get.mockImplementation((_name: string) => null);

    const { POST: webhook } = await import("@/app/api/webhooks/sumsub/route");

    const req = new Request("http://localhost/api/webhooks/sumsub", {
      method: "POST",
      body: "{}",
    });

    const res = await webhook(req);
    expect(res.status).toBe(401);
  });

  it("allows explicit insecure bypass only in non-production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_INSECURE_SUMSUB_WEBHOOK", "true");

    const { POST: webhook } = await import("@/app/api/webhooks/sumsub/route");

    const req = new Request("http://localhost/api/webhooks/sumsub", {
      method: "POST",
      body: "{}",
    });

    // With empty body (no externalUserId), handler returns 200 after parsing.
    const res = await webhook(req);
    expect(res.status).toBe(200);
  });
});
