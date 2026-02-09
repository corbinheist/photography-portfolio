const STANDARD_WIDTHS = [640, 750, 1080, 1600, 2400];

/**
 * Build the list of widths for srcset given a photo's native width.
 * Includes the native width if it falls between standard breakpoints.
 * Excludes standard widths larger than the native width.
 */
export function buildWidthList(nativeWidth: number): number[] {
  const below = STANDARD_WIDTHS.filter((w) => w <= nativeWidth);
  const largest = STANDARD_WIDTHS[STANDARD_WIDTHS.length - 1];
  // If native >= largest standard or is an exact standard match, just return standards
  if (nativeWidth >= largest || STANDARD_WIDTHS.includes(nativeWidth)) {
    return below;
  }
  // Native falls between standards — include it as an extra variant
  return [...below, nativeWidth].sort((a, b) => a - b);
}
