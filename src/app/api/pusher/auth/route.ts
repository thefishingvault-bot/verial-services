import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { pusherServer } from "@/lib/pusher";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    if (!pusherServer) return new NextResponse("Realtime not configured", { status: 503 });

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
