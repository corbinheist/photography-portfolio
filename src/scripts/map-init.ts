/**
 * MapLibre GL JS initialization.
 * Finds all [data-map] containers and creates map instances.
 *
 * Data sources (passed via data attributes from Map.astro):
 *   - data-center, data-zoom, data-markers: inline JSON
 *   - [data-map-regions]: sibling <script type="application/json"> with GeoJSON FeatureCollection
 *   - [data-map-route]: sibling <script type="application/json"> with GeoJSON Feature (LineString)
 *
 * Map style: Maptiler dataviz-dark, reskinned to Flexoki palette in the style.load handler.
 * All COLORS values follow Flexoki rules: dark theme uses 400 variants for accents,
 * base tones from the warm fx-base scale (never pure gray).
 *
 * To generate region/route data for a new project:
 *   - Regions: OSM Nominatim → polygon_geojson=1 → extract largest polygon → simplify → centroid
 *   - Routes: OSRM router.project-osrm.org → concatenate legs → GeoJSON LineString
 *   - See Map.astro header comment and reference_map_system.md for full steps.
 */

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MarkerDef {
  lng: number;
  lat: number;
  label: string;
  num?: string;
  target?: string;
}

/** Flexoki-aligned base colors (shared across all themes) */
const BASE_COLORS = {
  water: '#100F0F',
  land: '#1C1B1A',
  border: '#343331',
  textMajor: '#878580',
  textMinor: '#575653',
  road: '#343331',
};

/** Theme-specific accent colors */
const THEMES: Record<string, { regionFill: string; regionStroke: string; routeLine: string }> = {
  default: {
    regionFill: '#2E8B57',    // hs-forest (green accent)
    regionStroke: '#2E8B57',
    routeLine: '#DA702C',     // hs-rust
  },
  japan: {
    regionFill: '#D14D41',    // flexoki-red-400
    regionStroke: '#D14D41',
    routeLine: '#4385BE',     // flexoki-blue-400
  },
};

/** Compute the geometric centroid of a polygon ring using the shoelace/signed-area method. */
function polygonCentroid(ring: number[][]): [number, number] {
  const n = ring.length - 1; // last point repeats first
  if (n < 3) {
    const sx = ring.reduce((s, p) => s + p[0], 0);
    const sy = ring.reduce((s, p) => s + p[1], 0);
    return [sx / ring.length, sy / ring.length];
  }
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
}

/** Get the centroid of a GeoJSON geometry (Polygon or MultiPolygon — uses largest ring). */
function geometryCentroid(geom: GeoJSON.Geometry): [number, number] {
  if (geom.type === 'Polygon') {
    return polygonCentroid(geom.coordinates[0]);
  }
  if (geom.type === 'MultiPolygon') {
    // Use the ring with the most points (largest polygon)
    let best: number[][] = geom.coordinates[0][0];
    for (const poly of geom.coordinates) {
      if (poly[0].length > best.length) best = poly[0];
    }
    return polygonCentroid(best);
  }
  return [0, 0];
}

/** Navigate to a target — URL (starts with / or http) or element ID (scroll). */
function navigateTo(target: string) {
  if (target.startsWith('/') || target.startsWith('http')) {
    window.location.href = target;
  } else {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
  }
}

