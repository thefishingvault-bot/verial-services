import { db } from "@/lib/db";
import { riskRules, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Shield, CheckCircle, AlertTriangle, ArrowLeft, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function formatIncidentType(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function AdminRiskRulesPage() {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect("/dashboard");

  // Fetch all risk rules with creator info
  const rules = await db
    .select({
      id: riskRules.id,
      name: riskRules.name,
      incidentType: riskRules.incidentType,
      severity: riskRules.severity,
      trustScorePenalty: riskRules.trustScorePenalty,
      autoSuspend: riskRules.autoSuspend,
      suspendDurationDays: riskRules.suspendDurationDays,
      enabled: riskRules.enabled,
      createdAt: riskRules.createdAt,
      updatedAt: riskRules.updatedAt,
      creator: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(riskRules)
    .innerJoin(users, eq(riskRules.createdBy, users.id))
    .orderBy(desc(riskRules.createdAt));

  // Get summary stats
  const totalRules = rules.length;
  const enabledRules = rules.filter(r => r.enabled).length;
  const autoSuspendRules = rules.filter(r => r.autoSuspend && r.enabled).length;

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/admin/trust">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Incidents
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Risk Rules Management</h1>
            <p className="text-muted-foreground mt-2">
              Configure automated responses to trust incidents and violations.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/dashboard/admin/trust/rules/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Rule
          </Link>
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rules</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRules}</div>
            <p className="text-xs text-muted-foreground">
              Configured rules
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enabled Rules</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{enabledRules}</div>
            <p className="text-xs text-muted-foreground">
              Active rules
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auto-Suspend Rules</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{autoSuspendRules}</div>
            <p className="text-xs text-muted-foreground">
              Automatic suspensions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rules Table */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Rules</CardTitle>
          <CardDescription>
            Rules that automatically penalize trust scores and trigger suspensions based on incident types and severity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule Name</TableHead>
                <TableHead>Incident Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Trust Penalty</TableHead>
                <TableHead>Auto Suspend</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="font-medium">{rule.name}</div>
                  </TableCell>
                  <TableCell>
                    <span className="capitalize">
                      {formatIncidentType(rule.incidentType)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      rule.severity === "critical" ? "destructive" :
                      rule.severity === "high" ? "secondary" :
                      rule.severity === "medium" ? "outline" :
                      "default"
                    }>
                      {rule.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {rule.trustScorePenalty > 0 ? (
                      <span className="text-red-600 font-medium">-{rule.trustScorePenalty}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.autoSuspend ? "destructive" : "secondary"}>
                      {rule.autoSuspend ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!rule.autoSuspend
                      ? "—"
                      : rule.suspendDurationDays
                        ? `${rule.suspendDurationDays} days`
                        : "Indefinite"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.enabled ? "default" : "secondary"}>
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {rule.createdAt.toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <form action={`/api/admin/trust/rules/${rule.id}/toggle`} method="POST" className="inline">
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className={rule.enabled ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"}
                        >
                          {rule.enabled ? "Disable" : "Enable"}
                        </Button>
                      </form>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/admin/trust/rules/${rule.id}/edit`}>
                          Edit
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No risk rules configured yet. Create your first rule to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Default Rules Info */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong className="block mb-2">Recommended Default Risk Rules</strong>
          <p className="mb-4">
            Consider creating these default rules to automatically handle common trust incidents:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-muted p-3 rounded border">
              <strong>Customer Complaint (High)</strong>
              <br />Penalty: -10 points, Auto-suspend: No
            </div>
            <div className="bg-muted p-3 rounded border">
              <strong>Service Violation (Critical)</strong>
              <br />Penalty: -25 points, Auto-suspend: 7 days
            </div>
            <div className="bg-muted p-3 rounded border">
              <strong>Review Abuse (Medium)</strong>
              <br />Penalty: -15 points, Auto-suspend: No
            </div>
            <div className="bg-muted p-3 rounded border">
              <strong>Repeated Offenses (Critical)</strong>
              <br />Penalty: -50 points, Auto-suspend: Indefinite
            </div>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}