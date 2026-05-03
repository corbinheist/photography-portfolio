/**
 * Persistent map runtime controller.
 *
 * The map element lives in BaseLayout with `transition:persist="map"` so
 * its DOM (and the MapLibre instance bound to it via map-init) survives
 * page swaps. This script runs the swap-time work:
 *
 *   - Read body data attributes for the page's desired map state.
 *   - Animate camera via `map.flyTo(...)`.
 *   - Filter region polygons by view + active collection (`setFilter`).
 *   - Toggle marker visibility classes by view + active collection.
 *
 * Honors `prefers-reduced-motion: reduce` (snap, no fly).
 */

import type maplibregl from 'maplibre-gl';

interface MapState {
  layout: 'world' | 'region' | 'hidden';
  center: [number, number] | null;
  zoom: number | null;
  activeCollection: string | null;
}

function readState(): MapState {
  const body = document.body;
  const layoutRaw = body.dataset.mapLayout;
  const layout: MapState['layout'] =
    layoutRaw === 'world' || layoutRaw === 'region' ? layoutRaw : 'hidden';

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
  // Page navigation should drop any "locked" / "hovered" highlight from
  // the previous page so the new view starts clean.
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
    } else if (state.layout === 'region' && view === 'region') {
      // In region view, only the active collection's markers are shown.
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
  } else if (state.layout === 'region' && state.activeCollection) {
    filter = [
      'all',
      ['==', ['get', 'view'], 'region'],
      ['==', ['get', 'collectionId'], state.activeCollection],
    ];
  }

  for (const id of ['regions-fill', 'regions-stroke', 'regions-hatch']) {
    if (map.getLayer(id)) {
      try {
        map.setFilter(id, filter);
      } catch {
        // layer might not be ready yet — sync will retry on next swap
      }
    }
  }
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
  clearActiveState();
  applyCamera(map, state);
  applyRegionFilter(map, state);
  applyMarkerVisibility(state);
}

function init() {
  // First-paint case: map-init may not have created the instance yet
  // (the script runs as a module, ordering with map-init is not
  // guaranteed). Retry until __map appears, capped to ~2s.
  let attempts = 0;
  const tick = () => {
    attempts++;
    if (getMap()) {
      syncFromBody();
      return;
    }
    if (attempts < 20) {
      setTimeout(tick, 100);
    }
  };
  tick();
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:after-swap', syncFromBody);
