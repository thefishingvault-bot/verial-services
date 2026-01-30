import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const bypassKey = process.env.WAITLIST_BYPASS_KEY;

  if (!bypassKey || key !== bypassKey) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const cookieName = process.env.WAITLIST_BYPASS_COOKIE || "verial_bypass";

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: cookieName,
    value: bypassKey,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}
