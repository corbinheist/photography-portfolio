import { expect, test } from '@playwright/test';

// The rendered rules of the heist.studio Design Language (Linear, Studio team), checked on every
// route at desktop and phone widths. A failure names the element that breaks the rule.
const routes = ['/', '/about/', '/gallery/', '/404/', '/work/nomads/', '/work/cold-hands/', '/work/bougmez/', '/work/ksar/', '/work/tokyo-kissaten/', '/work/lofoten/', '/work/oslo/'];

// Green and oxide: functional colours, never at rest.
const ACCENTS = ['rgb(27, 107, 58)', 'rgb(92, 195, 126)', 'rgb(46, 139, 87)', 'rgb(15, 61, 36)', 'rgb(163, 228, 186)', 'rgb(188, 82, 21)', 'rgb(218, 112, 44)'];

for (const route of routes) {
  for (const [device, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]] as const) {
    test(`${route} follows the design language on ${device}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.setViewportSize({ width, height });
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const report = await page.evaluate((accents) => {
        const visible = (el: Element) => {
          const cs = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return cs.display !== 'none' && cs.visibility !== 'hidden' && box.width > 0 && box.height > 0
            && !el.closest('dialog:not([open]), details:not([open]) > :not(summary), .visually-hidden, .sr-only, .skip-link');
        };
        const name = (el: Element) => (typeof (el as HTMLElement).className === 'string' && (el as HTMLElement).className ? `.${(el as HTMLElement).className.split(' ')[0]}` : el.tagName.toLowerCase());
        const photos = [...document.querySelectorAll('img')].filter(visible).map((img) => img.getBoundingClientRect());
        const sizes = new Set<string>();
        const problems: string[] = [];
        let seals = 0;

        for (const el of document.querySelectorAll('body *')) {
          if (!visible(el)) continue;
          const cs = getComputedStyle(el);
          const text = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
          if (text) {
            sizes.add(cs.fontSize);
            if (accents.includes(cs.color)) problems.push(`accent at rest: ${name(el)}`);
            const box = el.getBoundingClientRect();
            if (photos.some((p) => Math.min(box.right, p.right) - Math.max(box.left, p.left) > 4 && Math.min(box.bottom, p.bottom) - Math.max(box.top, p.top) > 4)) {
              problems.push(`text on a photograph: ${name(el)}`);
            }
          }
          if (el.matches('.seal')) seals++;
          if (parseFloat(cs.borderTopLeftRadius) > 0 || parseFloat(cs.borderBottomRightRadius) > 0) problems.push(`rounded corner: ${name(el)}`);
          if (cs.boxShadow !== 'none') problems.push(`shadow: ${name(el)}`);
          if (cs.backgroundImage.includes('gradient')) problems.push(`gradient: ${name(el)}`);
          if (cs.backdropFilter && cs.backdropFilter !== 'none') problems.push(`backdrop-filter: ${name(el)}`);
          if (el.tagName === 'IMG' && (cs.filter !== 'none' || parseFloat(cs.opacity) < 1)) problems.push(`photograph altered: ${name(el)}`);
        }
        const running = document.getAnimations().filter((a) => a.playState === 'running').length;
        if (running) problems.push(`running animations: ${running}`);
        return { sizes: [...sizes], seals, problems: [...new Set(problems)] };
      }, ACCENTS);

      expect(report.problems).toEqual([]);
      expect(report.sizes.length, `font sizes: ${report.sizes.join(' ')}`).toBeLessThanOrEqual(4);
      expect(report.seals).toBeLessThanOrEqual(1);
    });
  }
}
