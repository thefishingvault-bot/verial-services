import { UserButton } from "@clerk/nextjs";

export default function DashboardPage() {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Verial Dashboard</h1>
        <UserButton afterSignOutUrl="/" />
      </div>
      <p className="mt-4">Welcome to your dashboard.</p>
    </div>
  );
}

