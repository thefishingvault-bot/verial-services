import { describe, expect, it, vi } from "vitest";

describe("provider plan platform fee", () => {
  it("maps starter/pro/elite to 10%/5%/0% bps", async () => {
    vi.stubEnv("PLATFORM_FEE_BPS", "1000");

    const { getPlatformFeeBpsForPlan } = await import("@/lib/provider-subscription");

    expect(getPlatformFeeBpsForPlan("starter")).toBe(1000);
    expect(getPlatformFeeBpsForPlan("pro")).toBe(500);
    expect(getPlatformFeeBpsForPlan("elite")).toBe(0);
  });
});
