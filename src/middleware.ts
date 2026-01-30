src/middleware.ts

export const runtime = "nodejs";

import { clerkMiddleware, clerkClient, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { providers, users } from "@/db/schema";
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

// Define routes that are public (accessible without auth)
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
  "/api/services/list", // Public service list API
  "/api/public/provider/time-offs", // Public time-offs API
  "/api/recommendations/providers", // Public recommendations API
]);