function init() {
  document.querySelectorAll<HTMLElement>('[data-map]').forEach((container) => {
    if (container.dataset.mapReady) return;
    container.dataset.mapReady = 'true';

    const center = JSON.parse(container.dataset.center!) as [number, number];
    const zoom = Number(container.dataset.zoom);
    const markers: MarkerDef[] = JSON.parse(container.dataset.markers || '[]');
    const interactive = container.dataset.interactive === 'true';
    const key = container.dataset.maptilerKey || '';
    const themeName = container.dataset.mapTheme || 'default';
    const accent = THEMES[themeName] ?? THEMES.default;

    // Look for region and route GeoJSON in sibling script tags
    const regionsEl = container.parentElement?.querySelector('[data-map-regions]');
    let regions: GeoJSON.FeatureCollection | null = null;
    if (regionsEl?.textContent) {
      try { regions = JSON.parse(regionsEl.textContent); } catch { /* skip */ }
    }

    const routeEl = container.parentElement?.querySelector('[data-map-route]');
    let routeData: GeoJSON.Feature | null = null;
    if (routeEl?.textContent) {
      try { routeData = JSON.parse(routeEl.textContent); } catch { /* skip */ }
    }

    const styleUrl = key
      ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${key}`
      : '';

    if (!styleUrl) {
      container.innerHTML =
        '<p style="color:var(--jp-ash,#878580);text-align:center;padding:2rem;">Map requires a Maptiler API key.<br>Set PUBLIC_MAPTILER_KEY in .env</p>';
      return;
    }

    const map = new maplibregl.Map({
      container,
      style: styleUrl,
      center,
      zoom,
      attributionControl: false,
      dragPan: interactive,
      scrollZoom: interactive,
      dragRotate: false,
      touchZoomRotate: interactive,
      doubleClickZoom: interactive,
      keyboard: false,
      pitch: 0,
      maxPitch: 0,
    });

    map.on('style.load', () => {
      const style = map.getStyle();
      if (!style?.layers) return;

      // ── Restyle base map layers ──
      for (const layer of style.layers) {
        const id = layer.id;
        const type = layer.type;

        try {
          if (id.includes('water') && type === 'fill') {
            map.setPaintProperty(id, 'fill-color', BASE_COLORS.water);
          }

          if (type === 'background') {
            map.setPaintProperty(id, 'background-color', BASE_COLORS.land);
          }

          if ((id.includes('landcover') || id.includes('landuse')) && type === 'fill') {
            map.setPaintProperty(id, 'fill-opacity', 0.06);
          }

          if (id.includes('road') || id.includes('highway') || id.includes('path') || id.includes('track')) {
            if (id.includes('major') || id.includes('motorway') || id.includes('trunk')) {
              map.setPaintProperty(id, 'line-color', BASE_COLORS.road);
              map.setPaintProperty(id, 'line-opacity', 0.3);
            } else {
              map.setLayoutProperty(id, 'visibility', 'none');
            }
          }

          if (id.includes('boundary') || id.includes('border')) {
            map.setPaintProperty(id, 'line-color', BASE_COLORS.border);
            map.setPaintProperty(id, 'line-opacity', 0.2);
          }

          if (id.includes('contour')) {
            map.setPaintProperty(id, 'line-opacity', 0.08);
          }

          if (type === 'symbol') {
            if (id.includes('country') || id.includes('continent')) {
              map.setPaintProperty(id, 'text-color', BASE_COLORS.textMajor);
              map.setPaintProperty(id, 'text-opacity', 0.7);
            } else if (id.includes('city') || id.includes('capital') || id.includes('state') || id.includes('region')) {
              map.setPaintProperty(id, 'text-color', BASE_COLORS.textMinor);
              map.setPaintProperty(id, 'text-opacity', 0.5);
            } else if (id.includes('peak') || id.includes('mountain')) {
              map.setPaintProperty(id, 'text-color', BASE_COLORS.textMinor);
              map.setPaintProperty(id, 'text-opacity', 0.4);
            } else {
              map.setLayoutProperty(id, 'visibility', 'none');
            }
            try { map.setLayoutProperty(id, 'icon-size', 0); } catch { /* skip */ }
          }

          if (id.includes('building')) map.setLayoutProperty(id, 'visibility', 'none');
          if (id.includes('poi')) map.setLayoutProperty(id, 'visibility', 'none');
          if (id.includes('transit') || id.includes('rail') || id.includes('ferry')) {
            map.setLayoutProperty(id, 'visibility', 'none');
          }

          if (id.includes('hillshade') || id.includes('hillshading')) {
            map.setPaintProperty(id, 'hillshade-shadow-color', '#100F0F');
            map.setPaintProperty(id, 'hillshade-highlight-color', '#343331');
            map.setPaintProperty(id, 'hillshade-exaggeration', 0.3);
          }
        } catch { /* skip unsupported properties */ }
      }

      // ── Add region polygons ──
      if (regions && regions.features?.length) {
        map.addSource('regions', { type: 'geojson', data: regions });

        map.addLayer({
          id: 'regions-fill',
          type: 'fill',
          source: 'regions',
          paint: {
            'fill-color': accent.regionFill,
            'fill-opacity': 0.12,
          },
        });

        map.addLayer({
          id: 'regions-stroke',
          type: 'line',
          source: 'regions',
          paint: {
            'line-color': accent.regionStroke,
            'line-width': 1.5,
            'line-opacity': 0.35,
          },
        });
      }

      // ── Route line (visually distinct: blue, dashed) ──
      // Only fall back to straight-line route if regions exist (collection-level map).
      // World-level maps (markers only, no regions) should not connect markers.
      const routeFeature = routeData ?? (regions && markers.length > 1 ? {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: markers.map((m) => [m.lng, m.lat]),
        },
      } : null);

      if (routeFeature) {
        map.addSource('route', {
          type: 'geojson',
          data: routeFeature as GeoJSON.Feature,
        });

        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': accent.routeLine,
            'line-width': 2.5,
            'line-dasharray': [4, 3],
            'line-opacity': 0.45,
          },
        });
      }

      // ── Region hover interaction ──
      // Track which region num is hovered (null = none)
      let hoveredNum: string | null = null;

      function setHovered(num: string | null) {
        if (num === hoveredNum) return;
        hoveredNum = num;
        // Update fill opacity: hovered region brighter
        map.setPaintProperty('regions-fill', 'fill-opacity', [
          'case',
          ['==', ['get', 'num'], num ?? ''],
          0.30,
          0.12,
        ]);
        // Update stroke: hovered region brighter + thicker
        map.setPaintProperty('regions-stroke', 'line-opacity', [
          'case',
          ['==', ['get', 'num'], num ?? ''],
          0.8,
          0.35,
        ]);
        map.setPaintProperty('regions-stroke', 'line-width', [
          'case',
          ['==', ['get', 'num'], num ?? ''],
          2.5,
          1.5,
        ]);
        // Update cursor
        map.getCanvas().style.cursor = num ? 'pointer' : '';
        // Update label highlights
        document.querySelectorAll('.map-marker').forEach((el) => {
          const markerNum = (el as HTMLElement).dataset.markerNum;
          el.classList.toggle('map-marker--active', markerNum === num);
        });
      }

      // Hover on map regions
      map.on('mousemove', 'regions-fill', (e) => {
        const feat = e.features?.[0];
        setHovered(feat?.properties?.num ?? null);
      });
      map.on('mouseleave', 'regions-fill', () => setHovered(null));

      // Click on map regions
      map.on('click', 'regions-fill', (e) => {
        const feat = e.features?.[0];
        const num = feat?.properties?.num;
        if (num) {
          const marker = markers.find((m) => m.num === num);
          if (marker?.target) navigateTo(marker.target);
        }
      });

      // ── Build centroid lookup from regions ──
      const centroidByNum = new Map<string, [number, number]>();
      if (regions?.features) {
        for (const feat of regions.features) {
          const num = feat.properties?.num;
          if (num) {
            centroidByNum.set(num, geometryCentroid(feat.geometry));
          }
        }
      }

      // ── Wire timeline phases to region highlights + click navigation ──
      const numToTarget = new Map(markers.map((m) => [m.num, m.target]));
      const slide = container.closest('.slide');
      if (slide) {
        slide.querySelectorAll<HTMLElement>('[data-region-num]').forEach((phase) => {
          const num = phase.dataset.regionNum!;
          phase.addEventListener('mouseenter', () => {
            setHovered(num);
            phase.classList.add('jp-timeline__phase--highlighted');
          });
          phase.addEventListener('mouseleave', () => {
            setHovered(null);
            phase.classList.remove('jp-timeline__phase--highlighted');
          });
          phase.addEventListener('click', () => {
            const targetId = numToTarget.get(num);
            if (targetId) navigateTo(targetId);
          });
        });
      }

      // ── DOM markers (label only, no dot — positioned at region centroid) ──
      markers.forEach((m) => {
        const computed = m.num ? centroidByNum.get(m.num) : undefined;
        const lngLat: [number, number] = computed ?? [m.lng, m.lat];

        const el = document.createElement('div');
        el.className = 'map-marker map-marker--label-only';
        if (m.target) el.classList.add('map-marker--clickable');
        if (m.num) el.dataset.markerNum = m.num;

        const label = document.createElement('div');
        label.className = 'map-marker__label';
        if (m.num) {
          const numSpan = document.createElement('span');
          numSpan.className = 'map-marker__num';
          numSpan.textContent = m.num;
          label.appendChild(numSpan);
        }
        const nameSpan = document.createElement('span');
        nameSpan.className = 'map-marker__name';
        nameSpan.textContent = m.label;
        label.appendChild(nameSpan);
        el.appendChild(label);

        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(map);

        // Label hover triggers region highlight
        el.addEventListener('mouseenter', () => setHovered(m.num ?? null));
        el.addEventListener('mouseleave', () => setHovered(null));

        if (m.target) {
          el.addEventListener('click', () => navigateTo(m.target!));
        }
      });
    });
  });
}

document.addEventListener('astro:page-load', init);
