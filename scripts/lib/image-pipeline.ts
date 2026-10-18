/**
 * Shared image processing: responsive AVIF + WebP variants, LQIP placeholders, and EXIF.
 *
 * `scripts/process-images.ts` and `scripts/photos.ts` use
 * these functions, so every pipeline writes the same widths, quality settings, and file names.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import exifReader from 'exif-reader';

export const WIDTHS = [640, 750, 1080, 1600, 2400];
const LQIP_WIDTH = 20;
const FORMATS = ['webp', 'avif'] as const;

export const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.webp'];

export interface ProcessedImage {
  slug: string;
  originalPath: string;
  width: number;
  height: number;
  lqip: string;
  variants: { format: string; width: number; path: string }[];
}

export interface ExifData {
  camera?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutter?: string;
  iso?: number;
  date?: string;
}

/** List the supported image files in `directory`, sorted by name. */
export function listImageFiles(directory: string): string[] {
  return fs
    .readdirSync(directory)
    .filter((f) => SUPPORTED_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort();
}

/** The photo id: the file stem, lower case, with whitespace replaced by hyphens. The CDN path uses it. */
export function slugify(filename: string): string {
  return path.basename(filename, path.extname(filename)).toLowerCase().replace(/\s+/g, '-');
}

export async function generateLQIP(inputPath: string): Promise<string> {
  const buffer = await sharp(inputPath)
    .resize(LQIP_WIDTH)
    .webp({ quality: 20 })
    .toBuffer();

  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

/** Write the variants of one image to `<outputRoot>/<slug>/<slug>-<width>.<format>`. */
export async function processImage(inputPath: string, outputRoot: string): Promise<ProcessedImage> {
  const filename = path.basename(inputPath);
  const slug = slugify(filename);
  const outputSubdir = path.join(outputRoot, slug);

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

  // Build width list: standard widths that fit within the native width
  const uniqueWidths = WIDTHS.filter((w) => w <= originalWidth);

  for (const format of FORMATS) {
    for (const targetWidth of uniqueWidths) {

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

/** Read camera, lens, exposure, and date from the EXIF block. A file without EXIF returns `{}`. */
export async function extractExif(imagePath: string): Promise<ExifData> {
  try {
    const metadata = await sharp(imagePath).metadata();
    if (!metadata.exif) return {};

    const exif = exifReader(metadata.exif);
    const result: ExifData = {};

    if (exif.Image?.Make && exif.Image?.Model) {
      result.camera = `${exif.Image.Make} ${exif.Image.Model}`.trim();
    } else if (exif.Image?.Model) {
      result.camera = exif.Image.Model;
    }

    if (exif.Photo?.LensModel) {
      result.lens = exif.Photo.LensModel;
    }

    if (exif.Photo?.FocalLength) {
      result.focalLength = `${exif.Photo.FocalLength}mm`;
    }

    if (exif.Photo?.FNumber) {
      result.aperture = `f/${exif.Photo.FNumber}`;
    }

    if (exif.Photo?.ExposureTime) {
      const time = exif.Photo.ExposureTime;
      result.shutter = time >= 1 ? `${time}s` : `1/${Math.round(1 / time)}s`;
    }

    if (exif.Photo?.ISOSpeedRatings) {
      const iso = exif.Photo.ISOSpeedRatings;
      result.iso = Array.isArray(iso) ? iso[0] : iso;
    }

    if (exif.Photo?.DateTimeOriginal) {
      const d: unknown = exif.Photo.DateTimeOriginal;
      if (d instanceof Date) {
        result.date = d.toISOString().split('T')[0];
      } else if (typeof d === 'string') {
        result.date = d.replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').split(' ')[0];
      }
    }

    return result;
  } catch {
    return {};
  }
}
