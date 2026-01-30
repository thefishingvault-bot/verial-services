export const runtime = "nodejs";

import { clerkMiddleware, clerkClient, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const PUBLIC_PATHS = [
  "/_clerk",
  "/waitlist",
  "/api/waitlist",
  "/invite/provider",
  "/sign-in",
  "/sign-up",
  "/api/webhooks",
  "/api/stripe/webhook",
  "/api/health",
  "/api/sentry-test",
];

const EARLY_ACCESS_COOKIE = "verial_early_provider_access";

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/sitemap") ||
    pathname.startsWith("/images") ||
    pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt)$/)
  );
}

function isWaitlistBypassAllowedPath(pathname: string) {
  // Clerk internals (OAuth callback lives here).
  if (pathname.startsWith("/_clerk")) return true;

  // App public routes that must keep working during waitlist mode.
  if (isPublicPath(pathname)) return true;

  // Next internals/static
  if (pathname.startsWith("/_next")) return true;

  // Waitlist + bypass endpoints
  if (pathname === "/waitlist" || pathname.startsWith("/waitlist/")) return true;
  if (pathname.startsWith("/api/waitlist-bypass")) return true;

  // Common static files
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/robots.txt") return true;
  if (pathname === "/sitemap.xml") return true;

  return false;
}

const isPublicRoute = createRouteMatcher([
  "/_clerk(.*)",
  "/",
  "/waitlist(.*)",
  "/invite/provider(.*)",
  "/services(.*)",
  "/s/(.*)",
  "/p/(.*)",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/api/pwa(.*)",
  "/api/waitlist(.*)",
  "/api/services/list",
  "/api/services/by-slug(.*)",
  "/api/webhooks(.*)",
  "/api/stripe/webhook",
  "/api/health(.*)",
  "/api/sentry-test",
  "/legal(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const isAdminRoute = createRouteMatcher(["/api/admin(.*)", "/dashboard/admin(.*)"]);
const isProviderDashboardRoute = createRouteMatcher(["/dashboard/provider(.*)"]);
const isProviderKycRoute = createRouteMatcher(["/dashboard/provider/kyc(.*)"]);
const isProviderServicesRoute = createRouteMatcher(["/dashboard/provider/services(.*)"]);
const isCustomerDashboardRoute = createRouteMatcher(["/dashboard(.*)"]);
const isMessagesRoute = createRouteMatcher(["/dashboard/messages(.*)"]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const pathname = req.nextUrl.pathname;

  const waitlistMode = process.env.WAITLIST_MODE === "1";
  if (waitlistMode) {
    if (isWaitlistBypassAllowedPath(pathname) || isAsset(pathname)) {
      return NextResponse.next();
    }

    const bypassCookieName = process.env.WAITLIST_BYPASS_COOKIE || "verial_bypass";
    const bypassKey = process.env.WAITLIST_BYPASS_KEY;
    const bypassCookieValue = req.cookies.get(bypassCookieName)?.value;

    if (bypassKey && bypassCookieValue === bypassKey) {
      return NextResponse.next();
    }

    const url = req.nextUrl.clone();
    url.pathname = "/waitlist";
    url.search = "";
    return NextResponse.redirect(url, 307);
  }

  const hostname = req.nextUrl.hostname;
  const isStagingHost =
    hostname.includes("staging.") ||
    hostname.startsWith("staging-") ||
    hostname.includes("-staging") ||
    hostname === "localhost";

  const maintenance = process.env.MAINTENANCE_MODE === "true";
  const vercelEnv = process.env.VERCEL_ENV;
  const shouldEnforceMaintenance = maintenance && vercelEnv === "production" && !isStagingHost;

  if (shouldEnforceMaintenance) {
    if (isPublicPath(pathname) || isAsset(pathname)) {
      return NextResponse.next();
    }

    const { userId, sessionClaims } = await auth();
    if (!userId) {
      const url = req.nextUrl.clone();
      url.pathname = "/waitlist";
      url.search = "";
      return NextResponse.redirect(url, 307);
    }

    const cookieBypass = req.cookies.get(EARLY_ACCESS_COOKIE)?.value === "1";
    const sessionRole = (sessionClaims?.publicMetadata as Record<string, unknown> | undefined)?.role;
    if (sessionRole === "admin") {
      return NextResponse.next();
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true, earlyProviderAccess: true },
    });

    if (dbUser?.role === "admin") {
      return NextResponse.next();
    }

    if (cookieBypass || dbUser?.earlyProviderAccess) {
      return NextResponse.next();
    }

    const url = req.nextUrl.clone();
    url.pathname = "/waitlist";
    url.search = "";
    return NextResponse.redirect(url, 307);
  }

  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  let role: string | undefined;
  let providerStatus: "pending" | "approved" | "rejected" | undefined;

  const getProviderStatus = async () => {
    if (providerStatus !== undefined) return providerStatus;
    const provider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
      columns: { status: true },
    });
    providerStatus = provider?.status;
    return providerStatus;
  };

  if (isAdminRoute(req) || isProviderDashboardRoute(req) || isCustomerDashboardRoute(req)) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    role = (user.publicMetadata as Record<string, unknown>)?.role as string | undefined;

    if (!role) {
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { role: true },
      });
      role = dbUser?.role ?? role;
    }
  }

  if (pathname.startsWith("/dashboard/admin")) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const method = req.method?.toUpperCase();
    if (method === "POST" || method === "PATCH") {
      const rate = await enforceRateLimit(req, {
        userId,
        resource: "admin",
        limit: 10,
        windowSeconds: 60,
      });

      if (!rate.success) {
        return rateLimitResponse(rate.retryAfter);
      }
    }

    return NextResponse.next();
  }

  if (isProviderDashboardRoute(req)) {
    if (role !== "provider" && role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    if (role === "provider") {
      const provider = await db.query.providers.findFirst({
        where: (p, { eq }) => eq(p.userId, userId),
        columns: { status: true },
      });

      if (!provider) {
        return NextResponse.redirect(new URL("/dashboard/register-provider", req.url));
      }

      const allowDuringOnboarding = isProviderKycRoute(req) || isProviderServicesRoute(req);
      if (provider.status !== "approved" && !allowDuringOnboarding) {
        return NextResponse.redirect(new URL("/dashboard/register-provider", req.url));
      }
    }

    return NextResponse.next();
  }

  if (isCustomerDashboardRoute(req) && !isProviderDashboardRoute(req)) {
    if (role === "provider") {
      const status = await getProviderStatus();
      if (status === "approved") {
        if (isMessagesRoute(req)) {
          const suffix = pathname.replace(/^\/dashboard\/messages/, "");
          return NextResponse.redirect(new URL(`/dashboard/provider/messages${suffix}`, req.url));
        }
        return NextResponse.redirect(new URL("/dashboard/provider", req.url));
      }
    }

    if (role === "admin") {
      if (isMessagesRoute(req)) {
        const suffix = pathname.replace(/^\/dashboard\/messages/, "");
        return NextResponse.redirect(new URL(`/dashboard/provider/messages${suffix}`, req.url));
      }
      return NextResponse.redirect(new URL("/dashboard/admin", req.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
