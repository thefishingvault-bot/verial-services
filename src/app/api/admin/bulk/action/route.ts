import { db } from '@/lib/db';
import { bookings, bookingStatusEnum, providers, providerSuspensions } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { z } from 'zod';
import { ensureUserExistsInDb } from '@/lib/user-sync';
import { writeAdminAuditLog } from '@/lib/admin-audit';

const BulkActionSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('providers'),
      action: z.enum(['suspend', 'unsuspend', 'reject']),
      ids: z.array(z.string().min(1)).min(1).max(200),
    }),
    z.object({
      type: z.literal('bookings'),
      action: z.enum(['cancel', 'complete']),
      ids: z.array(z.string().min(1)).min(1).max(200),
    }),
  ])
  .transform((data) => ({
    ...data,
    ids: Array.from(new Set(data.ids)),
  }));

function makeProviderSuspensionId() {
  return `psusp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    await ensureUserExistsInDb(admin.userId!, 'admin');

    const raw = await req.json().catch(() => null);
    const parsed = BulkActionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { type, action, ids } = parsed.data;

    if (type === 'providers') {
      if (action === 'suspend') {
        const now = new Date();
        const updatedProviderIds = await db.transaction(async (tx) => {
          const updatedProviders = await tx
            .update(providers)
            .set({
              isSuspended: true,
              suspensionReason: 'Bulk suspension by admin',
              suspensionStartDate: now,
              suspensionEndDate: null,
              updatedAt: now,
            })
            .where(and(inArray(providers.id, ids), eq(providers.isSuspended, false)))
            .returning({ id: providers.id });

          if (updatedProviders.length > 0) {
            await tx.insert(providerSuspensions).values(
              updatedProviders.map(({ id }) => ({
                id: makeProviderSuspensionId(),
                providerId: id,
                action: 'suspend',
                reason: 'Bulk suspension by admin',
                startDate: now,
                endDate: null,
                performedBy: admin.userId!,
              })),
            );
          }

          return updatedProviders.map((p) => p.id);
        });

        const updated = updatedProviderIds.length;

        console.log(`[API_ADMIN_BULK] Suspended ${updated} providers`);

        await Promise.all(
          updatedProviderIds.map((id) =>
            writeAdminAuditLog({
              userId: admin.userId!,
              action: 'PROVIDER_SUSPEND',
              resource: 'provider',
              resourceId: id,
              details: `Bulk suspended provider (requested ${ids.length}).`,
              request: req,
            }),
          ),
        );

        return NextResponse.json({ success: true, requested: ids.length, affected: updated });
      }

      if (action === 'unsuspend') {
        const now = new Date();
        const updatedProviderIds = await db.transaction(async (tx) => {
          const prior = await tx
            .select({
              id: providers.id,
              reason: providers.suspensionReason,
              startDate: providers.suspensionStartDate,
              endDate: providers.suspensionEndDate,
            })
            .from(providers)
            .where(and(inArray(providers.id, ids), eq(providers.isSuspended, true)));

          if (prior.length === 0) return [];

          await tx
            .update(providers)
            .set({
              isSuspended: false,
              suspensionReason: null,
              suspensionStartDate: null,
              suspensionEndDate: null,
              updatedAt: now,
            })
            .where(inArray(
              providers.id,
              prior.map((p) => p.id),
            ));

          await tx.insert(providerSuspensions).values(
            prior.map((p) => ({
              id: makeProviderSuspensionId(),
              providerId: p.id,
              action: 'unsuspend',
              performedBy: admin.userId!,
              reason: p.reason,
              startDate: p.startDate,
              endDate: p.endDate,
            })),
          );

          return prior.map((p) => p.id);
        });

        const updated = updatedProviderIds.length;

        console.log(`[API_ADMIN_BULK] Unsuspended ${updated} providers`);

        await Promise.all(
          updatedProviderIds.map((id) =>
            writeAdminAuditLog({
              userId: admin.userId!,
              action: 'PROVIDER_UNSUSPEND',
              resource: 'provider',
              resourceId: id,
              details: `Bulk unsuspended provider (requested ${ids.length}).`,
              request: req,
            }),
          ),
        );

        return NextResponse.json({ success: true, requested: ids.length, affected: updated });
      }

      if (action === 'reject') {
        const now = new Date();
        const updated = await db
          .update(providers)
          .set({
            status: 'rejected',
            updatedAt: now,
          })
          .where(and(inArray(providers.id, ids), eq(providers.status, 'pending')))
          .returning({ id: providers.id });

        console.log(`[API_ADMIN_BULK] Rejected ${updated.length} provider applications`);

        await Promise.all(
          updated.map(({ id }) =>
            writeAdminAuditLog({
              userId: admin.userId!,
              action: 'PROVIDER_APPLICATION_REJECT',
              resource: 'provider',
              resourceId: id,
              details: `Bulk rejected provider application (requested ${ids.length}).`,
              request: req,
            }),
          ),
        );

        return NextResponse.json({ success: true, requested: ids.length, affected: updated.length });
      }
    } else if (type === 'bookings') {
      if (action === 'cancel') {
        const now = new Date();
        const cancellableStatuses: (typeof bookingStatusEnum.enumValues)[number][] = [
          'pending',
          'accepted',
          'paid',
        ];

        const updated = await db
          .update(bookings)
          .set({
            status: 'canceled_provider',
            updatedAt: now,
          })
          .where(and(inArray(bookings.id, ids), inArray(bookings.status, cancellableStatuses)))
          .returning({ id: bookings.id });

        console.log(`[API_ADMIN_BULK] Canceled ${updated.length} bookings`);

        await Promise.all(
          updated.map(({ id }) =>
            writeAdminAuditLog({
              userId: admin.userId!,
              action: 'BOOKING_CANCEL',
              resource: 'booking',
              resourceId: id,
              details: `Bulk canceled booking (requested ${ids.length}).`,
              request: req,
            }),
          ),
        );

        return NextResponse.json({ success: true, requested: ids.length, affected: updated.length });
      }

      if (action === 'complete') {
        const now = new Date();
        const updated = await db
          .update(bookings)
          .set({
            status: 'completed',
            updatedAt: now,
          })
          .where(and(inArray(bookings.id, ids), eq(bookings.status, 'paid')))
          .returning({ id: bookings.id });

        console.log(`[API_ADMIN_BULK] Marked ${updated.length} bookings as completed`);

        await Promise.all(
          updated.map(({ id }) =>
            writeAdminAuditLog({
              userId: admin.userId!,
              action: 'BOOKING_COMPLETE',
              resource: 'booking',
              resourceId: id,
              details: `Bulk marked booking as completed (requested ${ids.length}).`,
              request: req,
            }),
          ),
        );

        return NextResponse.json({ success: true, requested: ids.length, affected: updated.length });
      }
    }

    return NextResponse.json({ error: 'Invalid action or type' }, { status: 400 });
  } catch (error) {
    console.error('[API_ADMIN_BULK_ACTION]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}