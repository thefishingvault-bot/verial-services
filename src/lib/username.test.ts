import { describe, expect, it } from "vitest";
import { normalizeUsername, parseUsername } from "./username";

describe("username", () => {
  it("normalizes username to lowercase", () => {
    expect(normalizeUsername("  Alice_123 ")).toBe("alice_123");
  });

  it("rejects empty usernames", () => {
    const res = parseUsername(" ");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/required/i);
  });

  it("rejects invalid characters", () => {
    const res = parseUsername("bad-name");
    expect(res.ok).toBe(false);
  });

  it("rejects reserved usernames", () => {
    const res = parseUsername("admin");
    expect(res.ok).toBe(false);
  });

  it("accepts underscored usernames", () => {
    const res = parseUsername("good_name_1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.normalized).toBe("good_name_1");
  });
});
