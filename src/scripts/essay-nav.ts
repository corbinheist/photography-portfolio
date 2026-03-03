/**
 * Essay navigation: progress bar, nav dots, keyboard navigation.
 * Only activates on pages with [data-essay] on the body.
 */

function initEssayNav() {
  if (!document.body.hasAttribute('data-essay')) return;

  const snapSlides = Array.from(
    document.querySelectorAll<HTMLElement>('[data-essay-snap]'),
  );
  const progressBar =
    document.querySelector<HTMLElement>('[data-essay-progress]');
  const dotsContainer =
    document.querySelector<HTMLElement>('[data-essay-dots]');

  if (snapSlides.length === 0) return;

  // Build nav dots
  snapSlides.forEach((slide, i) => {
    const dot = document.createElement('button');
    dot.className = 'essay-nav-dot';
    dot.setAttribute('aria-label', `Go to section ${i + 1}`);
    dot.addEventListener('click', () => {
      slide.scrollIntoView({ behavior: 'smooth' });
    });
    dotsContainer?.appendChild(dot);
  });

  const dots = Array.from(
    dotsContainer?.querySelectorAll<HTMLElement>('.essay-nav-dot') ?? [],
  );

  function getActiveSnapIndex(): number {
    const scrollY = window.scrollY;
    const vh = window.innerHeight;
    for (let i = snapSlides.length - 1; i >= 0; i--) {
      if (snapSlides[i].offsetTop <= scrollY + vh * 0.5) return i;
    }
    return 0;
  }

  function updateProgress() {
    const scrollY = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const pct = maxScroll > 0 ? (scrollY / maxScroll) * 100 : 0;
    if (progressBar) {
      progressBar.style.width = `${pct}%`;
    }
  }

  function updateDots() {
    const active = getActiveSnapIndex();
    dots.forEach((dot, i) => {
      dot.classList.toggle('essay-nav-dot--active', i === active);
    });
  }

  function onScroll() {
    updateProgress();
    updateDots();
  }

  function scrollToSnapSlide(index: number) {
    const clamped = Math.max(0, Math.min(index, snapSlides.length - 1));
    snapSlides[clamped].scrollIntoView({ behavior: 'smooth' });
  }

  function handleKeydown(e: KeyboardEvent) {
    // Don't navigate if lightbox is open
    const lightbox = document.querySelector('[data-lightbox]');
    if (lightbox?.getAttribute('aria-hidden') === 'false') return;

    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const current = getActiveSnapIndex();

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        scrollToSnapSlide(current + 1);
        break;

      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        scrollToSnapSlide(current - 1);
        break;

      case 'Home':
        e.preventDefault();
        scrollToSnapSlide(0);
        break;

      case 'End':
        e.preventDefault();
        scrollToSnapSlide(snapSlides.length - 1);
        break;
    }
  }

  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('scroll', onScroll, { passive: true });

  // Initial state
  onScroll();
}

document.addEventListener('astro:page-load', initEssayNav);
