import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { recipientId, content, conversationId } = await req.json();

    if (!content || (!recipientId && !conversationId)) {
      return new NextResponse("Missing fields", { status: 400 });
    }

    // Chat backend schema (conversations/messages) not yet implemented.
    // For now, accept the request and echo back a mock message payload
    // so that the route compiles and the rest of the app can build.

    const mockMessage = {
      id: `msg_${Date.now()}`,
      conversationId: conversationId ?? null,
      senderId: userId,
      recipientId: recipientId ?? null,
      content,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(mockMessage);
  } catch (error) {
    console.error("[API_CHAT_SEND]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
