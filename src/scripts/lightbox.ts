interface LightboxPhoto {
  url: string;
  width: number;
  height: number;
  title: string;
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

export function initLightbox() {
  const dataEl = document.querySelector('[data-lightbox-data]');
  if (!dataEl) return;

  const photos: LightboxPhoto[] = JSON.parse(dataEl.textContent || '[]');
  const lightbox = document.querySelector<HTMLElement>('[data-lightbox]');
  const img = document.querySelector<HTMLImageElement>('[data-lightbox-img]');
  const info = document.querySelector<HTMLElement>('[data-lightbox-info]');
  const closeBtn = document.querySelector<HTMLButtonElement>('[data-lightbox-close]');
  const prevBtn = document.querySelector<HTMLButtonElement>('[data-lightbox-prev]');
  const nextBtn = document.querySelector<HTMLButtonElement>('[data-lightbox-next]');

  if (!lightbox || !img || !info || !closeBtn || !prevBtn || !nextBtn) return;

  let currentIndex = 0;
  let isOpen = false;
  let previousFocus: Element | null = null;

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

  function show(index: number) {
    const wasOpen = isOpen;
    currentIndex = index;
    const photo = photos[index];
    if (!photo) return;

    const slug = photo.url.split('/').pop() || '';
    const bestWidth = selectBestWidth(photo.width);
    const newSrc = `${photo.url}/${slug}-${bestWidth}.webp`;

    if (!wasOpen) {
      // Opening: scale-up entrance
      previousFocus = document.activeElement;
      img!.src = newSrc;
      img!.alt = photo.title;
      img!.classList.add('is-entering');
      updateInfo(photo, index);
      lightbox!.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      isOpen = true;
      closeBtn!.focus();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          img!.classList.remove('is-entering');
        });
      });
    } else {
      // Navigating: crossfade
      img!.classList.add('is-transitioning');
      updateInfo(photo, index);
      setTimeout(() => {
        img!.src = newSrc;
        img!.alt = photo.title;
        const onLoad = () => {
          img!.classList.remove('is-transitioning');
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
    lightbox!.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    isOpen = false;
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
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
    item.addEventListener('click', (e) => {
      e.preventDefault();
      show(index);
    });
  });

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (lightbox!.getAttribute('aria-hidden') === 'true') return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  });

  // Click outside image to close
  const stage = lightbox.querySelector('.lightbox-stage');
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target === stage) close();
  });
}
