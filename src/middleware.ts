// src/middleware.ts
export const runtime = "nodejs";

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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

const MAINTENANCE_MODE =
  (process.env.MAINTENANCE_MODE ?? "false").toLowerCase() === "true";

// ✅ This is the middleware function Next.js requires
export default clerkMiddleware((auth, req) => {
  // If you're not using maintenance mode, just let Clerk handle auth normally.
  if (!MAINTENANCE_MODE) {
    // Optional: protect non-public routes explicitly (recommended)
    if (!isPublicRoute(req)) auth.protect();
    return NextResponse.next();
  }

  // Maintenance ON: allow public routes; redirect everything else
  if (!isPublicRoute(req)) {
    return NextResponse.redirect(new URL("/waitlist", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Run on all routes except Next internals and static files
    "/((?!_next|.*\\..*).*)",
    // Always run for API routes too
    "/(api|trpc)(.*)",
  ],
};
