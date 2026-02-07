import gsap from 'gsap';

/** Horizontal scroll gallery for albums with layout="horizontal-scroll" */
export function initGallery() {
  const horizontalSections = document.querySelectorAll<HTMLElement>('[data-horizontal-scroll]');
  horizontalSections.forEach((section) => {
    const track = section.querySelector<HTMLElement>('[data-scroll-track]');
    if (!track) return;

    const totalWidth = track.scrollWidth - section.offsetWidth;

    gsap.to(track, {
      x: -totalWidth,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => `+=${totalWidth}`,
        scrub: 1,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });
  });

  // Hover micro-interactions on gallery items
  const galleryItems = document.querySelectorAll<HTMLElement>('[data-gallery-item]');
  galleryItems.forEach((item) => {
    const img = item.querySelector('img');
    if (!img) return;

    item.addEventListener('mouseenter', () => {
      gsap.to(img, { scale: 1.03, duration: 0.5, ease: 'power2.out' });
    });

    item.addEventListener('mouseleave', () => {
      gsap.to(img, { scale: 1, duration: 0.5, ease: 'power2.out' });
    });
  });
}
