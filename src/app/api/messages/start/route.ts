import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { canMessage, sendBookingMessage } from "@/lib/messaging";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json();
    const bookingId = body?.bookingId as string | undefined;
    const content = (body?.content as string | undefined) ?? "";

    if (!bookingId) return new NextResponse("bookingId is required", { status: 400 });

    const allowed = await canMessage(userId, bookingId);
    if (!allowed.ok) return new NextResponse(allowed.reason, { status: 403 });

    // Optional first message to bootstrap thread
    if (content.trim()) {
      await sendBookingMessage({ bookingId, senderId: userId, content });
    }

    return NextResponse.json({ bookingId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("booking") || message.includes("Unauthorized") ? 403 : 500;
    console.error("[API_MESSAGES_START]", error);
    return new NextResponse(message, { status });
  }
}
