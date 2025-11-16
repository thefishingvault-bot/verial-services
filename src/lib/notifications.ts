import { db } from "@/lib/db";
import { notifications } from "@/db/schema";

// Helper function to create a unique ID
const generateNotificationId = () =>
  `notif_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

interface CreateNotificationPayload {
  userId: string; // The ID of the user *receiving* the notification
  message: string;
  href: string;
}

export const createNotification = async (payload: CreateNotificationPayload) => {
  try {
    await db.insert(notifications).values({
      id: generateNotificationId(),
      userId: payload.userId,
      message: payload.message,
      href: payload.href,
    });
    console.log(
      `[NOTIF_CREATED] For User: ${payload.userId}, Message: ${payload.message}`
    );
  } catch (error) {
    console.error("[NOTIF_ERROR] Failed to create notification:", error);
    // Do not throw; notification failure should not block the main request
  }
};

