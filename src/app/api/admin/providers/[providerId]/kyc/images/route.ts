import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { ProviderIdSchema, invalidResponse, parseParams } from "@/lib/validation/admin";
import { sumsubRequest } from "@/lib/sumsub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SumsubImageItem = {
  id: string;
  previewId?: string;
  addedDate?: string;
  fileMetadata?: {
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    resolution?: { width?: number; height?: number };
  };
  idDocDef?: {
    country?: string;
    idDocType?: string;
    idDocSubType?: string | null;
  };
  reviewResult?: {
    reviewAnswer?: string;
    reviewRejectType?: string;
    moderationComment?: string;
    clientComment?: string;
    rejectLabels?: string[];
  };
  attemptId?: string;
  source?: string;
  deactivated?: boolean;
};

async function resolveSumsubIdsForProvider(providerId: string): Promise<{
  userId: string;
  applicantId: string | null;
  inspectionId: string | null;
}> {
  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, providerId),
    columns: {
      id: true,
      userId: true,
      sumsubApplicantId: true,
      sumsubInspectionId: true,
    },
  });

  if (!provider) {
    return { userId: "", applicantId: null, inspectionId: null };
  }

  let applicantId = provider.sumsubApplicantId ?? null;
  let inspectionId = provider.sumsubInspectionId ?? null;

  if (!applicantId || !inspectionId) {
    try {
      const applicant = await sumsubRequest<{ id?: string; inspectionId?: string }>({
        method: "GET",
        pathWithQuery: `/resources/applicants/-;externalUserId=${encodeURIComponent(provider.userId)}/one`,
      });

      if (!applicantId && typeof applicant?.id === "string" && applicant.id.trim()) {
        applicantId = applicant.id;
      }

      if (!inspectionId && typeof applicant?.inspectionId === "string" && applicant.inspectionId.trim()) {
        inspectionId = applicant.inspectionId;
      }

      if ((applicantId && applicantId !== provider.sumsubApplicantId) || (inspectionId && inspectionId !== provider.sumsubInspectionId)) {
        await db
          .update(providers)
          .set({
            sumsubApplicantId: applicantId ?? provider.sumsubApplicantId,
            sumsubInspectionId: inspectionId ?? provider.sumsubInspectionId,
            updatedAt: new Date(),
          })
          .where(eq(providers.id, providerId));
      }
    } catch {
      // Best-effort: leave as nulls.
    }
  }

  return { userId: provider.userId, applicantId, inspectionId };
}

export async function GET(_req: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.isAdmin) return admin.response;

  const parsedParams = parseParams(ProviderIdSchema, await params);
  if (!parsedParams.ok) return invalidResponse(parsedParams.error);

  const { providerId } = parsedParams.data;

  const ids = await resolveSumsubIdsForProvider(providerId);
  if (!ids.userId) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  if (!ids.applicantId) {
    return NextResponse.json({
      providerId,
      sumsubApplicantId: null,
      sumsubInspectionId: ids.inspectionId,
      sumsubCockpitUrl: null,
      items: [] as Array<SumsubImageItem & { imageUrl: string; previewUrl: string | null }>,
      totalItems: 0,
    });
  }

  const metadata = await sumsubRequest<{ items?: SumsubImageItem[]; totalItems?: number }>({
    method: "GET",
    pathWithQuery: `/resources/applicants/${encodeURIComponent(ids.applicantId)}/metadata/resources`,
  });

  const items = (metadata.items ?? []).map((item) => {
    const previewUrl = item.previewId
      ? `/api/admin/providers/${encodeURIComponent(providerId)}/kyc/images/${encodeURIComponent(item.previewId)}`
      : null;

    return {
      ...item,
      imageUrl: `/api/admin/providers/${encodeURIComponent(providerId)}/kyc/images/${encodeURIComponent(item.id)}`,
      previewUrl,
    };
  });

  return NextResponse.json({
    providerId,
    sumsubApplicantId: ids.applicantId,
    sumsubInspectionId: ids.inspectionId,
    sumsubCockpitUrl: `https://cockpit.sumsub.com/checkus/#/applicants/${encodeURIComponent(ids.applicantId)}`,
    items,
    totalItems: Number(metadata.totalItems ?? items.length),
  });
}
