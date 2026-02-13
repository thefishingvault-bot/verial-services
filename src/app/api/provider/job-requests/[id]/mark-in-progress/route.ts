import { POST as lifecyclePost } from "@/app/api/job-requests/[jobId]/lifecycle/route";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = new Request("http://internal.local/lifecycle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "in_progress" }),
  });

  return lifecyclePost(req, { params: Promise.resolve({ jobId: id }) });
}
