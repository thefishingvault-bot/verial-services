import { db } from "@/lib/db";
import { trustIncidents, providers, users, bookings } from "@/db/schema";
import { asc, desc, and, or, ilike, eq, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle, Shield, Search, Settings } from "lucide-react";
import { AdminTrustIncidentsSearchSchema, parseSearchParams } from "@/lib/validation/admin-loader-schemas";
import { requireAdmin } from "@/lib/admin-auth";

export default async function AdminTrustIncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect("/dashboard");

  const params = parseSearchParams(AdminTrustIncidentsSearchSchema, await searchParams);
  const statusFilter = params.status;
  const typeFilter = params.type;
  const severityFilter = params.severity;
  const searchQuery = params.search;

  const [summaryRow, distinctTypes] = await Promise.all([
    db
      .select({
        total: sql<number>`COUNT(*)`,
        unresolved: sql<number>`COUNT(*) FILTER (WHERE ${trustIncidents.resolved} = false)`,
        resolved: sql<number>`COUNT(*) FILTER (WHERE ${trustIncidents.resolved} = true)`,
        criticalOpen: sql<number>`COUNT(*) FILTER (WHERE ${trustIncidents.resolved} = false AND ${trustIncidents.severity} = 'critical')`,
      })
      .from(trustIncidents)
      .then((rows) => rows[0] ?? { total: 0, unresolved: 0, resolved: 0, criticalOpen: 0 }),
    db
      .select({ incidentType: trustIncidents.incidentType })
      .from(trustIncidents)
      .groupBy(trustIncidents.incidentType)
      .orderBy(asc(trustIncidents.incidentType))
      .then((rows) => rows.map((r) => r.incidentType).filter(Boolean)),
  ]);

  const baseIncidentTypes = ["complaint", "violation", "review_abuse", "service_quality"];
  const known = new Set(baseIncidentTypes);
  const extraIncidentTypes = distinctTypes.filter((t) => !known.has(t));

  // Build where conditions
  const whereConditions = [];

  if (statusFilter === "resolved") {
    whereConditions.push(eq(trustIncidents.resolved, true));
  } else if (statusFilter === "unresolved") {
    whereConditions.push(eq(trustIncidents.resolved, false));
  }

  if (typeFilter !== "all") {
    whereConditions.push(eq(trustIncidents.incidentType, typeFilter));
  }

  if (severityFilter !== "all") {
    whereConditions.push(eq(trustIncidents.severity, severityFilter));
  }

  if (searchQuery) {
    whereConditions.push(
      or(
        ilike(providers.businessName, `%${searchQuery}%`),
        ilike(trustIncidents.description, `%${searchQuery}%`)
      )
    );
  }

  // Fetch trust incidents with related data
  const incidents = await db
    .select({
      id: trustIncidents.id,
      incidentType: trustIncidents.incidentType,
      severity: trustIncidents.severity,
      description: trustIncidents.description,
      trustScoreImpact: trustIncidents.trustScoreImpact,
      resolved: trustIncidents.resolved,
      resolvedAt: trustIncidents.resolvedAt,
      createdAt: trustIncidents.createdAt,
      reportedBy: trustIncidents.reportedBy,
      resolvedBy: trustIncidents.resolvedBy,
      provider: {
        id: providers.id,
        businessName: providers.businessName,
        handle: providers.handle,
      },
      booking: {
        id: bookings.id,
      },
    })
    .from(trustIncidents)
    .innerJoin(providers, eq(trustIncidents.providerId, providers.id))
    .leftJoin(bookings, eq(trustIncidents.bookingId, bookings.id))
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .orderBy(desc(trustIncidents.createdAt))
    .limit(100);

  // Get unique user IDs for reporter and resolver
  const userIds = new Set<string>();
  incidents.forEach(incident => {
    if (incident.reportedBy) userIds.add(incident.reportedBy);
    if (incident.resolvedBy) userIds.add(incident.resolvedBy);
  });

  // Fetch user details
  const userDetails = userIds.size > 0 ? await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, Array.from(userIds))) : [];

  // Create a map for quick user lookup
  const userMap = new Map(userDetails.map(user => [user.id, user]));

  // Combine the data
  const incidentsWithUsers = incidents.map(incident => ({
    ...incident,
    reporter: incident.reportedBy ? userMap.get(incident.reportedBy) : null,
    resolver: incident.resolvedBy ? userMap.get(incident.resolvedBy) : null,
  }));

  // Summary stats (all-time, not limited to current filter)
  const totalIncidents = Number(summaryRow.total ?? 0);
  const unresolvedIncidents = Number(summaryRow.unresolved ?? 0);
  const resolvedIncidents = Number(summaryRow.resolved ?? 0);
  const criticalIncidents = Number(summaryRow.criticalOpen ?? 0);

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trust Incident Management</h1>
          <p className="text-muted-foreground mt-2">
            Monitor and manage trust incidents affecting provider scores and platform safety.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/admin/trust/rules">
            <Settings className="mr-2 h-4 w-4" />
            Manage Risk Rules
          </Link>
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Incidents</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalIncidents}</div>
            <p className="text-xs text-muted-foreground">
              All time incidents
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unresolved</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{unresolvedIncidents}</div>
            <p className="text-xs text-muted-foreground">
              Require attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{resolvedIncidents}</div>
            <p className="text-xs text-muted-foreground">
              Successfully handled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{criticalIncidents}</div>
            <p className="text-xs text-muted-foreground">
              High priority
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>Filter incidents by status, type, severity, or search</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-4" method="GET">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <select
                name="status"
                defaultValue={statusFilter}
                className="w-40 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Status</option>
                <option value="resolved">Resolved</option>
                <option value="unresolved">Unresolved</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <select
                name="type"
                defaultValue={typeFilter}
                className="w-40 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Types</option>
                <option value="complaint">Complaint</option>
                <option value="violation">Violation</option>
                <option value="review_abuse">Review Abuse</option>
                <option value="service_quality">Service Quality</option>
                {extraIncidentTypes.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Severity</label>
              <select
                name="severity"
                defaultValue={severityFilter}
                className="w-40 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Severities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  name="search"
                  defaultValue={searchQuery}
                  placeholder="Provider name or description..."
                  className="pl-9 w-64"
                />
              </div>
            </div>

            <div className="flex items-end">
              <Button type="submit">
                <Search className="mr-2 h-4 w-4" />
                Filter
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Incidents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Trust Incidents</CardTitle>
          <CardDescription>
            {incidentsWithUsers.length} incident{incidentsWithUsers.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Impact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidentsWithUsers.map((incident) => (
                <TableRow key={incident.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{incident.provider.businessName}</div>
                      <div className="text-sm text-muted-foreground">@{incident.provider.handle}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="capitalize">
                      {incident.incidentType.replace("_", " ")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      incident.severity === "critical" ? "destructive" :
                      incident.severity === "high" ? "secondary" :
                      incident.severity === "medium" ? "outline" :
                      "default"
                    }>
                      {incident.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate" title={incident.description}>
                      {incident.description}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={incident.trustScoreImpact < 0 ? "text-red-600" : "text-green-600"}>
                      {incident.trustScoreImpact > 0 ? "+" : ""}{incident.trustScoreImpact}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={incident.resolved ? "default" : "destructive"}>
                      {incident.resolved ? "Resolved" : "Open"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {incident.createdAt.toLocaleDateString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {incident.createdAt.toLocaleTimeString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {!incident.resolved ? (
                        <form action={`/api/admin/trust/incidents/${incident.id}/resolve`} method="POST" className="inline">
                          <Button type="submit" variant="outline" size="sm">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Resolve
                          </Button>
                        </form>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Resolved
                        </Badge>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/admin/providers/${incident.provider.id}`}>
                          View Provider
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {incidentsWithUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No trust incidents found matching the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}