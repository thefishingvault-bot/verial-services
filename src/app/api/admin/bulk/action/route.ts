import { db } from '@/lib/db';
import { providers, bookings } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const { type, action, ids } = await req.json();

    if (!type || !action || !Array.isArray(ids) || ids.length === 0) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    if (type === 'providers') {
      if (action === 'suspend') {
        await db.update(providers)
          .set({
            isSuspended: true,
            suspensionReason: 'Bulk suspension by admin',
            suspensionStartDate: new Date(),
            updatedAt: new Date(),
          })
          .where(inArray(providers.id, ids));

        console.log(`[API_ADMIN_BULK] Suspended ${ids.length} providers`);
        return NextResponse.json({ success: true, affected: ids.length });
      }

      if (action === 'unsuspend') {
        await db.update(providers)
          .set({
            isSuspended: false,
            suspensionReason: null,
            suspensionStartDate: null,
            suspensionEndDate: null,
            updatedAt: new Date(),
          })
          .where(inArray(providers.id, ids));

        console.log(`[API_ADMIN_BULK] Unsuspended ${ids.length} providers`);
        return NextResponse.json({ success: true, affected: ids.length });
      }

      if (action === 'reject') {
        await db.update(providers)
          .set({
            status: 'rejected',
            updatedAt: new Date(),
          })
          .where(inArray(providers.id, ids));

        console.log(`[API_ADMIN_BULK] Rejected ${ids.length} provider applications`);
        return NextResponse.json({ success: true, affected: ids.length });
      }
    } else if (type === 'bookings') {
      if (action === 'cancel') {
        await db.update(bookings)
          .set({
            status: 'canceled_provider',
            updatedAt: new Date(),
          })
          .where(inArray(bookings.id, ids));

        console.log(`[API_ADMIN_BULK] Canceled ${ids.length} bookings`);
        return NextResponse.json({ success: true, affected: ids.length });
      }

      if (action === 'complete') {
        await db.update(bookings)
          .set({
            status: 'completed',
            updatedAt: new Date(),
          })
          .where(inArray(bookings.id, ids));

        console.log(`[API_ADMIN_BULK] Marked ${ids.length} bookings as completed`);
        return NextResponse.json({ success: true, affected: ids.length });
      }
    }

    return new NextResponse('Invalid action or type', { status: 400 });
  } catch (error) {
    console.error('[API_ADMIN_BULK_ACTION]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}