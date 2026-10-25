/**
 * Story navigation: J/K keys move between photographs. The frame counters under each plate show
 * the reader's position, so there is no separate position display.
 */
export function initStoryNav(): void {
  const article = document.querySelector<HTMLElement>('[data-story]');
  if (!article) return;

  const figures = [...article.querySelectorAll<HTMLElement>('.story-body [data-frame]')];
  if (figures.length === 0) return;

  // The current frame is the last photograph whose top has passed the middle of the screen.
  function current(): number {
    const line = window.innerHeight * 0.5;
    let index = 0;
    for (let i = 0; i < figures.length; i++) {
      if (figures[i].getBoundingClientRect().top <= line) index = i;
      else break;
    }
    return index;
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    const step = event.key === 'j' ? 1 : event.key === 'k' ? -1 : 0;
    if (!step) return;
    const next = Math.min(figures.length - 1, Math.max(0, current() + step));
    figures[next].scrollIntoView({ block: 'center', behavior: reduced.matches ? 'auto' : 'smooth' });
    event.preventDefault();
  });
}
