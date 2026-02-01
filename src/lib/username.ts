const DEFAULT_RESERVED_USERNAMES = [
  "admin",
  "api",
  "checkout",
  "dashboard",
  "help",
  "legal",
  "onboarding",
  "p",
  "privacy",
  "s",
  "services",
  "sign-in",
  "sign-up",
  "terms",
  "www",
] as const;

export const RESERVED_USERNAMES = new Set<string>(DEFAULT_RESERVED_USERNAMES);

export type UsernameParseResult =
  | { ok: true; normalized: string }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function normalizeUsername(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

export function parseUsername(value: unknown, opts?: { allowMissing?: boolean }): UsernameParseResult {
  const allowMissing = opts?.allowMissing ?? false;

  if (value === undefined && allowMissing) {
    return { ok: true, normalized: "" };
  }

  const normalized = normalizeUsername(value);
  if (!normalized) {
    return { ok: false, message: "Username is required" };
  }

  if (normalized.length < 3 || normalized.length > 20) {
    return { ok: false, message: "Username must be between 3 and 20 characters" };
  }

  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    return { ok: false, message: "Username can only contain lowercase letters, numbers, and underscores" };
  }

  if (RESERVED_USERNAMES.has(normalized)) {
    return { ok: false, message: "That username is reserved" };
  }

  return { ok: true, normalized };
}

export function hasOwn(obj: unknown, key: string): boolean {
  if (!isRecord(obj)) return false;
  return Object.prototype.hasOwnProperty.call(obj, key);
}
