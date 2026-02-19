import { describe, expect, it } from "vitest";
import { getTrustTier } from "../trust";

describe("trust tier helper", () => {
  it("assigns platinum for 85+", () => {
    expect(getTrustTier(85)).toBe("platinum");
  });

  it("assigns gold for scores from 70 to 84", () => {
    expect(getTrustTier(84)).toBe("gold");
    expect(getTrustTier(70)).toBe("gold");
  });

  it("assigns silver for scores from 50 to 69", () => {
    expect(getTrustTier(69)).toBe("silver");
    expect(getTrustTier(50)).toBe("silver");
  });

  it("assigns bronze for scores below 50", () => {
    expect(getTrustTier(49)).toBe("bronze");
  });
});
