"use client";

import { useState, useEffect, useRef } from 'react';
import { Bell, X, AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';

export interface NotificationItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  actionText?: string;
}

interface RealTimeNotificationsProps {
  notifications: NotificationItem[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onAction?: (notification: NotificationItem) => void;
}

export function RealTimeNotifications({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onAction
}: RealTimeNotificationsProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [currentToast, setCurrentToast] = useState<NotificationItem | null>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const lastShownToastRef = useRef<string | null>(null);

  // Show toast for new notifications
  useEffect(() => {
    const latestUnread = notifications.find(n => !n.read);
    if (latestUnread && !showToast && lastShownToastRef.current !== latestUnread.id) {
      lastShownToastRef.current = latestUnread.id;
      setCurrentToast(latestUnread);
      setShowToast(true);

      // Auto-hide toast after 5 seconds
      const timer = setTimeout(() => {
        setShowToast(false);
        setCurrentToast(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [notifications]);

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getToastStyles = (type: NotificationItem['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  return (
    <>
      {/* Notification Bell */}
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md"
        >
          <Bell className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {showDropdown && (
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg z-50 border">
            <div className="p-4 border-b">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllAsRead}
                    className="text-sm text-blue-600 hover:text-blue-900"
                  >
                    Mark all read
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No notifications
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 border-b hover:bg-gray-50 ${
                      !notification.read ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        {getIcon(notification.type)}
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-gray-900">
                              {notification.title}
                            </h4>
                            <div className="flex items-center space-x-2">
                              {!notification.read && (
                                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                              )}
                              <button
                                onClick={() => onDismiss(notification.id)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {notification.message}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">
                              {notification.timestamp.toLocaleTimeString()}
                            </span>
                            <div className="flex space-x-2">
                              {notification.actionUrl && notification.actionText && (
                                <button
                                  onClick={() => onAction?.(notification)}
                                  className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                                >
                                  {notification.actionText}
                                </button>
                              )}
                              {!notification.read && (
                                <button
                                  onClick={() => onMarkAsRead(notification.id)}
                                  className="text-xs text-blue-600 hover:text-blue-900"
                                >
                                  Mark read
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {showToast && currentToast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className={`max-w-sm w-full shadow-lg rounded-lg border p-4 ${getToastStyles(currentToast.type)}`}>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                {getIcon(currentToast.type)}
              </div>
              <div className="ml-3 w-0 flex-1">
                <p className="text-sm font-medium">
                  {currentToast.title}
                </p>
                <p className="mt-1 text-sm">
                  {currentToast.message}
                </p>
                <div className="mt-3 flex">
                  {currentToast.actionUrl && currentToast.actionText && (
                    <button
                      onClick={() => {
                        onAction?.(currentToast);
                        setShowToast(false);
                      }}
                      className="text-sm bg-white bg-opacity-20 hover:bg-opacity-30 px-3 py-1 rounded mr-2"
                    >
                      {currentToast.actionText}
                    </button>
                  )}
                  <button
                    onClick={() => setShowToast(false)}
                    className="text-sm text-current hover:text-opacity-75"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="ml-4 flex-shrink-0 flex">
                <button
                  onClick={() => setShowToast(false)}
                  className="inline-flex text-current hover:text-opacity-75"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}