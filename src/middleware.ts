export const runtime = "nodejs";

import { clerkMiddleware, clerkClient, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { providers, users } from "@/db/schema";
import { eq } from "drizzle-orm";

// Define routes that are public (accessible without auth)
const isPublicRoute = createRouteMatcher([
  "/",
  "/services(.*)",
  "/s/(.*)",
  "/p/(.*)",
  "/manifest.webmanifest",
  "/api/pwa(.*)",
  "/api/services/list", // Public service list API
  "/api/services/by-slug(.*)", // Public service detail API
  "/api/webhooks(.*)", // All webhooks are public
  "/api/stripe/webhook", // Stripe platform webhook
  "/api/health(.*)", // Health check and monitoring routes
  "/api/sentry-test", // Sentry test route
  "/legal(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const isAdminRoute = createRouteMatcher([
  "/api/admin(.*)",
  "/dashboard/admin(.*)",
]);

const isProviderDashboardRoute = createRouteMatcher([
  "/dashboard/provider(.*)",
]);

const isCustomerDashboardRoute = createRouteMatcher([
  "/dashboard(.*)",
]);

const isMessagesRoute = createRouteMatcher([
  "/dashboard/messages(.*)",
]);

const clerk = clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;

  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  // Fetch user role once if needed for guarded dashboard/admin routes
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

    // Fallback to DB role if Clerk metadata is missing
    if (!role) {
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { role: true },
      });
      role = dbUser?.role ?? role;
    }
  }

  // Admin dashboard guard (explicit, to avoid loops)
  if (pathname.startsWith("/dashboard/admin")) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }
    // Allow admins through and stop further dashboard handling
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

  // Provider dashboard guard
  if (isProviderDashboardRoute(req)) {
    if (role !== "provider" && role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Providers only get dashboard access after approval.
    if (role === "provider") {
      const status = await getProviderStatus();
      if (status !== "approved") {
        return NextResponse.redirect(new URL("/dashboard/register-provider", req.url));
      }
    }
    return NextResponse.next();
  }

  // Customer dashboard guard (exclude provider paths handled above)
  if (isCustomerDashboardRoute(req) && !isProviderDashboardRoute(req)) {
    if (role === "provider") {
      // Only redirect into provider dashboard once the application is approved.
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
});

export default function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  // PWA install flows fetch these without auth/cookies; Clerk redirects break install icons.
  if (pathname === "/manifest.webmanifest" || pathname.startsWith("/api/pwa")) {
    return NextResponse.next();
  }
  return clerk(req);
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

