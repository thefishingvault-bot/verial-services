import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

// This is a Server Component layout
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.publicMetadata.role === 'admin';

  if (!isAdmin) {
    // Not an admin, send them back to the main dashboard
    redirect('/dashboard');
  }

  // Admin is verified, render the admin pages
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      {/* We can add admin-specific navigation here later */}
      <div className="border-t pt-6">
        {children}
      </div>
    </div>
  );
}

