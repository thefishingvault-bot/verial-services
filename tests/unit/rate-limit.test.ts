import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearRateLimitMemory, rateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  clearRateLimitMemory();
  vi.useRealTimers();
});

describe("rateLimit sliding window", () => {
  it("blocks when limit exceeded", async () => {
    const key = "test:sliding";
    const first = await rateLimit({ key, limit: 2, windowSeconds: 60 });
    const second = await rateLimit({ key, limit: 2, windowSeconds: 60 });
    const third = await rateLimit({ key, limit: 2, windowSeconds: 60 });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(third.success).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
  });

  it("resets after window", async () => {
    vi.useFakeTimers();
    const key = "test:window";

    await rateLimit({ key, limit: 1, windowSeconds: 10 });
    const blocked = await rateLimit({ key, limit: 1, windowSeconds: 10 });
    expect(blocked.success).toBe(false);

    vi.advanceTimersByTime(11_000);

    const afterWindow = await rateLimit({ key, limit: 1, windowSeconds: 10 });
    expect(afterWindow.success).toBe(true);
  });
});
