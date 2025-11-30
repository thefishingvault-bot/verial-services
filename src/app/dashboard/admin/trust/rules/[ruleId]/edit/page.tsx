import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { riskRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Save } from "lucide-react";

interface EditRiskRulePageProps {
  params: Promise<{ ruleId: string }>;
}

export default async function EditRiskRulePage({ params }: EditRiskRulePageProps) {
  const user = await currentUser();
  if (!user?.id) {
    redirect("/dashboard");
  }

  try {
    await requireAdmin(user.id);
  } catch {
    redirect("/dashboard");
  }

  const { ruleId } = await params;

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
                <Select name="incidentType" defaultValue={ruleData.incidentType} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select incident type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="complaint">Customer Complaint</SelectItem>
                    <SelectItem value="service_violation">Service Violation</SelectItem>
                    <SelectItem value="review_abuse">Review Abuse</SelectItem>
                    <SelectItem value="repeated_offenses">Repeated Offenses</SelectItem>
                    <SelectItem value="payment_issue">Payment Issue</SelectItem>
                    <SelectItem value="communication_failure">Communication Failure</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="severity">Severity *</Label>
                <Select name="severity" defaultValue={ruleData.severity} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
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
                <Checkbox
                  id="autoSuspend"
                  name="autoSuspend"
                  defaultChecked={ruleData.autoSuspend}
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