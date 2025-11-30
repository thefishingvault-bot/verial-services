import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { riskRules } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const user = await currentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireAdmin(user.id);

    const { ruleId } = await params;
    const body = await request.json();
    const { name, incidentType, severity, trustScorePenalty, autoSuspend, suspendDurationDays } = body;

    // Validate required fields
    if (!name || !incidentType || !severity) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate severity
    if (!["low", "medium", "high", "critical"].includes(severity)) {
      return NextResponse.json({ error: "Invalid severity level" }, { status: 400 });
    }

    // Check if rule exists
    const existingRule = await db
      .select()
      .from(riskRules)
      .where(eq(riskRules.id, ruleId))
      .limit(1);

    if (existingRule.length === 0) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    // Update the rule
    await db
      .update(riskRules)
      .set({
        name,
        incidentType,
        severity,
        trustScorePenalty: trustScorePenalty || 0,
        autoSuspend: autoSuspend || false,
        suspendDurationDays: suspendDurationDays || null,
        updatedAt: new Date(),
      })
      .where(eq(riskRules.id, ruleId));

    // Redirect back to the rules page
    return NextResponse.redirect(new URL("/dashboard/admin/trust/rules", request.url));
  } catch (error) {
    console.error("Error updating risk rule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}