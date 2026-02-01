import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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

export default clerkMiddleware((auth, req) => {
  const maintenance = readMaintenanceMode();

  if (!maintenance) return NextResponse.next();

  // maintenance ON -> allow minimal routes; send everything else to waitlist
  if (!isAlwaysAllowedInMaintenance(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/waitlist";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)", "/_clerk(.*)"],
};
