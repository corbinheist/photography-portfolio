/**
 * Upload processed images to DigitalOcean Spaces
 *
 * Reads from _processed/ directory and uploads all variants
 * to the configured S3-compatible bucket.
 *
 * Usage: pnpm upload-images
 *
 * Required env vars: DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET, DO_SPACES_REGION
 */

import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const PROCESSED_DIR = path.resolve('_processed');

function getConfig() {
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;
  const bucket = process.env.DO_SPACES_BUCKET;
  const region = process.env.DO_SPACES_REGION || 'nyc3';

  if (!key || !secret || !bucket) {
    console.error('Missing required environment variables:');
    console.error('  DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET');
    console.error('\nCopy .env.example to .env and fill in your credentials.');
    process.exit(1);
  }

  return { key, secret, bucket, region };
}

function getContentType(ext: string): string {
  const types: Record<string, string> = {
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  };
  return types[ext] || 'application/octet-stream';
}

async function objectExists(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const config = getConfig();

  const client = new S3Client({
    endpoint: `https://${config.region}.digitaloceanspaces.com`,
    region: config.region,
    credentials: {
      accessKeyId: config.key,
      secretAccessKey: config.secret,
    },
    forcePathStyle: false,
  });

  if (!fs.existsSync(PROCESSED_DIR)) {
    console.error(`Processed directory not found: ${PROCESSED_DIR}`);
    console.log('Run "pnpm process-images" first.');
    process.exit(1);
  }

  const slugDirs = fs.readdirSync(PROCESSED_DIR).filter((f) => {
    return fs.statSync(path.join(PROCESSED_DIR, f)).isDirectory();
  });

  if (slugDirs.length === 0) {
    console.log('No processed images found.');
    return;
  }

  console.log(`Uploading ${slugDirs.length} image set(s) to DO Spaces...\n`);

  let uploaded = 0;
  let skipped = 0;

  for (const slug of slugDirs) {
    const slugDir = path.join(PROCESSED_DIR, slug);
    const files = fs.readdirSync(slugDir);

    for (const file of files) {
      const filePath = path.join(slugDir, file);
      const ext = path.extname(file).toLowerCase();
      const s3Key = `photos/${slug}/${file}`;

      // Check if already uploaded
      const exists = await objectExists(client, config.bucket, s3Key);
      if (exists) {
        skipped++;
        continue;
      }

      const body = fs.readFileSync(filePath);
      const contentType = getContentType(ext);

      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: s3Key,
          Body: body,
          ContentType: contentType,
          ACL: 'public-read',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );

      uploaded++;
      console.log(`  Uploaded: ${s3Key}`);
    }
  }

  console.log(`\nDone. Uploaded: ${uploaded}, Skipped (existing): ${skipped}`);
}

main().catch((err) => {
  console.error('Upload failed:', err);
  process.exit(1);
});
