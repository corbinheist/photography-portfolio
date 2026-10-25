/**
 * Story lightbox: a click (or Enter/Space) on a numbered photograph opens it full screen in a
 * <dialog>. Arrow keys and J/K move between frames; Escape closes. The frames come from the page:
 * every [data-frame] element in the story, ordered by its frame number, one entry per number.
 */
export function initLightbox(): void {
  const article = document.querySelector<HTMLElement>('[data-story]');
  const dialog = document.querySelector<HTMLDialogElement>('[data-lightbox]');
  if (!article || !dialog) return;

  const stage = dialog.querySelector<HTMLElement>('[data-lightbox-stage]')!;
  const num = dialog.querySelector<HTMLElement>('[data-lightbox-num]')!;
  const caption = dialog.querySelector<HTMLElement>('[data-lightbox-caption]')!;
  const prev = dialog.querySelector<HTMLButtonElement>('[data-lightbox-prev]')!;
  const next = dialog.querySelector<HTMLButtonElement>('[data-lightbox-next]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-lightbox-close]')!;

  // One entry per frame number. The cover can appear in the hero and in the body; the first wins.
  const byNumber = new Map<number, HTMLElement>();
  for (const el of article.querySelectorAll<HTMLElement>('[data-frame]')) {
    const n = Number(el.dataset.frame);
    if (n && !byNumber.has(n) && el.querySelector('picture')) byNumber.set(n, el);
  }
  const frames = [...byNumber.entries()].sort((a, b) => a[0] - b[0]).map(([n, el]) => ({ n, el }));
  if (frames.length === 0) return;
  const total = String(frames.length).padStart(2, '0');

  let current = 0;

  function show(index: number): void {
    current = Math.min(frames.length - 1, Math.max(0, index));
    const { n, el } = frames[current];

    // Clone the frame's own <picture>, so the browser picks a source for the full screen.
    const picture = el.querySelector('picture')!.cloneNode(true) as HTMLPictureElement;
    for (const source of picture.querySelectorAll('source')) source.sizes = '100vw';
    const img = picture.querySelector('img')!;
    img.sizes = '100vw';
    img.loading = 'eager';
    img.removeAttribute('fetchpriority');
    img.removeAttribute('style');
    stage.replaceChildren(picture);

    num.textContent = `${String(n).padStart(2, '0')} / ${total}`;
    const text = [...el.querySelectorAll('figcaption > span:not(.story-caption__num)')].map((span) => span.textContent?.trim()).filter(Boolean);
    caption.textContent = text.join(' · ');
    dialog!.setAttribute('aria-label', `Photograph ${String(n).padStart(2, '0')} of ${total}${img.alt ? `: ${img.alt}` : ''}`);
    prev.disabled = current === 0;
    next.disabled = current === frames.length - 1;
  }

  function open(index: number): void {
    show(index);
    if (!dialog!.open) dialog!.showModal();
  }

  // Each photograph opens its own frame: a click, or Enter/Space on the focused photograph.
  frames.forEach(({ n, el }, index) => {
    const target = el.querySelector<HTMLElement>('.photo-wrap') ?? el;
    target.dataset.lightboxOpen = '';
    target.tabIndex = 0;
    target.setAttribute('role', 'button');
    target.setAttribute('aria-label', `Open photograph ${String(n).padStart(2, '0')} full screen`);
    target.addEventListener('click', () => open(index));
    target.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(index);
      }
    });
  });

  prev.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  close.addEventListener('click', () => dialog.close());

  // A click on the empty field around the photograph closes the view.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target === stage) dialog.close();
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const step = event.key === 'ArrowRight' || event.key === 'j' ? 1 : event.key === 'ArrowLeft' || event.key === 'k' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    show(current + step);
  });

  dialog.addEventListener('close', () => stage.replaceChildren());
}
