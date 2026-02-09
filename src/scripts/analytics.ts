// Custom event tracking for Umami.
// Uses event delegation — no modifications to existing scripts needed.

export {};

declare global {
  interface Window {
    umami?: {
      track: (name: string, data?: Record<string, string | number>) => void;
    };
    __umamiKit?: { destroy: () => void };
    UmamiTracker?: new (opts: Record<string, unknown>) => { destroy: () => void };
  }
}

function track(name: string, data?: Record<string, string | number>) {
  window.umami?.track(name, data);
}

function collectionFromPath(): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // /work/[collection]/[album]
  if (parts[0] === 'work' && parts.length >= 2) {
    return parts.slice(1).join('/');
  }
  return window.location.pathname;
}

// --- Lightbox ---
function onLightboxClick(e: Event) {
  const target = (e.target as HTMLElement).closest<HTMLElement>(
    '[data-lightbox-index]',
  );
  if (!target) return;
  const index = parseInt(
    target.getAttribute('data-lightbox-index') || '0',
    10,
  );
  const dataEl = document.querySelector('[data-lightbox-data]');
  let title = '';
  if (dataEl) {
    try {
      const photos = JSON.parse(dataEl.textContent || '[]');
      title = photos[index]?.title || '';
    } catch {
      /* no-op */
    }
  }
  track('lightbox-open', {
    photo: title || `photo-${index}`,
    index,
    collection: collectionFromPath(),
  });
}

// --- Newsletter ---
function onSubscribe(e: Event) {
  const form = (e.target as HTMLElement).closest<HTMLFormElement>(
    '[data-subscribe-form]',
  );
  if (!form) return;
  track('newsletter-signup', { page: window.location.pathname });
}

// --- Outbound links ---
function onOutboundClick(e: Event) {
  const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
  if (!link) return;
  try {
    const url = new URL(link.href);
    if (url.hostname === window.location.hostname) return;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    track('outbound-click', {
      url: link.href,
      text: (link.textContent || '').trim().slice(0, 100),
    });
  } catch {
    /* invalid URL */
  }
}

// --- Theme toggle ---
function onThemeToggle(e: Event) {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(
    '[data-theme-toggle]',
  );
  if (!btn) return;
  // theme.ts has already toggled data-theme by the time this delegated handler fires
  track('theme-toggle', {
    theme: document.documentElement.getAttribute('data-theme') || 'dark',
  });
}

// --- umami-kit lifecycle ---
function initUmamiKit() {
  if (window.__umamiKit) window.__umamiKit.destroy();
  if (window.UmamiTracker) {
    window.__umamiKit = new window.UmamiTracker({
      scrollDepthThresholds: [25, 50, 75, 100],
      heartbeatInterval: 30000,
      autoTrackClicks: false,
    });
  }
}

// --- Setup / teardown ---
let controller: AbortController | null = null;

function init() {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;

  document.addEventListener('click', onLightboxClick, { signal });
  document.addEventListener('click', onOutboundClick, { signal });
  document.addEventListener('click', onThemeToggle, { signal });
  document.addEventListener('submit', onSubscribe, { signal });

  initUmamiKit();
}

function cleanup() {
  controller?.abort();
  controller = null;
  if (window.__umamiKit) {
    window.__umamiKit.destroy();
    window.__umamiKit = undefined;
  }
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', cleanup);
