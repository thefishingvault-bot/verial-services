import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { providers, providerSuspensions, riskRules, trustIncidents } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { penaltyToTrustScoreImpact } from "@/lib/format/penalty";
import { ensureUserExistsInDb } from "@/lib/user-sync";
import { TrustIncidentCreateSchema, invalidResponse, parseBody } from "@/lib/validation/admin";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

    await ensureUserExistsInDb(userId!, "admin");

    const parsedBody = await parseBody(TrustIncidentCreateSchema, request);
    if (!parsedBody.ok) return invalidResponse(parsedBody.error);

    const providerRows = await db
      .select({
        id: providers.id,
        isSuspended: providers.isSuspended,
      })
      .from(providers)
      .where(eq(providers.id, parsedBody.data.providerId))
      .limit(1);

    const provider = providerRows[0];
    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const matchingRules = await db
      .select()
      .from(riskRules)
      .where(
        and(
          eq(riskRules.enabled, true),
          eq(riskRules.incidentType, parsedBody.data.incidentType),
          eq(riskRules.severity, parsedBody.data.severity),
        ),
      )
      .limit(10);

    // If multiple rules match, pick the one with the largest penalty.
    const selectedRule = matchingRules.reduce<typeof matchingRules[number] | null>((best, current) => {
      if (!best) return current;
      return (current.trustScorePenalty ?? 0) > (best.trustScorePenalty ?? 0) ? current : best;
    }, null);

    const trustScoreImpact = selectedRule ? penaltyToTrustScoreImpact(selectedRule.trustScorePenalty) : 0;

    const incidentId = `tincident_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    await db.insert(trustIncidents).values({
      id: incidentId,
      providerId: parsedBody.data.providerId,
      incidentType: parsedBody.data.incidentType,
      severity: parsedBody.data.severity,
      description: parsedBody.data.description,
      reportedBy: userId!,
      bookingId: parsedBody.data.bookingId,
      trustScoreImpact,
      resolved: false,
    });

    if (selectedRule?.autoSuspend && !provider.isSuspended) {
      const now = new Date();
      const endDate =
        selectedRule.suspendDurationDays && selectedRule.suspendDurationDays > 0
          ? new Date(now.getTime() + selectedRule.suspendDurationDays * 24 * 60 * 60 * 1000)
          : null;

      await db
        .update(providers)
        .set({
          isSuspended: true,
          suspensionReason: `Auto-suspended by risk rule: ${selectedRule.name}`,
          suspensionStartDate: now,
          suspensionEndDate: endDate,
          updatedAt: now,
        })
        .where(eq(providers.id, parsedBody.data.providerId));

      await db.insert(providerSuspensions).values({
        id: `psusp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        providerId: parsedBody.data.providerId,
        action: "suspend",
        reason: `Auto-suspended by risk rule: ${selectedRule.name}`,
        startDate: now,
        endDate,
        performedBy: userId!,
      });
    }

    return NextResponse.json(
      {
        id: incidentId,
        appliedRiskRuleId: selectedRule?.id ?? null,
        trustScoreImpact,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating trust incident:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}