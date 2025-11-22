import { NextResponse } from "next/server";

import {
  getAuthenticatedUserId,
  getConversationsForUser,
} from "@/lib/chat";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ conversations: [] }, { status: 401 });
    }

    const conversations = await getConversationsForUser(userId);

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("[API_CHAT_CONVERSATIONS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
