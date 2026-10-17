/**
 * Story navigation: the frame counter, the current chapter, the reading progress,
 * and J/K keys to move between photographs. Every number comes from the DOM.
 */
export function initStoryNav(): void {
  const article = document.querySelector<HTMLElement>('[data-story]');
  if (!article) return;

  const figures = [...article.querySelectorAll<HTMLElement>('.story-body [data-frame]')];
  const chapters = [...article.querySelectorAll<HTMLElement>('.story-body h2')];
  const frameEl = article.querySelector<HTMLElement>('[data-story-frame]');
  const pctEl = article.querySelector<HTMLElement>('[data-story-pct]');
  const chapterEl = article.querySelector<HTMLElement>('[data-story-chapter]');
  const progressEl = article.querySelector<HTMLElement>('[data-story-progress]');
  const body = article.querySelector<HTMLElement>('.story-body');
  if (!body) return;

  let current = 0;
  let scheduled = false;

  function update(): void {
    scheduled = false;
    const line = window.innerHeight * 0.5;

    // The current frame is the last photograph whose top has passed the middle of the screen.
    let index = 0;
    for (let i = 0; i < figures.length; i++) {
      if (figures[i].getBoundingClientRect().top <= line) index = i;
      else break;
    }
    current = index;
    const frame = figures[index]?.dataset.frame ?? '1';
    if (frameEl) frameEl.textContent = frame.padStart(2, '0');

    let chapter = '';
    for (const heading of chapters) {
      if (heading.getBoundingClientRect().top <= line) chapter = heading.textContent ?? '';
      else break;
    }
    if (chapterEl) chapterEl.textContent = chapter ? ` · ${chapter}` : '';

    const rect = body!.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const pct = Math.min(100, Math.max(0, Math.round((-rect.top / Math.max(total, 1)) * 100)));
    if (pctEl) pctEl.textContent = String(pct);
    if (progressEl) progressEl.style.setProperty('--progress', String(pct / 100));
  }

  function schedule(): void {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    const step = event.key === 'j' ? 1 : event.key === 'k' ? -1 : 0;
    if (!step || figures.length === 0) return;
    const next = Math.min(figures.length - 1, Math.max(0, current + step));
    figures[next].scrollIntoView({ block: 'center', behavior: reduced.matches ? 'auto' : 'smooth' });
    event.preventDefault();
  });
}
