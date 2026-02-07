import gsap from 'gsap';

/** Fade-up reveal on scroll */
export function initReveals() {
  // .reveal elements — fade up
  const reveals = document.querySelectorAll('.reveal');
  reveals.forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          once: true,
        },
      },
    );
  });

  // .fade-in elements — opacity only
  const fadeIns = document.querySelectorAll('.fade-in');
  fadeIns.forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0 },
      {
        opacity: 1,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          once: true,
        },
      },
    );
  });

  // .mask-reveal elements — clip-path expanding
  const maskReveals = document.querySelectorAll('.mask-reveal');
  maskReveals.forEach((el) => {
    gsap.fromTo(
      el,
      { clipPath: 'inset(100% 0 0 0)' },
      {
        clipPath: 'inset(0% 0 0 0)',
        duration: 1,
        ease: 'power3.inOut',
        scrollTrigger: {
          trigger: el,
          start: 'top 80%',
          once: true,
        },
      },
    );
  });

  // .stagger-children — animate children in sequence
  const staggerParents = document.querySelectorAll('.stagger-children');
  staggerParents.forEach((parent) => {
    const children = parent.children;
    gsap.fromTo(
      children,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: parent,
          start: 'top 85%',
          once: true,
        },
      },
    );
  });
}
