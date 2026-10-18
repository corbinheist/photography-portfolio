/**
 * Image processing pipeline
 *
 * Reads raw photos from _raw/, generates responsive variants in
 * AVIF + WebP at multiple widths, and creates LQIP base64 placeholders.
 *
 * Usage: pnpm process-images
 *
 * Output goes to _processed/ directory, organized by photo slug.
 * The processing functions live in scripts/lib/image-pipeline.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { listImageFiles, processImage, type ProcessedImage } from './lib/image-pipeline';

const RAW_DIR = path.resolve('_raw');
const OUTPUT_DIR = path.resolve('_processed');

async function getImageFiles(): Promise<string[]> {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`Raw directory not found: ${RAW_DIR}`);
    console.log('Create a _raw/ directory and place your photos there.');
    process.exit(1);
  }

  return listImageFiles(RAW_DIR);
}

async function main() {
  console.log('Starting image processing...\n');

  const files = await getImageFiles();
  if (files.length === 0) {
    console.log('No images found in _raw/ directory.');
    return;
  }

  console.log(`Found ${files.length} image(s) to process.\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results: ProcessedImage[] = [];

  for (const file of files) {
    const result = await processImage(path.join(RAW_DIR, file), OUTPUT_DIR);
    results.push(result);
    console.log('');
  }

  // Write manifest
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2));
  console.log(`\nManifest written to ${manifestPath}`);
  console.log(`Processed ${results.length} image(s) successfully.`);
}

main().catch((err) => {
  console.error('Image processing failed:', err);
  process.exit(1);
});
