import "@testing-library/jest-dom";
import { vi } from "vitest";

// Default env values used by modules that throw when missing
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/db";

// Minimal mock for next/image to simplify component rendering in tests
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => {
    const { src, alt, ...rest } = props;
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img src={typeof src === "string" ? src : src?.src ?? ""} alt={alt} {...rest} />;
  },
}));

// Stub next/navigation notFound to throw, so tests can assert it
vi.mock("next/navigation", async (importOriginal: () => Promise<unknown>) => {
  const actual = (await importOriginal()) as typeof import("next/navigation");
  return {
    ...actual,
    notFound: () => {
      throw new Error("NOT_FOUND");
    },
    useRouter: () => ({
      refresh: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
    }),
    usePathname: () => "/",
  };
});

// Basic auth mock used by components that call useAuth
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: true, userId: "user_test", orgId: null, sessionId: "sess_test" }),
}));
