export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && aEnd >= bStart;
}

export function hasOverlap(intervals: Array<{ start: Date; end: Date }>, start: Date, end: Date) {
  return intervals.some((interval) => intervalsOverlap(interval.start, interval.end, start, end));
}
