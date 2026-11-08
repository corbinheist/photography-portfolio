/**
 * Sync the Everyday page (/everyday/) from the Apple Photos album EDC.
 *
 * Usage: pnpm everyday sync [--dry-run] [--publish] [--album <name>]
 *
 * 1. Exports the still photographs of the album as JPEG into _raw/everyday/
 *    (scripts/everyday/export_album.py, through uv and osxphotos). The Photos library is not changed.
 * 2. Processes and uploads each new frame (AVIF and WebP, no EXIF in the variants).
 * 3. Writes src/data/everyday.yaml: captioned frames only, newest first, coordinates to 2 decimal places.
 * 4. With --publish: checks the content, commits the manifest to main, and pushes. CI deploys.
 *
 * --dry-run   Export and process into a temporary directory. Upload nothing, write nothing.
 * --publish   Commit and push the manifest. The checkout must be on main with a clean tree.
 *             The scheduled job (deploy/everyday-sync.sh) passes this flag.
 *
 * Test only (local layout checks; refused with --publish):
 * --limit <n>        Read the newest n frames of the album.
 * --test-alt         Give an uncaptioned frame the alt text "Test frame, <date>".
 *
 * Env vars: DO_SPACES_CDN_ENDPOINT, and for the upload DO_SPACES_KEY, DO_SPACES_SECRET,
 * DO_SPACES_BUCKET, DO_SPACES_REGION (read from .env).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildEveryday, renderEveryday, type ExportedFrame } from './lib/everyday';
import { extractExif, processImage } from './lib/image-pipeline';
import { getConfig, photoObjectKey, spacesStore, uploadFiles, type UploadItem } from './lib/spaces';
import { EVERYDAY_FILE, loadEveryday } from '../src/scripts/utils/everyday';

const USAGE = 'Usage: pnpm everyday sync [--dry-run] [--publish] [--album <name>] [--limit <n>] [--test-alt]';
const root = process.cwd();

function loadDotEnv() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  if (command !== 'sync') throw new Error(USAGE);
  const options = { dryRun: false, publish: false, album: 'EDC', limit: 0, testAlt: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--publish') options.publish = true;
    else if (arg === '--test-alt') options.testAlt = true;
    else if (arg === '--album') options.album = rest[++i] ?? '';
    else if (arg === '--limit') options.limit = Number(rest[++i]);
    else throw new Error(`Unknown argument "${arg}". ${USAGE}`);
  }
  if (!options.album) throw new Error('--album needs a name');
  if (!Number.isInteger(options.limit) || options.limit < 0) throw new Error('--limit needs a whole number');
  if (options.publish && options.dryRun) throw new Error('--publish and --dry-run cannot be used together');
  if (options.publish && (options.limit || options.testAlt || options.album !== 'EDC')) {
    throw new Error('--publish publishes the full album EDC only. Remove --limit, --test-alt, and --album.');
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadDotEnv();

  if (options.publish) {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    if (branch !== 'main') throw new Error(`--publish runs on main only (this checkout is on ${branch})`);
    if (git('status', '--porcelain', '--untracked-files=no') !== '') throw new Error('--publish needs a clean tree');
    git('pull', '--ff-only', '--quiet');
  }

  let cdnBase = process.env.DO_SPACES_CDN_ENDPOINT?.replace(/\/+$/, '');
  if (!cdnBase) {
    if (!options.dryRun) throw new Error('Missing DO_SPACES_CDN_ENDPOINT. The manifest urls need the CDN base url.');
    cdnBase = 'https://cdn.example.invalid';
  }

  // 1. Export.
  const rawDir = path.join(root, '_raw', 'everyday');
  const framesFile = path.join(root, '_raw', 'everyday-frames.json');
  fs.mkdirSync(rawDir, { recursive: true });
  const exportArgs = ['run', '--quiet', 'scripts/everyday/export_album.py', '--album', options.album, '--out', rawDir, '--frames', framesFile, '--root', root];
  if (options.limit) exportArgs.push('--limit', String(options.limit));
  if (options.testAlt) exportArgs.push('--export-uncaptioned');
  console.log(`Reading the Apple Photos album "${options.album}"...`);
  execFileSync('uv', exportArgs, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
  let frames = (JSON.parse(fs.readFileSync(framesFile, 'utf8')) as { frames: ExportedFrame[] }).frames;
  if (options.testAlt) frames = frames.map((frame) => (frame.alt ? frame : { ...frame, alt: `Test frame, ${frame.date}` }));

  // 2. Process the new frames.
  const outputDir = options.dryRun ? fs.mkdtempSync(path.join(os.tmpdir(), 'everyday-')) : path.join(root, '_processed', 'everyday');
  fs.mkdirSync(outputDir, { recursive: true });
  const uploads: UploadItem[] = [];
  const current = loadEveryday(root);
  const plan = await buildEveryday(frames, current, cdnBase, async (frame) => {
    const input = path.join(root, frame.file!);
    const image = await processImage(input, outputDir);
    for (const variant of image.variants) uploads.push({ key: photoObjectKey(image.slug, path.basename(variant.path)), path: variant.path });
    return { width: image.width, height: image.height, lqip: image.lqip, exif: await extractExif(input) };
  });

  // 3. Upload before the manifest changes, so the manifest never names files the CDN lacks.
  if (!options.dryRun && uploads.length > 0) {
    console.log(`Uploading ${uploads.length} variant(s)...`);
    const { uploaded, skipped } = await uploadFiles(spacesStore(getConfig()), uploads);
    console.log(`Uploaded: ${uploaded}, skipped (existing): ${skipped}`);
  }

  const manifestPath = path.join(root, EVERYDAY_FILE);
  const before = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : '';
  const text = renderEveryday(plan.photos);
  const changed = text !== before;

  console.log(`\nPublished: ${plan.photos.length}. Added: ${plan.added.length}, updated: ${plan.updated.length}, removed: ${plan.removed.length}.`);
  for (const frame of plan.held) console.log(`Held (no caption in Photos): ${frame.date} ${frame.uuid}`);
  for (const frame of plan.failed) console.error(`Failed: ${frame.date} ${frame.uuid}: ${frame.error}`);

  if (options.dryRun) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    console.log(changed ? `Dry run: ${EVERYDAY_FILE} would change. Nothing written.` : `Dry run: ${EVERYDAY_FILE} would not change.`);
  } else if (changed) {
    fs.writeFileSync(manifestPath, text);
    console.log(`Wrote ${EVERYDAY_FILE}.`);
    if (options.publish) {
      execFileSync('pnpm', ['--silent', 'validate:content'], { cwd: root, stdio: 'inherit' });
      const parts = [plan.added.length && `${plan.added.length} added`, plan.updated.length && `${plan.updated.length} updated`, plan.removed.length && `${plan.removed.length} removed`].filter(Boolean);
      git('add', EVERYDAY_FILE);
      git('commit', '--quiet', '-m', `Sync the Everyday page: ${parts.join(', ') || 'manifest changed'}`);
      git('push', '--quiet', 'origin', 'main');
      console.log(`Pushed ${git('rev-parse', '--short', 'HEAD')} to main. CI deploys the site.`);
    }
  } else {
    console.log(`${EVERYDAY_FILE}: no change.`);
  }

  if (plan.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('everyday sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
