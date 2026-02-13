import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import React from "react";

export const runtime = "edge";

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function isTruthy(value: string | null) {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

export async function GET(req: NextRequest) {
  const sizeParam = req.nextUrl.searchParams.get("size");
  const requested = sizeParam ? Number(sizeParam) : 512;
  const size = clampInt(Number.isFinite(requested) ? requested : 512, 32, 1024);

  const maskable = isTruthy(req.nextUrl.searchParams.get("maskable"));
  const padding = maskable ? Math.round(size * 0.16) : Math.round(size * 0.1);

  const outerStyle: React.CSSProperties = {
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0b1220",
    borderRadius: maskable ? Math.round(size * 0.22) : Math.round(size * 0.12),
    overflow: "hidden",
  };

  const innerStyle: React.CSSProperties = {
    width: size - padding * 2,
    height: size - padding * 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Math.round(size * 0.16),
    background: "linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)",
    color: "#ffffff",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    fontWeight: 700,
    fontSize: Math.round((size - padding * 2) * 0.52),
    lineHeight: 1,
  };

  const element = React.createElement(
    "div",
    { style: outerStyle },
    React.createElement(
      "div",
      { style: innerStyle },
      React.createElement("span", null, "V"),
    ),
  );

  return new ImageResponse(element, { width: size, height: size });
}
