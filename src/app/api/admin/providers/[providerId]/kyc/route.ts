import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { adminAuditLogs, providers } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureUserExistsInDb } from "@/lib/user-sync";
import {
  ProviderIdSchema,
  ProviderKycMutationSchema,
  invalidResponse,
  parseBody,
  parseParams,
} from "@/lib/validation/admin";

function makeAuditId() {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    await ensureUserExistsInDb(admin.userId, "admin");

    const parsedParams = parseParams(ProviderIdSchema, await params);
    if (!parsedParams.ok) return invalidResponse(parsedParams.error);

    const parsedBody = await parseBody(ProviderKycMutationSchema, req);
    if (!parsedBody.ok) return invalidResponse(parsedBody.error);

    const providerId = parsedParams.data.providerId;
    const { action, kycStatus, reason, adminNotes } = parsedBody.data;

    if (action !== "set_status") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const now = new Date();

    const updated = await db.transaction(async (tx) => {
      const prior = await tx
        .select({ id: providers.id, kycStatus: providers.kycStatus })
        .from(providers)
        .where(eq(providers.id, providerId))
        .limit(1);

      const current = prior[0];
      if (!current) {
        return { ok: false as const, status: 404 as const, body: { error: "Provider not found" } };
      }

      const [row] = await tx
        .update(providers)
        .set({
          kycStatus,
          kycVerifiedAt: kycStatus === "verified" ? now : null,
          updatedAt: now,
        })
        .where(eq(providers.id, providerId))
        .returning({
          id: providers.id,
          kycStatus: providers.kycStatus,
          kycVerifiedAt: providers.kycVerifiedAt,
          updatedAt: providers.updatedAt,
        });

      if (!row) {
        return { ok: false as const, status: 404 as const, body: { error: "Provider not found" } };
      }

      await tx.insert(adminAuditLogs).values({
        id: makeAuditId(),
        userId: admin.userId,
        action: "PROVIDER_KYC_SET_STATUS",
        resource: "provider",
        resourceId: providerId,
        details: JSON.stringify({
          action: "set_status",
          from: current.kycStatus,
          to: kycStatus,
          reason: reason ?? null,
          adminNotes: adminNotes ?? null,
        }),
      });

      return { ok: true as const, row };
    });

    if (!updated.ok) {
      return NextResponse.json(updated.body, { status: updated.status });
    }

    return NextResponse.json(updated.row);
  } catch (error) {
    console.error("[API_ADMIN_PROVIDER_KYC_PATCH]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
