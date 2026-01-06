import crypto from "crypto";

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
}): Promise<T> {
  const { pathWithQuery, method, body, signal } = params;
  const { baseUrl, appToken, secretKey } = getSumsubConfig();

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
    signal,
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
    throw new Error(`Sumsub request failed: ${response.status} ${response.statusText}${suffix}`);
  }

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export type SumsubAccessTokenResponse = {
  token: string;
  userId?: string;
  expiresAt?: string;
};
