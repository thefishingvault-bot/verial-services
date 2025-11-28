import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { providerCommunications, scheduledCommunications, providers, users } from '@/db/schema';
import { sql, desc, inArray } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';

interface BulkMessageRequest {
  subject: string;
  message: string;
  type: 'email' | 'notification' | 'sms';
  providerIds: string[];
  scheduledFor?: string;
  templateId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin (you'll need to implement this check based on your user roles)
    // For now, we'll assume the user is authenticated

    const body: BulkMessageRequest = await request.json();
    const { subject, message, type, providerIds, scheduledFor, templateId } = body;

    if (!subject || !message || !providerIds.length) {
      return NextResponse.json(
        { error: 'Subject, message, and provider IDs are required' },
        { status: 400 }
      );
    }

    // Get provider details
    const providersList = await db.query.providers.findMany({
      where: inArray(providers.id, providerIds),
      with: {
        user: {
          columns: {
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      columns: {
        id: true,
        businessName: true,
        userId: true
      }
    });

    if (providersList.length === 0) {
      return NextResponse.json({ error: 'No valid providers found' }, { status: 400 });
    }

    const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
    const shouldSendNow = !scheduledDate || scheduledDate <= new Date();

    if (shouldSendNow) {
      // Send messages immediately
      const results = await Promise.allSettled(
        providersList.map(async (provider) => {
          try {
            const personalizedMessage = message
              .replace(/{provider_name}/g, provider.businessName)
              .replace(/{first_name}/g, provider.user.firstName || '')
              .replace(/{last_name}/g, provider.user.lastName || '');

            const personalizedSubject = subject
              .replace(/{provider_name}/g, provider.businessName)
              .replace(/{first_name}/g, provider.user.firstName || '')
              .replace(/{last_name}/g, provider.user.lastName || '');

            if (type === 'email') {
              await sendEmail({
                to: provider.user.email,
                subject: personalizedSubject,
                html: personalizedMessage.replace(/\n/g, '<br>')
              });
            } else if (type === 'notification') {
              await createNotification({
                userId: provider.userId,
                message: `${personalizedSubject}: ${personalizedMessage}`,
                href: '/dashboard/notifications'
              });
            } else if (type === 'sms') {
              // Implement SMS sending logic here
              console.log(`SMS to ${provider.user.email}: ${personalizedMessage}`);
            }

            // Log the communication
            await db.insert(providerCommunications).values({
              id: `pcomm_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`,
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
              id: `pcomm_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`,
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

      return NextResponse.json({
        success: true,
        sent: successCount,
        failed: failureCount,
        total: providersList.length
      });
    } else {
      // Schedule message for later
      await db.insert(scheduledCommunications).values({
        id: `scomm_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`,
        subject,
        message,
        type,
        providerIds,
        scheduledFor: scheduledDate,
        templateId,
        createdBy: userId
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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const providerId = searchParams.get('providerId');

    const where: any = {};
    if (providerId) {
      where.providerId = providerId;
    }

    const [communications, totalResult] = await Promise.all([
      db.query.providerCommunications.findMany({
        where,
        orderBy: [desc(providerCommunications.sentAt)],
        limit,
        offset: (page - 1) * limit
      }),
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