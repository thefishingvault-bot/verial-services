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

  const logoUrl = new URL("/Verial.jpg", req.url).toString();

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
  };

  const element = React.createElement(
    "div",
    { style: outerStyle },
    React.createElement(
      "div",
      { style: innerStyle },
      React.createElement("img", {
        src: logoUrl,
        width: size - padding * 2,
        height: size - padding * 2,
        style: {
          width: "100%",
          height: "100%",
          objectFit: "contain",
        },
      }),
    ),
  );

  return new ImageResponse(element, { width: size, height: size });
}
