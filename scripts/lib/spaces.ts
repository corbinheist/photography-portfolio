/**
 * Shared DigitalOcean Spaces upload.
 *
 * `scripts/upload-to-spaces.ts` and `scripts/photos.ts` use these functions. The upload code talks
 * to an `ObjectStore`, so tests can pass a fake store and never reach the network.
 */

import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

export interface SpacesConfig {
  key: string;
  secret: string;
  bucket: string;
  region: string;
}

/** The two operations the uploader needs. `spacesStore` is the real one. */
export interface ObjectStore {
  exists(key: string): Promise<boolean>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}

export interface UploadItem {
  /** The object key, for example `photos/<id>/<id>-640.webp`. */
  key: string;
  /** The local file. */
  path: string;
}

/** Read the Spaces credentials from the environment. Exit with a message when one is missing. */
export function getConfig(): SpacesConfig {
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

export function getContentType(ext: string): string {
  const types: Record<string, string> = {
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  };
  return types[ext] || 'application/octet-stream';
}

/** The object key of a photo variant. The CDN url of the photo is `<cdn>/photos/<id>`. */
export function photoObjectKey(id: string, file: string): string {
  return `photos/${id}/${file}`;
}

export function spacesStore(config: SpacesConfig): ObjectStore {
  const client = new S3Client({
    endpoint: `https://${config.region}.digitaloceanspaces.com`,
    region: config.region,
    credentials: {
      accessKeyId: config.key,
      secretAccessKey: config.secret,
    },
    forcePathStyle: false,
  });

  return {
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ACL: 'public-read',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },
  };
}

/** Upload each item that the store does not already hold. */
export async function uploadFiles(
  store: ObjectStore,
  items: UploadItem[],
): Promise<{ uploaded: number; skipped: number }> {
  let uploaded = 0;
  let skipped = 0;

  for (const item of items) {
    // Check if already uploaded
    if (await store.exists(item.key)) {
      skipped++;
      continue;
    }

    const contentType = getContentType(path.extname(item.path).toLowerCase());
    await store.put(item.key, fs.readFileSync(item.path), contentType);

    uploaded++;
    console.log(`  Uploaded: ${item.key}`);
  }

  return { uploaded, skipped };
}
