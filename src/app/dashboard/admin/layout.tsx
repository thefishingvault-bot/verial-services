import { notFound } from 'next/navigation';
import { assertAdminOrThrow } from '@/lib/admin-auth';

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
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      <div className="border-t pt-6">
        {children}
      </div>
    </div>
  );
}

