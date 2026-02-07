/**
 * Image processing pipeline
 *
 * Reads raw photos from _raw/, generates responsive variants in
 * AVIF + WebP at multiple widths, and creates LQIP base64 placeholders.
 *
 * Usage: pnpm process-images
 *
 * Output goes to _processed/ directory, organized by photo slug.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const RAW_DIR = path.resolve('_raw');
const OUTPUT_DIR = path.resolve('_processed');
const WIDTHS = [640, 750, 1080, 1600, 2400];
const LQIP_WIDTH = 20;
const FORMATS = ['webp', 'avif'] as const;

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.webp'];

interface ProcessedImage {
  slug: string;
  originalPath: string;
  width: number;
  height: number;
  lqip: string;
  variants: { format: string; width: number; path: string }[];
}

async function getImageFiles(): Promise<string[]> {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`Raw directory not found: ${RAW_DIR}`);
    console.log('Create a _raw/ directory and place your photos there.');
    process.exit(1);
  }

  const files = fs.readdirSync(RAW_DIR);
  return files.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  });
}

function slugify(filename: string): string {
  return path.basename(filename, path.extname(filename)).toLowerCase().replace(/\s+/g, '-');
}

async function generateLQIP(inputPath: string): Promise<string> {
  const buffer = await sharp(inputPath)
    .resize(LQIP_WIDTH)
    .webp({ quality: 20 })
    .toBuffer();

  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

async function processImage(filename: string): Promise<ProcessedImage> {
  const inputPath = path.join(RAW_DIR, filename);
  const slug = slugify(filename);
  const outputSubdir = path.join(OUTPUT_DIR, slug);

  fs.mkdirSync(outputSubdir, { recursive: true });

  const metadata = await sharp(inputPath).metadata();
  const originalWidth = metadata.width || 2400;
  const originalHeight = metadata.height || 1600;

  console.log(`Processing: ${filename} (${originalWidth}x${originalHeight})`);

  // Generate LQIP
  const lqip = await generateLQIP(inputPath);
  console.log(`  LQIP generated (${lqip.length} chars)`);

  // Generate responsive variants
  const variants: ProcessedImage['variants'] = [];

  for (const format of FORMATS) {
    for (const targetWidth of WIDTHS) {
      // Skip widths larger than original
      if (targetWidth > originalWidth) continue;

      const outputFilename = `${slug}-${targetWidth}.${format}`;
      const outputPath = path.join(outputSubdir, outputFilename);

      const pipeline = sharp(inputPath).resize(targetWidth, null, {
        withoutEnlargement: true,
      });

      if (format === 'webp') {
        await pipeline.webp({ quality: 82, effort: 6 }).toFile(outputPath);
      } else {
        await pipeline.avif({ quality: 72, effort: 6 }).toFile(outputPath);
      }

      variants.push({ format, width: targetWidth, path: outputPath });
      console.log(`  Generated: ${outputFilename}`);
    }
  }

  return {
    slug,
    originalPath: inputPath,
    width: originalWidth,
    height: originalHeight,
    lqip,
    variants,
  };
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
    const result = await processImage(file);
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
