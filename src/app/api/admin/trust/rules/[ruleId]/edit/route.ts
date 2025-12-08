import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { riskRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { RuleIdSchema, TrustRuleSchema, invalidResponse, parseBody, parseParams } from "@/lib/validation/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedParams = parseParams(RuleIdSchema, await params);
    if (!parsedParams.ok) return invalidResponse(parsedParams.error);

    const parsedBody = await parseBody(TrustRuleSchema, request);
    if (!parsedBody.ok) return invalidResponse(parsedBody.error);

    // Check if rule exists
    const existingRule = await db
      .select()
      .from(riskRules)
      .where(eq(riskRules.id, parsedParams.data.ruleId))
      .limit(1);

    if (existingRule.length === 0) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    // Update the rule
    await db
      .update(riskRules)
      .set({
        name: parsedBody.data.name,
        incidentType: parsedBody.data.incidentType,
        severity: parsedBody.data.severity,
        trustScorePenalty: parsedBody.data.trustScorePenalty,
        autoSuspend: parsedBody.data.autoSuspend,
        suspendDurationDays: parsedBody.data.suspendDurationDays,
        updatedAt: new Date(),
      })
      .where(eq(riskRules.id, parsedParams.data.ruleId));

    // Redirect back to the rules page
    return NextResponse.redirect(new URL("/dashboard/admin/trust/rules", request.url));
  } catch (error) {
    console.error("Error updating risk rule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}