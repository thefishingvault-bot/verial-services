import { notFound } from 'next/navigation';
import { assertAdminOrThrow } from '@/lib/admin-auth';
import { AdminHeader } from '@/components/admin/admin-header';

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
      <AdminHeader />
      <div className="border-t pt-6">
        {children}
      </div>
    </div>
  );
}

