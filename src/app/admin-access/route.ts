import { NextResponse } from "next/server";

const ADMIN_BYPASS_COOKIE = "__Host-verial_admin_bypass";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const expected = process.env.ADMIN_BYPASS_KEY;

  // Fail closed if key is missing or not configured.
  if (!key || !expected || key !== expected) {
    return new Response("Not Found", { status: 404 });
  }

  const res = NextResponse.redirect(new URL("/sign-in", url));

  res.cookies.set({
    name: ADMIN_BYPASS_COOKIE,
    value: "1",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });

  return res;
}
