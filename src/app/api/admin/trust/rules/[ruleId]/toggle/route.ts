import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { riskRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { RuleIdSchema, invalidResponse, parseParams } from "@/lib/validation/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedParams = parseParams(RuleIdSchema, await params);
    if (!parsedParams.ok) return invalidResponse(parsedParams.error);

    // Get current rule status
    const rule = await db
      .select({ enabled: riskRules.enabled })
      .from(riskRules)
      .where(eq(riskRules.id, parsedParams.data.ruleId))
      .limit(1);

    if (rule.length === 0) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    // Toggle the enabled status
    await db
      .update(riskRules)
      .set({
        enabled: !rule[0].enabled,
        updatedAt: new Date(),
      })
      .where(eq(riskRules.id, parsedParams.data.ruleId));

    // Redirect back to the rules page
    return NextResponse.redirect(new URL("/dashboard/admin/trust/rules", request.url));
  } catch (error) {
    console.error("Error toggling risk rule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}