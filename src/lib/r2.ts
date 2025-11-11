import { S3Client } from '@aws-sdk/client-s3';

let r2Client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (r2Client) {
    return r2Client;
  }

  if (
    !process.env.R2_ENDPOINT ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  ) {
    throw new Error('R2 environment variables are not set.');
  }

  r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  return r2Client;
}

