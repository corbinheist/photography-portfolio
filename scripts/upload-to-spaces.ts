/**
 * Upload processed images to DigitalOcean Spaces
 *
 * Reads from _processed/ directory and uploads all variants
 * to the configured S3-compatible bucket.
 *
 * Usage: pnpm upload-images
 *
 * Required env vars: DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET, DO_SPACES_REGION
 *
 * The upload functions live in scripts/lib/spaces.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getConfig, photoObjectKey, spacesStore, uploadFiles, type UploadItem } from './lib/spaces';

const PROCESSED_DIR = path.resolve('_processed');

async function main() {
  const store = spacesStore(getConfig());

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

  // Only files are variants. `pnpm photos` writes _processed/<story>/<id>/ subdirectories,
  // and this script does not upload them; `pnpm photos` uploads its own output.
  const items: UploadItem[] = slugDirs.flatMap((slug) => {
    const slugDir = path.join(PROCESSED_DIR, slug);
    return fs
      .readdirSync(slugDir)
      .filter((file) => fs.statSync(path.join(slugDir, file)).isFile())
      .map((file) => ({ key: photoObjectKey(slug, file), path: path.join(slugDir, file) }));
  });

  const { uploaded, skipped } = await uploadFiles(store, items);

  console.log(`\nDone. Uploaded: ${uploaded}, Skipped (existing): ${skipped}`);
}

main().catch((err) => {
  console.error('Upload failed:', err);
  process.exit(1);
});
