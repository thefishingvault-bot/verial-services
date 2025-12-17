import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { canMessage } from "@/lib/messaging";
import { pusherServer } from "@/lib/pusher";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    if (!pusherServer) return new NextResponse("Realtime not configured", { status: 503 });

    const rate = await enforceRateLimit(req, {
      userId,
      resource: "pusher:auth",
      limit: 60,
      windowSeconds: 60,
    });

    if (!rate.success) {
      return rateLimitResponse(rate.retryAfter);
    }

    const contentType = req.headers.get("content-type") ?? "";
    let socketId = "";
    let channelName = "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      socketId = body.socket_id;
      channelName = body.channel_name;
    } else {
      const form = await req.formData();
      socketId = String(form.get("socket_id") ?? "");
      channelName = String(form.get("channel_name") ?? "");
    }

    if (!socketId || !channelName) {
      return new NextResponse("Invalid auth payload", { status: 400 });
    }

    // Only allow subscribing to booking-linked message channels if the user is a participant.
    // This prevents guessing booking IDs and receiving private realtime events.
    const threadPrefixes = ["private-thread-", "private-messages-"];
    const matchedPrefix = threadPrefixes.find((p) => channelName.startsWith(p));
    if (matchedPrefix) {
      const threadId = channelName.slice(matchedPrefix.length);
      const allowed = await canMessage(userId, threadId);
      if (!allowed.ok) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    const presenceData = channelName.startsWith("presence-")
      ? { user_id: userId, user_info: { id: userId } }
      : undefined;

    const authResponse = pusherServer.authorizeChannel(socketId, channelName, presenceData);
    return NextResponse.json(authResponse);
  } catch (error) {
    console.error("[API_PUSHER_AUTH]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
