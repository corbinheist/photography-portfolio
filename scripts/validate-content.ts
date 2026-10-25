import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fullBleedIds, GALLERY_EXTRAS_FILE, loadGalleryExtras, loadManifest, MAX_FULL_BLEEDS, splitFrontmatter, storyUrl, validateStory, STORY_PHOTOS_DIR } from '../src/scripts/utils/story-manifest';

type Diagnostic = { level: 'error' | 'warning'; code: string; message: string };

const root = process.cwd();
const storiesDir = path.join(root, 'src/content/stories');
const diagnostics: Diagnostic[] = [];
const error = (code: string, message: string) => diagnostics.push({ level: 'error', code, message });
const warning = (code: string, message: string) => diagnostics.push({ level: 'warning', code, message });

// Every story is one MDX file at /work/<slug>/. A redirect source must not take a story URL.
const config = await readFile(path.join(root, 'astro.config.mjs'), 'utf8');
const redirectSources = new Set([...config.matchAll(/^\s*'(\/[^']+)':\s*'[^']+',?\s*$/gm)].map((match) => match[1].replace(/\/$/, '')));

const storyFiles = (await readdir(storiesDir)).filter((file) => file.endsWith('.mdx')).sort();
const slugs = new Set<string>();

for (const filename of storyFiles) {
  const slug = path.basename(filename, '.mdx');
  slugs.add(slug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) error('story.slug-invalid', `${filename}: the file name must be a kebab-case slug`);

  const { data, body } = splitFrontmatter(await readFile(path.join(storiesDir, filename), 'utf8'));
  if ('url' in data) error('story.url-forbidden', `${slug}: stories are flat; remove the url field (the URL is ${storyUrl(slug)})`);

  let manifest;
  try {
    manifest = loadManifest(slug, root);
  } catch (cause) {
    error('story.manifest-invalid', (cause as Error).message);
    continue;
  }
  for (const problem of validateStory(slug, data, body, manifest)) error('story.reference-invalid', problem);

  // A warning while the stories are brought to the limit one at a time (STU-59); then an error.
  const bleeds = fullBleedIds(body);
  if (bleeds.length > MAX_FULL_BLEEDS) warning('story.full-bleed-limit', `${slug}: ${bleeds.length} full-bleed photographs; the limit is ${MAX_FULL_BLEEDS} (${bleeds.join(', ')})`);

  const route = storyUrl(slug).replace(/\/$/, '');
  if (redirectSources.has(route)) error('story.route-collision', `${slug}: ${route} is also a redirect source in astro.config.mjs`);
}

for (const filename of await readdir(path.join(root, STORY_PHOTOS_DIR))) {
  const slug = path.basename(filename, '.yaml');
  if (filename.endsWith('.yaml') && !slugs.has(slug)) warning('story.manifest-orphan', `${STORY_PHOTOS_DIR}/${filename}: no story uses it`);
}

// Gallery-only photographs: valid entries, unique ids, real alt text.
let extras: ReturnType<typeof loadGalleryExtras> = [];
try {
  extras = loadGalleryExtras(root);
} catch (cause) {
  error('gallery.extras-invalid', (cause as Error).message);
}
const extraIds = new Set<string>();
for (const photo of extras) {
  if (extraIds.has(photo.id)) error('gallery.extra-duplicate', `${GALLERY_EXTRAS_FILE}: duplicate id "${photo.id}"`);
  extraIds.add(photo.id);
  if (!photo.alt.trim()) error('gallery.extra-alt-missing', `${GALLERY_EXTRAS_FILE}: "${photo.id}" has no alt text`);
}

for (const diagnostic of diagnostics) {
  const prefix = diagnostic.level === 'error' ? 'ERROR' : 'WARN ';
  console[diagnostic.level === 'error' ? 'error' : 'warn'](`${prefix} ${diagnostic.code} ${diagnostic.message}`);
}

const errors = diagnostics.filter((item) => item.level === 'error').length;
console.log(`Validated ${storyFiles.length} stories, ${extras.length} gallery-only photographs, and ${redirectSources.size} redirects.`);
console.log(`${errors} error(s), ${diagnostics.length - errors} warning(s).`);
if (errors > 0) process.exitCode = 1;
