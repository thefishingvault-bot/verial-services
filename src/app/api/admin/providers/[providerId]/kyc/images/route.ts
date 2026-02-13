import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { ProviderIdSchema, invalidResponse, parseParams } from "@/lib/validation/admin";
import { safeSumsubRequest } from "@/lib/sumsub";

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
    const applicant = await safeSumsubRequest<{ id?: string; inspectionId?: string }>({
      context: "API_ADMIN_PROVIDER_KYC_IMAGES_RESOLVE_IDS",
      method: "GET",
      pathWithQuery: `/resources/applicants/-;externalUserId=${encodeURIComponent(provider.userId)}/one`,
      extraLogFields: { providerId, userId: provider.userId },
    });

    if (applicant.ok) {
      if (!applicantId && typeof applicant.data?.id === "string" && applicant.data.id.trim()) {
        applicantId = applicant.data.id;
      }

      if (
        !inspectionId &&
        typeof applicant.data?.inspectionId === "string" &&
        applicant.data.inspectionId.trim()
      ) {
        inspectionId = applicant.data.inspectionId;
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

  const metadata = await safeSumsubRequest<{ items?: SumsubImageItem[]; totalItems?: number }>({
    context: "API_ADMIN_PROVIDER_KYC_IMAGES_LIST",
    method: "GET",
    pathWithQuery: `/resources/applicants/${encodeURIComponent(ids.applicantId)}/metadata/resources`,
    extraLogFields: { providerId, applicantId: ids.applicantId },
  });

  if (!metadata.ok) {
    return NextResponse.json(
      {
        error: metadata.error,
        message: "Failed to load Sumsub KYC images",
        kind: metadata.kind,
        statusCode: metadata.statusCode,
      },
      { status: 502 },
    );
  }

  const items = (metadata.data.items ?? []).map((item) => {
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
    totalItems: Number(metadata.data.totalItems ?? items.length),
  });
}
