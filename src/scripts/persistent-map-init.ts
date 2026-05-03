/**
 * Persistent map runtime controller.
 *
 * The map element lives in BaseLayout with `transition:persist="map"` so
 * its DOM (and the MapLibre instance bound to it via map-init) survives
 * page swaps. Camera continuity, region/marker filtering, and rect
 * tracking happen here.
 *
 * The map's viewport rect is ALWAYS driven by a slot element on the
 * page — there is no static CSS positioning. The active slot is either:
 *   - the page's `[data-map-presence-anchor]` placeholder, OR
 *   - an `[data-map-inset-slot]` from an essay's map slide once it
 *     scrolls into view (then back to the page anchor when it leaves).
 *
 * A rAF loop reads `getBoundingClientRect()` of the active slot every
 * frame and writes the result into CSS vars on `<body>`, so the
 * persistent map (position: fixed) follows the slot through scroll,
 * resize, and view transitions. When no slot is active, the map fades
 * out via `data-map-layout="hidden"`.
 *
 * Honors `prefers-reduced-motion: reduce` (snap, no fly).
 */

import type maplibregl from 'maplibre-gl';

type Layout = 'world' | 'region' | 'inset' | 'hidden';

interface MapState {
  layout: Layout;
  center: [number, number] | null;
  zoom: number | null;
  activeCollection: string | null;
}

interface PageDefaults {
  layout: Layout;
  center: string | null;
  zoom: string | null;
  activeCollection: string | null;
}

let pageDefaults: PageDefaults = {
  layout: 'hidden',
  center: null,
  zoom: null,
  activeCollection: null,
};

let pageSlot: HTMLElement | null = null;
let activeSlot: HTMLElement | null = null;
let trackRaf = 0;

function readState(): MapState {
  const body = document.body;
  const layoutRaw = body.dataset.mapLayout;
  const layout: Layout =
    layoutRaw === 'world' || layoutRaw === 'region' || layoutRaw === 'inset'
      ? layoutRaw
      : 'hidden';

  let center: [number, number] | null = null;
  if (body.dataset.mapTargetCenter) {
    try {
      const parsed = JSON.parse(body.dataset.mapTargetCenter);
      if (Array.isArray(parsed) && parsed.length === 2) {
        center = [Number(parsed[0]), Number(parsed[1])];
      }
    } catch {
      // ignore — fall back to null
    }
  }

  const zoomRaw = body.dataset.mapTargetZoom;
  const zoom = zoomRaw ? Number(zoomRaw) : null;
  const activeCollection = body.dataset.mapActiveCollection || null;

  return { layout, center, zoom, activeCollection };
}

function snapshotPageDefaults() {
  const body = document.body;
  const layoutRaw = body.dataset.mapLayout;
  pageDefaults = {
    layout:
      layoutRaw === 'world' || layoutRaw === 'region' ? layoutRaw : 'hidden',
    center: body.dataset.mapTargetCenter || null,
    zoom: body.dataset.mapTargetZoom || null,
    activeCollection: body.dataset.mapActiveCollection || null,
  };
}

function getMapContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-persistent-map] [data-map]');
}

function getMap(): maplibregl.Map | null {
  const container = getMapContainer();
  if (!container) return null;
  return ((container as any).__map as maplibregl.Map | null) ?? null;
}

function clearActiveState() {
  const container = getMapContainer();
  if (!container) return;
  if ((container as any).__setLocked) (container as any).__setLocked(null);
  if ((container as any).__setHovered) (container as any).__setHovered(null);
}

function applyMarkerVisibility(state: MapState) {
  const markers = document.querySelectorAll<HTMLElement>(
    '[data-persistent-map] .map-marker[data-view]',
  );
  for (const el of markers) {
    const view = el.dataset.view;
    const cid = el.dataset.collectionId;
    let active = false;
    if (state.layout === 'world' && view === 'world') {
      active = true;
    } else if (
      (state.layout === 'region' || state.layout === 'inset') &&
      view === 'region'
    ) {
      active = state.activeCollection ? cid === state.activeCollection : false;
    }
    el.classList.toggle('map-marker--inactive', !active);
  }
}

function applyRegionFilter(map: maplibregl.Map, state: MapState) {
  const NONE: any = ['==', ['get', 'view'], '__none__'];
  let filter: any = NONE;

  if (state.layout === 'world') {
    filter = ['==', ['get', 'view'], 'world'];
  } else if (
    (state.layout === 'region' || state.layout === 'inset') &&
    state.activeCollection
  ) {
    filter = [
      'all',
      ['==', ['get', 'view'], 'region'],
      ['==', ['get', 'collectionId'], state.activeCollection],
    ];
  }

  const apply = () => {
    for (const id of ['regions-fill', 'regions-stroke', 'regions-hatch']) {
      if (map.getLayer(id)) {
        try {
          map.setFilter(id, filter);
        } catch {
          // ignore — layer not ready
        }
      }
    }
  };

  apply();
  // The `regions-hatch` layer is added asynchronously by map-init after
  // the crosshatch image loads, so the initial setFilter may miss it.
  // Re-apply on the next idle when all layers are present.
  map.once('idle', apply);
}

