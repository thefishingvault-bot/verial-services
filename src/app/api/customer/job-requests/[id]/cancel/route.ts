import { POST as basePost } from "@/app/api/job-requests/[jobId]/cancel/route";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return basePost(req, { params: Promise.resolve({ jobId: id }) });
}
