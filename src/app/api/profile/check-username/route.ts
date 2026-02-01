import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { parseUsername } from "@/lib/username";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const raw = req.nextUrl.searchParams.get("username");
    const parsed = parseUsername(raw);
    if (!parsed.ok) {
      return NextResponse.json({ available: false, message: parsed.message }, { status: 400 });
    }

    const hit = await db.query.users.findFirst({
      where: and(eq(users.usernameLower, parsed.normalized), ne(users.id, userId)),
      columns: { id: true },
    });

    return NextResponse.json({ available: !hit, normalized: parsed.normalized });
  } catch (error) {
    console.error("[API_PROFILE_CHECK_USERNAME]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
