"use client";

import { useEffect, useState } from "react";

type SumsubKycImagesResponse = {
  providerId: string;
  sumsubApplicantId: string | null;
  sumsubInspectionId: string | null;
  sumsubCockpitUrl: string | null;
  items: Array<{
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
    imageUrl: string;
    previewUrl: string | null;
  }>;
  totalItems: number;
};

export function AdminProviderKycDocuments({ providerId }: { providerId: string }) {
  const [data, setData] = useState<SumsubKycImagesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/admin/providers/${encodeURIComponent(providerId)}/kyc/images`, {
          cache: "no-store",
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Request failed (${res.status})`);
        }

        const json = (await res.json()) as SumsubKycImagesResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  if (loading) {
    return <div className="text-muted-foreground">Loading Sumsub documents…</div>;
  }

  if (error) {
    return <div className="text-muted-foreground">Sumsub documents: unable to load</div>;
  }

  if (!data) {
    return <div className="text-muted-foreground">Sumsub documents: —</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-muted-foreground">Sumsub documents</div>
        {data.sumsubCockpitUrl ? (
          <a href={data.sumsubCockpitUrl} target="_blank" rel="noreferrer" className="hover:underline">
            Open in Sumsub
          </a>
        ) : data.sumsubApplicantId ? (
          <span className="text-muted-foreground">Applicant: {data.sumsubApplicantId}</span>
        ) : null}
      </div>

      {data.items.length === 0 ? (
        <div className="text-muted-foreground">—</div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {data.items.map((item) => {
            const labelParts = [item.idDocDef?.idDocType, item.idDocDef?.idDocSubType].filter(Boolean);
            const label = labelParts.length ? labelParts.join(" ") : "Document";

            const thumbSrc = item.previewUrl ?? item.imageUrl;

            return (
              <div key={item.id} className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbSrc}
                  alt={label}
                  className="h-12 w-20 rounded border object-cover"
                />
                <div className="space-y-1">
                  <div className="text-muted-foreground">{label}</div>
                  <a href={item.imageUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    Open
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
