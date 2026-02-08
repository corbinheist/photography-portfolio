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

export function initLightbox() {
  const dataEl = document.querySelector<HTMLTemplateElement>('[data-lightbox-data]');
  if (!dataEl) return;

  const photos: LightboxPhoto[] = JSON.parse(dataEl.innerHTML || '[]');
  const lightbox = document.querySelector<HTMLElement>('[data-lightbox]');
  const img = document.querySelector<HTMLImageElement>('[data-lightbox-img]');
  const info = document.querySelector<HTMLElement>('[data-lightbox-info]');
  const closeBtn = document.querySelector<HTMLButtonElement>('[data-lightbox-close]');
  const prevBtn = document.querySelector<HTMLButtonElement>('[data-lightbox-prev]');
  const nextBtn = document.querySelector<HTMLButtonElement>('[data-lightbox-next]');

  if (!lightbox || !img || !info || !closeBtn || !prevBtn || !nextBtn) return;

  let currentIndex = 0;

  function show(index: number) {
    currentIndex = index;
    const photo = photos[index];
    if (!photo) return;

    const slug = photo.url.split('/').pop() || '';
    // Use native width if it falls between standard breakpoints, otherwise largest standard width
    const standardWidths = [2400, 1600, 1080, 750, 640];
    const maxStandard = standardWidths.find(w => w <= photo.width);
    const bestWidth = (maxStandard && maxStandard < photo.width) ? photo.width : maxStandard || 640;
    img!.src = `${photo.url}/${slug}-${bestWidth}.webp`;
    img!.alt = photo.title;

    const exifParts: string[] = [];
    if (photo.exif?.camera) exifParts.push(photo.exif.camera);
    if (photo.exif?.lens) exifParts.push(photo.exif.lens);
    if (photo.exif?.focalLength) exifParts.push(photo.exif.focalLength);
    if (photo.exif?.aperture) exifParts.push(photo.exif.aperture);
    if (photo.exif?.shutter) exifParts.push(photo.exif.shutter);
    if (photo.exif?.iso) exifParts.push(`ISO ${photo.exif.iso}`);

    info!.innerHTML = `
      <p class="lightbox-title">${photo.title}</p>
      ${exifParts.length ? `<p class="lightbox-exif">${exifParts.join(' &middot; ')}</p>` : ''}
      <p class="lightbox-counter">${index + 1} / ${photos.length}</p>
    `;

    lightbox!.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lightbox!.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function prev() {
    show((currentIndex - 1 + photos.length) % photos.length);
  }

  function next() {
    show((currentIndex + 1) % photos.length);
  }

  // Click on gallery items to open lightbox
  const galleryItems = document.querySelectorAll<HTMLElement>('[data-gallery-item]');
  galleryItems.forEach((item, i) => {
    item.style.cursor = 'pointer';
    item.addEventListener('click', (e) => {
      e.preventDefault();
      show(i);
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
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) close();
  });
}
