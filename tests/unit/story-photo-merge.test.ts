// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { parse } from 'yaml';
import { describe, expect, it, vi } from 'vitest';
import { diffLines, mergeManifest, type GeneratedPhoto } from '../../scripts/lib/story-photo-merge';
import { runPhotos } from '../../scripts/lib/photos';
import type { ObjectStore } from '../../scripts/lib/spaces';
import { STORY_PHOTOS_DIR } from '../../src/scripts/utils/story-manifest';

const photo = (id: string, width = 2048): GeneratedPhoto => ({
  id,
  url: `https://cdn.example.com/photos/${id}`,
  width,
  height: 1367,
  lqip: `data:image/webp;base64,${id.toUpperCase()}`,
});

const handWritten = `# Reviewed by hand.
- id: b
  url: https://cdn.example.com/photos/b
  width: 1000
  height: 1367
  lqip: data:image/webp;base64,OLD
  alt: A hand-written alt for b
  title: Title B
  caption: A field the script does not know
  exif:
    camera: Leica Q2
    lens: Corrected by hand
- id: gone
  url: https://cdn.example.com/photos/gone
  width: 2048
  height: 1367
  lqip: data:image/webp;base64,GONE
  alt: An image that left _raw
- id: a
  url: https://cdn.example.com/photos/a
  width: 2048
  height: 1367
  lqip: data:image/webp;base64,A
  alt: A hand-written alt for a
`;

const entries = (text: string) => parse(text) as Record<string, any>[];

describe('mergeManifest', () => {
  it('creates a manifest with an empty alt for each new image', () => {
    const result = mergeManifest('s', null, [photo('a'), { ...photo('b'), exif: { camera: 'X', iso: 200, date: '2025-08-01' } }]);
    expect(result.added).toEqual(['a', 'b']);
    expect(entries(result.text).map((e) => [e.id, e.alt])).toEqual([['a', ''], ['b', '']]);
    expect(entries(result.text)[1].exif).toEqual({ camera: 'X', iso: 200, date: '2025-08-01' });
    expect(result.text).toContain('date: "2025-08-01"');
  });

  it('keeps hand-written alt, title, and unknown fields', () => {
    const result = mergeManifest('s', handWritten, [photo('a'), photo('b')]);
    const b = entries(result.text).find((e) => e.id === 'b')!;
    expect(b.alt).toBe('A hand-written alt for b');
    expect(b.title).toBe('Title B');
    expect(b.caption).toBe('A field the script does not know');
    expect(result.text.startsWith('# Reviewed by hand.')).toBe(true);
  });

  it('overwrites the generated fields and keeps exif sub-fields the image does not carry', () => {
    const result = mergeManifest('s', handWritten, [{ ...photo('b'), exif: { camera: 'Leica M11' } }]);
    const b = entries(result.text).find((e) => e.id === 'b')!;
    expect(b.width).toBe(2048);
    expect(b.lqip).toBe('data:image/webp;base64,B');
    expect(b.exif).toEqual({ camera: 'Leica M11', lens: 'Corrected by hand' });
    expect(result.updated).toEqual(['b']);
  });

  it('keeps the existing order and appends new images at the end', () => {
    const result = mergeManifest('s', handWritten, [photo('new-1'), photo('a'), photo('b'), photo('new-2')]);
    expect(entries(result.text).map((e) => e.id)).toEqual(['b', 'gone', 'a', 'new-1', 'new-2']);
    expect(result.added).toEqual(['new-1', 'new-2']);
  });

  it('never deletes an entry and reports entries with no source image as missing', () => {
    const result = mergeManifest('s', handWritten, [photo('a')]);
    expect(entries(result.text).map((e) => e.id)).toEqual(['b', 'gone', 'a']);
    expect(result.missing).toEqual(['b', 'gone']);
  });

  it('returns the same text when nothing changed', () => {
    const first = mergeManifest('s', null, [photo('a'), photo('b')]).text;
    const second = mergeManifest('s', first, [photo('a'), photo('b')]);
    expect(second.text).toBe(first);
    expect(second.unchanged).toEqual(['a', 'b']);
    expect(diffLines(first, second.text)).toBe('');
  });

  it('rejects two source images with the same id', () => {
    expect(() => mergeManifest('s', null, [photo('a'), photo('a')])).toThrow(/two source images have the id "a"/);
  });

  it('rejects a manifest that is not a list', () => {
    expect(() => mergeManifest('s', 'id: a\n', [photo('a')])).toThrow(/must be a list/);
  });
});

