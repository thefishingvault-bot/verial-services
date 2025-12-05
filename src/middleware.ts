export const runtime = "nodejs";

import { clerkMiddleware, clerkClient, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return;
  }

  const { userId } = await auth();
  if (!userId) {
    await auth.protect();
    return;
  }

  if (isAdminRoute(req)) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const role = (user.publicMetadata as Record<string, unknown>)?.role;

    if (role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

