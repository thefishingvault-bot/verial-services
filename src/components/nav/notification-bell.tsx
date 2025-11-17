"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, Package } from "lucide-react";
import { useAuth } from "@clerk/nextjs";

interface Notification {
  id: string;
  message: string;
  href: string;
  createdAt: string;
}

export function NotificationBell() {
  const { isSignedIn } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !isOpen) return;

    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);

      void fetch("/api/notifications/list")
        .then((res) => {
          if (!res.ok) return [] as Notification[];
          return res.json() as Promise<Notification[]>;
        })
        .then((data) => {
          setNotifications(data);
          setIsLoading(false);
        })
        .catch((error) => {
          console.error("[NotificationBell] Failed to load notifications", error);
          setIsLoading(false);
        });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isSignedIn, isOpen]);

  const markAsRead = async (): Promise<void> => {
    if (notifications.length === 0) return;

    const idsToMark = notifications.map((n) => n.id);
    setNotifications([]); // Optimistically clear

    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds: idsToMark }),
      });
    } catch (error) {
      console.error("[NotificationBell] Failed to mark notifications as read", error);
    }
  };

  if (!isSignedIn) return null;

  const unreadCount = notifications.length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          <Bell className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-sm font-medium">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={markAsRead}
            >
              Mark all as read
            </Button>
          )}
        </div>
        <div className="space-y-4">
          {isLoading && (
            <p className="text-center text-sm text-muted-foreground">Loading...</p>
          )}
          {!isLoading && unreadCount === 0 && (
            <div className="flex flex-col items-center justify-center p-4 text-center">
              <Package className="mb-2 h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No new notifications</p>
            </div>
          )}
          {!isLoading && unreadCount > 0 &&
            notifications.map((notif) => (
              <Link
                key={notif.id}
                href={notif.href}
                className="block rounded-md p-2 hover:bg-accent"
                onClick={() => setIsOpen(false)}
              >
                <p className="text-sm font-medium">{notif.message}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(notif.createdAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

