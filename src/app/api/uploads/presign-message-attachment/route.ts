import { auth } from "@clerk/nextjs/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";

import { getR2Client } from "../../../../lib/r2";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const body = (await req.json()) as { fileType?: string; fileSize?: number };
    const fileType = body.fileType;
    const fileSize = body.fileSize;

    if (!fileType || !fileSize) {
      return new NextResponse("Missing fileType or fileSize", { status: 400 });
    }

    if (!fileType.startsWith("image/")) {
      return new NextResponse("Invalid file type. Only images are allowed.", { status: 400 });
    }

    // Keep this conservative to avoid abuse. If you want larger, bump and mirror in UI.
    const maxBytes = 5 * 1024 * 1024;
    if (fileSize > maxBytes) {
      return new NextResponse("File size exceeds 5MB limit.", { status: 400 });
    }

    const bucket = process.env.R2_BUCKET;
    const publicBase = process.env.R2_PUBLIC_URL;
    if (!bucket || !publicBase) {
      return new NextResponse("R2 is not configured", { status: 500 });
    }

    const fileExtension = fileType.split("/")[1] || "jpg";
    const key = `messages/${userId}/attachment-${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

    const r2Client = getR2Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: fileType,
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 });
    const publicUrl = `${publicBase}/${key}`;

    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (error) {
    console.error("[API_PRESIGN_MESSAGE_ATTACHMENT]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
