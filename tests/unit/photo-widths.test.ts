import { describe, it, expect } from 'vitest';
import { buildWidthList } from '../../src/scripts/utils/photo-widths';

describe('buildWidthList', () => {
  it('returns all standard widths for exact match at 2400', () => {
    expect(buildWidthList(2400)).toEqual([640, 750, 1080, 1600, 2400]);
  });

  it('returns all standard widths for native larger than 2400', () => {
    expect(buildWidthList(4000)).toEqual([640, 750, 1080, 1600, 2400]);
  });

  it('includes native width when between standards (2048)', () => {
    expect(buildWidthList(2048)).toEqual([640, 750, 1080, 1600, 2048]);
  });

  it('includes native width when between standards (800)', () => {
    expect(buildWidthList(800)).toEqual([640, 750, 800]);
  });

  it('returns single entry for exact match at smallest', () => {
    expect(buildWidthList(640)).toEqual([640]);
  });

  it('includes native width at 1920 between 1600 and 2400', () => {
    expect(buildWidthList(1920)).toEqual([640, 750, 1080, 1600, 1920]);
  });

  it('returns standard widths for exact match at 1080', () => {
    expect(buildWidthList(1080)).toEqual([640, 750, 1080]);
  });
});
