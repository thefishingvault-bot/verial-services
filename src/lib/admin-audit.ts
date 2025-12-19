import { db } from '@/lib/db';
import { adminAuditLogs } from '@/db/schema';

function makeAuditId() {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function getHeader(req: Request | undefined, key: string) {
  try {
    return req?.headers?.get(key) ?? null;
  } catch {
    return null;
  }
}

function getIpAddress(req?: Request) {
  const forwardedFor = getHeader(req, 'x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || forwardedFor;

  const realIp = getHeader(req, 'x-real-ip');
  if (realIp) return realIp;

  const cfConnectingIp = getHeader(req, 'cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  return 'unknown';
}

export async function writeAdminAuditLog(args: {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  details: string;
  request?: Request;
}) {
  try {
    await db.insert(adminAuditLogs).values({
      id: makeAuditId(),
      userId: args.userId,
      action: args.action,
      resource: args.resource,
      resourceId: args.resourceId ?? null,
      details: args.details,
      ipAddress: getIpAddress(args.request),
      userAgent: getHeader(args.request, 'user-agent') ?? 'unknown',
    });
  } catch (e) {
    console.error('[ADMIN_AUDIT_LOG_WRITE_FAILED]', e);
  }
}
