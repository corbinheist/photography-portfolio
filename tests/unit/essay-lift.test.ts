/**
 * Phase 1 migration gate — verifies that lifted essay YAMLs preserve the
 * photo array in the same order as the source .astro inline arrays.
 *
 * This test exists to guard the data lift step and SHOULD BE DELETED once
 * Phase 1 ships and the inline `const photos = [...]` arrays no longer
 * exist in any essay file.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

interface LiftedPhoto {
  url: string;
  width: number;
  height: number;
  lqip: string;
  title?: string;
}

interface LiftedDoc {
  slug: string;
  collectionId: string;
  photos: LiftedPhoto[];
}

const ROOT = path.resolve(__dirname, '../..');

const cases = [
  { yaml: 'morocco-wise-essay.yaml',   astro: 'src/pages/work/morocco/wise-essay.astro' },
  { yaml: 'morocco-nomads-essay.yaml', astro: 'src/pages/work/morocco/nomads-essay.astro' },
  { yaml: 'morocco-ksar-essay.yaml',   astro: 'src/pages/work/morocco/ksar-essay.astro' },
];

function extractInlineUrls(astroSource: string): string[] {
  const cdnMatch = astroSource.match(/const CDN = ['"`]([^'"`]+)['"`]/);
  const cdn = cdnMatch ? cdnMatch[1] : '';

  const urls: string[] = [];

  // CDN-template form: `${CDN}/...`
  const templateRe = /url:\s*`\$\{CDN\}\/([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = templateRe.exec(astroSource)) !== null) {
    urls.push(`${cdn}/${m[1]}`);
  }

  // Plain string form: 'https://...'
  const literalRe = /url:\s*['"]([^'"]+)['"]/g;
  while ((m = literalRe.exec(astroSource)) !== null) {
    urls.push(m[1]);
  }

  return urls;
}

describe('essay data lift — photo order preservation', () => {
  for (const { yaml, astro } of cases) {
    describe(yaml, () => {
      const yamlPath = path.join(ROOT, 'src/data/essays', yaml);
      const astroPath = path.join(ROOT, astro);
      const doc = YAML.parse(fs.readFileSync(yamlPath, 'utf-8')) as LiftedDoc;
      const sourceUrls = extractInlineUrls(fs.readFileSync(astroPath, 'utf-8'));

      it('photo count matches source', () => {
        expect(doc.photos).toHaveLength(sourceUrls.length);
      });

      it('first url matches source[0]', () => {
        expect(doc.photos[0].url).toBe(sourceUrls[0]);
      });

      it('last url matches source[N-1]', () => {
        expect(doc.photos[doc.photos.length - 1].url).toBe(sourceUrls[sourceUrls.length - 1]);
      });

      it('all urls match source in order', () => {
        const yamlUrls = doc.photos.map((p) => p.url);
        expect(yamlUrls).toEqual(sourceUrls);
      });

      it('every photo has positive width and height', () => {
        for (const p of doc.photos) {
          expect(p.width).toBeGreaterThan(0);
          expect(p.height).toBeGreaterThan(0);
        }
      });

      it('every photo has a base64 lqip', () => {
        for (const p of doc.photos) {
          expect(p.lqip).toMatch(/^data:image\/webp;base64,/);
        }
      });
    });
  }
});
