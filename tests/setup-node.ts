import { vi } from "vitest";

// Ensure React uses test/dev builds so React.act exists (React 19 hides it in production).
process.env.NODE_ENV = "test";

// Default env values used by modules that throw when missing
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/db";

// Basic auth mock used by route handlers/components that import Clerk helpers
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: true, userId: "user_test", orgId: null, sessionId: "sess_test" }),
}));

// Stub next/navigation notFound to throw, so tests can assert it
vi.mock("next/navigation", async (importOriginal: () => Promise<unknown>) => {
  const actual = (await importOriginal()) as typeof import("next/navigation");
  return {
    ...actual,
    notFound: () => {
      throw new Error("NOT_FOUND");
    },
  };
});
