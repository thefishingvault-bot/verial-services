import { test } from "@playwright/test";

// Placeholder scenarios to be enabled when e2e environment is wired to backend stateful rate limiter.
test.describe.skip("rate limit protections", () => {
  test("spam send messages stops at limit", async () => {
    // Implement once test harness can prime KV/in-memory limiter across requests.
  });

  test("spam favorites stops at limit", async () => {
    // Implement once auth + data seeding is available in Playwright setup.
  });

  test("spam search queries stops", async () => {
    // Implement once we can seed services and reuse a shared limiter across browser contexts.
  });
});
