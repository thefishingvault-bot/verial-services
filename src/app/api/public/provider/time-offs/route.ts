import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get('providerId');

    if (!providerId) {
      return new NextResponse('Missing providerId', { status: 400 });
    }

    const now = new Date();

    const timeOffs = await db.query.providerTimeOffs.findMany({
      where: (table, { and, eq, gt }) => and(eq(table.providerId, providerId), gt(table.endTime, now)),
      columns: {
        startTime: true,
        endTime: true,
      },
    });

    return NextResponse.json(timeOffs);
  } catch (error) {
    console.error('[API_PUBLIC_TIMEOFFS]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
