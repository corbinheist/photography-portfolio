/**
 * Work page interaction coordinator.
 *
 * Wires up the collapsible region dossier:
 *   - Hover collection row  → highlight marker on the world map
 *   - Click collection row  → toggle expand (reveals nested essays)
 *   - Click "Open region"   → navigate to /work/<collection>
 *   - Click an essay row    → navigate to the essay
 *   - Year filter tabs      → show/hide collection rows + map markers by year
 *   - Map → dossier         → highlight matching collection row when a region
 *                              or marker is hovered/locked
 *   - Filmstrip             → expand + filter to the active collection
 */
export {};

function init() {
  const mapContainer = document.querySelector<HTMLElement>('[data-map]');
  const coordReadout = document.querySelector<HTMLElement>('[data-coord-readout]');
  const coordText = coordReadout?.querySelector<HTMLElement>('.work-coord-readout__text');
  const filmRoll = document.querySelector<HTMLElement>('[data-film-roll]');
  const filmStatus = document.querySelector<HTMLElement>('[data-film-status]');
  const filmStatusText = filmStatus?.querySelector<HTMLElement>('.film-roll__status-text');
  const yearTabs = document.querySelector<HTMLElement>('[data-year-tabs]');
  const storyCountEl = document.querySelector<HTMLElement>('[data-story-count]');
  const collections = Array.from(
    document.querySelectorAll<HTMLElement>('.dossier-collection[data-dossier-collection]'),
  );

  if (collections.length === 0) return;

  const isTouch = window.matchMedia('(hover: none)').matches;
  const total = collections.length;
  const idleCoordText = isTouch
    ? `Tap a region · ${total} regions`
    : `Hover a region · ${total} regions`;
  const idleFilmText = isTouch
    ? 'Hero roll · tap a region to load frames'
    : 'Hero roll · hover a region to load frames';

  if (coordText) coordText.textContent = idleCoordText;
  if (filmStatusText) filmStatusText.textContent = idleFilmText;

  let activeYear = 'all';
  let activeNum: string | null = null;

  // ── Year filter ──
  yearTabs?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.work-year-tab');
    if (!btn) return;
    const year = btn.dataset.year || 'all';
    activeYear = year;

    yearTabs.querySelectorAll('.work-year-tab').forEach((t) => {
      t.classList.toggle('work-year-tab--active', (t as HTMLElement).dataset.year === year);
    });

    let visibleCollections = 0;
    collections.forEach((node) => {
      const nodeYear = node.dataset.storyYear || '';
      const show = year === 'all' || nodeYear === year;
      node.classList.toggle('dossier-collection--hidden', !show);
      if (show) visibleCollections++;
    });

    document.querySelectorAll<HTMLElement>('.map-marker--label-only').forEach((el) => {
      const num = el.dataset.markerNum;
      if (!num) return;
      const ownerNode = collections.find((c) => c.dataset.storyMarker === num);
      const show = year === 'all' || (ownerNode?.dataset.storyYear || '') === year;
      el.style.display = show ? '' : 'none';
    });

    if (storyCountEl) {
      storyCountEl.textContent =
        year === 'all'
          ? `${visibleCollections} regions`
          : `${visibleCollections} ${visibleCollections === 1 ? 'region' : 'regions'} · ${year}`;
    }
  });

  // ── Collection row: hover, click-to-expand ──
  function setExpanded(node: HTMLElement, expanded: boolean) {
    const toggle = node.querySelector<HTMLElement>('[data-dossier-toggle]');
    const panel = node.querySelector<HTMLElement>('.dossier-collection__essays');
    if (!toggle || !panel) return;
    toggle.setAttribute('aria-expanded', String(expanded));
    panel.hidden = !expanded;
    node.classList.toggle('dossier-collection--expanded', expanded);
  }

  function collapseAllExcept(except: HTMLElement | null) {
    for (const c of collections) {
      if (c !== except) setExpanded(c, false);
    }
  }

  collections.forEach((node) => {
    const markerNum = node.dataset.storyMarker || null;
    const toggle = node.querySelector<HTMLElement>('[data-dossier-toggle]');
    const hasEssays = !!node.querySelector('.dossier-collection__essays');

    // Hover: highlight on the map
    node.addEventListener('mouseenter', () => {
      if (markerNum && mapContainer && (mapContainer as any).__setHovered) {
        (mapContainer as any).__setHovered(markerNum);
      }
    });

    node.addEventListener('mouseleave', () => {
      if (mapContainer && (mapContainer as any).__deferClear) {
        (mapContainer as any).__deferClear();
      } else if (mapContainer && (mapContainer as any).__setHovered) {
        (mapContainer as any).__setHovered(null);
      }
    });

    // Click: expand if has essays, else navigate to collection
    toggle?.addEventListener('click', () => {
      if (!hasEssays) {
        // Collections without essays go straight to /work/<id>
        const href = node.querySelector<HTMLAnchorElement>('a.dossier-collection__open')?.href;
        if (href) {
          window.location.href = href;
          return;
        }
        // Fallback: derive from collectionId
        const cid = node.dataset.dossierCollection;
        if (cid) window.location.href = `/work/${cid}`;
        return;
      }
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        setExpanded(node, false);
      } else {
        collapseAllExcept(node);
        setExpanded(node, true);
        // Filmstrip follows the expanded region
        if (markerNum && mapContainer && (mapContainer as any).__setLocked) {
          (mapContainer as any).__setLocked(markerNum);
        }
      }
    });
  });

  // ── Listen for map events (region/marker hover or lock) ──
  document.addEventListener('work-story-change', ((e: CustomEvent) => {
    const { num, locked } = e.detail;
    activeNum = num;

    // Highlight matching collection row
    collections.forEach((node) => {
      const match = node.dataset.storyMarker === num;
      node.classList.toggle('dossier-collection--active', match && num !== null);
    });

    // Auto-expand the locked collection
    if (locked && num) {
      const node = collections.find((c) => c.dataset.storyMarker === num);
      if (node) {
        collapseAllExcept(node);
        setExpanded(node, true);
      }
    }
    if (!locked && !num) {
      collapseAllExcept(null);
    }

    // Coord readout
    if (coordText) {
      if (num) {
        const node = collections.find((c) => c.dataset.storyMarker === num);
        if (node) {
          const title = node.querySelector('.dossier-collection__title')?.textContent || '';
          coordReadout?.classList.add('work-coord-readout--active');
          coordText.innerHTML = `● Active · ${title}`;
        }
      } else {
        coordReadout?.classList.remove('work-coord-readout--active');
        coordText.textContent = idleCoordText;
      }
    }

    // Filmstrip: expand when active, collapse when idle
    if (filmRoll) {
      if (num) {
        filmRoll.classList.remove('film-roll--collapsed');
        filmRoll.classList.add('film-roll--expanded');
        const node = collections.find((c) => c.dataset.storyMarker === num);
        const title = node?.querySelector('.dossier-collection__title')?.textContent || '';
        if (filmStatusText) filmStatusText.textContent = title;
        filmRoll.querySelectorAll<HTMLElement>('.film-roll__frame').forEach((frame) => {
          frame.style.opacity = frame.dataset.markerNum === num ? '1' : '0.3';
        });
      } else {
        filmRoll.classList.add('film-roll--collapsed');
        filmRoll.classList.remove('film-roll--expanded');
        if (filmStatusText) filmStatusText.textContent = idleFilmText;
        filmRoll.querySelectorAll<HTMLElement>('.film-roll__frame').forEach((frame) => {
          frame.style.opacity = '';
        });
      }
    }
  }) as EventListener);

  // ── Filmstrip hover (still drives map highlight) ──
  filmRoll?.querySelectorAll<HTMLElement>('.film-roll__frame').forEach((frame) => {
    frame.addEventListener('mouseenter', () => {
      const num = frame.dataset.markerNum;
      if (!num) return;
      if (mapContainer && (mapContainer as any).__setHovered) {
        (mapContainer as any).__setHovered(num);
      }
    });
    frame.addEventListener('mouseleave', () => {
      if (mapContainer && (mapContainer as any).__deferClear) {
        (mapContainer as any).__deferClear();
      }
    });
  });

  void activeYear;
  void activeNum;
}

document.addEventListener('astro:page-load', init);
