import { db } from "@/lib/db";
import { bookings, conversations, messages, providers, users } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, asc, eq, or } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const params = await context.params;
    const conversationId = params.conversationId;

    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        or(eq(conversations.user1Id, userId), eq(conversations.user2Id, userId)),
      ),
      with: {
        user1: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            providerId: true,
          },
        },
        user2: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            providerId: true,
          },
        },
        messages: {
          orderBy: [asc(messages.createdAt)],
          with: {
            sender: {
              columns: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    const isUser1 = conversation.user1Id === userId;
    const viewerUser = isUser1 ? conversation.user1 : conversation.user2;
    const otherUser = isUser1 ? conversation.user2 : conversation.user1;

    // Determine viewer role via linked provider record
    const viewerProvider =
      viewerUser.providerId
        ? await db.query.providers.findFirst({
            where: eq(providers.id, viewerUser.providerId),
          })
        : null;

    const viewerRole: "provider" | "customer" = viewerProvider ? "provider" : "customer";

    // Resolve provider entity and customer user
    const providerEntity = viewerProvider
      ? viewerProvider
      : otherUser.providerId
      ? await db.query.providers.findFirst({
          where: eq(providers.id, otherUser.providerId),
        })
      : null;

    const providerUser = providerEntity
      ? await db.query.users.findFirst({ where: eq(users.id, providerEntity.userId) })
      : null;

    const customerUser =
      providerUser && providerUser.id === conversation.user1Id
        ? conversation.user2
        : conversation.user1;

    const provider = providerEntity && providerUser
      ? {
          id: providerEntity.id,
          name:
            providerEntity.businessName ||
            `${providerUser.firstName || ""} ${providerUser.lastName || ""}`.trim() ||
            "Provider",
          handle: providerEntity.handle,
          avatarUrl: providerUser.avatarUrl,
          rating: undefined,
          jobsCompleted: undefined,
          isVerified: providerEntity.isVerified,
        }
      : null;

    const customer = {
      id: customerUser.id,
      name:
        `${customerUser.firstName || ""} ${customerUser.lastName || ""}`.trim() ||
        "Customer",
      handle: "customer",
      avatarUrl: customerUser.avatarUrl,
    };

    // Try to find a booking that links this customer and provider
    const booking =
      provider
        ? await db.query.bookings.findFirst({
            where: and(
              eq(bookings.userId, customer.id),
              eq(bookings.providerId, provider.id),
            ),
            with: {
              service: {
                columns: {
                  title: true,
                },
              },
            },
          })
        : null;

    return NextResponse.json({
      messages: conversation.messages,
      booking: booking
        ? {
            id: booking.id,
            publicRef: booking.id,
            serviceTitle: booking.service.title,
            scheduledAt: booking.scheduledDate,
            totalInCents: booking.priceAtBooking,
            includesGst: true,
            status: booking.status,
          }
        : null,
      provider,
      customer,
      viewerRole,
    });
  } catch (error) {
    console.error("[API_CHAT_MESSAGES]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
