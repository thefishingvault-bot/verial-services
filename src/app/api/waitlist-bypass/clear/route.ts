import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const cookieName = process.env.WAITLIST_BYPASS_COOKIE || "verial_bypass";

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: cookieName,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}
