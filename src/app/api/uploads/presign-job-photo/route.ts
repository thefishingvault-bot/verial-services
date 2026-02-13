import { auth } from "@clerk/nextjs/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";

import { getR2Client } from "@/lib/r2";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { fileType, fileSize } = (await req.json().catch(() => ({}))) as {
      fileType?: string;
      fileSize?: number;
    };

    if (!fileType || !fileSize) {
      return new NextResponse("Missing fileType or fileSize", { status: 400 });
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(fileType)) {
      return new NextResponse("Invalid file type. Only JPG, PNG, and WEBP images are allowed.", { status: 400 });
    }

    if (fileSize > 5 * 1024 * 1024) {
      return new NextResponse("File size exceeds 5MB limit.", { status: 400 });
    }

    const extension = fileType === "image/jpeg" ? "jpg" : fileType.split("/")[1];
    const key = `job-requests/tmp/${userId}/photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

    const bucket = process.env.R2_BUCKET;
    if (!bucket) {
      return new NextResponse("R2 is not configured", { status: 500 });
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: fileType,
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 300 });
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (error) {
    console.error("[API_PRESIGN_JOB_PHOTO]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}