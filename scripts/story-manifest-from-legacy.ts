/**
 * Write a story photo manifest from a legacy album or essay.
 *
 * Usage:
 *   pnpm tsx scripts/story-manifest-from-legacy.ts album <album-id> [story-slug] [--force]
 *   pnpm tsx scripts/story-manifest-from-legacy.ts essay <essay-id> [story-slug] [--force]
 *
 * The output is src/data/story-photos/<story-slug>.yaml. The slug defaults to the source id.
 * The script keeps the source photo order. It copies each photo `title` into `alt`, because
 * the legacy data has no alt text. A person must review every `alt` before the story publishes.
 * The script refuses to overwrite an existing manifest unless you pass --force, so reviewed alt
 * text is not lost.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { STORY_PHOTOS_DIR, type StoryPhoto } from '../src/scripts/utils/story-manifest';

type LegacyPhoto = Omit<StoryPhoto, 'id' | 'alt'> & { title: string };

const args = process.argv.slice(2);
const force = args.includes('--force');
const [kind, sourceId, slug = sourceId] = args.filter((arg) => arg !== '--force');
const readYaml = (file: string) => parse(readFileSync(path.resolve('src/data', file), 'utf8'));

if (!['album', 'essay'].includes(kind) || !sourceId) {
  console.error('Usage: story-manifest-from-legacy.ts album|essay <source-id> [story-slug] [--force]');
  process.exit(1);
}

const legacyPhotos: LegacyPhoto[] = kind === 'album'
  ? (readYaml(`albums/${sourceId}.yaml`).photos as string[]).map((id) => readYaml(`photos/${id}.yaml`))
  : readYaml(`essays/${sourceId}.yaml`).photos;

const manifest: StoryPhoto[] = legacyPhotos.map((photo) => ({
  id: photo.url.split('/').pop()!,
  url: photo.url,
  width: photo.width,
  height: photo.height,
  lqip: photo.lqip,
  alt: photo.title,
  title: photo.title,
  ...(photo.exif ? { exif: photo.exif } : {}),
}));

const output = path.resolve(STORY_PHOTOS_DIR, `${slug}.yaml`);
if (existsSync(output) && !force) {
  console.error(`${path.relative(process.cwd(), output)} exists. Pass --force to overwrite it.`);
  process.exit(1);
}
writeFileSync(output, stringify(manifest, { lineWidth: 0 }));
console.log(`Wrote ${manifest.length} photos to ${path.relative(process.cwd(), output)}. Review every alt.`);
