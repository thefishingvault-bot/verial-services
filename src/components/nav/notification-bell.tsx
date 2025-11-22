"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Bell, Package } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  message: string;
  href: string;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const { isSignedIn } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const fetchNotifications = () => {
    setIsLoading(true);
    fetch("/api/notifications/list")
      .then((res) => res.json())
      .then((data: Notification[]) => {
        setNotifications(data);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  };

  useEffect(() => {
    if (isSignedIn && isOpen) {
      fetchNotifications();
    }
    if (isSignedIn && !isOpen && notifications.length === 0) {
      fetchNotifications();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, isOpen]);

  const markAsRead = async (ids: string[]) => {
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n)),
    );

    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds: ids }),
    });
  };

  const handleNotificationClick = async (notification: Notification) => {
    setIsOpen(false);
    if (!notification.isRead) {
      await markAsRead([notification.id]);
    }
    if (notification.href) {
      window.location.href = notification.href;
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length > 0) {
      await markAsRead(unreadIds);
    }
  };

  if (!isSignedIn) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

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
            <span className="absolute right-1.5 top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-background" />
          )}
          <Bell className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b bg-gray-50/50 px-4 py-3">
          <h4 className="text-sm font-semibold">Notifications</h4>
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
        <div className="max-h-[300px] overflow-y-auto">
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
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 border-b p-4 text-sm last:border-0 transition-colors",
                  notif.isRead ? "bg-white hover:bg-gray-50" : "bg-blue-50/50 hover:bg-blue-50",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={cn(
                      "leading-tight",
                      !notif.isRead && "font-medium text-foreground",
                    )}
                  >
                    {notif.message}
                  </p>
                  {!notif.isRead && (
                    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-600" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                </p>
              </div>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

