export const runtime = "nodejs";

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define routes that are public (accessible without auth)
const isPublicRoute = createRouteMatcher([
  "/",
  "/services(.*)",
  "/s/(.*)",
  "/p/(.*)",
  "/api/webhooks(.*)", // All webhooks are public
  "/api/stripe/webhook", // Stripe platform webhook
  "/api/health(.*)", // Health check and monitoring routes
  "/api/sentry-test", // Sentry test route
  "/legal(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect(); // Protect all routes that are not public
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

