import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bookingIdempotencyKey, clearIdempotencyCache, hashPayload, withIdempotency } from "@/lib/idempotency";

const originalFetch = global.fetch;

beforeEach(() => {
  clearIdempotencyCache();
  vi.restoreAllMocks();
});

afterEach(() => {
  clearIdempotencyCache();
  vi.unstubAllEnvs();
  global.fetch = originalFetch;
});

describe("withIdempotency", () => {
  it("returns cached value on repeat calls", async () => {
    let executions = 0;
    const fn = vi.fn(async () => {
      executions += 1;
      return { attempt: executions };
    });

    const key = bookingIdempotencyKey("create", "user_1", "booking_1");
    const first = await withIdempotency(key, 60, fn);
    const second = await withIdempotency(key, 60, fn);

    expect(first).toEqual({ attempt: 1 });
    expect(second).toEqual({ attempt: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("falls back to memory when KV is unavailable", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.com");
    vi.stubEnv("KV_REST_API_TOKEN", "token");
    global.fetch = vi.fn().mockRejectedValue(new Error("kv down")) as unknown as typeof fetch;

    const fn = vi.fn(async () => "ok");
    const key = bookingIdempotencyKey("cancel", "user_1", "booking_2");

    const first = await withIdempotency(key, 60, fn);
    const second = await withIdempotency(key, 60, fn);

    expect(first).toBe("ok");
    expect(second).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("key derivation", () => {
  it("hashes payload when booking id is missing", () => {
    const payload = { foo: "bar" };
    const key = bookingIdempotencyKey("create", "user_1", null, payload);
    const expectedHash = hashPayload(payload);
    expect(key).toBe(`booking:create:user_1:${expectedHash}`);
  });
});
