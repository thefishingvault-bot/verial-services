import crypto from "crypto";

const DEFAULT_SUMSUB_TIMEOUT_MS = 10_000;

export type SumsubErrorCode = "SUMSUB_UNAVAILABLE";
export type SumsubErrorKind = "config" | "http" | "timeout" | "network" | "unknown";

export class SumsubApiError extends Error {
  readonly code: SumsubErrorCode;
  readonly kind: SumsubErrorKind;
  readonly statusCode?: number;
  readonly details?: string;

  constructor(params: {
    message: string;
    kind: SumsubErrorKind;
    statusCode?: number;
    details?: string;
  }) {
    super(params.message);
    this.name = "SumsubApiError";
    this.code = "SUMSUB_UNAVAILABLE";
    this.kind = params.kind;
    this.statusCode = params.statusCode;
    this.details = params.details;
  }
}

export type SumsubConfig = {
  baseUrl: string;
  appToken: string;
  secretKey: string;
};

function getSumsubConfig(): SumsubConfig {
  const appToken = process.env.SUMSUB_APP_TOKEN;
  const secretKey = process.env.SUMSUB_SECRET_KEY;
  const baseUrl = process.env.SUMSUB_BASE_URL || "https://api.sumsub.com";

  if (!appToken || !secretKey) {
    throw new Error("SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY environment variables are not set");
  }

  return { baseUrl, appToken, secretKey };
}

function getSumsubErrorInfo(error: unknown): {
  code: SumsubErrorCode;
  kind: SumsubErrorKind;
  statusCode?: number;
  message: string;
  details?: string;
} {
  if (error instanceof SumsubApiError) {
    return {
      code: error.code,
      kind: error.kind,
      statusCode: error.statusCode,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "SUMSUB_UNAVAILABLE",
      kind: "unknown",
      message: error.message,
    };
  }

  return {
    code: "SUMSUB_UNAVAILABLE",
    kind: "unknown",
    message: String(error),
  };
}

export function logSumsubError(context: string, error: unknown, extra?: Record<string, unknown>) {
  const info = getSumsubErrorInfo(error);

  console.error("SUMSUB_UNAVAILABLE", {
    context,
    code: info.code,
    kind: info.kind,
    statusCode: info.statusCode,
    message: info.message,
    details: info.details,
    ...extra,
  });
}

export type SafeSumsubResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: SumsubErrorCode;
      kind: SumsubErrorKind;
      message: string;
      statusCode?: number;
    };

function createSignature(params: {
  ts: number;
  method: string;
  pathWithQuery: string;
  body?: string;
  secretKey: string;
}): string {
  const { ts, method, pathWithQuery, body, secretKey } = params;

  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(String(ts));
  hmac.update(method.toUpperCase());
  hmac.update(pathWithQuery);
  if (body) {
    hmac.update(body);
  }
  return hmac.digest("hex");
}

export async function sumsubRequest<T>(params: {
  pathWithQuery: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<T> {
  const { pathWithQuery, method, body, signal, timeoutMs = DEFAULT_SUMSUB_TIMEOUT_MS } = params;

  let baseUrl: string;
  let appToken: string;
  let secretKey: string;

  try {
    const config = getSumsubConfig();
    baseUrl = config.baseUrl;
    appToken = config.appToken;
    secretKey = config.secretKey;
  } catch (error) {
    throw new SumsubApiError({
      message: error instanceof Error ? error.message : "Sumsub config unavailable",
      kind: "config",
    });
  }

  const ts = Math.floor(Date.now() / 1000);
  const bodyString = body === undefined ? "" : JSON.stringify(body);
  const signature = createSignature({
    ts,
    method,
    pathWithQuery,
    body: bodyString || undefined,
    secretKey,
  });

  const url = `${baseUrl}${pathWithQuery}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("sumsub-timeout"), timeoutMs);

  const onExternalAbort = () => controller.abort("external-abort");
  if (signal) {
    if (signal.aborted) {
      controller.abort("external-abort");
    } else {
      signal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-App-Token": appToken,
        "X-App-Access-Ts": String(ts),
        "X-App-Access-Sig": signature,
      },
      body: method === "GET" || method === "DELETE" ? undefined : bodyString,
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      let parsed: unknown = undefined;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        parsed = text;
      }

      const correlationId =
        typeof parsed === "object" && parsed && "correlationId" in parsed
          ? String((parsed as { correlationId?: unknown }).correlationId)
          : undefined;

      const suffix = correlationId ? ` (correlationId: ${correlationId})` : "";
      throw new SumsubApiError({
        message: `Sumsub request failed: ${response.status} ${response.statusText}${suffix}`,
        kind: "http",
        statusCode: response.status,
        details: text || undefined,
      });
    }

    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof SumsubApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SumsubApiError({
        message: `Sumsub timeout after ${timeoutMs}ms`,
        kind: "timeout",
      });
    }

    if (error instanceof Error) {
      throw new SumsubApiError({
        message: error.message,
        kind: "network",
      });
    }

    throw new SumsubApiError({
      message: String(error),
      kind: "unknown",
    });
  } finally {
    clearTimeout(timeout);
    if (signal) {
      signal.removeEventListener("abort", onExternalAbort);
    }
  }
}

export async function safeSumsubRequest<T>(params: {
  context: string;
  pathWithQuery: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  extraLogFields?: Record<string, unknown>;
}): Promise<SafeSumsubResult<T>> {
  const { context, extraLogFields, ...requestParams } = params;

  try {
    const data = await sumsubRequest<T>(requestParams);
    return { ok: true, data };
  } catch (error) {
    logSumsubError(context, error, extraLogFields);
    const info = getSumsubErrorInfo(error);
    return {
      ok: false,
      error: info.code,
      kind: info.kind,
      message: info.message,
      statusCode: info.statusCode,
    };
  }
}

export type SumsubAccessTokenResponse = {
  token: string;
  userId?: string;
  expiresAt?: string;
};
