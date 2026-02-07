/**
 * Dark/light mode toggle with localStorage persistence.
 * Runs inline in <head> to prevent flash (see BaseLayout).
 * This module handles the toggle button behavior.
 */

const STORAGE_KEY = 'theme';
const DARK = 'dark';
const LIGHT = 'light';

type Theme = typeof DARK | typeof LIGHT;

function getStoredTheme(): Theme | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === DARK || stored === LIGHT) return stored;
  return null;
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return DARK;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? LIGHT : DARK;
}

function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

function getCurrentTheme(): Theme {
  return (document.documentElement.getAttribute('data-theme') as Theme) || DARK;
}

function toggleTheme() {
  const current = getCurrentTheme();
  setTheme(current === DARK ? LIGHT : DARK);
}

function initThemeToggle() {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', toggleTheme);
  });
}

// Initialize on page load (works with View Transitions)
document.addEventListener('astro:page-load', initThemeToggle);

// Also run immediately if no View Transitions
if (!document.startViewTransition) {
  initThemeToggle();
}

export { getStoredTheme, getSystemTheme, setTheme, toggleTheme };
