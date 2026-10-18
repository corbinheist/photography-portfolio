/**
 * Publish the photos of one story.
 *
 * Usage: pnpm photos <slug> [--dry-run] [--no-upload]
 *
 * 1. Processes _raw/<slug>/ into _processed/<slug>/<id>/ (AVIF + WebP at the standard widths, LQIP).
 * 2. Uploads the variants to photos/<id>/ on DigitalOcean Spaces. It skips files the bucket has.
 * 3. Writes or updates src/data/story-photos/<slug>.yaml. A re-run keeps alt, title, every other
 *    hand-written field, and the entry order. It appends new images and never deletes an entry.
 *
 * --dry-run   Process into a temporary directory, skip the upload, print the manifest diff,
 *             and write nothing to the repository.
 * --no-upload Process and write the manifest, but skip the upload.
 *
 * Env vars: DO_SPACES_CDN_ENDPOINT (the photo urls), and for the upload DO_SPACES_KEY,
 * DO_SPACES_SECRET, DO_SPACES_BUCKET, DO_SPACES_REGION.
 */

import fs from 'node:fs';
import path from 'node:path';
import { runPhotos } from './lib/photos';
import { getConfig, spacesStore } from './lib/spaces';

const DRY_RUN_CDN = 'https://cdn.example.invalid';
const USAGE = 'Usage: pnpm photos <slug> [--dry-run] [--no-upload]';

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((arg) => arg.startsWith('--'));
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const unknown = flags.filter((flag) => !['--dry-run', '--no-upload'].includes(flag));
  if (positional.length !== 1 || unknown.length > 0) {
    console.error(USAGE);
    process.exit(1);
  }

  const slug = positional[0];
  const dryRun = flags.includes('--dry-run');
  const upload = !dryRun && !flags.includes('--no-upload');

  let cdnBase = process.env.DO_SPACES_CDN_ENDPOINT?.replace(/\/+$/, '');
  if (!cdnBase) {
    if (!dryRun) {
      console.error('Missing DO_SPACES_CDN_ENDPOINT. The manifest urls need the CDN base url.');
      process.exit(1);
    }
    cdnBase = DRY_RUN_CDN;
    console.warn(`DO_SPACES_CDN_ENDPOINT is not set. The dry run uses ${DRY_RUN_CDN} in the urls.`);
  }

  const store = upload ? spacesStore(getConfig()) : undefined;
  const result = await runPhotos({ slug, root: process.cwd(), cdnBase, dryRun, upload }, store);
  const manifest = path.relative(process.cwd(), result.manifestPath);

  console.log('');
  if (result.diff === '') {
    console.log(`${manifest}: no change.`);
  } else {
    console.log(`${manifest} diff:\n${result.diff}\n`);
  }
  console.log(
    `Added: ${result.added.length}, Updated: ${result.updated.length}, Unchanged: ${result.unchanged.length}`,
  );
  for (const id of result.missing) {
    console.warn(`Warning: manifest entry "${id}" has no image in _raw/${slug}/. The entry stays.`);
  }

  if (dryRun) {
    fs.rmSync(result.outputDir, { recursive: true, force: true });
    console.log('Dry run: nothing uploaded, nothing written to the repository.');
  } else {
    if (!upload) console.log('Upload skipped (--no-upload).');
    if (result.written) console.log(`Wrote ${manifest}.`);
    if (result.added.length > 0) console.log(`Write the alt text for the ${result.added.length} new entr${result.added.length === 1 ? 'y' : 'ies'}.`);
  }
}

main().catch((err) => {
  console.error('photos failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
