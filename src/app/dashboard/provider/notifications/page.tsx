import { auth } from "@clerk/nextjs/server";
import { requireProvider } from "@/lib/auth-guards";
import { listNotifications } from "@/lib/notifications";
import { NotificationsFeed } from "@/components/notifications/notifications-feed";

export const dynamic = "force-dynamic";

export default async function ProviderNotificationsPage() {
  await requireProvider();

  const { userId } = await auth();
  if (!userId) {
    // requireProvider should already enforce this, but guard defensively
    throw new Error("User not authenticated");
  }

  const initial = await listNotifications({ userId, limit: 30 });
  const serialized = initial.items.map((item) => ({
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? String(item.createdAt),
  }));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Provider inbox</p>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Updates about your bookings, payouts, messages, and trust actions.
          </p>
        </div>
      </div>
      <NotificationsFeed
        initialNotifications={serialized}
        initialNextCursor={initial.nextCursor}
      />
    </div>
  );
}

