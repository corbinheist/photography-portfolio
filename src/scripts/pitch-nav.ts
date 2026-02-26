/**
 * Pitch deck keyboard navigation, fullscreen toggle, and slide counter.
 * Only activates on pages with [data-pitch] on the body.
 */

function init() {
  if (!document.body.hasAttribute('data-pitch')) return;

  const slides = Array.from(document.querySelectorAll<HTMLElement>('.slide'));
  if (slides.length === 0) return;

  const counter = document.querySelector<HTMLElement>('.pitch-counter');
  const counterCurrent = counter?.querySelector<HTMLElement>(
    '.pitch-counter__current',
  );
  const counterTotal = counter?.querySelector<HTMLElement>(
    '.pitch-counter__total',
  );

  if (counterTotal) counterTotal.textContent = String(slides.length);

  let idleTimer: ReturnType<typeof setTimeout>;

  function getCurrentSlide(): number {
    const scrollY = window.scrollY;
    const vh = window.innerHeight;
    for (let i = slides.length - 1; i >= 0; i--) {
      if (slides[i].offsetTop <= scrollY + vh * 0.5) return i;
    }
    return 0;
  }

  function showCounter() {
    counter?.classList.remove('pitch-counter--hidden');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      counter?.classList.add('pitch-counter--hidden');
    }, 2500);
  }

  function updateCounter() {
    const idx = getCurrentSlide();
    if (counterCurrent) counterCurrent.textContent = String(idx + 1);
    showCounter();
  }

  function scrollToSlide(index: number) {
    const clamped = Math.max(0, Math.min(index, slides.length - 1));
    slides[clamped].scrollIntoView({ behavior: 'smooth' });
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const current = getCurrentSlide();

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
      case ' ':
      case 'PageDown':
        e.preventDefault();
        scrollToSlide(current + 1);
        break;

      case 'ArrowUp':
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        scrollToSlide(current - 1);
        break;

      case 'Home':
        e.preventDefault();
        scrollToSlide(0);
        break;

      case 'End':
        e.preventDefault();
        scrollToSlide(slides.length - 1);
        break;

      case 'f':
      case 'F':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          toggleFullscreen();
        }
        break;

      case 'Escape':
        if (document.fullscreenElement) document.exitFullscreen();
        break;
    }
  }

  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('scroll', updateCounter, { passive: true });

  updateCounter();
}

document.addEventListener('astro:page-load', init);
