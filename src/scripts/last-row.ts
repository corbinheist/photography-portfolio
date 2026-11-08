/**
 * Justified rows: the last row takes the height of the row above.
 *
 * A full row grows to the page width, so its frames end up taller than the base row height. The
 * last row must not grow (a lone frame would fill the page), so it stays at the base height and
 * looks smaller than the row above. CSS cannot size one flex line from another, which is the reason
 * for this script. Without it the page still works; the last row is only a little smaller.
 *
 * Each item carries its aspect ratio as `--ratio`. The script sets the last row's flex-basis to
 * ratio × the height of the row above, or to the largest height at which the row still fits.
 */
export function matchLastRow(wall: HTMLElement): void {
  const items = [...wall.children] as HTMLElement[];
  if (items.length < 2) return;

  const apply = () => {
    for (const item of items) {
      item.style.flexGrow = '';
      item.style.flexBasis = '';
    }
    const lastTop = items[items.length - 1].offsetTop;
    const last = items.filter((item) => item.offsetTop === lastTop);
    const above = items.filter((item) => item.offsetTop < lastTop);
    if (above.length === 0) return;
    const aboveTop = Math.max(...above.map((item) => item.offsetTop));
    const height = above.find((item) => item.offsetTop === aboveTop)!.querySelector('img')!.getBoundingClientRect().height;

    const ratios = last.map((item) => parseFloat(item.style.getPropertyValue('--ratio')) || 1);
    const gap = parseFloat(getComputedStyle(wall).columnGap) || 0;
    const room = wall.clientWidth - gap * (last.length - 1);
    // Round down by a pixel, so rounding never pushes a frame onto a new line.
    const target = Math.min(height, room / ratios.reduce((sum, ratio) => sum + ratio, 0)) - 1;
    last.forEach((item, index) => {
      item.style.flexGrow = '0';
      item.style.flexBasis = `${ratios[index] * target}px`;
    });
  };

  apply();
  let width = wall.clientWidth;
  new ResizeObserver(() => {
    if (wall.clientWidth === width) return;
    width = wall.clientWidth;
    apply();
  }).observe(wall);
}
