import crypto from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { ProviderIdSchema, invalidResponse, parseParams } from "@/lib/validation/admin";
import { sumsubRequest } from "@/lib/sumsub";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ImageIdSchema = z.object({ imageId: z.string().min(1) });

function getSumsubConfig() {
  const appToken = process.env.SUMSUB_APP_TOKEN;
  const secretKey = process.env.SUMSUB_SECRET_KEY;
  const baseUrl = process.env.SUMSUB_BASE_URL || "https://api.sumsub.com";

  if (!appToken || !secretKey) {
    throw new Error("SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY environment variables are not set");
  }

  return { appToken, secretKey, baseUrl };
}

function createSignature(params: {
  ts: number;
  method: string;
  pathWithQuery: string;
  body?: string;
  secretKey: string;
}): string {
  const { ts, method, pathWithQuery, body, secretKey } = params;

  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(String(ts));
  hmac.update(method.toUpperCase());
  hmac.update(pathWithQuery);
  if (body) {
    hmac.update(body);
  }
  return hmac.digest("hex");
}

async function resolveInspectionId(providerId: string): Promise<{ userId: string; inspectionId: string | null }> {
  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, providerId),
    columns: { id: true, userId: true, sumsubApplicantId: true, sumsubInspectionId: true },
  });

  if (!provider) {
    return { userId: "", inspectionId: null };
  }

  let inspectionId = provider.sumsubInspectionId ?? null;

  if (!inspectionId) {
    try {
      const applicant = await sumsubRequest<{ id?: string; inspectionId?: string }>({
        method: "GET",
        pathWithQuery: `/resources/applicants/-;externalUserId=${encodeURIComponent(provider.userId)}/one`,
      });

      if (typeof applicant?.inspectionId === "string" && applicant.inspectionId.trim()) {
        inspectionId = applicant.inspectionId;
      }

      // Store best-effort IDs for later.
      const applicantId = typeof applicant?.id === "string" && applicant.id.trim() ? applicant.id : null;
      if (inspectionId || applicantId) {
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
      // ignore
    }
  }

  return { userId: provider.userId, inspectionId };
}

export async function GET(_req: Request, { params }: { params: Promise<{ providerId: string; imageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.isAdmin) return admin.response;

  const rawParams = await params;
  const parsedProvider = parseParams(ProviderIdSchema, rawParams);
  if (!parsedProvider.ok) return invalidResponse(parsedProvider.error);

  const parsedImage = ImageIdSchema.safeParse({ imageId: rawParams.imageId });
  if (!parsedImage.success) return invalidResponse(parsedImage.error.flatten());

  const { providerId } = parsedProvider.data;
  const { imageId } = parsedImage.data;

  const ids = await resolveInspectionId(providerId);
  if (!ids.userId) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  if (!ids.inspectionId) {
    return NextResponse.json({ error: "Sumsub inspectionId not available" }, { status: 409 });
  }

  const pathWithQuery = `/resources/inspections/${encodeURIComponent(ids.inspectionId)}/resources/${encodeURIComponent(imageId)}`;

  const { appToken, secretKey, baseUrl } = getSumsubConfig();
  const ts = Math.floor(Date.now() / 1000);
  const signature = createSignature({ ts, method: "GET", pathWithQuery, secretKey });

  const response = await fetch(`${baseUrl}${pathWithQuery}`, {
    method: "GET",
    headers: {
      Accept: "*/*",
      "X-App-Token": appToken,
      "X-App-Access-Ts": String(ts),
      "X-App-Access-Sig": signature,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return NextResponse.json(
      { error: "Sumsub image fetch failed", status: response.status, details: text || undefined },
      { status: 502 },
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "application/octet-stream";

  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}
