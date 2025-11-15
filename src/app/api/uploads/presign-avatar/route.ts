import { getR2Client } from '@/lib/r2';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { fileType, fileSize } = await req.json();
    if (!fileType || !fileSize) {
      return new NextResponse('Missing fileType or fileSize', { status: 400 });
    }

    // 1. Validate file type and size
    if (!fileType.startsWith('image/')) {
      return new NextResponse('Invalid file type. Only images are allowed.', {
        status: 400,
      });
    }

    // 2MB limit for avatars
    if (fileSize > 2 * 1024 * 1024) {
      return new NextResponse('File size exceeds 2MB limit.', { status: 400 });
    }

    // 2. Bucket configuration
    const R2_BUCKET = process.env.R2_BUCKET;
    if (!R2_BUCKET) {
      return new NextResponse('R2 is not configured', { status: 500 });
    }

    const publicBase = process.env.R2_PUBLIC_URL;
    if (!publicBase) {
      return new NextResponse('R2 is not configured', { status: 500 });
    }

    // 3. Generate a unique key for the file
    const fileExtension = fileType.split('/')[1] || 'jpg';
    const key = `avatars/${userId}/avatar-${Date.now()}.${fileExtension}`;

    // 4. Create the pre-signed URL
    const r2Client = getR2Client();
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: fileType,
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 }); // 5 minutes
    const publicUrl = `${publicBase}/${key}`;

    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (error) {
    console.error('[API_PRESIGN_AVATAR]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

