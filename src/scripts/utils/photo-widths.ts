const STANDARD_WIDTHS = [640, 750, 1080, 1600, 2400];

/**
 * Build the list of widths for srcset given a photo's native width.
 * Returns only standard widths that are ≤ the native width.
 */
export function buildWidthList(nativeWidth: number): number[] {
  return STANDARD_WIDTHS.filter((w) => w <= nativeWidth);
}

export function buildPhotoUrl(
  url: string,
  nativeWidth: number,
  targetWidth: number,
  format: 'avif' | 'webp' = 'webp',
): string {
  const widths = buildWidthList(nativeWidth);
  if (widths.length === 0) throw new Error(`Photo source ${url} is narrower than the smallest generated width.`);
  const width = widths.filter((candidate) => candidate <= targetWidth).at(-1) ?? widths[0];
  const slug = url.split('/').pop() || '';
  return `${url}/${slug}-${width}.${format}`;
}
