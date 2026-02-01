import { describe, expect, it } from "vitest";
import { normalizeUsername, parseUsername } from "./username";

describe("username", () => {
  it("normalizes username to lowercase", () => {
    expect(normalizeUsername("  Alice-123 ")).toBe("alice-123");
  });

  it("rejects empty usernames", () => {
    const res = parseUsername(" ");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/required/i);
  });

  it("rejects invalid characters", () => {
    const res = parseUsername("bad_name");
    expect(res.ok).toBe(false);
  });

  it("rejects reserved usernames", () => {
    const res = parseUsername("admin");
    expect(res.ok).toBe(false);
  });

  it("accepts dashed usernames", () => {
    const res = parseUsername("good-name-1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.normalized).toBe("good-name-1");
  });
});
