import { describe, expect, it } from "vitest";
import { hasOverlap, intervalsOverlap } from "@/lib/time-off-overlap";

describe("time off overlap helpers", () => {
  it("detects overlapping intervals", () => {
    const aStart = new Date("2024-02-10T09:00:00Z");
    const aEnd = new Date("2024-02-10T12:00:00Z");
    const bStart = new Date("2024-02-10T11:00:00Z");
    const bEnd = new Date("2024-02-10T13:00:00Z");

    expect(intervalsOverlap(aStart, aEnd, bStart, bEnd)).toBe(true);
  });

  it("treats touching endpoints as overlapping (inclusive)", () => {
    const aStart = new Date("2024-02-10T09:00:00Z");
    const aEnd = new Date("2024-02-10T10:00:00Z");
    const bStart = new Date("2024-02-10T10:00:00Z");
    const bEnd = new Date("2024-02-10T11:00:00Z");

    expect(intervalsOverlap(aStart, aEnd, bStart, bEnd)).toBe(true);
  });

  it("detects no overlap when separated", () => {
    const aStart = new Date("2024-02-10T09:00:00Z");
    const aEnd = new Date("2024-02-10T10:00:00Z");
    const bStart = new Date("2024-02-10T11:00:00Z");
    const bEnd = new Date("2024-02-10T12:00:00Z");

    expect(intervalsOverlap(aStart, aEnd, bStart, bEnd)).toBe(false);
  });

  it("checks lists of intervals", () => {
    const intervals = [
      { start: new Date("2024-02-10T09:00:00Z"), end: new Date("2024-02-10T10:00:00Z") },
      { start: new Date("2024-02-11T09:00:00Z"), end: new Date("2024-02-11T10:00:00Z") },
    ];

    expect(hasOverlap(intervals, new Date("2024-02-10T09:30:00Z"), new Date("2024-02-10T09:45:00Z"))).toBe(true);
    expect(hasOverlap(intervals, new Date("2024-02-12T09:00:00Z"), new Date("2024-02-12T10:00:00Z"))).toBe(false);
  });
});
