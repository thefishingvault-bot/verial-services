// In-memory audit log storage (in production, this would be a database table)
interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
}

let auditLogs: AuditLog[] = [
  {
    id: 'audit_001',
    userId: 'system',
    action: 'SYSTEM_INIT',
    resource: 'system',
    resourceId: null,
    details: 'System initialization completed',
    ipAddress: '127.0.0.1',
    userAgent: 'System',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
  },
  {
    id: 'audit_002',
    userId: 'admin_user_1',
    action: 'PROVIDER_SUSPEND',
    resource: 'provider',
    resourceId: 'prov_123',
    details: 'Suspended provider account due to policy violation',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  },
  {
    id: 'audit_003',
    userId: 'admin_user_1',
    action: 'BROADCAST_SEND',
    resource: 'notification',
    resourceId: null,
    details: 'Sent broadcast message to 150 users',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  },
];

// Helper function to log audit events
export function logAuditEvent(event: {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  details: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const auditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId: event.userId,
    action: event.action,
    resource: event.resource,
    resourceId: event.resourceId || null,
    details: event.details,
    ipAddress: event.ipAddress || 'unknown',
    userAgent: event.userAgent || 'unknown',
    timestamp: new Date().toISOString(),
  };

  auditLogs.push(auditEntry);

  // Keep only last 1000 entries (in production, this would be handled by database retention policies)
  if (auditLogs.length > 1000) {
    auditLogs = auditLogs.slice(-1000);
  }

  return auditEntry;
}

// Function to get audit logs with filtering
export function getAuditLogs(filters: {
  action?: string;
  resource?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
} = {}) {
  let filteredLogs = auditLogs;

  // Apply filters
  if (filters.action && filters.action !== 'all') {
    filteredLogs = filteredLogs.filter(log => log.action === filters.action);
  }

  if (filters.resource && filters.resource !== 'all') {
    filteredLogs = filteredLogs.filter(log => log.resource === filters.resource);
  }

  if (filters.userId && filters.userId !== 'all') {
    filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
  }

  if (filters.startDate) {
    const start = new Date(filters.startDate);
    filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= start);
  }

  if (filters.endDate) {
    const end = new Date(filters.endDate);
    filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= end);
  }

  // Sort by timestamp descending
  filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const total = filteredLogs.length;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  // Get unique users for filter dropdown
  const uniqueUsers = [...new Set(auditLogs.map(log => log.userId))];

  // Get audit statistics
  const stats = {
    totalEvents: auditLogs.length,
    eventsLast24h: auditLogs.filter(log => {
      const logDate = new Date(log.timestamp);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return logDate >= yesterday;
    }).length,
    eventsLast7d: auditLogs.filter(log => {
      const logDate = new Date(log.timestamp);
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return logDate >= lastWeek;
    }).length,
    uniqueUsers: uniqueUsers.length,
  };

  // Get action breakdown
  const actionBreakdown = auditLogs.reduce((acc, log) => {
    acc[log.action] = (acc[log.action] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    logs: paginatedLogs,
    stats,
    actionBreakdown,
    uniqueUsers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export { auditLogs };