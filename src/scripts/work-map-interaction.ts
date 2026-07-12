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
  const sheet = document.querySelector<HTMLElement>('[data-story-sheet]');
  const sheetBackdrop = document.querySelector<HTMLElement>('[data-story-sheet-backdrop]');
  const sheetDrawer = document.querySelector<HTMLElement>('[data-story-sheet-drawer]');
  const sheetContent = document.querySelector<HTMLElement>('[data-story-sheet-content]');
  const sheetClose = document.querySelector<HTMLButtonElement>('[data-story-sheet-close]');
  const isMobile = () => window.matchMedia('(max-width: 1023px)').matches;

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

    document.querySelectorAll<HTMLElement>('.map-marker--label-only[data-view="world"]').forEach((el) => {
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
        if (mapContainer && (mapContainer as any).__setLocked) {
          (mapContainer as any).__setLocked(null);
        }
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

  // ── Mobile bottom sheet ──
  let sheetReturnFocus: HTMLElement | null = null;

  function getSheetFocusable() {
    if (!sheetDrawer) return [];
    return Array.from(sheetDrawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
  }

  function openSheet(node: HTMLElement) {
    if (!sheet || !sheetContent || !sheetDrawer) return;
    const num = node.dataset.storyMarker || '';
    const title =
      node.querySelector('.dossier-collection__title')?.textContent ?? '';
    const meta = node.querySelector('.dossier-collection__meta')?.textContent ?? '';
    const cid = node.dataset.dossierCollection ?? '';
    const sourceEssays = node.querySelector<HTMLElement>('.dossier-collection__essays');

    const head = document.createElement('div');
    head.className = 'story-sheet__head';
    const numEl = document.createElement('span');
    numEl.className = 'story-sheet__num';
    numEl.textContent = num.replace('world-', '');
    const titleBlock = document.createElement('div');
    titleBlock.className = 'story-sheet__title-block';
    const titleEl = document.createElement('h3');
    titleEl.className = 'story-sheet__title';
    titleEl.id = 'story-sheet-heading';
    titleEl.textContent = title;
    const metaEl = document.createElement('span');
    metaEl.className = 'story-sheet__meta';
    metaEl.textContent = meta;
    titleBlock.append(titleEl, metaEl);
    head.append(numEl, titleBlock);
    sheetContent.replaceChildren(head);

    if (sourceEssays) {
      const essays = document.createElement('div');
      essays.className = 'story-sheet__essays';
      essays.append(...Array.from(sourceEssays.children, (child) => child.cloneNode(true)));
      sheetContent.append(essays);
    } else {
      const cta = document.createElement('a');
      cta.className = 'story-sheet__cta';
      cta.href = `/work/${encodeURIComponent(cid)}`;
      cta.textContent = `Open region ${title} →`;
      sheetContent.append(cta);
    }
    sheetReturnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    sheet.inert = false;
    sheet.setAttribute('aria-hidden', 'false');
    (sheetClose ?? getSheetFocusable()[0] ?? sheetDrawer).focus();
  }

  function closeSheet() {
    if (!sheet || sheet.getAttribute('aria-hidden') === 'true') return;
    sheet.setAttribute('aria-hidden', 'true');
    sheet.inert = true;
    sheetReturnFocus?.focus();
    sheetReturnFocus = null;
  }

  function closeSheetAndUnlock() {
    closeSheet();
    if (mapContainer && (mapContainer as any).__setLocked) {
      (mapContainer as any).__setLocked(null);
    }
  }

  sheetBackdrop?.addEventListener('click', closeSheetAndUnlock);
  sheetClose?.addEventListener('click', closeSheetAndUnlock);
  sheet?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSheetAndUnlock();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = getSheetFocusable();
    if (focusable.length === 0) {
      e.preventDefault();
      sheetDrawer?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, { capture: true });

  // Swipe-to-dismiss on the drawer
  if (sheetDrawer) {
    let touchStartY = 0;
    let touchCurrentY = 0;
    let tracking = false;

    sheetDrawer.addEventListener(
      'touchstart',
      (e) => {
        if (sheetDrawer.scrollTop > 0) return;
        touchStartY = e.touches[0].clientY;
        touchCurrentY = touchStartY;
        tracking = true;
      },
      { passive: true },
    );

    sheetDrawer.addEventListener(
      'touchmove',
      (e) => {
        if (!tracking) return;
        touchCurrentY = e.touches[0].clientY;
        const dy = touchCurrentY - touchStartY;
        if (dy > 0) sheetDrawer.style.transform = `translateY(${dy}px)`;
      },
      { passive: true },
    );

    sheetDrawer.addEventListener('touchend', () => {
      if (!tracking) return;
      tracking = false;
      const dy = touchCurrentY - touchStartY;
      if (dy > 80) {
        closeSheetAndUnlock();
      }
      sheetDrawer.style.transform = '';
    });
  }

  // ── Listen for map events (region/marker hover or lock) ──
  document.addEventListener('work-story-change', ((e: CustomEvent) => {
    const { num, locked } = e.detail;
    activeNum = num;

    // Highlight matching collection row
    collections.forEach((node) => {
      const match = node.dataset.storyMarker === num;
      node.classList.toggle('dossier-collection--active', match && num !== null);
    });

    // Auto-expand the locked collection on desktop, open the sheet on mobile
    if (locked && num) {
      const node = collections.find((c) => c.dataset.storyMarker === num);
      if (node) {
        if (isMobile()) {
          openSheet(node);
        } else {
          collapseAllExcept(node);
          setExpanded(node, true);
        }
      }
    }
    if (!locked && !num) {
      collapseAllExcept(null);
      closeSheet();
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
