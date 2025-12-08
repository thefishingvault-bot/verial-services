import { db } from '@/lib/db';
import { bookings, providers, users } from '@/db/schema';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq, and, inArray } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    // Ensure the current user exists in our local DB before creating a conversation
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const userEmail = user.emailAddresses[0]?.emailAddress;

      if (userEmail) {
        await db.insert(users).values({
          id: userId,
          email: userEmail,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: user.imageUrl,
          role: 'user',
        });
      }
    } catch (syncError) {
      console.error('[API_CHAT_INITIATE] Failed to sync user:', syncError);
    }

    const { recipientId } = await req.json();
    if (!recipientId) return new NextResponse('Missing recipientId', { status: 400 });

    if (userId === recipientId) {
      return new NextResponse('Cannot chat with yourself', { status: 400 });
    }

    // Only allow conversations when a booking exists between the customer and provider
    const providerForSender = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
      columns: { id: true },
    });
    const providerForRecipient = await db.query.providers.findFirst({
      where: eq(providers.userId, recipientId),
      columns: { id: true },
    });

    let providerId: string | null = null;
    let customerId: string | null = null;

    if (providerForSender) {
      providerId = providerForSender.id;
      customerId = recipientId;
    } else if (providerForRecipient) {
      providerId = providerForRecipient.id;
      customerId = userId;
    }

    if (!providerId || !customerId) {
      return new NextResponse('Messaging is only allowed between providers and customers with a booking.', { status: 403 });
    }

    const existingBooking = await db.query.bookings.findFirst({
      where: and(
        eq(bookings.providerId, providerId),
        eq(bookings.userId, customerId),
        inArray(bookings.status, ['pending', 'accepted', 'paid', 'completed', 'disputed']),
      ),
      columns: { id: true },
    });

    if (!existingBooking) {
      return new NextResponse('A booking is required to start messaging.', { status: 403 });
    }

    return NextResponse.json({ bookingId: existingBooking.id });
  } catch (error) {
    console.error('[API_CHAT_INITIATE]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
