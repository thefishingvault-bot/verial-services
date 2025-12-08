import { describe, expect, it } from "vitest";

import {
  applyDeliveryStatus,
  normalizeMessage,
  replaceTempMessage,
  upsertMessages,
  mergeMessages,
} from "@/lib/messaging-client";

describe("messaging-client helpers", () => {
  it("replaces temp message with server message and keeps order", () => {
    const temp = normalizeMessage(
      {
        serverMessageId: "temp-1",
        clientTempId: "temp-1",
        bookingId: "b1",
        threadId: "b1",
        senderId: "u1",
        recipientId: "u2",
        content: "hello",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      "u1",
      { status: "sending" },
    );

    const server = {
      serverMessageId: "srv-1",
      clientTempId: "temp-1",
      bookingId: "b1",
      threadId: "b1",
      senderId: "u1",
      recipientId: "u2",
      content: "hello",
      createdAt: new Date("2024-01-01T00:00:01Z"),
      deliveredAt: new Date("2024-01-01T00:00:02Z"),
    };

    const replaced = replaceTempMessage([temp], server, "u1");
    expect(replaced).toHaveLength(1);
    expect(replaced[0].serverMessageId).toBe("srv-1");
    expect(replaced[0].status).toBe("delivered");
  });

  it("derives seen status for sender", () => {
    const msg = normalizeMessage(
      {
        serverMessageId: "srv-2",
        clientTempId: null,
        bookingId: "b1",
        threadId: "b1",
        senderId: "me",
        recipientId: "u2",
        content: "hi",
        createdAt: new Date(),
        seenAt: new Date(),
      },
      "me",
    );
    expect(msg.status).toBe("seen");
  });

  it("merges messages without duplicates", () => {
    const first = normalizeMessage(
      {
        serverMessageId: "srv-3",
        clientTempId: "temp-3",
        bookingId: "b1",
        threadId: "b1",
        senderId: "a",
        recipientId: "b",
        content: "one",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      "a",
    );
    const incoming = normalizeMessage(
      {
        serverMessageId: "srv-3",
        clientTempId: null,
        bookingId: "b1",
        threadId: "b1",
        senderId: "a",
        recipientId: "b",
        content: "one",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      "a",
    );
    const merged = mergeMessages([first], [incoming]);
    expect(merged).toHaveLength(1);
    expect(merged[0].serverMessageId).toBe("srv-3");
  });

  it("applies delivery status", () => {
    const msg = normalizeMessage(
      {
        serverMessageId: "srv-4",
        clientTempId: null,
        bookingId: "b1",
        threadId: "b1",
        senderId: "me",
        recipientId: "u2",
        content: "check",
        createdAt: new Date(),
      },
      "me",
    );
    const updated = applyDeliveryStatus([msg], "srv-4", "seen");
    expect(updated[0].status).toBe("seen");
  });

  it("upserts messages and sorts by createdAt", () => {
    const base = normalizeMessage(
      {
        serverMessageId: "srv-5",
        clientTempId: null,
        bookingId: "b1",
        threadId: "b1",
        senderId: "a",
        recipientId: "b",
        content: "first",
        createdAt: new Date("2024-01-01T00:00:01Z"),
      },
      "a",
    );
    const incoming = {
      serverMessageId: "srv-6",
      clientTempId: null,
      bookingId: "b1",
      threadId: "b1",
      senderId: "b",
      recipientId: "a",
      content: "second",
      createdAt: new Date("2024-01-01T00:00:00Z"),
    };
    const merged = upsertMessages([base], [incoming], "a");
    expect(merged[0].serverMessageId).toBe("srv-6");
    expect(merged[1].serverMessageId).toBe("srv-5");
  });
});
