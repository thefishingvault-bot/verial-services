import { formatISO } from "date-fns";

export type ServerMessage = {
  serverMessageId: string;
  clientTempId?: string | null;
  bookingId: string;
  threadId: string | null;
  senderId: string;
  recipientId: string;
  content: string;
  attachments?: unknown;
  deliveredAt?: Date | string | null;
  seenAt?: Date | string | null;
  readAt?: Date | string | null;
  createdAt: Date | string;
};

export type MessageStatus = "sending" | "sent" | "delivered" | "seen" | "failed";

export type UiMessage = Omit<ServerMessage, "createdAt"> & {
  createdAt: string;
  status: MessageStatus;
};

export function deriveStatus(msg: ServerMessage, viewerId?: string | null): MessageStatus {
  const isSender = viewerId && msg.senderId === viewerId;
  if (!isSender) return "sent";
  const seen = msg.seenAt || msg.readAt;
  if (seen) return "seen";
  if (msg.deliveredAt) return "delivered";
  return "sent";
}

export function normalizeMessage(msg: ServerMessage, viewerId?: string | null, overrides?: Partial<UiMessage>): UiMessage {
  return {
    ...msg,
    createdAt: typeof msg.createdAt === "string" ? msg.createdAt : formatISO(msg.createdAt),
    status: overrides?.status ?? deriveStatus(msg, viewerId),
    ...overrides,
  };
}

export function mergeMessages(existing: UiMessage[], incoming: UiMessage[]): UiMessage[] {
  const map = new Map<string, UiMessage>();
  const tempMap = new Map<string, string>();

  for (const msg of existing) {
    if (msg.serverMessageId) map.set(msg.serverMessageId, msg);
    if (msg.clientTempId) tempMap.set(msg.clientTempId, msg.serverMessageId ?? msg.clientTempId);
  }

  for (const msg of incoming) {
    const key = msg.serverMessageId || msg.clientTempId;
    if (!key) continue;
    map.set(key, msg);
    if (msg.clientTempId) tempMap.set(msg.clientTempId, key);
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return merged;
}

export function replaceTempMessage(messages: UiMessage[], serverMessage: ServerMessage, viewerId?: string | null) {
  const normalized = normalizeMessage(serverMessage, viewerId);
  if (!serverMessage.clientTempId) return mergeMessages(messages, [normalized]);
  const filtered = messages.filter((m) => m.clientTempId !== serverMessage.clientTempId);
  return mergeMessages(filtered, [normalized]);
}

export function applyDeliveryStatus(messages: UiMessage[], serverMessageId: string, status: MessageStatus): UiMessage[] {
  return messages.map((m) => (m.serverMessageId === serverMessageId ? { ...m, status } : m));
}

export function upsertMessages(messages: UiMessage[], incoming: ServerMessage[], viewerId?: string | null, statusOverride?: MessageStatus) {
  const normalized = incoming.map((m) => normalizeMessage(m, viewerId, statusOverride ? { status: statusOverride } : {}));
  return mergeMessages(messages, normalized);
}
