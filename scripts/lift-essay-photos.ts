/**
 * Phase 1 migration — lift inline `const photos = [...]` arrays from essay
 * .astro files into src/data/essays/<collection>-<slug>.yaml.
 *
 * Default mode is --dry-run. Pass --write to apply.
 *
 *   pnpm tsx scripts/lift-essay-photos.ts                  # dry-run all
 *   pnpm tsx scripts/lift-essay-photos.ts --essay=wise-essay
 *   pnpm tsx scripts/lift-essay-photos.ts --write
 *
 * Out of scope (this iteration): rewriting the .astro file to import the
 * lifted YAML, mutating collection YAMLs (essay reference list,
 * `albums` → `archiveAlbums` rename). Those land in a follow-up pass once
 * the YAML output shape is approved.
 */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

interface Photo {
  url: string;
  width: number;
  height: number;
  lqip: string;
  title?: string;
  exif?: Record<string, unknown>;
}

interface EssayDoc {
  slug: string;
  collectionId: string;
  title: string;
  description?: string;
  date?: string;
  location?: string;
  coverPhotoIndex: number;
  photos: Photo[];
}

const ROOT = path.resolve(import.meta.dirname, '..');
const WORK_DIR = path.join(ROOT, 'src/pages/work');
const ESSAYS_DIR = path.join(ROOT, 'src/data/essays');
const COLLECTIONS_DIR = path.join(ROOT, 'src/data/collections');

// Files in src/pages/work/<collection>/ that are NOT essays.
const SKIP_FILES = new Set(['index.astro', 'briefing.astro']);

const args = process.argv.slice(2);
const dryRun = !args.includes('--write');
const printYaml = args.includes('--print');
const filter = args.find((a) => a.startsWith('--essay='))?.split('=')[1];

type EssayPath = { collectionId: string; slug: string; absPath: string };

function findEssayFiles(): EssayPath[] {
  const collections = fs.readdirSync(WORK_DIR).filter((name) => {
    return fs.statSync(path.join(WORK_DIR, name)).isDirectory();
  });

  const out: EssayPath[] = [];
  for (const c of collections) {
    const cDir = path.join(WORK_DIR, c);
    for (const file of fs.readdirSync(cDir)) {
      if (SKIP_FILES.has(file)) continue;
      if (!file.endsWith('.astro')) continue;
      const slug = file.replace(/\.astro$/, '');
      if (filter && filter !== slug) continue;
      out.push({ collectionId: c, slug, absPath: path.join(cDir, file) });
    }
  }
  return out;
}

function extractFrontmatter(source: string): string {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error('no Astro frontmatter found');
  return match[1];
}

function findCDN(frontmatter: string): string {
  const match = frontmatter.match(/const\s+CDN\s*=\s*['"`]([^'"`]+)['"`]/);
  return match ? match[1] : '';
}

/**
 * Walk forward from `const photos = [` to the matching `]`, tracking string
 * literals and comments so brackets inside them don't fool the depth counter.
 * Returns the bracketed array text including the outer `[` and `]`.
 */
function extractPhotosArrayBody(frontmatter: string): string {
  const decl = frontmatter.search(/const\s+photos\s*=\s*\[/);
  if (decl === -1) throw new Error('no `const photos = [` declaration found');
  const start = frontmatter.indexOf('[', decl);

  let depth = 0;
  let inString: string | null = null;
  let inComment: 'line' | 'block' | null = null;
  let escape = false;

  for (let i = start; i < frontmatter.length; i++) {
    const ch = frontmatter[i];
    const next = frontmatter[i + 1];

    if (inComment === 'line') {
      if (ch === '\n') inComment = null;
      continue;
    }
    if (inComment === 'block') {
      if (ch === '*' && next === '/') { inComment = null; i++; }
      continue;
    }
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === inString) { inString = null; continue; }
      if (inString === '`' && ch === '$' && next === '{') {
        // skip past ${...} interpolation
        let braceDepth = 1;
        i += 2;
        while (i < frontmatter.length && braceDepth > 0) {
          if (frontmatter[i] === '{') braceDepth++;
          else if (frontmatter[i] === '}') braceDepth--;
          i++;
        }
        i--; // outer loop will increment
      }
      continue;
    }

    if (ch === '/' && next === '/') { inComment = 'line'; i++; continue; }
    if (ch === '/' && next === '*') { inComment = 'block'; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }

    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return frontmatter.slice(start, i + 1);
    }
  }

  throw new Error('unmatched `[` while parsing photos array');
}

