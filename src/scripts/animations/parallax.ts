import gsap from 'gsap';

/** Parallax effect on hero images and .parallax-wrap elements */
export function initParallax() {
  const parallaxWraps = document.querySelectorAll('.parallax-wrap');
  parallaxWraps.forEach((wrap) => {
    const img = wrap.querySelector('img');
    if (!img) return;

    gsap.fromTo(
      img,
      { yPercent: -10 },
      {
        yPercent: 10,
        ease: 'none',
        scrollTrigger: {
          trigger: wrap,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      },
    );
  });
}
