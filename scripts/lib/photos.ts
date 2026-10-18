/**
 * The `pnpm photos <slug>` pipeline: process, upload, and write the story manifest.
 * `scripts/photos.ts` is the command line. Tests call `runPhotos` with a fake store.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STORY_PHOTOS_DIR } from '../../src/scripts/utils/story-manifest';
import { extractExif, listImageFiles, processImage, slugify } from './image-pipeline';
import { photoObjectKey, uploadFiles, type ObjectStore, type UploadItem } from './spaces';
import { diffLines, mergeManifest, type GeneratedPhoto, type MergeResult } from './story-photo-merge';

export interface PhotosOptions {
  /** The story slug. The source images are `_raw/<slug>/`. */
  slug: string;
  /** The repository root. */
  root: string;
  /** The CDN base url, without the trailing slash. A photo url is `<cdnBase>/photos/<id>`. */
  cdnBase: string;
  /** Process into a temporary directory, skip the upload, and write nothing to the repository. */
  dryRun: boolean;
  /** Upload the variants. `dryRun` turns the upload off. */
  upload: boolean;
}

export interface PhotosResult extends MergeResult {
  manifestPath: string;
  outputDir: string;
  diff: string;
  written: boolean;
  uploaded: number;
  skipped: number;
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function runPhotos(options: PhotosOptions, store?: ObjectStore): Promise<PhotosResult> {
  const { slug, root, cdnBase, dryRun } = options;
  const upload = options.upload && !dryRun;
  if (!SLUG.test(slug)) throw new Error(`"${slug}" is not a valid story slug (lower case, digits, and hyphens)`);
  if (upload && !store) throw new Error('runPhotos: an upload needs an object store');

  const rawDir = path.join(root, '_raw', slug);
  if (!fs.existsSync(rawDir)) throw new Error(`Raw directory not found: ${path.relative(root, rawDir)}`);
  const files = listImageFiles(rawDir);
  if (files.length === 0) throw new Error(`No images found in ${path.relative(root, rawDir)}`);

  const ids = new Map<string, string>();
  for (const file of files) {
    const id = slugify(file);
    const other = ids.get(id);
    if (other) throw new Error(`${other} and ${file} both have the id "${id}". Rename one of them.`);
    ids.set(id, file);
  }

  const outputDir = dryRun
    ? fs.mkdtempSync(path.join(os.tmpdir(), `photos-${slug}-`))
    : path.join(root, '_processed', slug);
  fs.mkdirSync(outputDir, { recursive: true });

  const generated: GeneratedPhoto[] = [];
  const uploads: UploadItem[] = [];
  for (const file of files) {
    const inputPath = path.join(rawDir, file);
    const image = await processImage(inputPath, outputDir);
    const exif = await extractExif(inputPath);
    generated.push({
      id: image.slug,
      url: `${cdnBase}/photos/${image.slug}`,
      width: image.width,
      height: image.height,
      lqip: image.lqip,
      ...(Object.keys(exif).length > 0 ? { exif } : {}),
    });
    for (const variant of image.variants) {
      uploads.push({ key: photoObjectKey(image.slug, path.basename(variant.path)), path: variant.path });
    }
  }

  // Upload before the manifest changes, so the manifest does not name files the CDN lacks.
  let uploaded = 0;
  let skipped = 0;
  if (upload && store) {
    console.log(`\nUploading ${uploads.length} variant(s)...`);
    ({ uploaded, skipped } = await uploadFiles(store, uploads));
    console.log(`Uploaded: ${uploaded}, Skipped (existing): ${skipped}`);
  }

  const manifestPath = path.join(root, STORY_PHOTOS_DIR, `${slug}.yaml`);
  const before = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : null;
  const merge = mergeManifest(slug, before, generated);
  const diff = diffLines(before ?? '', merge.text);

  const written = !dryRun && merge.text !== before;
  if (written) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, merge.text);
  }

  return { ...merge, manifestPath, outputDir, diff, written, uploaded, skipped };
}
