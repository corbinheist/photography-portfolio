/**
 * Essay navigation: progress bar, nav dots, keyboard navigation.
 * Only activates on pages with [data-essay] on the body.
 *
 * Sequence-aware: when EssaySequence wrappers exist, only observes
 * slides within the visible (orientation-matched) sequence.
 * Falls back to all .essay-slide elements for backward compat.
 *
 * Keyboard acceleration: single arrow tap scrolls smoothly (400ms).
 * Holding the key ramps up — each rapid repeat shortens the
 * animation duration, bottoming out at 100ms for fast scrubbing
 * that still feels continuous.
 */

let cleanupFn: (() => void) | null = null;

function getVisibleSequence(): HTMLElement | null {
  const sequences = document.querySelectorAll<HTMLElement>('.essay-sequence');
  if (sequences.length === 0) return null;

  for (const seq of sequences) {
    if (getComputedStyle(seq).display !== 'none') return seq;
  }
  return null;
}

function initEssayNav() {
  if (!document.body.hasAttribute('data-essay')) return;

  // Clean up previous init (orientation change or page transition)
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }

  const visibleSequence = getVisibleSequence();
  const slideRoot = visibleSequence || document;
  const snapSlides = Array.from(
    slideRoot.querySelectorAll<HTMLElement>('.essay-slide'),
  );
  const progressBar =
    document.querySelector<HTMLElement>('[data-essay-progress]');
  const dotsContainer =
    document.querySelector<HTMLElement>('[data-essay-dots]');

  if (snapSlides.length === 0) return;

  // Clear existing dots
  if (dotsContainer) dotsContainer.innerHTML = '';

  // Build nav dots
  snapSlides.forEach((slide, i) => {
    const dot = document.createElement('button');
    dot.className = 'essay-nav-dot';
    dot.setAttribute('aria-label', `Go to section ${i + 1}`);
    dot.addEventListener('click', () => {
      targetIndex = i;
      animateScrollTo(slide.offsetTop, 400);
    });
    dotsContainer?.appendChild(dot);
  });

  const dots = Array.from(
    dotsContainer?.querySelectorAll<HTMLElement>('.essay-nav-dot') ?? [],
  );

  // --- Smooth scroll with controllable duration ---
  let scrollRaf = 0;
  let isAnimating = false;
  const htmlEl = document.documentElement;

  function animateScrollTo(targetY: number, duration: number) {
    cancelAnimationFrame(scrollRaf);
    const startY = window.scrollY;
    const distance = targetY - startY;
    if (distance === 0) return;

    // Disable snap during animation so the browser doesn't fight us
    isAnimating = true;
    htmlEl.style.scrollSnapType = 'none';

    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      window.scrollTo(0, startY + distance * ease);
      if (t < 1) {
        scrollRaf = requestAnimationFrame(step);
      } else {
        // Re-enable snap after landing on the target
        htmlEl.style.scrollSnapType = '';
        isAnimating = false;
      }
    }

    scrollRaf = requestAnimationFrame(step);
  }

  // --- Navigation state ---
  let targetIndex = 0;
  let repeatCount = 0;
  let lastKeyTime = 0;
  let lastKeyDir: 'next' | 'prev' | null = null;
  const REPEAT_WINDOW = 350;

  function getDuration(): number {
    if (repeatCount <= 0) return 400;
    if (repeatCount === 1) return 250;
    if (repeatCount === 2) return 150;
    return 100;
  }

  function getVisibleIndex(): number {
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
    const active = getVisibleIndex();
    dots.forEach((dot, i) => {
      dot.classList.toggle('essay-nav-dot--active', i === active);
    });
  }

  function onScroll() {
    updateProgress();
    updateDots();
  }

  // Sync targetIndex when the user scrolls manually (mouse wheel, touch)
  let scrollSyncTimer = 0;
  function onScrollEnd() {
    clearTimeout(scrollSyncTimer);
    scrollSyncTimer = window.setTimeout(() => {
      // Don't override targetIndex while we're animating programmatically
      if (!isAnimating) {
        targetIndex = getVisibleIndex();
      }
    }, 150);
  }

  function navigateToSlide(index: number, duration: number) {
    targetIndex = Math.max(0, Math.min(index, snapSlides.length - 1));
    animateScrollTo(snapSlides[targetIndex].offsetTop, duration);
  }

  function navigateDirection(dir: 'next' | 'prev') {
    const now = performance.now();

    if (dir === lastKeyDir && now - lastKeyTime < REPEAT_WINDOW) {
      repeatCount++;
    } else {
      repeatCount = 0;
    }
    lastKeyDir = dir;
    lastKeyTime = now;

    const next = dir === 'next' ? targetIndex + 1 : targetIndex - 1;
    navigateToSlide(next, getDuration());
  }

  function handleKeydown(e: KeyboardEvent) {
    // Don't navigate if lightbox is open
    const lightbox = document.querySelector('[data-lightbox]');
    if (lightbox?.getAttribute('aria-hidden') === 'false') return;

    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        navigateDirection('next');
        break;

      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        navigateDirection('prev');
        break;

      case 'Home':
        e.preventDefault();
        navigateToSlide(0, 400);
        break;

      case 'End':
        e.preventDefault();
        navigateToSlide(snapSlides.length - 1, 400);
        break;
    }
  }

  function handleScroll() {
    onScroll();
    onScrollEnd();
  }

  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('scroll', handleScroll, { passive: true });

  // Initial state
  targetIndex = getVisibleIndex();
  onScroll();

  // Orientation change: reinitialize for the newly visible sequence
  const orientationMql = window.matchMedia('(orientation: portrait)');
  function onOrientationChange() {
    // Defer to let CSS display changes apply
    requestAnimationFrame(() => {
      initEssayNav();
    });
  }
  orientationMql.addEventListener('change', onOrientationChange);

  // Cleanup function for reinit
  cleanupFn = () => {
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('scroll', handleScroll);
    orientationMql.removeEventListener('change', onOrientationChange);
    cancelAnimationFrame(scrollRaf);
    clearTimeout(scrollSyncTimer);
  };
}

document.addEventListener('astro:page-load', initEssayNav);
