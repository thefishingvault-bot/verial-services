import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { canMessage, ensureBookingRelationship, sendBookingMessage } from "@/lib/messaging";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json();
    const bookingId = body?.bookingId as string | undefined;
    const providerId = body?.providerId as string | undefined;
    const serviceId = body?.serviceId as string | undefined;
    const content = (body?.content as string | undefined) ?? "";

    let resolvedBookingId = bookingId;

    if (!resolvedBookingId) {
      if (!providerId) return new NextResponse("bookingId or providerId is required", { status: 400 });

      try {
        const relationship = await ensureBookingRelationship({
          currentUserId: userId,
          providerId,
          serviceId,
        });
        resolvedBookingId = relationship.bookingId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to start conversation";
        const status = message.includes("Provider not found") ? 404 : 403;
        return new NextResponse(message, { status });
      }
    }

    const allowed = await canMessage(userId, resolvedBookingId);
    if (!allowed.ok) return new NextResponse(allowed.reason, { status: 403 });

    // Optional first message to bootstrap thread
    if (content.trim()) {
      await sendBookingMessage({ bookingId: resolvedBookingId, senderId: userId, content });
    }

    return NextResponse.json({ bookingId: resolvedBookingId, conversationId: resolvedBookingId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("booking") || message.includes("Unauthorized") ? 403 : 500;
    console.error("[API_MESSAGES_START]", error);
    return new NextResponse(message, { status });
  }
}
