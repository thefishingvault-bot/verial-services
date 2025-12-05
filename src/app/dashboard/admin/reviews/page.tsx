import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { AdminReviewsTable } from "@/components/admin/admin-reviews-table";

export default async function AdminReviewsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/dashboard');
  await requireAdmin(userId);

  return (
    <div className="container mx-auto max-w-5xl py-8 space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Reviews moderation</h1>
        <p className="text-muted-foreground text-sm">
          Hide abusive or low-quality reviews. Visibility updates are immediate.
        </p>
      </div>
      <AdminReviewsTable />
    </div>
  );
}
