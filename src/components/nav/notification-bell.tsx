"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { Bell, Package } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  message: string;
  actionUrl?: string | null;
  href?: string | null;
  isRead: boolean;
  createdAt: string;
  bookingId?: string | null;
  type?: string | null;
}

function isMeaningfulUrl(url: string | null | undefined) {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  // Treat the default as "not meaningful" for navigation.
  if (trimmed === "/dashboard") return false;
  if (trimmed === "/dashboard/provider") return false;
  // Legacy route used by older provider flows; providers may be redirected away from it.
  if (trimmed === "/dashboard/bookings/provider") return false;
  return true;
}

function getNotificationTarget(notification: Notification, isProviderDashboard: boolean): string | null {
  if (isMeaningfulUrl(notification.actionUrl)) return notification.actionUrl as string;
  if (isMeaningfulUrl(notification.href)) return notification.href as string;

  const bookingId = typeof notification.bookingId === "string" ? notification.bookingId : null;
  if (!bookingId) return null;

  const title = `${notification.title ?? ""} ${notification.message ?? ""} ${notification.body ?? ""}`.toLowerCase();
  const looksLikeReschedule = title.includes("reschedule");

  if (isProviderDashboard) {
    if (notification.type === "message") return `/dashboard/provider/messages/${bookingId}`;
    if (looksLikeReschedule) return `/dashboard/provider/bookings/${bookingId}?focus=reschedule`;
    return `/dashboard/provider/bookings/${bookingId}`;
  }

  if (notification.type === "message") return `/dashboard/messages/${bookingId}`;
  if (looksLikeReschedule) return `/dashboard/bookings/${bookingId}?focus=reschedule`;
  return `/dashboard/bookings/${bookingId}`;
}

export function NotificationBell() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const role = (user?.publicMetadata as Record<string, unknown>)?.role as string | undefined;
  const isProviderUser = role === "provider" || role === "admin";
  const isProviderContext = isProviderUser || (pathname?.startsWith("/dashboard/provider") ?? false);
  const viewAllHref = isProviderContext ? "/dashboard/provider/notifications" : "/dashboard/notifications";

  const fetchUnreadCount = () => {
    fetch("/api/notifications/unread-count")
      .then((res) => res.json())
      .then((data: { count?: number }) => setUnreadCount(Number(data?.count ?? 0)))
      .catch(() => {
        // ignore
      });
  };

  const fetchNotifications = () => {
    setIsLoading(true);
    fetch("/api/notifications/list?limit=10")
      .then((res) => res.json())
      .then((data: { items: Notification[] }) => {
        setNotifications(data.items || []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  };

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isSignedIn && isOpen) {
      fetchNotifications();
      fetchUnreadCount();
    }
    if (isSignedIn && !isOpen && notifications.length === 0) {
      fetchNotifications();
      fetchUnreadCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, isOpen]);

  const markAsRead = async (ids: string[]) => {
    setNotifications((prev) => {
      let unreadInBatch = 0;
      const next = prev.map((n) => {
        if (!ids.includes(n.id)) return n;
        if (!n.isRead) unreadInBatch += 1;
        return { ...n, isRead: true };
      });
      if (unreadInBatch > 0) {
        setUnreadCount((count) => Math.max(0, count - unreadInBatch));
      }
      return next;
    });

    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds: ids }),
    });
  };

  const handleNotificationClick = (notification: Notification, target: string) => {
    setIsOpen(false);
    if (!notification.isRead) {
      void markAsRead([notification.id]);
    }

    router.push(target);
  };

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications/mark-all", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  if (!isSignedIn) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `You have ${unreadCount} unread notifications`
              : "No new notifications"
          }
        >
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
          )}
          <Bell className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
          <h4 className="text-sm font-semibold">Notifications</h4>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
              onClick={fetchNotifications}
            >
              Refresh
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
                onClick={handleMarkAllRead}
              >
                Mark all read
              </Button>
            )}
          </div>
        </div>
        <div className="max-h-75 overflow-y-auto">
          {isLoading && (
            <p className="py-4 text-center text-xs text-muted-foreground">Loading...</p>
          )}
          {!isLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <Package className="mb-2 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          )}
          {!isLoading &&
            notifications.map((notif) => (
              <button
                key={notif.id}
                type="button"
                onClick={() => {
                  const target = getNotificationTarget(notif, isProviderContext);
                  if (!target) return;
                  handleNotificationClick(notif, target);
                }}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 border-b p-4 text-sm last:border-0 transition-colors",
                  notif.isRead
                    ? "bg-background hover:bg-muted/50"
                    : "bg-primary/5 hover:bg-primary/10",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <p
                      className={cn(
                        "leading-tight",
                        !notif.isRead && "font-medium text-foreground",
                      )}
                    >
                      {notif.title || notif.message}
                    </p>
                    {notif.body && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{notif.body}</p>
                    )}
                  </div>
                  {!notif.isRead && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isHydrated
                    ? formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })
                    : ""}
                </p>
              </button>
            ))}
        </div>
        <div className="border-t bg-muted/40 px-4 py-2 text-right">
          <Button
            variant="link"
            size="sm"
            className="px-0 text-xs"
            onClick={() => {
              setIsOpen(false);
              router.push(viewAllHref);
            }}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

