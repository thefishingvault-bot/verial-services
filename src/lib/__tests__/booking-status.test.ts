import { describe, expect, it } from "vitest";
import { getBookingStatusLabel, getBookingStatusVariant } from "../bookings/status";

describe("booking status helpers", () => {
  it("formats known statuses with friendly labels", () => {
    expect(getBookingStatusLabel("canceled_customer")).toBe("Cancelled by customer");
    expect(getBookingStatusLabel("disputed")).toBe("In dispute");
    expect(getBookingStatusLabel("pending")).toBe("Pending");
  });

  it("falls back to spacing unknown statuses", () => {
    expect(getBookingStatusLabel("new_state" as string)).toBe("new state");
  });

  it("returns badge variants for key lifecycle states", () => {
    expect(getBookingStatusVariant("paid")).toBe("default");
    expect(getBookingStatusVariant("pending")).toBe("outline");
    expect(getBookingStatusVariant("canceled_provider")).toBe("destructive");
  });
});
