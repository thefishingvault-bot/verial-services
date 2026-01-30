import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/waitlist(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/_clerk(.*)", // REQUIRED for OAuth callback + Clerk internal endpoints
]);

export default clerkMiddleware((auth, req) => {
  // If site is locked to waitlist, keep the redirect BUT never block Clerk endpoints.
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
