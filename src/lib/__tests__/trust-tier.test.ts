import { describe, expect, it } from "vitest";
import { getTrustTier } from "../trust";

describe("trust tier helper", () => {
  it("assigns platinum for 90+", () => {
    expect(getTrustTier(95)).toBe("platinum");
  });

  it("assigns gold for upper scores", () => {
    expect(getTrustTier(80)).toBe("gold");
  });

  it("assigns silver for midrange scores", () => {
    expect(getTrustTier(60)).toBe("silver");
  });

  it("assigns bronze for lower scores", () => {
    expect(getTrustTier(30)).toBe("bronze");
  });
});
