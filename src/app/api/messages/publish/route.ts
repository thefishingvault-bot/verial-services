import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { pusherServer } from "@/lib/pusher";
import { PublishSchema } from "@/lib/validation/messages";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json();
    const parsed = PublishSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
    if (!pusherServer) return new NextResponse("Realtime not configured", { status: 503 });

    const { threadId, event, payload } = parsed.data;
    const basePayload = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    await pusherServer.trigger(`private-messages-${threadId}`, event, { ...basePayload, actor: userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("[API_MESSAGES_PUBLISH]", error);
    return new NextResponse(message, { status: 500 });
  }
}
