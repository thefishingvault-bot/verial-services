import { db } from '@/lib/db';
import { providers, providerAvailabilities, dayOfWeekEnum } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

// Helper function to create a unique ID
const generateId = () => `pavail_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

// GET: Fetch the provider's current schedule
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (!provider) {
      return new NextResponse('Provider not found', { status: 404 });
    }

    const schedule = await db.query.providerAvailabilities.findMany({
      where: eq(providerAvailabilities.providerId, provider.id),
    });

    return NextResponse.json(schedule);
  } catch (error) {
    console.error('[API_AVAILABILITY_GET]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// POST: Overwrite the provider's entire schedule
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (!provider) {
      return new NextResponse('Provider not found', { status: 404 });
    }

    const newSchedule = (await req.json()) as {
      dayOfWeek: (typeof dayOfWeekEnum.enumValues)[number];
      startTime: string;
      endTime: string;
      isEnabled: boolean;
    }[];

    // 1. Delete all existing schedule entries for this provider
    await db
      .delete(providerAvailabilities)
      .where(eq(providerAvailabilities.providerId, provider.id));

    // 2. Insert new schedule entries
    if (newSchedule.length > 0) {
      const scheduleToInsert = newSchedule.map((day) => ({
        id: generateId(),
        providerId: provider.id,
        dayOfWeek: day.dayOfWeek,
        startTime: day.startTime,
        endTime: day.endTime,
        isEnabled: day.isEnabled,
      }));

      await db.insert(providerAvailabilities).values(scheduleToInsert);
    }

    console.log(`[API_AVAILABILITY_POST] Updated schedule for Provider ${provider.id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API_AVAILABILITY_POST]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