describe('diffLines', () => {
  it('marks removed and added lines with context', () => {
    expect(diffLines('a\nb\nc\n', 'a\nB\nc\n', 1)).toBe('  a\n- b\n+ B\n  c');
  });
});

async function makeImage(file: string, width: number, height: number) {
  await sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .jpeg()
    .toFile(file);
}

function fakeStore(existing: string[] = []): ObjectStore & { puts: string[] } {
  const keys = new Set(existing);
  const puts: string[] = [];
  return {
    puts,
    exists: vi.fn(async (key: string) => keys.has(key)),
    put: vi.fn(async (key: string) => {
      keys.add(key);
      puts.push(key);
    }),
  };
}

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'photos-test-'));
  const raw = path.join(root, '_raw', 'trip');
  mkdirSync(raw, { recursive: true });
  await makeImage(path.join(raw, 'First Shot.jpg'), 800, 600);
  await makeImage(path.join(raw, 'second.png'), 700, 500);
  return { root, raw };
}

describe('runPhotos', () => {
  const options = (root: string) => ({ slug: 'trip', root, cdnBase: 'https://cdn.example.com', dryRun: false, upload: true });

  it('processes, uploads new variants only, and writes the manifest', async () => {
    const { root } = await fixture();
    const store = fakeStore(['photos/first-shot/first-shot-640.webp']);
    const result = await runPhotos(options(root), store);

    expect(store.puts.sort()).toEqual([
      'photos/first-shot/first-shot-640.avif',
      'photos/first-shot/first-shot-750.avif',
      'photos/first-shot/first-shot-750.webp',
      'photos/second/second-640.avif',
      'photos/second/second-640.webp',
    ]);
    expect(result.skipped).toBe(1);
    expect(readdirSync(path.join(root, '_processed', 'trip', 'first-shot')).sort()).toEqual([
      'first-shot-640.avif',
      'first-shot-640.webp',
      'first-shot-750.avif',
      'first-shot-750.webp',
    ]);

    const manifest = entries(readFileSync(path.join(root, STORY_PHOTOS_DIR, 'trip.yaml'), 'utf8'));
    expect(manifest.map((e) => [e.id, e.url, e.width, e.height, e.alt])).toEqual([
      ['first-shot', 'https://cdn.example.com/photos/first-shot', 800, 600, ''],
      ['second', 'https://cdn.example.com/photos/second', 700, 500, ''],
    ]);
    expect(manifest[0].lqip).toMatch(/^data:image\/webp;base64,/);
  });

  it('keeps hand-written alt on a re-run and warns about a removed source image', async () => {
    const { root, raw } = await fixture();
    await runPhotos({ ...options(root), upload: false });
    const file = path.join(root, STORY_PHOTOS_DIR, 'trip.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace("alt: \"\"", 'alt: Written by hand'));

    await makeImage(path.join(raw, 'third.jpg'), 650, 400);
    rmSync(path.join(raw, 'second.png'));
    const result = await runPhotos({ ...options(root), upload: false });

    const manifest = entries(readFileSync(file, 'utf8'));
    expect(manifest.map((e) => [e.id, e.alt])).toEqual([
      ['first-shot', 'Written by hand'],
      ['second', ''],
      ['third', ''],
    ]);
    expect(result.missing).toEqual(['second']);
    expect(result.added).toEqual(['third']);
  });

  it('writes nothing to the repository and uploads nothing on a dry run', async () => {
    const { root } = await fixture();
    const store = fakeStore();
    const result = await runPhotos({ ...options(root), dryRun: true }, store);

    expect(store.exists).not.toHaveBeenCalled();
    expect(existsSync(path.join(root, STORY_PHOTOS_DIR, 'trip.yaml'))).toBe(false);
    expect(existsSync(path.join(root, '_processed'))).toBe(false);
    expect(result.outputDir.startsWith(tmpdir())).toBe(true);
    expect(result.written).toBe(false);
    expect(result.diff).toContain('+ - id: first-shot');
  });

  it('rejects two source files with the same id', async () => {
    const { root, raw } = await fixture();
    await makeImage(path.join(raw, 'first shot.png'), 700, 500);
    await expect(runPhotos({ ...options(root), upload: false })).rejects.toThrow(/both have the id "first-shot"/);
  });
});
