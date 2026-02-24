interface LightboxPhoto {
  url: string;
  width: number;
  height: number;
  title: string;
  lqip: string;
  exif?: {
    camera?: string;
    lens?: string;
    focalLength?: string;
    aperture?: string;
    shutter?: string;
    iso?: number;
  };
}

const STANDARD_WIDTHS = [2400, 1600, 1080, 750, 640];

export function selectBestWidth(nativeWidth: number): number {
  return STANDARD_WIDTHS.find((w) => w <= nativeWidth) || 640;
}

// AVIF support detection — resolved once, cached
let supportsAvif: boolean | null = null;

function detectAvif(): Promise<boolean> {
  if (supportsAvif !== null) return Promise.resolve(supportsAvif);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      supportsAvif = img.width === 1;
      resolve(supportsAvif);
    };
    img.onerror = () => {
      supportsAvif = false;
      resolve(false);
    };
    // 1x1 AVIF pixel
    img.src =
      'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErZ';
  });
}

function getImageFormat(): string {
  return supportsAvif ? 'avif' : 'webp';
}

function buildImageUrl(photo: LightboxPhoto): string {
  const slug = photo.url.split('/').pop() || '';
  const bestWidth = selectBestWidth(photo.width);
  return `${photo.url}/${slug}-${bestWidth}.${getImageFormat()}`;
}

// Module-level AbortController for listener cleanup across page transitions
let controller: AbortController | null = null;

