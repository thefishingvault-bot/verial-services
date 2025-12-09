export const runtime = "nodejs";

import { clerkMiddleware, clerkClient, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// Define routes that are public (accessible without auth)
const isPublicRoute = createRouteMatcher([
  "/",
  "/services(.*)",
  "/s/(.*)",
  "/p/(.*)",
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

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  // Fetch user role once if needed for guarded dashboard/admin routes
  let role: string | undefined;
  if (isAdminRoute(req) || isProviderDashboardRoute(req) || isCustomerDashboardRoute(req)) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    role = (user.publicMetadata as Record<string, unknown>)?.role as string | undefined;
  }

  if (isAdminRoute(req)) {
    if (role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
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
  }

  // Provider dashboard guard
  if (isProviderDashboardRoute(req)) {
    if (role !== "provider" && role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Customer dashboard guard (exclude provider paths handled above)
  if (isCustomerDashboardRoute(req) && !isProviderDashboardRoute(req)) {
    if (role === "provider") {
      return NextResponse.redirect(new URL("/dashboard/provider", req.url));
    }
    return NextResponse.next();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

