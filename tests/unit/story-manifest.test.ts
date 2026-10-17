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
  it('defaults to /work/<slug>/ and honours the override', () => {
    expect(storyUrl('tokyo')).toBe('/work/tokyo/');
    expect(storyUrl('nomads', '/work/morocco/nomads-essay/')).toBe('/work/morocco/nomads-essay/');
  });
});
