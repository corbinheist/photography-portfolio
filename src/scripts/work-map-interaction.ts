/**
 * Work page map interaction coordinator.
 *
 * Listens for work-story-change events from map-init.ts and coordinates:
 *   - Story dossier panel (index list + detail view)
 *   - Filmstrip expand/collapse + filtering
 *   - Coordinate readout
 *   - Year filter tabs
 *   - Keyboard (Esc to unlock)
 */

interface Story {
  id: string;
  collectionId: string;
  title: string;
  description: string;
  kind: 'essay' | 'collection';
  slug: string;
  coverUrl: string;
  coverWidth: number;
  coverHeight: number;
  coverLqip: string;
  location: string;
  lng: number;
  lat: number;
  markerNum: string;
  year: string | null;
  photoCount: number;
}

function init() {
  const storiesEl = document.querySelector<HTMLScriptElement>('[data-stories]');
  if (!storiesEl?.textContent) return;

  let stories: Story[];
  try {
    stories = JSON.parse(storiesEl.textContent);
  } catch {
    return;
  }

  const mapContainer = document.querySelector<HTMLElement>('[data-map]');
  const dossier = document.querySelector<HTMLElement>('[data-story-dossier]');
  const indexPanel = document.querySelector<HTMLElement>('[data-story-index]');
  const detailPanel = document.querySelector<HTMLElement>('[data-story-detail]');
  const detailInner = document.querySelector<HTMLElement>('[data-story-detail-inner]');
  const backBtn = document.querySelector<HTMLElement>('[data-story-back]');
  const coordReadout = document.querySelector<HTMLElement>('[data-coord-readout]');
  const coordText = coordReadout?.querySelector<HTMLElement>('.work-coord-readout__text');
  const filmRoll = document.querySelector<HTMLElement>('[data-film-roll]');
  const filmStatus = document.querySelector<HTMLElement>('[data-film-status]');
  const filmStatusText = filmStatus?.querySelector<HTMLElement>('.film-roll__status-text');
  const yearTabs = document.querySelector<HTMLElement>('[data-year-tabs]');
  const storyCountEl = document.querySelector<HTMLElement>('[data-story-count]');
  const rows = document.querySelectorAll<HTMLElement>('[data-story-row]');

  const isTouch = window.matchMedia('(hover: none)').matches;
  const idleCoordText = isTouch
    ? `Tap a pin · ${stories.length} stories`
    : `Hover a pin · ${stories.length} stories`;
  const idleFilmText = isTouch
    ? 'Hero roll · tap a pin to load frames'
    : 'Hero roll · hover a pin to load frames';

  // Set initial text (overrides server-rendered generic copy)
  if (coordText) coordText.textContent = idleCoordText;
  if (filmStatusText) filmStatusText.textContent = idleFilmText;

  let activeYear = 'all';
  let activeNum: string | null = null;
  let isLocked = false;

  // ── Year filter ──
  yearTabs?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.work-year-tab');
    if (!btn) return;
    const year = btn.dataset.year || 'all';
    activeYear = year;

    // Update active tab
    yearTabs.querySelectorAll('.work-year-tab').forEach((t) => {
      t.classList.toggle('work-year-tab--active', (t as HTMLElement).dataset.year === year);
    });

    // Filter rows
    let visibleCount = 0;
    rows.forEach((row) => {
      const rowYear = row.dataset.storyYear || '';
      const show = year === 'all' || rowYear === year;
      row.classList.toggle('story-dossier__row--hidden', !show);
      if (show) visibleCount++;
    });

    // Filter map markers by visibility
    document.querySelectorAll<HTMLElement>('.map-marker--label-only').forEach((el) => {
      const num = el.dataset.markerNum;
      if (!num) return;
      const markerStories = stories.filter((s) => s.markerNum === num);
      const anyVisible = year === 'all' || markerStories.some((s) => s.year === year);
      el.style.display = anyVisible ? '' : 'none';
    });

    // Update count
    if (storyCountEl) {
      storyCountEl.textContent = `${visibleCount} ${visibleCount === 1 ? 'story' : 'stories'}`;
    }
  });

  // ── Mobile bottom sheet ──
  const sheet = document.querySelector<HTMLElement>('[data-story-sheet]');
  const sheetBackdrop = document.querySelector<HTMLElement>('[data-story-sheet-backdrop]');
  const sheetDrawer = document.querySelector<HTMLElement>('[data-story-sheet-drawer]');
  const sheetContent = document.querySelector<HTMLElement>('[data-story-sheet-content]');
  const isMobile = () => window.matchMedia('(max-width: 1023px)').matches;

  function buildDetailHTML(story: Story): string {
    const slug = story.coverUrl.split('/').pop() || '';
    const coverSrc = story.coverUrl ? `${story.coverUrl}/${slug}-640.webp` : '';

    return `
      ${coverSrc ? `<div class="story-detail__cover"><img src="${coverSrc}" alt="${story.title}" loading="lazy" /></div>` : ''}
      <div class="story-detail__kind">${story.kind === 'essay' ? 'Essay' : 'Collection'} · ${story.markerNum}</div>
      <div class="story-detail__title">${story.title}</div>
      <div class="story-detail__desc">${story.description}</div>
      <div class="story-detail__meta-grid">
        <div class="story-detail__meta-item">
          <span class="story-detail__meta-label">Location</span>
          <span class="story-detail__meta-value">${story.location}</span>
        </div>
        <div class="story-detail__meta-item">
          <span class="story-detail__meta-label">Coordinates</span>
          <span class="story-detail__meta-value">${story.lng.toFixed(2)}°, ${story.lat.toFixed(2)}°</span>
        </div>
        ${story.year ? `<div class="story-detail__meta-item"><span class="story-detail__meta-label">Year</span><span class="story-detail__meta-value">${story.year}</span></div>` : ''}
        <div class="story-detail__meta-item">
          <span class="story-detail__meta-label">${story.kind === 'essay' ? 'Frames' : 'Albums'}</span>
          <span class="story-detail__meta-value">${story.photoCount}</span>
        </div>
      </div>
      <a href="${story.slug}" class="story-detail__cta">
        ${story.kind === 'essay' ? 'Start the essay' : 'View collection'} →
      </a>
    `;
  }

  function openSheet(story: Story) {
    if (!sheet || !sheetContent) return;
    sheetContent.innerHTML = buildDetailHTML(story);
    sheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.setAttribute('aria-hidden', 'true');
  }

  // Backdrop click closes sheet
  sheetBackdrop?.addEventListener('click', () => {
    closeSheet();
    if (mapContainer && (mapContainer as any).__setLocked) {
      (mapContainer as any).__setLocked(null);
    }
  });

  // Swipe-to-dismiss on the drawer
  if (sheetDrawer) {
    let touchStartY = 0;
    let touchCurrentY = 0;
    let tracking = false;

    sheetDrawer.addEventListener('touchstart', (e) => {
      if (sheetDrawer.scrollTop > 0) return;
      touchStartY = e.touches[0].clientY;
      touchCurrentY = touchStartY;
      tracking = true;
    }, { passive: true });

    sheetDrawer.addEventListener('touchmove', (e) => {
      if (!tracking) return;
      touchCurrentY = e.touches[0].clientY;
      const dy = touchCurrentY - touchStartY;
      if (dy > 0) {
        sheetDrawer.style.transform = `translateY(${dy}px)`;
      }
    }, { passive: true });

    sheetDrawer.addEventListener('touchend', () => {
      if (!tracking) return;
      tracking = false;
      const dy = touchCurrentY - touchStartY;
      if (dy > 80) {
        closeSheet();
        if (mapContainer && (mapContainer as any).__setLocked) {
          (mapContainer as any).__setLocked(null);
        }
      }
      sheetDrawer.style.transform = '';
    });
  }

  // ── Dossier: show detail for a story ──
  function showDetail(story: Story) {
    if (!detailPanel || !detailInner || !indexPanel) return;
    detailInner.innerHTML = buildDetailHTML(story);
    indexPanel.style.display = 'none';
    detailPanel.style.display = '';
  }

  function showIndex() {
    if (!indexPanel || !detailPanel) return;
    indexPanel.style.display = '';
    detailPanel.style.display = 'none';
  }

  backBtn?.addEventListener('click', showIndex);

  // ── Dossier row interaction ──
  rows.forEach((row) => {
    const idx = Number(row.dataset.storyRow);
    const markerNum = row.dataset.storyMarker || null;

    row.addEventListener('mouseenter', () => {
      if (isLocked) return;
      if (markerNum && mapContainer && (mapContainer as any).__setHovered) {
        (mapContainer as any).__setHovered(markerNum);
      }
    });

    row.addEventListener('mouseleave', () => {
      if (isLocked) return;
      if (mapContainer && (mapContainer as any).__deferClear) {
        (mapContainer as any).__deferClear();
      } else if (mapContainer && (mapContainer as any).__setHovered) {
        (mapContainer as any).__setHovered(null);
      }
    });

    row.addEventListener('click', () => {
      const story = stories[idx];
      if (!story) return;
      if (markerNum && mapContainer && (mapContainer as any).__setLocked) {
        (mapContainer as any).__setLocked(markerNum);
      }
      showDetail(story);
    });
  });

  // ── Listen for map events ──
  document.addEventListener('work-story-change', ((e: CustomEvent) => {
    const { num, locked } = e.detail;
    activeNum = num;
    isLocked = locked;

    // Highlight matching rows
    rows.forEach((row) => {
      const match = row.dataset.storyMarker === num;
      row.classList.toggle('story-dossier__row--active', match && num !== null);
    });

    // Update coord readout
    if (coordText) {
      if (num) {
        const story = stories.find((s) => s.markerNum === num);
        if (story) {
          coordReadout?.classList.add('work-coord-readout--active');
          coordText.innerHTML = `● Active · ${story.location} · ${story.lng.toFixed(2)}°, ${story.lat.toFixed(2)}°`;
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
        // Filter frames to matching collection
        const matchingStory = stories.find((s) => s.markerNum === num);
        if (matchingStory && filmStatusText) {
          filmStatusText.textContent = `${matchingStory.location} · ${matchingStory.title}`;
        }
        // Highlight matching frames, dim others
        filmRoll.querySelectorAll<HTMLElement>('.film-roll__frame').forEach((frame) => {
          const frameNum = frame.dataset.markerNum;
          frame.style.opacity = (frameNum === num) ? '1' : '0.3';
        });
      } else {
        filmRoll.classList.add('film-roll--collapsed');
        filmRoll.classList.remove('film-roll--expanded');
        if (filmStatusText) {
          filmStatusText.textContent = idleFilmText;
        }
        // Reset all frame opacity
        filmRoll.querySelectorAll<HTMLElement>('.film-roll__frame').forEach((frame) => {
          frame.style.opacity = '';
        });
      }
    }

    // If locked, show story detail
    if (locked && num) {
      const story = stories.find((s) => s.markerNum === num);
      if (story) {
        if (isMobile()) {
          openSheet(story);
        } else {
          showDetail(story);
        }
      }
    }

    // If unlocked, return to index / close sheet
    if (!locked && !num) {
      showIndex();
      closeSheet();
    }
  }) as EventListener);

  // ── Filmstrip hover interaction (same as before, but respects lock) ──
  const frames = filmRoll?.querySelectorAll<HTMLElement>('.film-roll__frame');
  frames?.forEach((frame) => {
    frame.addEventListener('mouseenter', () => {
      if (isLocked) return;
      const num = frame.dataset.markerNum;
      if (!num) return;
      if (mapContainer && (mapContainer as any).__setHovered) {
        (mapContainer as any).__setHovered(num);
      }
    });

    frame.addEventListener('mouseleave', () => {
      if (isLocked) return;
      if (mapContainer && (mapContainer as any).__deferClear) {
        (mapContainer as any).__deferClear();
      } else if (mapContainer && (mapContainer as any).__setHovered) {
        (mapContainer as any).__setHovered(null);
      }
    });
  });
}

document.addEventListener('astro:page-load', init);
