import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

// This is a Server Component layout
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  // Only enforce that the user is signed in here.
  // Per-page server guards handle admin role checks.
  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      <div className="border-t pt-6">
        {children}
      </div>
    </div>
  );
}

