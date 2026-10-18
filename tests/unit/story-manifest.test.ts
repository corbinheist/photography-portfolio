import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractImageIds,
  loadManifest,
  parseManifest,
  resolvePhoto,
  splitFrontmatter,
  storyUrl,
  compareStories,
  storyFrames,
  formatCoordinates,
  validateStory,
  STORY_PHOTOS_DIR,
} from '../../src/scripts/utils/story-manifest';

const entry = (id: string, alt = `Alt for ${id}`) => `- id: ${id}
  url: https://cdn.example.com/photos/${id}
  width: 2048
  height: 1367
  lqip: data:image/webp;base64,AAAA
  alt: "${alt}"
`;

describe('parseManifest', () => {
  it('keeps every entry in file order, keyed by id', () => {
    const manifest = parseManifest('tokyo', entry('a') + entry('b'));
    expect([...manifest.keys()]).toEqual(['a', 'b']);
    expect(manifest.get('b')?.width).toBe(2048);
  });

  it('rejects an entry without a required field and names the story', () => {
    expect(() => parseManifest('tokyo', '- id: a\n  url: https://cdn.example.com/a\n')).toThrow(/Story "tokyo": invalid photo manifest/);
  });

  it('rejects a duplicate id', () => {
    expect(() => parseManifest('tokyo', entry('a') + entry('a'))).toThrow(/duplicate photo id "a"/);
  });
});

describe('loadManifest', () => {
  it('reads src/data/story-photos/<slug>.yaml under the root', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'story-'));
    mkdirSync(path.join(root, STORY_PHOTOS_DIR), { recursive: true });
    writeFileSync(path.join(root, STORY_PHOTOS_DIR, 'tokyo.yaml'), entry('a'));
    expect(loadManifest('tokyo', root).has('a')).toBe(true);
  });

  it('names the missing manifest file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'story-'));
    expect(() => loadManifest('tokyo', root)).toThrow(/story-photos\/tokyo\.yaml does not exist/);
  });
});

describe('resolvePhoto', () => {
  it('fails with the story and the id when the id is missing', () => {
    const manifest = parseManifest('tokyo', entry('a'));
    expect(resolvePhoto('tokyo', manifest, 'a').id).toBe('a');
    expect(() => resolvePhoto('tokyo', manifest, 'zzz')).toThrow('Story "tokyo": image id "zzz" is not in src/data/story-photos/tokyo.yaml');
  });
});

describe('extractImageIds', () => {
  it('finds ids in <Image> and <Pair> in every quoting style', () => {
    const mdx = `
<Image id="a" caption="One" />
<Image caption='Two' id='b' />
<Image id={"c"} />
<Pair ids={["d", 'e']} captions={["x", "y"]} />
`;
    expect(extractImageIds(mdx)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('validateStory', () => {
  const manifest = parseManifest('tokyo', entry('a') + entry('b', ' '));
  const { data, body } = splitFrontmatter('---\ntitle: T\ncover: missing\n---\n\n<Image id="a" />\n<Pair ids={["a", "c"]} />\n');

  it('reports an empty alt, a missing cover, and an unknown image id', () => {
    expect(validateStory('tokyo', data, body, manifest)).toEqual([
      'tokyo: manifest entry "b" has an empty alt',
      'tokyo: cover "missing" is not in the manifest',
      'tokyo: image id "c" is not in the manifest',
    ]);
  });

  it('accepts a story whose references all resolve', () => {
    const good = parseManifest('tokyo', entry('a'));
    expect(validateStory('tokyo', { cover: 'a' }, '<Image id="a" />', good)).toEqual([]);
  });
});

describe('storyUrl', () => {
  it('puts every story at /work/<slug>/', () => {
    expect(storyUrl('tokyo')).toBe('/work/tokyo/');
  });
});

describe('compareStories', () => {
  const story = (date: string, order: number) => ({ data: { date, order } });

  it('puts the newest story first', () => {
    const sorted = [story('2024-06', 1), story('2026-04', 1), story('2025-08', 1)].sort(compareStories);
    expect(sorted.map((s) => s.data.date)).toEqual(['2026-04', '2025-08', '2024-06']);
  });

  it('puts a dated day above the same month without a day', () => {
    const sorted = [story('2025-11', 1), story('2025-11-12', 9)].sort(compareStories);
    expect(sorted.map((s) => s.data.date)).toEqual(['2025-11-12', '2025-11']);
  });

  it('falls back to order for the same date', () => {
    const sorted = [story('2025-11', 5), story('2025-11', 1), story('2025-11', 2)].sort(compareStories);
    expect(sorted.map((s) => s.data.order)).toEqual([1, 2, 5]);
  });
});

describe('formatCoordinates', () => {
  it('formats decimal degrees with hemispheres', () => {
    expect(formatCoordinates({ latitude: 31.2667, longitude: -5.9833 })).toBe('31°16′N 5°59′W');
    expect(formatCoordinates({ latitude: -50.917, longitude: -72.4 })).toBe('50°55′S 72°24′W');
  });
});

describe('storyFrames', () => {
  it('counts the cover as frame 01 when the body does not show it', () => {
    expect(storyFrames('<Image id="b" />\n<Pair ids={["c", "d"]} />', 'a')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the body order when the body shows the cover', () => {
    expect(storyFrames('<Image id="b" />\n<Image id="a" />', 'a')).toEqual(['b', 'a']);
  });
});
