import { db } from "@/lib/db";
import { riskRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save } from "lucide-react";
import { parseParamsOrNotFound, RuleIdParamSchema } from "@/lib/validation/admin-loader-schemas";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

interface EditRiskRulePageProps {
  params: Promise<{ ruleId: string }>;
}

export default async function EditRiskRulePage({ params }: EditRiskRulePageProps) {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect("/dashboard");

  const { ruleId } = parseParamsOrNotFound(RuleIdParamSchema, await params);

  // Fetch the rule
  const rule = await db
    .select()
    .from(riskRules)
    .where(eq(riskRules.id, ruleId))
    .limit(1);

  if (rule.length === 0) {
    notFound();
  }

  const ruleData = rule[0];

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/admin/trust/rules">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Rules
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Risk Rule</h1>
            <p className="text-muted-foreground mt-2">
              Modify the configuration for this risk rule.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Rule Configuration</CardTitle>
          <CardDescription>
            Update how this rule responds to trust incidents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={`/api/admin/trust/rules/${ruleId}/edit`} method="POST" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Rule Name *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={ruleData.name}
                  placeholder="e.g., Customer Complaint (High)"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="incidentType">Incident Type *</Label>
                <select
                  id="incidentType"
                  name="incidentType"
                  required
                  defaultValue={ruleData.incidentType}
                  className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                >
                  <option value="complaint">Customer Complaint</option>
                  <option value="service_violation">Service Violation</option>
                  <option value="review_abuse">Review Abuse</option>
                  <option value="repeated_offenses">Repeated Offenses</option>
                  <option value="payment_issue">Payment Issue</option>
                  <option value="communication_failure">Communication Failure</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="severity">Severity *</Label>
                <select
                  id="severity"
                  name="severity"
                  required
                  defaultValue={ruleData.severity}
                  className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trustScorePenalty">Trust Score Penalty</Label>
                <Input
                  id="trustScorePenalty"
                  name="trustScorePenalty"
                  type="number"
                  defaultValue={ruleData.trustScorePenalty}
                  placeholder="0"
                  min="0"
                  max="100"
                />
                <p className="text-sm text-muted-foreground">
                  Points to deduct from provider&apos;s trust score
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                  <input
                    id="autoSuspend"
                    name="autoSuspend"
                    value="true"
                    type="checkbox"
                    defaultChecked={ruleData.autoSuspend}
                    className="size-4 shrink-0 rounded-[4px] border border-input bg-transparent shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                <Label htmlFor="autoSuspend">Automatically suspend provider</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="suspendDurationDays">Suspension Duration (days)</Label>
                <Input
                  id="suspendDurationDays"
                  name="suspendDurationDays"
                  type="number"
                  defaultValue={ruleData.suspendDurationDays || ""}
                  placeholder="Leave empty for indefinite"
                  min="1"
                />
                <p className="text-sm text-muted-foreground">
                  Number of days to suspend (leave empty for indefinite suspension)
                </p>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit">
                <Save className="mr-2 h-4 w-4" />
                Update Rule
              </Button>
              <Button asChild variant="outline" type="button">
                <Link href="/dashboard/admin/trust/rules">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}