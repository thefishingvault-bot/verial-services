"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCircle2, Loader2, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  message: string;
  actionUrl: string;
  href: string;
  isRead: boolean;
  createdAt: string;
}

interface Props {
  initialNotifications: NotificationItem[];
  initialNextCursor: string | null;
}

export function NotificationsFeed({ initialNotifications, initialNextCursor }: Props) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const refresh = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/notifications/list?limit=30`);
      const data = await res.json();
      setNotifications(data.items || []);
      setNextCursor(data.nextCursor ?? null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/notifications/list?cursor=${encodeURIComponent(nextCursor)}&limit=20`,
      );
      const data = await res.json();
      setNotifications((prev) => [...prev, ...(data.items || [])]);
      setNextCursor(data.nextCursor ?? null);
    } finally {
      setIsLoading(false);
    }
  };

  const markAllRead = async () => {
    setIsMarking(true);
    await fetch("/api/notifications/mark-all", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setIsMarking(false);
  };

  const markOneRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds: [id] }),
    });
  };

  const handleOpen = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      await markOneRead(notification.id);
    }
    const target = notification.actionUrl || notification.href;
    if (target) {
      window.location.href = target;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Your notifications</CardTitle>
            <p className="text-sm text-muted-foreground">
              Stay on top of bookings, payments, and account updates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={refresh} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              disabled={isMarking || unreadCount === 0}
            >
              {isMarking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Mark all read
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground/40" />
              <div>
                <p className="font-medium">You're all caught up</p>
                <p className="text-sm text-muted-foreground">
                  New updates will show up here as they arrive.
                </p>
              </div>
            </div>
          ) : null}

          <div className="divide-y rounded-md border">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                  notif.isRead ? "bg-white hover:bg-gray-50" : "bg-blue-50/60 hover:bg-blue-50",
                )}
                onClick={() => handleOpen(notif)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpen(notif);
                  }
                }}
              >
                <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-sm", !notif.isRead && "font-semibold text-foreground")}>
                      {notif.title || notif.message}
                    </p>
                    {!notif.isRead ? <span className="h-2 w-2 rounded-full bg-blue-600" /> : null}
                  </div>
                  {notif.body && <p className="text-sm text-muted-foreground">{notif.body}</p>}
                  <p className="text-xs text-muted-foreground">
                    {isHydrated
                      ? formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })
                      : ""}
                  </p>
                </div>
                {!notif.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      markOneRead(notif.id);
                    }}
                  >
                    Mark read
                  </Button>
                )}
              </div>
            ))}
          </div>

          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <Button onClick={loadMore} disabled={isLoading} variant="outline">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
