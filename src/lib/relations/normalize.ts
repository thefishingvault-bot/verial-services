export function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function requireOne<T>(
  value: T | T[] | null | undefined,
  ctxMsg = "Expected relation to be present",
): T {
  const one = asOne(value);
  if (!one) {
    throw new Error(ctxMsg);
  }
  return one;
}
