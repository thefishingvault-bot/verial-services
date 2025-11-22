import { db } from '@/lib/db';
import { getR2Client } from '@/lib/r2';
import { providers, services } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 1. Verify user is a provider
    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });
    if (!provider) {
      return new NextResponse('Not a provider', { status: 403 });
    }

    if (provider.status !== 'approved') {
      return new NextResponse('Provider must be approved to upload images.', { status: 403 });
    }

    const { serviceId, fileType, fileSize } = await req.json();
    if (!serviceId || !fileType || !fileSize) {
      return new NextResponse('Missing serviceId, fileType, or fileSize', { status: 400 });
    }

    // 2. Validate file type and size
    if (!fileType.startsWith('image/')) {
      return new NextResponse('Invalid file type. Only images are allowed.', { status: 400 });
    }
    // 5MB limit
    if (fileSize > 5 * 1024 * 1024) {
      return new NextResponse('File size exceeds 5MB limit.', { status: 400 });
    }

    // 3. Verify service ownership
    const service = await db.query.services.findFirst({
      where: and(
        eq(services.id, serviceId),
        eq(services.providerId, provider.id)
      ),
    });

    if (!service) {
      return new NextResponse('Service not found or you do not own it.', { status: 404 });
    }

    // 4. Generate a unique key for the file
    const fileExtension = fileType.split('/')[1];
    const key = `services/${serviceId}/cover-${Date.now()}.${fileExtension}`;

    // 5. Get R2 bucket name
    const R2_BUCKET = process.env.R2_BUCKET;
    if (!R2_BUCKET) {
      return new NextResponse('R2 is not configured', { status: 500 });
    }

    // 6. Create the pre-signed URL
    const r2Client = getR2Client();
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: fileType,
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 }); // 5 minutes

    // The URL of the file *after* upload
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({ uploadUrl, publicUrl });

  } catch (error) {
    console.error('[API_PRESIGN_COVER]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

