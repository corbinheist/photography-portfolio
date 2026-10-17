/**
 * Scroll reveals for the decks. The decks use native scroll-snap, so this
 * file does not start Lenis smooth scroll (the site skips it on decks too).
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initReveals } from './reveals';

gsap.registerPlugin(ScrollTrigger);

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  gsap.context(() => {
    initReveals();
  });
}
