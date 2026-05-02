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
 * What --write does (in order, per-essay):
 *   1. Emits src/data/essays/<collectionId>-<slug>.yaml.
 *   2. Rewrites the .astro file: removes the inline `const photos = [...]`
 *      and any `const CDN = '...'`, inserts an `import { getEntry }`
 *      and an `await getEntry('essays', '<id>')` lookup.
 *   3. Mutates the collection YAML: replaces the legacy `essays: [{}]`
 *      blob with a string-id reference list and renames `albums:`
 *      to `archiveAlbums:`.
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
const printRewrite = args.includes('--print-rewrite');
const mutateCollections = args.includes('--collections');
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

/**
 * Find the byte range [start, endExclusive) of the full
 * `const photos = [ ... ];` declaration including the trailing semicolon.
 * Walks the source bracket-by-bracket, tracking strings and comments so
 * brackets inside them don't fool the depth counter.
 */
function findPhotosDeclRange(source: string): { start: number; end: number } {
  const declMatch = source.match(/const\s+photos\s*=\s*\[/);
  if (!declMatch || declMatch.index === undefined) {
    throw new Error('no `const photos = [` declaration found in source');
  }
  const declStart = declMatch.index;
  const openBracket = source.indexOf('[', declStart);

  // If a /** ... */ doc comment immediately precedes the declaration (only
  // whitespace between), absorb it — its content describes the array we're
  // about to delete and would otherwise dangle. Find the LAST doc comment
  // in `before`, then only absorb it if nothing but whitespace separates
  // its `*/` from `declStart`.
  let start = declStart;
  const before = source.slice(0, declStart);
  const docCommentRe = /\/\*\*[\s\S]*?\*\//g;
  let lastDocComment: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = docCommentRe.exec(before)) !== null) {
    lastDocComment = m;
  }
  if (lastDocComment) {
    const tail = before.slice(lastDocComment.index + lastDocComment[0].length);
    if (/^\s*$/.test(tail)) {
      start = lastDocComment.index;
    }
  }

  let depth = 0;
  let inString: string | null = null;
  let inComment: 'line' | 'block' | null = null;
  let escape = false;
  let closeBracket = -1;

  for (let i = openBracket; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inComment === 'line') { if (ch === '\n') inComment = null; continue; }
    if (inComment === 'block') {
      if (ch === '*' && next === '/') { inComment = null; i++; }
      continue;
    }
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === inString) { inString = null; continue; }
      if (inString === '`' && ch === '$' && next === '{') {
        let braceDepth = 1;
        i += 2;
        while (i < source.length && braceDepth > 0) {
          if (source[i] === '{') braceDepth++;
          else if (source[i] === '}') braceDepth--;
          i++;
        }
        i--;
      }
      continue;
    }
    if (ch === '/' && next === '/') { inComment = 'line'; i++; continue; }
    if (ch === '/' && next === '*') { inComment = 'block'; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }

    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) { closeBracket = i; break; }
    }
  }
  if (closeBracket === -1) throw new Error('unmatched `[` in photos declaration');

  let end = closeBracket + 1;
  if (source[end] === ';') end++;
  return { start, end };
}

/**
 * Rewrite an essay .astro file to consume photo data from the `essays`
 * content collection instead of the inline array.
 *
 * Removes:  `const CDN = '...';` (when present)
 *           `const photos = [ ... ];`
 * Inserts:  `import { getEntry } from 'astro:content';` (if missing)
 *           `const essay = await getEntry('essays', '<id>');`
 *           `const photos = essay!.data.photos;`
 */
