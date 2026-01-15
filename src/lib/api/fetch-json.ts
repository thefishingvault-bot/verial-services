import {
  dispatchProviderLimitedMode,
  parseProviderSuspendedPayload,
  ProviderLimitedModeHandledError,
} from "@/lib/errors/provider-suspension";

export class ApiError extends Error {
  name = "ApiError";
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

function safeStringify(value: unknown) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return "";
  }
}

function looksLikeJsonText(text: string) {
  const t = text.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

function toUserMessage(status: number, body: unknown) {
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    const message = rec["message"];
    if (typeof message === "string" && message.trim()) return message;
    const error = rec["error"];
    if (typeof error === "string" && error.trim()) return error;
  }
  if (typeof body === "string") {
    const text = body.trim();
    if (!text) return `Request failed (${status})`;
    if (looksLikeJsonText(text)) return `Request failed (${status})`;
    return text;
  }
  return `Request failed (${status})`;
}

async function readBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json().catch(() => null);
  }
  return res.text().catch(() => "");
}

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const body = await readBody(res);

  if (!res.ok) {
    const suspended = parseProviderSuspendedPayload(body);
    if (res.status === 403 && suspended) {
      dispatchProviderLimitedMode(suspended);
      throw new ProviderLimitedModeHandledError();
    }

    throw new ApiError(toUserMessage(res.status, body), res.status, body);
  }

  return body as T;
}

export async function fetchOk(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  await fetchJson<void>(input, init);
}

export function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ProviderLimitedModeHandledError) return null;
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error) {
    const msg = err.message?.trim();
    if (!msg) return fallback;
    // Avoid surfacing JSON blobs even for non-403 errors.
    if (looksLikeJsonText(msg)) return fallback;
    return msg;
  }
  return fallback;
}

export function getErrorPayload(err: unknown) {
  if (err instanceof ApiError) return err.payload;
  return null;
}

export function debugError(err: unknown) {
  const payload = getErrorPayload(err);
  return { message: err instanceof Error ? err.message : safeStringify(err), payload };
}
