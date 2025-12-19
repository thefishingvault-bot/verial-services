import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, messageTemplates, providerCommunications, providers, scheduledCommunications, users } from '@/db/schema';
import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { requireAdmin } from '@/lib/admin-auth';
import { ensureUserExistsInDb } from '@/lib/user-sync';
import { writeAdminAuditLog } from '@/lib/admin-audit';
import { z } from 'zod';

const ProviderIdSchema = z
  .string()
  .min(1)
  .regex(/^prov_[A-Za-z0-9_]+$/, 'Invalid provider id');

const BulkMessageRequestSchema = z.object({
  subject: z.string().trim().min(1).max(255),
  message: z.string().trim().min(1),
  type: z.enum(['email', 'notification']),
  providerIds: z.array(ProviderIdSchema).min(1).max(200),
  scheduledFor: z.string().trim().optional(),
  templateId: z.string().trim().optional(),
});

function makeProviderCommId() {
  return `pcomm_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function makeScheduledCommId() {
  return `scomm_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function riskFromTrustScore(score: number) {
  if (score >= 80) return 'low' as const;
  if (score >= 60) return 'medium' as const;
  if (score >= 40) return 'high' as const;
  return 'critical' as const;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

    await ensureUserExistsInDb(userId!, 'admin');

    const raw = await request.json().catch(() => null);
    const parsedBody = BulkMessageRequestSchema.safeParse(raw);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const { subject, message, type, providerIds, scheduledFor, templateId } = parsedBody.data;

    // Get provider details
    const providersList = await db
      .select({
        id: providers.id,
        businessName: providers.businessName,
        userId: providers.userId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(providers)
      .innerJoin(users, eq(providers.userId, users.id))
      .where(inArray(providers.id, providerIds));

    if (providersList.length === 0) {
      return NextResponse.json({ error: 'No valid providers found' }, { status: 400 });
    }

    const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
    if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: 'Invalid scheduledFor timestamp' }, { status: 400 });
    }
    const shouldSendNow = !scheduledDate || scheduledDate <= new Date();

    if (shouldSendNow) {
      // Send messages immediately
      const results = await Promise.allSettled(
        providersList.map(async (provider) => {
          try {
            const personalizedMessage = message
              .replace(/{provider_name}/g, provider.businessName)
              .replace(/{first_name}/g, provider.firstName || '')
              .replace(/{last_name}/g, provider.lastName || '');

            const personalizedSubject = subject
              .replace(/{provider_name}/g, provider.businessName)
              .replace(/{first_name}/g, provider.firstName || '')
              .replace(/{last_name}/g, provider.lastName || '');

            if (type === 'email') {
              await sendEmail({
                to: provider.email,
                subject: personalizedSubject,
                html: personalizedMessage.replace(/\n/g, '<br>')
              });
            } else if (type === 'notification') {
              await createNotification({
                userId: provider.userId,
                message: `${personalizedSubject}: ${personalizedMessage}`,
                href: '/dashboard/notifications'
              });
            }

            // Log the communication
            await db.insert(providerCommunications).values({
              id: makeProviderCommId(),
              providerId: provider.id,
              type,
              subject: personalizedSubject,
              message: personalizedMessage,
              sentAt: new Date(),
              status: 'sent',
              sentBy: userId
            });

            return { providerId: provider.id, status: 'success' };
          } catch (error) {
            console.error(`Failed to send message to provider ${provider.id}:`, error);

            // Log failed communication
            await db.insert(providerCommunications).values({
              id: makeProviderCommId(),
              providerId: provider.id,
              type,
              subject,
              message,
              sentAt: new Date(),
              status: 'failed',
              sentBy: userId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });

            return { providerId: provider.id, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' };
          }
        })
      );

      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length;
      const failureCount = results.filter(r => r.status === 'fulfilled' && r.value.status === 'failed').length;

      await writeAdminAuditLog({
        userId: userId!,
        action: 'PROVIDER_COMMUNICATION_SEND',
        resource: 'provider',
        resourceId: null,
        details: `Sent ${type} to ${providersList.length} provider(s): ${successCount} succeeded, ${failureCount} failed.${templateId ? ` templateId=${templateId}` : ''}`,
        request,
      });

      return NextResponse.json({
        success: true,
        sent: successCount,
        failed: failureCount,
        total: providersList.length
      });
    } else {
      // Schedule message for later
      await db.insert(scheduledCommunications).values({
        id: makeScheduledCommId(),
        subject,
        message,
        type,
        providerIds,
        scheduledFor: scheduledDate,
        templateId,
        createdBy: userId
      });

      await writeAdminAuditLog({
        userId: userId!,
        action: 'PROVIDER_COMMUNICATION_SCHEDULE',
        resource: 'provider',
        resourceId: null,
        details: `Scheduled ${type} to ${providersList.length} provider(s) for ${scheduledDate.toISOString()}.${templateId ? ` templateId=${templateId}` : ''}`,
        request,
      });

      return NextResponse.json({
        success: true,
        scheduled: true,
        scheduledFor: scheduledDate,
        providerCount: providersList.length
      });
    }
  } catch (error) {
    console.error('Bulk messaging error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const { searchParams } = new URL(request.url);
    const kind = searchParams.get('kind') || 'history';

    if (kind === 'templates') {
      const rows = await db
        .select({
          id: messageTemplates.id,
          name: messageTemplates.name,
          subject: messageTemplates.subject,
          body: messageTemplates.body,
          category: messageTemplates.category,
          variables: messageTemplates.variables,
          updatedAt: messageTemplates.updatedAt,
        })
        .from(messageTemplates)
        .orderBy(desc(messageTemplates.updatedAt));

      return NextResponse.json({ templates: rows });
    }

    if (kind === 'providers') {
      const q = (searchParams.get('q') || '').trim();
      const status = (searchParams.get('status') || 'all').trim();
      const risk = (searchParams.get('risk') || 'all').trim();
      const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10) || 50));

      const whereClauses = [] as Array<ReturnType<typeof and> | ReturnType<typeof eq> | ReturnType<typeof sql>>;

      if (q) {
        const like = `%${q}%`;
        whereClauses.push(
          sql`(
            ${providers.businessName} ILIKE ${like}
            OR ${providers.handle} ILIKE ${like}
            OR ${users.email} ILIKE ${like}
          )`,
        );
      }

      if (status !== 'all') {
        if (status === 'suspended') {
          whereClauses.push(eq(providers.isSuspended, true));
        } else if (status === 'approved' || status === 'pending' || status === 'rejected') {
          whereClauses.push(eq(providers.status, status as 'approved' | 'pending' | 'rejected'));
        }
      }

      if (risk !== 'all') {
        if (risk === 'low') whereClauses.push(sql`${providers.trustScore} >= 80`);
        if (risk === 'medium') whereClauses.push(sql`${providers.trustScore} BETWEEN 60 AND 79`);
        if (risk === 'high') whereClauses.push(sql`${providers.trustScore} BETWEEN 40 AND 59`);
        if (risk === 'critical') whereClauses.push(sql`${providers.trustScore} < 40`);
      }

      const where = whereClauses.length ? and(...whereClauses) : undefined;

      const [rows, totalProvidersRes, totalMessagesRes] = await Promise.all([
        db
          .select({
            id: providers.id,
            businessName: providers.businessName,
            handle: providers.handle,
            email: users.email,
            status: providers.status,
            isSuspended: providers.isSuspended,
            trustScore: providers.trustScore,
            trustLevel: providers.trustLevel,
            createdAt: providers.createdAt,
            totalBookings: sql<number>`COUNT(${bookings.id})`,
            lastActivity: sql<Date | null>`MAX(${bookings.createdAt})`,
          })
          .from(providers)
          .innerJoin(users, eq(providers.userId, users.id))
          .leftJoin(bookings, eq(bookings.providerId, providers.id))
          .where(where)
          .groupBy(
            providers.id,
            providers.businessName,
            providers.handle,
            users.email,
            providers.status,
            providers.isSuspended,
            providers.trustScore,
            providers.trustLevel,
            providers.createdAt,
          )
          .orderBy(desc(providers.createdAt))
          .limit(limit)
          .offset((page - 1) * limit),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(providers)
          .innerJoin(users, eq(providers.userId, users.id))
          .where(where),
        db.select({ count: sql<number>`COUNT(*)` }).from(providerCommunications),
      ]);

      const providersOut = rows.map((p) => ({
        id: p.id,
        businessName: p.businessName,
        handle: p.handle,
        email: p.email,
        status: p.isSuspended ? 'suspended' : p.status,
        riskLevel: riskFromTrustScore(p.trustScore ?? 0),
        totalBookings: Number(p.totalBookings ?? 0),
        trustScore: p.trustScore ?? 0,
        lastActivity: p.lastActivity,
      }));

      return NextResponse.json({
        providers: providersOut,
        totals: {
          totalProviders: totalProvidersRes[0]?.count ?? 0,
          totalMessagesSent: totalMessagesRes[0]?.count ?? 0,
        },
        pagination: {
          page,
          limit,
        },
      });
    }

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const providerId = searchParams.get('providerId');

    const where = providerId ? sql`${providerCommunications.providerId} = ${providerId}` : undefined;

    const [communications, totalResult] = await Promise.all([
      db
        .select({
          id: providerCommunications.id,
          providerId: providerCommunications.providerId,
          providerName: providers.businessName,
          providerHandle: providers.handle,
          type: providerCommunications.type,
          subject: providerCommunications.subject,
          message: providerCommunications.message,
          sentAt: providerCommunications.sentAt,
          status: providerCommunications.status,
          error: providerCommunications.error,
          response: providerCommunications.response,
          responseAt: providerCommunications.responseAt,
        })
        .from(providerCommunications)
        .innerJoin(providers, eq(providerCommunications.providerId, providers.id))
        .where(where)
        .orderBy(desc(providerCommunications.sentAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)` }).from(providerCommunications).where(where)
    ]);

    const total = totalResult[0].count;

    return NextResponse.json({
      communications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get communications error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}