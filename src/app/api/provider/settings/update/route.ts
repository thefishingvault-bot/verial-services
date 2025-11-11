import { db } from '@/lib/db';
import { providers } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { chargesGst } = await req.json();
    if (typeof chargesGst !== 'boolean') {
      return new NextResponse('Invalid input: chargesGst must be a boolean', { status: 400 });
    }

    // Update the provider record for this user
    const [updatedProvider] = await db.update(providers)
      .set({
        chargesGst: chargesGst,
        updatedAt: new Date(),
      })
      .where(eq(providers.userId, userId))
      .returning();

    if (!updatedProvider) {
      return new NextResponse('Provider not found', { status: 404 });
    }

    console.log(`[API_PROVIDER_SETTINGS] Provider ${updatedProvider.id} set chargesGst to ${chargesGst}`);
    return NextResponse.json(updatedProvider);

  } catch (error) {
    console.error('[API_PROVIDER_SETTINGS]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