function rewriteEssayAstro(
  source: string,
  collectionId: string,
  slug: string,
): string {
  const fmStart = source.indexOf('---');
  if (fmStart !== 0) throw new Error('expected file to start with ---');
  const fmContentStart = source.indexOf('\n', fmStart) + 1;
  const fmContentEnd = source.indexOf('\n---', fmContentStart);
  if (fmContentEnd === -1) throw new Error('frontmatter close delimiter not found');

  let fm = source.slice(fmContentStart, fmContentEnd);

  // 1. Replace the photos declaration with the lookup.
  const range = findPhotosDeclRange(fm);
  const id = `${collectionId}-${slug}`;
  const lookup =
    `const essay = await getEntry('essays', '${id}');\n` +
    `const photos = essay!.data.photos;`;
  fm = fm.slice(0, range.start) + lookup + fm.slice(range.end);

  // 2. Remove `const CDN = '...';` line if present (no longer used).
  fm = fm.replace(
    /^const\s+CDN\s*=\s*['"`][^'"`]+['"`]\s*;?\s*\n+/m,
    '',
  );

  // 3. Ensure `import { getEntry } from 'astro:content';` is present.
  if (!/import[^;]*\bgetEntry\b[^;]*from\s*['"]astro:content['"]/.test(fm)) {
    // Insert after the LAST top-level import statement.
    const importRe = /^import\s+[\s\S]*?from\s*['"][^'"]+['"]\s*;?$/gm;
    let lastImportEnd = 0;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(fm)) !== null) {
      lastImportEnd = m.index + m[0].length;
    }
    if (lastImportEnd === 0) {
      // No imports found — prepend.
      fm = `import { getEntry } from 'astro:content';\n` + fm;
    } else {
      fm =
        fm.slice(0, lastImportEnd) +
        `\nimport { getEntry } from 'astro:content';` +
        fm.slice(lastImportEnd);
    }
  }

  return source.slice(0, fmContentStart) + fm + source.slice(fmContentEnd);
}

interface CollectionYamlMutation {
  collectionPath: string;
  changed: boolean;
  renamedAlbums: boolean;
  replacedEssaysBlob: boolean;
  newEssaysList: string[] | null;
}

/**
 * Mutate a collection YAML text:
 *   - Rename `albums:` → `archiveAlbums:`
 *   - Replace `essays: [{...}]` blob with `essays: [<id>, ...]` string refs
 * Comment-preserving via `yaml.parseDocument`. Pure (no I/O).
 */
function applyCollectionYamlMutation(
  yamlText: string,
  collectionId: string,
): { text: string; mutation: CollectionYamlMutation } {
  const doc = YAML.parseDocument(yamlText);
  let renamedAlbums = false;
  let replacedEssaysBlob = false;
  let newEssaysList: string[] | null = null;

  if (doc.has('albums')) {
    const albumsNode = doc.get('albums', true);
    doc.delete('albums');
    doc.set('archiveAlbums', albumsNode);
    renamedAlbums = true;
  }

  // doc.get('essays') returns a YAMLSeq node, not a plain JS array, so
  // round-trip via toJS() to inspect the shape.
  const essaysJS = (doc.toJS() as { essays?: unknown }).essays;
  const isBlobList =
    Array.isArray(essaysJS) &&
    essaysJS.length > 0 &&
    typeof essaysJS[0] === 'object' &&
    essaysJS[0] !== null &&
    'slug' in (essaysJS[0] as object);
  if (isBlobList) {
    newEssaysList = (essaysJS as { slug: string }[])
      .filter((e) => typeof e.slug === 'string')
      .map((e) => `${collectionId}-${e.slug}`);
    doc.set('essays', newEssaysList);
    replacedEssaysBlob = true;
  }

  return {
    text: doc.toString(),
    mutation: {
      collectionPath: '',
      changed: renamedAlbums || replacedEssaysBlob,
      renamedAlbums,
      replacedEssaysBlob,
      newEssaysList,
    },
  };
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

      // 2. Compute the .astro rewrite.
      const rewritten = rewriteEssayAstro(source, collectionId, slug);
      const rewriteBytesDelta = rewritten.length - source.length;

      if (printRewrite) {
        const head = rewritten.split('\n').slice(0, 30).join('\n');
        console.log('   ────── rewritten frontmatter (first 30 lines) ──────');
        console.log(head.split('\n').map((l) => `   │ ${l}`).join('\n'));
        console.log('   ────────────────────────────────────────────────────');
      }

      if (dryRun) {
        console.log(`   [dry-run] yaml:    ${yamlOut.length} bytes`);
        console.log(`   [dry-run] rewrite: ${rewriteBytesDelta >= 0 ? '+' : ''}${rewriteBytesDelta} bytes vs original`);
      } else {
        if (!fs.existsSync(ESSAYS_DIR)) fs.mkdirSync(ESSAYS_DIR, { recursive: true });
        fs.writeFileSync(outPath, yamlOut, 'utf-8');
        fs.writeFileSync(absPath, rewritten, 'utf-8');
        console.log(`   ✓ wrote yaml (${yamlOut.length} bytes)`);
        console.log(`   ✓ rewrote .astro (${rewriteBytesDelta >= 0 ? '+' : ''}${rewriteBytesDelta} bytes)`);
      }
      okCount++;
    } catch (err) {
      console.log(`   ✗ skip: ${(err as Error).message}`);
      skipCount++;
    }
    console.log();
  }

  if (!mutateCollections) {
    console.log();
    console.log('Skipping collection YAML mutations (pass --collections to apply).');
    console.log(`Done. ${okCount} essays processed, ${skipCount} skipped.`);
    if (dryRun) console.log('Re-run with --write to apply.');
    return;
  }

  // 3. Mutate collection YAMLs (rename albums → archiveAlbums; replace essays blob).
  console.log('── collection YAMLs ──');
  const collectionFiles = fs
    .readdirSync(COLLECTIONS_DIR)
    .filter((f) => f.endsWith('.yaml'));
  for (const cf of collectionFiles) {
    const collectionId = cf.replace(/\.yaml$/, '');
    const cPath = path.join(COLLECTIONS_DIR, cf);
    const before = fs.readFileSync(cPath, 'utf-8');
    const { text: after, mutation } = applyCollectionYamlMutation(before, collectionId);

    if (!mutation.changed) {
      console.log(`   ${collectionId}: unchanged`);
      continue;
    }

    const parts: string[] = [];
    if (mutation.renamedAlbums) parts.push('albums→archiveAlbums');
    if (mutation.replacedEssaysBlob) parts.push(`essays→[${mutation.newEssaysList?.join(', ')}]`);
    console.log(`   ${collectionId}: ${parts.join(' · ')}`);

    if (!dryRun) {
      fs.writeFileSync(cPath, after, 'utf-8');
    }
  }

  console.log();
  console.log(`Done. ${okCount} essays processed, ${skipCount} skipped.`);
  if (dryRun) console.log('Re-run with --write to apply.');
}

main();
