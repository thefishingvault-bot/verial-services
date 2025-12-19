import { notFound } from 'next/navigation';
import Link from 'next/link';
import { assertAdminOrThrow } from '@/lib/admin-auth';
import { SignOutAction } from '@/components/auth/sign-out-button';
import { Button } from '@/components/ui/button';

// This is a Server Component layout
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertAdminOrThrow().catch((res) => {
    if (res instanceof Response) notFound();
    throw res;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/admin">Back to Dashboard</Link>
          </Button>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>
        <SignOutAction />
      </div>
      <div className="border-t pt-6">
        {children}
      </div>
    </div>
  );
}

