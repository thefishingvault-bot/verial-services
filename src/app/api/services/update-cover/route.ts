import { db } from '@/lib/db';
import { services, providers } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { assertProviderCanTransactFromProvider } from '@/lib/provider-access';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { serviceId, publicUrl } = (await req.json()) as { serviceId?: string; publicUrl?: string | null };
    if (!serviceId) {
      return new NextResponse('Missing serviceId', { status: 400 });
    }

    // 1. Get the provider record for this user
    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });
    if (!provider) {
      return new NextResponse('Provider not found', { status: 404 });
    }

    const access = assertProviderCanTransactFromProvider(provider);
    if (!access.ok) return access.response;

    // 2. Update the service, but *only if it belongs to this provider*
    const [updatedService] = await db.update(services)
      .set({ coverImageUrl: publicUrl ?? null, updatedAt: new Date() })
      .where(and(
        eq(services.id, serviceId),
        eq(services.providerId, provider.id) // Security check
      ))
      .returning();

    if (!updatedService) {
      return new NextResponse('Service not found or access denied', { status: 404 });
    }

    console.log(`[API_UPDATE_COVER] Provider ${provider.id} updated cover for Service ${serviceId}`);
    return NextResponse.json(updatedService);

  } catch (error) {
    console.error('[API_UPDATE_COVER]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

