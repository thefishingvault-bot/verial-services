import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/db/schema";

const ADMIN_BYPASS_COOKIE = "__Host-verial_admin_bypass";

function isClerkInternalPath(pathname: string): boolean {
  return pathname === "/_clerk" || pathname.startsWith("/_clerk/");
}

function isClerkAuthPath(pathname: string): boolean {
  // Common auth entrypoints/callbacks
  return (
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/sign-up" ||
    pathname.startsWith("/sign-up/") ||
    pathname === "/sso-callback" ||
    pathname.startsWith("/sso-callback/")
  );
}

function hasAdminBypassCookie(req: NextRequest): boolean {
  return req.cookies.get(ADMIN_BYPASS_COOKIE)?.value === "1";
}

function parseHostAllowlist(raw: string | undefined | null): Set<string> {
  const input = String(raw ?? "").trim();
  if (!input) return new Set();

  return new Set(
    input
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isMaintenanceHost(hostname: string): boolean {
  // Default: only apply maintenance redirects on the public production domain.
  // This prevents accidentally blocking test/staging custom domains.
  const allowlist = parseHostAllowlist(
    process.env.MAINTENANCE_HOST_ALLOWLIST ?? "verial.co.nz,www.verial.co.nz",
  );

  if (allowlist.size === 0) return true;
  return allowlist.has(hostname.trim().toLowerCase());
}

// Public routes (no auth required)
const isPublicRoute = createRouteMatcher([
  "/_clerk(.*)",
  "/",
  "/waitlist(.*)",
  "/invite/provider(.*)",
  "/services(.*)",
  "/s/(.*)",
  "/p/(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/api/pwa(.*)",
  "/api/waitlist(.*)",
  "/api/services/list",
  "/api/public/provider/time-offs",
  "/api/recommendations/providers",
  "/api/webhooks(.*)",
  "/api/stripe/webhook(.*)",
  "/api/health(.*)",
]);

const isOnboardingRoute = createRouteMatcher(["/onboarding(.*)"]);

const isAlwaysAllowedInMaintenance = createRouteMatcher([
  // Clerk internals
  "/_clerk(.*)",

  // Admin bypass (sets the bypass cookie)
  "/admin-access(.*)",

  // Waitlist page + the API it uses
  "/waitlist(.*)",
  "/api/waitlist(.*)",

  // Operational endpoints that must remain reachable
  "/api/health(.*)",
  "/api/stripe/webhook(.*)",
  "/api/webhooks(.*)",
]);

function readMaintenanceMode(): boolean {
  const raw =
    process.env.MAINTENANCE_MODE ??
    // tolerate common typos in env var naming
    process.env.MAINTENENCE_MODE ??
    process.env.MAINTENCE_MODE ??
    "false";

  const normalized = String(raw).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export default clerkMiddleware(async (auth, req) => {
  const hostname = req.nextUrl.hostname;
  const maintenance = isMaintenanceHost(hostname) && readMaintenanceMode();
  const pathname = req.nextUrl.pathname;

  if (!maintenance) {
    // Explicitly protect non-public routes
    if (!isPublicRoute(req)) auth.protect();

    const isPageRequest = !pathname.startsWith("/api");

    // Avoid redirect loops: /onboarding itself must remain reachable.
    const shouldCheckOnboarding =
      isPageRequest &&
      !isPublicRoute(req) &&
      !isOnboardingRoute(req);

    if (!shouldCheckOnboarding) {
      return NextResponse.next();
    }

    try {
      const { userId } = await auth();
      if (!userId) return NextResponse.next();

      const row = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { profileCompleted: true, role: true },
      });

      // Don't block admins/providers on customer onboarding.
      if (row?.role === "admin" || row?.role === "provider") {
        return NextResponse.next();
      }

      if (!row?.profileCompleted) {
        const url = req.nextUrl.clone();
        url.pathname = "/onboarding";
        url.search = "";
        return NextResponse.redirect(url);
      }
    } catch (err) {
      console.error("[PROXY_PROFILE_GUARD]", err);
      // Fail open if DB is unreachable.
    }

    return NextResponse.next();
  }

  // maintenance ON -> allow minimal routes; send everything else to waitlist
  // Important: do NOT allow '/' during maintenance, so visitors land on /waitlist.
  if (isAlwaysAllowedInMaintenance(req) || isClerkInternalPath(pathname)) {
    return NextResponse.next();
  }

  const bypassCookie = hasAdminBypassCookie(req);

  // Auth pages/callbacks are only reachable if the bypass cookie is set.
  if (isClerkAuthPath(pathname)) {
    if (bypassCookie) return NextResponse.next();

    const url = req.nextUrl.clone();
    url.pathname = "/waitlist";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Everything else during maintenance requires bypass cookie + admin user.
  if (!bypassCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/waitlist";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // If cookie exists but user is not signed in, send them to sign-in.
  let userId: string | null = null;
  try {
    const a = await auth();
    userId = a.userId ?? null;
  } catch {
    userId = null;
  }

  if (!userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Server-side admin enforcement (role OR email allowlist). Fail closed.
  try {
    const allowlist = parseHostAllowlist(process.env.ADMIN_EMAIL_ALLOWLIST);
    const row = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true, email: true },
    });

    const email = String(row?.email ?? "").trim().toLowerCase();
    const isAdmin = row?.role === "admin" || (email && allowlist.has(email));

    if (!isAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/waitlist";
      url.search = "";

      const res = NextResponse.redirect(url);
      res.cookies.set({
        name: ADMIN_BYPASS_COOKIE,
        value: "",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return res;
    }
  } catch (err) {
    console.error("[PROXY_MAINTENANCE_ADMIN_GUARD]", err);

    const url = req.nextUrl.clone();
    url.pathname = "/waitlist";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Ensure protected routes still require auth (even in maintenance).
  if (!isPublicRoute(req)) auth.protect();
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)", "/_clerk(.*)"],
};
