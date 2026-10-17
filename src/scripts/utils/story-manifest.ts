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
export function storyUrl(slug: string, override?: string): string {
  return override ?? `/work/${slug}/`;
}

/** Resolve an image id against the manifest that the story route put in `Astro.locals`. */
export function storyPhoto(locals: App.Locals, id: string): StoryPhoto {
  if (!locals.story) throw new Error(`Image id "${id}": story components render only inside a story route`);
  return resolvePhoto(locals.story.slug, locals.story.photos, id);
}
