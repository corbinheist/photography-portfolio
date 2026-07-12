import { describe, it, expect } from 'vitest';
import { buildPhotoUrl, buildWidthList } from '../../src/scripts/utils/photo-widths';

describe('buildWidthList', () => {
  it('returns all standard widths for exact match at 2400', () => {
    expect(buildWidthList(2400)).toEqual([640, 750, 1080, 1600, 2400]);
  });

  it('returns all standard widths for native larger than 2400', () => {
    expect(buildWidthList(4000)).toEqual([640, 750, 1080, 1600, 2400]);
  });

  it('caps at largest standard ≤ native (2048)', () => {
    expect(buildWidthList(2048)).toEqual([640, 750, 1080, 1600]);
  });

  it('caps at largest standard ≤ native (800)', () => {
    expect(buildWidthList(800)).toEqual([640, 750]);
  });

  it('returns single entry for exact match at smallest', () => {
    expect(buildWidthList(640)).toEqual([640]);
  });

  it('caps at 1600 for 1920px native', () => {
    expect(buildWidthList(1920)).toEqual([640, 750, 1080, 1600]);
  });

  it('returns standard widths for exact match at 1080', () => {
    expect(buildWidthList(1080)).toEqual([640, 750, 1080]);
  });
});

describe('buildPhotoUrl', () => {
  it('selects the largest generated width at or below the target', () => {
    expect(buildPhotoUrl('https://cdn.test/photos/frame', 2048, 1200, 'avif'))
      .toBe('https://cdn.test/photos/frame/frame-1080.avif');
  });

  it('falls back to the largest generated width for smaller sources', () => {
    expect(buildPhotoUrl('https://cdn.test/photos/frame', 800, 1080))
      .toBe('https://cdn.test/photos/frame/frame-750.webp');
  });

  it('uses the smallest generated width when the target is below 640', () => {
    expect(buildPhotoUrl('https://cdn.test/photos/frame', 2400, 500))
      .toBe('https://cdn.test/photos/frame/frame-640.webp');
  });

  it('rejects sources without a generated width', () => {
    expect(() => buildPhotoUrl('https://cdn.test/photos/frame', 500, 1080)).toThrow();
  });
});
