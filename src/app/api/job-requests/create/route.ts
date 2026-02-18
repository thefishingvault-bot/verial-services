import { POST as customerCreatePost } from "@/app/api/customer/job-requests/route";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return customerCreatePost(req);
}
