import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'astro/zod';

/** Directory that holds one photo manifest per story: `<slug>.yaml`. */
export const STORY_PHOTOS_DIR = 'src/data/story-photos';

export const storyPhotoSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  lqip: z.string(),
  alt: z.string(),
  title: z.string().optional(),
  exif: z
    .object({
      camera: z.string().optional(),
      lens: z.string().optional(),
      focalLength: z.string().optional(),
      aperture: z.string().optional(),
      shutter: z.string().optional(),
      iso: z.number().optional(),
      date: z.string().optional(),
    })
    .optional(),
});

export type StoryPhoto = z.infer<typeof storyPhotoSchema>;
export type StoryManifest = Map<string, StoryPhoto>;

/** Parse the YAML text of a manifest. The file is a list of photo entries. */
export function parseManifest(slug: string, source: string): StoryManifest {
  const result = z.array(storyPhotoSchema).safeParse(parse(source));
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Story "${slug}": invalid photo manifest at [${issue.path.join('.')}]: ${issue.message}`);
  }
  const manifest: StoryManifest = new Map();
  for (const photo of result.data) {
    if (manifest.has(photo.id)) throw new Error(`Story "${slug}": duplicate photo id "${photo.id}" in manifest`);
    manifest.set(photo.id, photo);
  }
  return manifest;
}

/** Read `src/data/story-photos/<slug>.yaml` relative to `root`. */
export function loadManifest(slug: string, root = process.cwd()): StoryManifest {
  const file = path.join(root, STORY_PHOTOS_DIR, `${slug}.yaml`);
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`Story "${slug}": photo manifest ${STORY_PHOTOS_DIR}/${slug}.yaml does not exist`);
  }
  return parseManifest(slug, source);
}

/** Look up one photo. A missing id throws, so the build fails and names the story and the id. */
export function resolvePhoto(slug: string, manifest: StoryManifest, id: string): StoryPhoto {
  const photo = manifest.get(id);
  if (!photo) throw new Error(`Story "${slug}": image id "${id}" is not in ${STORY_PHOTOS_DIR}/${slug}.yaml`);
  return photo;
}

/** Find every image id that the MDX body references through <Image id> and <Pair ids>. */
export function extractImageIds(mdx: string): string[] {
  const ids: string[] = [];
  for (const match of mdx.matchAll(/<Image\b[^>]*?\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["']([^"']*)["']\s*\})/g)) {
    ids.push(match[1] ?? match[2] ?? match[3]);
  }
  for (const match of mdx.matchAll(/<Pair\b[^>]*?\bids\s*=\s*\{\s*\[([^\]]*)\]\s*\}/g)) {
    for (const item of match[1].matchAll(/["']([^"']+)["']/g)) ids.push(item[1]);
  }
  return ids;
}

/** Split an MDX file into its YAML frontmatter object and its body. */
export function splitFrontmatter(mdx: string): { data: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(mdx);
  if (!match) return { data: {}, body: mdx };
  return { data: parse(match[1]) ?? {}, body: mdx.slice(match[0].length) };
}

/** Return one message for each broken reference in a story. An empty list means the story is valid. */
export function validateStory(slug: string, frontmatter: Record<string, unknown>, body: string, manifest: StoryManifest): string[] {
  const problems: string[] = [];
  for (const photo of manifest.values()) {
    if (photo.alt.trim() === '') problems.push(`${slug}: manifest entry "${photo.id}" has an empty alt`);
  }
  const cover = frontmatter.cover;
  if (typeof cover !== 'string' || !manifest.has(cover)) problems.push(`${slug}: cover "${String(cover)}" is not in the manifest`);
  for (const id of extractImageIds(body)) {
    if (!manifest.has(id)) problems.push(`${slug}: image id "${id}" is not in the manifest`);
  }
  return problems;
}

/** The public URL of a story: the frontmatter `url` override, or `/work/<slug>/`. */
export function storyUrl(slug: string): string {
  return `/work/${slug}/`;
}

/** Resolve an image id against the manifest that the story route put in `Astro.locals`. */
export function storyPhoto(locals: App.Locals, id: string): StoryPhoto {
  if (!locals.story) throw new Error(`Image id "${id}": story components render only inside a story route`);
  return resolvePhoto(locals.story.slug, locals.story.photos, id);
}

/** Format a story date ("YYYY" or "YYYY-MM") for display, for example "August 2025". */
export function formatStoryDate(date: string): string {
  const [year, month] = date.split('-');
  return month ? new Date(Number(year), Number(month) - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' }) : year;
}

/**
 * Image ids in reading order, with <Image> and <Pair> interleaved as they appear in the MDX.
 * A photograph that appears twice keeps its first position.
 */
export function orderedImageIds(mdx: string): string[] {
  const ordered: string[] = [];
  const pattern = /<Image\b[^>]*?\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["']([^"']*)["']\s*\})|<Pair\b[^>]*?\bids\s*=\s*\{\s*\[([^\]]*)\]\s*\}/g;
  for (const match of mdx.matchAll(pattern)) {
    const ids = match[4] !== undefined ? [...match[4].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]) : [match[1] ?? match[2] ?? match[3]];
    for (const id of ids) if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

/** Format decimal degrees as 31°16′N 5°59′W. */
export function formatCoords({ lat, lon }: { lat: number; lon: number }): string {
  const part = (value: number, positive: string, negative: string) => {
    const abs = Math.abs(value);
    const degrees = Math.floor(abs);
    const minutes = Math.round((abs - degrees) * 60);
    return `${degrees}°${String(minutes).padStart(2, '0')}′${value >= 0 ? positive : negative}`;
  };
  return `${part(lat, 'N', 'S')} ${part(lon, 'E', 'W')}`;
}

/** The cameras and lenses that the EXIF of the given photographs names, most used first. */
export function kitFromExif(photos: StoryPhoto[]): string[] {
  const counts = new Map<string, number>();
  for (const photo of photos) {
    for (const item of [photo.exif?.camera, photo.exif?.lens]) {
      if (item) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([item]) => item.replace(/^Canon Canon /, 'Canon '));
}

/** The EXIF line for a caption, for example "Canon EOS R5m2 · 50mm · f/4 · 1/2500s". */
export function exifLine(photo: StoryPhoto): string | undefined {
  const exif = photo.exif;
  if (!exif) return undefined;
  const parts = [exif.camera, exif.focalLength, exif.aperture, exif.shutter].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/**
 * Story order: newest first. Dates compare as strings, so "2025-11-12" sorts above "2025-11".
 * Stories with the same date fall back to `order`, lowest first.
 */
export function compareStories(
  a: { data: { date: string; order: number } },
  b: { data: { date: string; order: number } },
): number {
  return b.data.date.localeCompare(a.data.date) || a.data.order - b.data.order;
}
