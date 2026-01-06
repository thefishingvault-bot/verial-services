import { auth } from '@clerk/nextjs/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';

import { getR2Client } from '@/lib/r2';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const body = (await req.json()) as { fileType?: string; fileSize?: number };
    const fileType = body.fileType;
    const fileSize = body.fileSize;

    if (!fileType || !fileSize) {
      return new NextResponse('Missing fileType or fileSize', { status: 400 });
    }

    const isAllowedImage = fileType.startsWith('image/');
    const isAllowedPdf = fileType === 'application/pdf';
    if (!isAllowedImage && !isAllowedPdf) {
      return new NextResponse('Invalid file type. Only images or PDFs are allowed.', { status: 400 });
    }

    // Keep conservative to limit abuse.
    const maxBytes = 10 * 1024 * 1024;
    if (fileSize > maxBytes) {
      return new NextResponse('File size exceeds 10MB limit.', { status: 400 });
    }

    const bucket = process.env.R2_BUCKET;
    const publicBase = process.env.R2_PUBLIC_URL;
    if (!bucket || !publicBase) {
      return new NextResponse('R2 is not configured', { status: 500 });
    }

    const fileExtension = isAllowedPdf ? 'pdf' : (fileType.split('/')[1] || 'jpg');
    const key = `kyc/${userId}/identity-${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

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
    console.error('[API_PRESIGN_IDENTITY_DOCUMENT]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
