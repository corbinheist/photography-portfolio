import { describe, it, expect } from 'vitest';
import { selectBestWidth } from '../../src/scripts/lightbox';

describe('selectBestWidth', () => {
  it('returns 2400 for native width larger than all standards', () => {
    expect(selectBestWidth(4000)).toBe(2400);
  });

  it('returns 2400 for exact match', () => {
    expect(selectBestWidth(2400)).toBe(2400);
  });

  it('returns 1600 for 2048 (must NOT request non-standard width)', () => {
    expect(selectBestWidth(2048)).toBe(1600);
  });

  it('returns 750 for width between standards', () => {
    expect(selectBestWidth(800)).toBe(750);
  });

  it('returns 640 for width smaller than smallest standard', () => {
    expect(selectBestWidth(500)).toBe(640);
  });

  it('returns exact standard for each standard width', () => {
    expect(selectBestWidth(640)).toBe(640);
    expect(selectBestWidth(750)).toBe(750);
    expect(selectBestWidth(1080)).toBe(1080);
    expect(selectBestWidth(1600)).toBe(1600);
  });
});