function applyCamera(map: maplibregl.Map, state: MapState) {
  if (!state.center || state.zoom === null) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    map.jumpTo({ center: state.center, zoom: state.zoom });
    return;
  }
  map.flyTo({
    center: state.center,
    zoom: state.zoom,
    duration: 1200,
    essential: true,
  });
}

function syncFromBody() {
  const map = getMap();
  if (!map) return;
  const state = readState();
  applyCamera(map, state);
  applyRegionFilter(map, state);
  applyMarkerVisibility(state);
}

// ── Slot tracking ─────────────────────────────────────────────────────

/** Read the active slot's rect into CSS vars on body. */
function trackSlotRect() {
  if (!activeSlot) return;
  const rect = activeSlot.getBoundingClientRect();
  const body = document.body;
  body.style.setProperty('--map-shell-top', `${rect.top}px`);
  body.style.setProperty('--map-shell-left', `${rect.left}px`);
  body.style.setProperty('--map-shell-width', `${rect.width}px`);
  body.style.setProperty('--map-shell-height', `${rect.height}px`);

  // MapLibre needs to know about size changes (canvas dimensions).
  const map = getMap();
  if (map) {
    try {
      map.resize();
    } catch {
      // ignore
    }
  }
}

function startTracking() {
  if (trackRaf) return;
  const loop = () => {
    trackSlotRect();
    trackRaf = requestAnimationFrame(loop);
  };
  trackRaf = requestAnimationFrame(loop);
  window.addEventListener('resize', trackSlotRect);
}

function stopTracking() {
  if (trackRaf) {
    cancelAnimationFrame(trackRaf);
    trackRaf = 0;
  }
  window.removeEventListener('resize', trackSlotRect);
  const body = document.body;
  body.style.removeProperty('--map-shell-top');
  body.style.removeProperty('--map-shell-left');
  body.style.removeProperty('--map-shell-width');
  body.style.removeProperty('--map-shell-height');
}

function setActiveSlot(slot: HTMLElement | null) {
  if (slot === activeSlot) return;
  activeSlot = slot;
  const shell = document.getElementById('persistent-map');
  if (slot) {
    trackSlotRect();
    startTracking();
    // Reveal only once the rect has been written, otherwise the map
    // would briefly paint at its viewport-fallback size.
    shell?.classList.add('is-ready');
  } else {
    stopTracking();
    shell?.classList.remove('is-ready');
  }
}

// ── Inset slot handling ──────────────────────────────────────────────

function activateInset(slot: HTMLElement) {
  const body = document.body;
  body.dataset.mapLayout = 'inset';

  const slotCenter = slot.dataset.mapTargetCenter;
  const slotZoom = slot.dataset.mapTargetZoom;
  const slotCollection = slot.dataset.mapActiveCollection;
  if (slotCenter) body.dataset.mapTargetCenter = slotCenter;
  if (slotZoom) body.dataset.mapTargetZoom = slotZoom;
  if (slotCollection !== undefined) {
    if (slotCollection) body.dataset.mapActiveCollection = slotCollection;
    else delete body.dataset.mapActiveCollection;
  }

  setActiveSlot(slot);
  syncFromBody();
}

function deactivateInset() {
  const body = document.body;
  body.dataset.mapLayout = pageDefaults.layout;
  if (pageDefaults.center) body.dataset.mapTargetCenter = pageDefaults.center;
  else delete body.dataset.mapTargetCenter;
  if (pageDefaults.zoom) body.dataset.mapTargetZoom = pageDefaults.zoom;
  else delete body.dataset.mapTargetZoom;
  if (pageDefaults.activeCollection) {
    body.dataset.mapActiveCollection = pageDefaults.activeCollection;
  } else {
    delete body.dataset.mapActiveCollection;
  }

  // Fall back to the page's slot anchor (or hide if none).
  setActiveSlot(pageSlot);
  syncFromBody();
}

let insetObserver: IntersectionObserver | null = null;

function teardownInsetObserver() {
  insetObserver?.disconnect();
  insetObserver = null;
}

function setupInsetObserver() {
  teardownInsetObserver();
  const slots = document.querySelectorAll<HTMLElement>('[data-map-inset-slot]');
  if (slots.length === 0) return;

  insetObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const slot = entry.target as HTMLElement;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (slot !== activeSlot) activateInset(slot);
        } else if (slot === activeSlot && entry.intersectionRatio < 0.25) {
          deactivateInset();
        }
      }
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  for (const slot of slots) insetObserver.observe(slot);
}

// ── Lifecycle ─────────────────────────────────────────────────────────

function bindToPageSlot() {
  pageSlot = document.querySelector<HTMLElement>('[data-map-presence-anchor]');
  // Only adopt the page slot when no inset slot is currently active.
  if (!activeSlot || activeSlot === pageSlot) {
    setActiveSlot(pageSlot);
  }
}

function init() {
  snapshotPageDefaults();
  let attempts = 0;
  const tick = () => {
    attempts++;
    if (getMap()) {
      clearActiveState();
      bindToPageSlot();
      syncFromBody();
      setupInsetObserver();
      return;
    }
    if (attempts < 20) {
      setTimeout(tick, 100);
    }
  };
  tick();
}

function onSwap() {
  teardownInsetObserver();
  setActiveSlot(null);
  pageSlot = null;
  snapshotPageDefaults();
  clearActiveState();
  bindToPageSlot();
  syncFromBody();
  setupInsetObserver();
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:after-swap', onSwap);
