const STANDARD_WIDTHS = [640, 750, 1080, 1600, 2400];

/**
 * Build the list of widths for srcset given a photo's native width.
 * Returns only standard widths that are ≤ the native width.
 */
export function buildWidthList(nativeWidth: number): number[] {
  return STANDARD_WIDTHS.filter((w) => w <= nativeWidth);
}
