import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/_clerk(.*)",
  "/",
  "/waitlist(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invite/provider(.*)",
  "/api/waitlist(.*)",
  "/api/stripe/webhook(.*)",
  "/api/webhooks(.*)",
  "/api/health(.*)",
]);

const MAINTENANCE_MODE =
  (process.env.MAINTENANCE_MODE ?? "false").toLowerCase() === "true";

export default clerkMiddleware((auth, req) => {
  // maintenance OFF -> allow normal site
  if (!MAINTENANCE_MODE) return NextResponse.next();

  // maintenance ON -> allow public routes; send everything else to waitlist
  if (!isPublicRoute(req)) {
    return NextResponse.redirect(new URL("/waitlist", req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
    "/_clerk(.*)",
  ],
};
