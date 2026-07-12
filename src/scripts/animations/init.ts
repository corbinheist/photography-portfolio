import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initReveals } from './reveals';
import { initParallax } from './parallax';
import { initGallery } from './gallery';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;
let ctx: gsap.Context | null = null;
let tickerRegistered = false;
const updateLenis = (time: number) => lenis?.raf(time * 1000);

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function initLenis() {
  if (lenis) {
    lenis.destroy();
    lenis = null;
  }

  lenis = new Lenis({
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    touchMultiplier: 2,
  });

  // Connect Lenis to GSAP's ticker
  lenis.on('scroll', ScrollTrigger.update);
  if (!tickerRegistered) {
    gsap.ticker.add(updateLenis);
    tickerRegistered = true;
  }
  gsap.ticker.lagSmoothing(0);
}

function initAnimations() {
  // Clean up previous context
  if (ctx) {
    ctx.revert();
    ctx = null;
  }

  ScrollTrigger.getAll().forEach((t) => t.kill());

  if (prefersReducedMotion()) return;

  ctx = gsap.context(() => {
    initReveals();
    initParallax();
    initGallery();
  });
}

export function initAnimationsRuntime() {
  // Skip Lenis on pitch/essay pages — native scroll-snap handles paging
  if (!document.body.hasAttribute('data-pitch') && !document.body.hasAttribute('data-essay')) {
    initLenis();
  }
  initAnimations();
}

export function cleanupAnimationsRuntime() {
  if (lenis) {
    lenis.destroy();
    lenis = null;
  }
  if (ctx) {
    ctx.revert();
    ctx = null;
  }
  ScrollTrigger.getAll().forEach((t) => t.kill());
}

export { lenis, prefersReducedMotion };