export function initLightbox() {
  const dataEl = document.querySelector('[data-lightbox-data]');
  if (!dataEl) return;

  // Abort previous listeners (view transitions re-init)
  if (controller) controller.abort();
  controller = new AbortController();
  const { signal } = controller;

  const photos: LightboxPhoto[] = JSON.parse(dataEl.textContent || '[]');
  const lightbox = document.querySelector<HTMLElement>('[data-lightbox]');
  const img = document.querySelector<HTMLImageElement>('[data-lightbox-img]');
  const info = document.querySelector<HTMLElement>('[data-lightbox-info]');
  const closeBtn = document.querySelector<HTMLButtonElement>('[data-lightbox-close]');
  const prevBtn = document.querySelector<HTMLButtonElement>('[data-lightbox-prev]');
  const nextBtn = document.querySelector<HTMLButtonElement>('[data-lightbox-next]');

  if (!lightbox || !img || !info || !closeBtn || !prevBtn || !nextBtn) return;

  // Move lightbox to body root so inert on <main> doesn't affect it
  document.body.appendChild(lightbox);

  let currentIndex = 0;
  let isOpen = false;
  let previousFocus: Element | null = null;
  let closingFromPopstate = false;

  // Preload cache
  const preloadCache = new Map<string, HTMLImageElement>();

  // Kick off AVIF detection early
  detectAvif();

  function updateInfo(photo: LightboxPhoto, index: number) {
    const gear: string[] = [];
    if (photo.exif?.camera) gear.push(photo.exif.camera);
    if (photo.exif?.lens) gear.push(photo.exif.lens);

    const settings: string[] = [];
    if (photo.exif?.focalLength) settings.push(photo.exif.focalLength);
    if (photo.exif?.aperture) settings.push(photo.exif.aperture);
    if (photo.exif?.shutter) settings.push(photo.exif.shutter);
    if (photo.exif?.iso) settings.push(`ISO ${photo.exif.iso}`);

    const hasExif = gear.length || settings.length;
    let exifHtml = '';
    if (hasExif) {
      const parts: string[] = [];
      if (gear.length) parts.push(gear.join(' \u00b7 '));
      if (settings.length) parts.push(settings.join(' \u00b7 '));
      exifHtml = `<p class="lightbox-exif">${parts.join('<span class="lightbox-exif-sep">\u2014</span>')}</p>`;
    }

    info!.innerHTML = `
      ${photo.title ? `<p class="lightbox-title">${photo.title}</p>` : ''}
      ${exifHtml}
      <p class="lightbox-counter">${index + 1} / ${photos.length}</p>
    `;
  }

  function setBackgroundInert(inert: boolean) {
    for (const child of Array.from(document.body.children)) {
      if (child === lightbox) continue;
      if (inert) {
        (child as HTMLElement).setAttribute?.('inert', '');
      } else {
        (child as HTMLElement).removeAttribute?.('inert');
      }
    }
  }

  function preloadAdjacent(index: number) {
    const indices = [
      (index + 1) % photos.length,
      (index - 1 + photos.length) % photos.length,
    ];
    for (const i of indices) {
      const photo = photos[i];
      if (!photo) continue;
      const url = buildImageUrl(photo);
      if (preloadCache.has(url)) continue;
      const preloadImg = new Image();
      preloadImg.src = url;
      preloadCache.set(url, preloadImg);
    }
  }

  function show(index: number) {
    const wasOpen = isOpen;
    currentIndex = index;
    const photo = photos[index];
    if (!photo) return;

    const newSrc = buildImageUrl(photo);

    if (!wasOpen) {
      // Opening: scale-up entrance
      previousFocus = document.activeElement;

      // LQIP background
      img!.style.backgroundImage = `url(${photo.lqip})`;
      img!.style.backgroundSize = 'cover';

      img!.src = newSrc;
      img!.alt = photo.title;
      img!.classList.add('is-entering');
      updateInfo(photo, index);
      lightbox!.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      isOpen = true;

      // Inert background + focus
      setBackgroundInert(true);
      closeBtn!.focus();

      // History state for back-button close
      history.pushState({ lightbox: true }, '');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          img!.classList.remove('is-entering');
        });
      });

      // Preload after current image loads
      const onFirstLoad = () => preloadAdjacent(index);
      if (img!.complete) {
        onFirstLoad();
      } else {
        img!.addEventListener('load', onFirstLoad, { once: true });
      }
    } else {
      // Navigating: crossfade
      img!.classList.add('is-transitioning');
      updateInfo(photo, index);
      setTimeout(() => {
        // Update LQIP background
        img!.style.backgroundImage = `url(${photo.lqip})`;
        img!.style.backgroundSize = 'cover';

        img!.src = newSrc;
        img!.alt = photo.title;
        const onLoad = () => {
          img!.classList.remove('is-transitioning');
          preloadAdjacent(index);
        };
        if (img!.complete) {
          onLoad();
        } else {
          img!.addEventListener('load', onLoad, { once: true });
        }
      }, 150);
    }
  }

  function close() {
    if (!isOpen) return;
    lightbox!.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    isOpen = false;

    // Clear LQIP background
    img!.style.backgroundImage = '';
    img!.style.backgroundSize = '';

    setBackgroundInert(false);

    if (previousFocus instanceof HTMLElement) previousFocus.focus();

    // Pop the lightbox history entry (unless we're closing from popstate)
    if (!closingFromPopstate) {
      history.back();
    }
    closingFromPopstate = false;
  }

  function prev() {
    show((currentIndex - 1 + photos.length) % photos.length);
  }

  function next() {
    show((currentIndex + 1) % photos.length);
  }

  // Click on photos with lightbox index to open lightbox
  const galleryItems = document.querySelectorAll<HTMLElement>('[data-lightbox-index]');
  galleryItems.forEach((item) => {
    const index = parseInt(item.getAttribute('data-lightbox-index') || '0', 10);
    item.style.cursor = 'zoom-in';
    item.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        show(index);
      },
      { signal },
    );
  });

  closeBtn.addEventListener('click', close, { signal });
  prevBtn.addEventListener('click', prev, { signal });
  nextBtn.addEventListener('click', next, { signal });

  // Keyboard navigation + focus trap
  document.addEventListener(
    'keydown',
    (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();

      // Focus trap: Tab/Shift+Tab cycles through close, prev, next
      if (e.key === 'Tab') {
        const focusable = [closeBtn!, prevBtn!, nextBtn!];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    { signal },
  );

  // Click outside image to close
  const stage = lightbox.querySelector('.lightbox-stage');
  lightbox.addEventListener(
    'click',
    (e) => {
      if (e.target === lightbox || e.target === stage) close();
    },
    { signal },
  );

  // Touch/swipe navigation
  let touchStartX = 0;
  let touchStartY = 0;
  let didSwipe = false;

  const stageEl = stage as HTMLElement | null;

  stageEl?.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
      didSwipe = false;
    },
    { passive: true, signal },
  );

  stageEl?.addEventListener(
    'touchend',
    (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        didSwipe = true;
        if (dx < 0) next();
        else prev();
      }
    },
    { passive: true, signal },
  );

  // Prevent swipe from also triggering click-to-close
  stage?.addEventListener(
    'click',
    (e) => {
      if (didSwipe) {
        e.stopPropagation();
        didSwipe = false;
      }
    },
    { signal },
  );

  // History back-button support
  window.addEventListener(
    'popstate',
    () => {
      if (isOpen) {
        closingFromPopstate = true;
        close();
      }
    },
    { signal },
  );

  // Astro transition safety: close lightbox + remove inert before page swap
  document.addEventListener(
    'astro:before-preparation',
    () => {
      if (isOpen) {
        closingFromPopstate = true; // prevent history.back() during transition
        close();
      }
    },
    { signal },
  );
}
