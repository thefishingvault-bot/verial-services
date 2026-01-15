import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getPresence, setPresence } from "@/lib/presence";
import { pusherServer } from "@/lib/pusher";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const rate = await enforceRateLimit(req, {
      userId,
      resource: "presence:get",
      limit: 120,
      windowSeconds: 60,
    });

    if (!rate.success) {
      return rateLimitResponse(rate.retryAfter);
    }

    const url = new URL(req.url);
    const idsParam = url.searchParams.getAll("userId").slice(0, 50);
    if (!idsParam.length) return NextResponse.json({ presence: {} });
    const presence = await getPresence(idsParam);
    return NextResponse.json({ presence });
  } catch (error) {
    console.error("[API_PRESENCE_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const rate = await enforceRateLimit(req, {
      userId,
      resource: "presence:set",
      limit: 60,
      windowSeconds: 60,
    });

    if (!rate.success) {
      return rateLimitResponse(rate.retryAfter);
    }

    const body = (await req.json().catch(() => ({}))) as { status?: "online" | "away" | "busy" | "offline" };
    const status = body.status ?? "online";
    await setPresence(userId, status);
    if (pusherServer) {
      await pusherServer.trigger("presence-global", "presence:update", {
        userId,
        status,
        lastActive: Date.now(),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API_PRESENCE_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