function evalPhotosArray(arrayText: string, cdn: string): Photo[] {
  const fnBody = `const CDN = ${JSON.stringify(cdn)}; return ${arrayText};`;
  // The input is our own source code, parsed bounds-checked above.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return new Function(fnBody)();
}

interface CollectionEssayBlob {
  slug?: string;
  title?: string;
  description?: string;
  coverImage?: { url?: string };
}

function readCollectionEssayBlob(
  collectionId: string,
  slug: string,
): CollectionEssayBlob {
  const collPath = path.join(COLLECTIONS_DIR, `${collectionId}.yaml`);
  if (!fs.existsSync(collPath)) return {};
  const collData = YAML.parse(fs.readFileSync(collPath, 'utf-8')) as
    | { essays?: CollectionEssayBlob[] }
    | undefined;
  const blob = collData?.essays?.find((e) => e.slug === slug);
  return blob ?? {};
}

function deriveCoverIndex(photos: Photo[], coverUrl?: string): number {
  if (!coverUrl) return 0;
  const idx = photos.findIndex((p) => p.url === coverUrl);
  return idx >= 0 ? idx : 0;
}

function main() {
  const essays = findEssayFiles();
  if (essays.length === 0) {
    console.log('No essay files matched.');
    return;
  }

  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'WRITE'}`);
  console.log(`Found ${essays.length} essay file(s).\n`);

  let okCount = 0;
  let skipCount = 0;

  for (const { collectionId, slug, absPath } of essays) {
    const rel = path.relative(ROOT, absPath);
    console.log(`── ${collectionId}/${slug}  (${rel})`);

    try {
      const source = fs.readFileSync(absPath, 'utf-8');
      const fm = extractFrontmatter(source);
      const cdn = findCDN(fm);
      const arrayText = extractPhotosArrayBody(fm);
      const photos = evalPhotosArray(arrayText, cdn);

      const blob = readCollectionEssayBlob(collectionId, slug);
      const coverPhotoIndex = deriveCoverIndex(photos, blob.coverImage?.url);

      const doc: EssayDoc = {
        slug,
        collectionId,
        title: blob.title ?? slug,
        ...(blob.description ? { description: blob.description } : {}),
        coverPhotoIndex,
        photos,
      };

      const yamlOut = YAML.stringify(doc, { lineWidth: 0 });
      const outPath = path.join(ESSAYS_DIR, `${collectionId}-${slug}.yaml`);

      console.log(`   photos:           ${photos.length}`);
      console.log(`   cdn declaration:  ${cdn ? 'yes' : 'inline-urls'}`);
      console.log(`   coverPhotoIndex:  ${coverPhotoIndex}`);
      console.log(`   first url:        ${photos[0]?.url}`);
      console.log(`   last  url:        ${photos[photos.length - 1]?.url}`);
      console.log(`   target:           ${path.relative(ROOT, outPath)}`);

      if (printYaml) {
        console.log('   ────── YAML output ──────');
        console.log(yamlOut.split('\n').map((l) => `   │ ${l}`).join('\n'));
        console.log('   ─────────────────────────');
      }

      if (dryRun) {
        console.log(`   [dry-run] would write ${yamlOut.length} bytes`);
      } else {
        if (!fs.existsSync(ESSAYS_DIR)) fs.mkdirSync(ESSAYS_DIR, { recursive: true });
        fs.writeFileSync(outPath, yamlOut, 'utf-8');
        console.log(`   ✓ wrote (${yamlOut.length} bytes)`);
      }
      okCount++;
    } catch (err) {
      console.log(`   ✗ skip: ${(err as Error).message}`);
      skipCount++;
    }
    console.log();
  }

  console.log(`Done. ${okCount} processed, ${skipCount} skipped.`);
  if (dryRun) console.log('Re-run with --write to apply.');
}

main();
