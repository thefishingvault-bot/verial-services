import { z } from "zod";

const uuidString = z.string().uuid("Invalid id");

export const MessageContentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(2000, "Message too long"),
  attachments: z
    .array(
      z.object({
        type: z.enum(["image"]),
        url: z.string().url(),
        name: z.string().trim().max(200).optional(),
        size: z.number().int().nonnegative().optional(),
      })
    )
    .optional(),
});

export const MessageSendSchema = z.object({
  threadId: uuidString,
  tempId: z.string().trim().max(255).optional(),
}).and(MessageContentSchema);

export const MessageListSchema = z.object({
  threadId: uuidString,
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
  cursor: z.string().trim().max(255).optional(),
});

export const ThreadListSchema = z.object({});

export const MarkReadSchema = z.object({
  threadId: uuidString,
  lastMessageId: z.string().trim().max(255).optional(),
});

export const PublishSchema = z.object({
  threadId: uuidString,
  event: z.enum([
    "message:new",
    "message:delivered",
    "message:seen",
    "thread:unread",
    "presence:update",
    "typing",
  ]),
  payload: z.unknown(),
});

export type MessageSendInput = z.infer<typeof MessageSendSchema>;
export type MessageListInput = z.infer<typeof MessageListSchema>;
export type ThreadListInput = z.infer<typeof ThreadListSchema>;
export type MarkReadInput = z.infer<typeof MarkReadSchema>;
export type PublishInput = z.infer<typeof PublishSchema>;
