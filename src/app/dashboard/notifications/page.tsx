import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { listNotifications } from "@/lib/notifications";
import { NotificationsFeed } from "@/components/notifications/notifications-feed";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
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
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Inbox</p>
          <h1 className="text-2xl font-semibold">Notifications</h1>
        </div>
      </div>
      <NotificationsFeed
        initialNotifications={serialized}
        initialNextCursor={initial.nextCursor}
      />
    </div>
  );
}
