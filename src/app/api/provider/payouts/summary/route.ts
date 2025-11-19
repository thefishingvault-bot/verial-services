import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { providers } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (!provider || !provider.stripeConnectId) {
      return new NextResponse('Provider not connected', { status: 404 });
    }

    const stripeId = provider.stripeConnectId;

    // 1. Fetch Balance (Available vs Pending)
    const balance = await stripe.balance.retrieve({
      stripeAccount: stripeId,
    });

    // 2. Fetch Recent Payouts (Bank Transfers)
    const payouts = await stripe.payouts.list(
      { limit: 10 },
      { stripeAccount: stripeId }
    );

    return NextResponse.json({
      available: balance.available.reduce((acc, cur) => acc + cur.amount, 0),
      pending: balance.pending.reduce((acc, cur) => acc + cur.amount, 0),
      currency: balance.available[0]?.currency || 'nzd',
      payouts: payouts.data.map(p => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        arrivalDate: p.arrival_date,
      })),
    });

  } catch (error) {
    console.error('[API_PAYOUTS_SUMMARY]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
