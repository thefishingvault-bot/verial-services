import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createNotification,
  getUnreadCount,
  listNotifications,
  markNotificationsRead,
} from "./notifications";

// Hoist all mock fns before vi.mock to avoid TDZ issues
const { valuesMock, insertMock, updateWhereMock, updateSetMock, updateMock, findManyMock, selectWhereMock, selectFromMock, selectMock } =
  vi.hoisted(() => ({
    valuesMock: vi.fn(),
    insertMock: vi.fn(() => ({ values: valuesMock })),
    updateWhereMock: vi.fn(),
    updateSetMock: vi.fn(() => ({ where: updateWhereMock })),
    updateMock: vi.fn(() => ({ set: updateSetMock })),
    findManyMock: vi.fn(),
    selectWhereMock: vi.fn(),
    selectFromMock: vi.fn(() => ({ where: selectWhereMock })),
    selectMock: vi.fn(() => ({ from: selectFromMock })),
  }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: insertMock,
    update: updateMock,
    select: selectMock,
    query: { notifications: { findMany: findManyMock } },
  },
}));

// We use the real table schema so we don't mock it.

const now = new Date();

beforeEach(() => {
  vi.clearAllMocks();
  valuesMock.mockResolvedValue(undefined);
  updateWhereMock.mockResolvedValue(undefined);
  findManyMock.mockResolvedValue([]);
  selectWhereMock.mockResolvedValue([{ count: 2 }]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createNotification", () => {
  it("fills defaults for title and actionUrl", async () => {
    await createNotification({ userId: "user_1", message: "Hello world" });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledTimes(1);
    const payload = valuesMock.mock.calls[0][0];
    expect(payload.userId).toBe("user_1");
    expect(payload.title).toBe("Hello world");
    expect(payload.actionUrl).toBe("/dashboard");
    expect(payload.message).toBe("Hello world");
    expect(payload.href).toBe("/dashboard");
    expect(payload.type).toBe("system");
  });
});

describe("listNotifications", () => {
  it("paginates and returns nextCursor when more items exist", async () => {
    const newer = { id: "n1", createdAt: now } as any;
    const older = { id: "n2", createdAt: new Date(now.getTime() - 1000) } as any;
    findManyMock.mockResolvedValue([newer, older]);

    const result = await listNotifications({ userId: "user_1", limit: 1 });

    expect(findManyMock).toHaveBeenCalled();
    expect(result.items.length).toBe(1);
    expect(result.nextCursor).toBe(now.toISOString());
  });
});

describe("markNotificationsRead", () => {
  it("marks provided ids with readAt", async () => {
    await markNotificationsRead({ userId: "user_1", ids: ["a", "b"] });

    expect(updateMock).toHaveBeenCalled();
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
    );
    expect(updateWhereMock).toHaveBeenCalled();
  });
});

describe("getUnreadCount", () => {
  it("returns the count from the query", async () => {
    const count = await getUnreadCount("user_1");
    expect(selectMock).toHaveBeenCalled();
    expect(selectWhereMock).toHaveBeenCalled();
    expect(count).toBe(2);
  });
});
