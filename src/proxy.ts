import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/db/schema";

function parseAllowlist(raw: string | undefined | null): Set<string> {
  const input = String(raw ?? "").trim();
  if (!input) return new Set();

  return new Set(
    input
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isPublicPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/waitlist" || pathname.startsWith("/waitlist/");
}

function isClerkPath(pathname: string): boolean {
  // Be conservative here: allow Clerk internals + common auth entrypoints/callbacks
  return (
    pathname === "/_clerk" ||
    pathname.startsWith("/_clerk/") ||
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/sign-up" ||
    pathname.startsWith("/sign-up/") ||
    pathname === "/sso-callback" ||
    pathname.startsWith("/sso-callback/")
  );
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

function readAdminEmailAllowlist(): Set<string> {
  const raw = process.env.ADMIN_EMAIL_ALLOWLIST ?? "admin@verial.co.nz";
  const set = parseAllowlist(raw);
  // Prevent accidental lock-out if env var is present but blank.
  if (set.size === 0) return new Set(["admin@verial.co.nz"]);
  return set;
}

function getPrimaryEmailFromSessionClaims(sessionClaims: unknown): string | null {
  if (!sessionClaims || typeof sessionClaims !== "object") return null;

  const claims = sessionClaims as Record<string, unknown>;

  const candidates = [
    claims.email,
    claims.primary_email_address,
    claims.primaryEmail,
    claims.primary_email,
  ];

  for (const val of candidates) {
    if (typeof val === "string" && val.trim()) return val.trim();
  }

  return null;
}

export default clerkMiddleware(async (auth, req) => {
  const maintenance = readMaintenanceMode();
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

  // maintenance ON -> only admin allowlist can access non-public paths
  const adminAllowlist = readAdminEmailAllowlist();

  // Always allow: public pages, Clerk internals/callbacks, and operational endpoints.
  if (isPublicPath(pathname) || isClerkPath(pathname) || isAlwaysAllowedInMaintenance(req)) {
    return NextResponse.next();
  }

  const redirectToWaitlist = () => {
    // Never redirect when already on /waitlist (extra safety).
    if (isPublicPath(pathname)) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/waitlist";
    url.search = "";
    return NextResponse.redirect(url);
  };

  const { userId, sessionClaims } = await auth();
  if (!userId) return redirectToWaitlist();

  // Prefer session claims (fast), fall back to DB email if needed.
  const emailFromClaims = getPrimaryEmailFromSessionClaims(sessionClaims);
  let email = emailFromClaims?.toLowerCase() ?? null;

  if (!email) {
    try {
      const row = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { email: true },
      });
      email = row?.email?.toLowerCase() ?? null;
    } catch (err) {
      console.error("[PROXY_MAINTENANCE_EMAIL_LOOKUP]", err);
      return redirectToWaitlist();
    }
  }

  if (!email || !adminAllowlist.has(email)) {
    return redirectToWaitlist();
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)", "/_clerk(.*)"],
};
