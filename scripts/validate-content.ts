import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

type RecordMap = Map<string, any>;
type Diagnostic = { level: 'error' | 'warning'; code: string; message: string };

const root = process.cwd();
const dataDir = path.join(root, 'src/data');
const diagnostics: Diagnostic[] = [];

function report(level: Diagnostic['level'], code: string, message: string) {
  diagnostics.push({ level, code, message });
}

function error(code: string, message: string) {
  report('error', code, message);
}

function warning(code: string, message: string) {
  report('warning', code, message);
}

async function loadYamlDirectory(name: string): Promise<RecordMap> {
  const directory = path.join(dataDir, name);
  const entries = new Map<string, any>();
  for (const filename of (await readdir(directory)).filter((file) => file.endsWith('.yaml')).sort()) {
    const id = path.basename(filename, '.yaml');
    try {
      entries.set(id, parse(await readFile(path.join(directory, filename), 'utf8')));
    } catch (cause) {
      error('yaml.invalid', `${name}/${filename}: ${String(cause)}`);
    }
  }
  return entries;
}

async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function hasDuplicates(values: string[]) {
  return new Set(values).size !== values.length;
}

function validCoordinate(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validateCoordinates(value: unknown, source: string) {
  if (!Array.isArray(value)) {
    error('map.coordinates-invalid', `${source}: coordinates must be arrays`);
    return;
  }
  if (value.length === 0) {
    error('map.coordinates-empty', `${source}: coordinate arrays cannot be empty`);
    return;
  }
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    if (!validCoordinate(value[0], -180, 180) || !validCoordinate(value[1], -90, 90)) {
      error('map.coordinate-out-of-range', `${source}: invalid coordinate [${value[0]}, ${value[1]}]`);
    }
    return;
  }
  for (const nested of value) validateCoordinates(nested, source);
}

function samePosition(a: unknown, b: unknown) {
  return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
}

function validateGeometryStructure(geometry: any, source: string) {
  if (geometry.type === 'LineString' && geometry.coordinates.length < 2) {
    error('map.line-too-short', `${source}: LineString needs at least two positions`);
  }
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) {
        error('map.ring-too-short', `${source}: polygon rings need at least four positions`);
      } else if (!samePosition(ring[0], ring[ring.length - 1])) {
        error('map.ring-open', `${source}: polygon rings must be closed`);
      }
    }
  }
}

async function discoverStaticRoutes() {
  const pagesDir = path.join(root, 'src/pages');
  const routes = new Set<string>();
  for (const filename of await walk(pagesDir)) {
    if (!filename.endsWith('.astro')) continue;
    const relative = path.relative(pagesDir, filename).replaceAll(path.sep, '/');
    if (relative.includes('[')) continue;
    const route = `/${relative.replace(/(?:\/index)?\.astro$/, '')}`.replace(/\/$/, '') || '/';
    routes.add(route);
  }
  return routes;
}

const [photos, albums, essays, collections, staticRoutes, mapFiles] = await Promise.all([
  loadYamlDirectory('photos'),
  loadYamlDirectory('albums'),
  loadYamlDirectory('essays'),
  loadYamlDirectory('collections'),
  discoverStaticRoutes(),
  readdir(path.join(dataDir, 'maps')),
]);

const routes = new Set(staticRoutes);
const mapFileSet = new Set(mapFiles.filter((file) => file.endsWith('.json')));
const albumOwners = new Map<string, string>();
const referencedMaps = new Set<string>();

for (const [collectionId, collection] of collections) {
  routes.add(`/work/${collectionId}`);
  const essayIds: string[] = collection.essays ?? [];
  const albumIds: string[] = collection.archiveAlbums ?? [];

  if (hasDuplicates(essayIds)) error('collection.essay-duplicate', `${collectionId}: duplicate essay reference`);
  if (hasDuplicates(albumIds)) error('collection.album-duplicate', `${collectionId}: duplicate archive album reference`);

  for (const essayId of essayIds) {
    const essay = essays.get(essayId);
    if (!essay) {
      error('collection.essay-missing', `${collectionId}: essay "${essayId}" does not exist`);
      continue;
    }
    if (essay.collectionId !== collectionId) {
      error('collection.essay-owner', `${essayId}: declares collection "${essay.collectionId}", expected "${collectionId}"`);
    }
    const slug = essayId.startsWith(`${collectionId}-`)
      ? essayId.slice(collectionId.length + 1)
      : essayId;
    routes.add(`/work/${collectionId}/${slug}`);
  }

  for (const albumId of albumIds) {
    if (!albums.has(albumId)) {
      error('collection.album-missing', `${collectionId}: album "${albumId}" does not exist`);
      continue;
    }
    const existingOwner = albumOwners.get(albumId);
    if (existingOwner && existingOwner !== collectionId) {
      error('collection.album-multiple-owners', `${albumId}: referenced by ${existingOwner} and ${collectionId}`);
    }
    albumOwners.set(albumId, collectionId);
    routes.add(`/work/${collectionId}/${albumId}`);
  }

  if (collection.coverPhoto && !photos.has(collection.coverPhoto)) {
    error('collection.cover-missing', `${collectionId}: cover photo "${collection.coverPhoto}" does not exist`);
  }

  if (collection.primaryHref && !collection.primaryHref.startsWith('/')) {
    error('collection.primary-route-invalid', `${collectionId}: primaryHref must be an internal absolute path`);
  }

  if (!collection.map) continue;
  const [lng, lat] = collection.map.center ?? [];
  if (!validCoordinate(lng, -180, 180) || !validCoordinate(lat, -90, 90)) {
    error('collection.map-center-invalid', `${collectionId}: map center is outside geographic bounds`);
  }

  const countryFile = `${collectionId}-country.json`;
  referencedMaps.add(countryFile);
  if (!mapFileSet.has(countryFile)) {
    error('collection.country-map-missing', `${collectionId}: implicit map "${countryFile}" does not exist`);
  }

  for (const key of ['regionsFile', 'routeFile'] as const) {
    const filename = collection.map[key];
    if (!filename) continue;
    referencedMaps.add(filename);
    if (path.basename(filename) !== filename || !mapFileSet.has(filename)) {
      error('collection.map-file-missing', `${collectionId}: ${key} "${filename}" does not exist`);
    }
  }

  const markerNums = new Set<string>();
  for (const marker of collection.map.markers ?? []) {
    if (!marker.num || !/^\d{2}$/.test(marker.num)) {
      error('marker.number-invalid', `${collectionId}: marker "${marker.label}" needs a two-digit num`);
    } else if (markerNums.has(marker.num)) {
      error('marker.number-duplicate', `${collectionId}: duplicate marker num "${marker.num}"`);
    } else {
      markerNums.add(marker.num);
    }
    if (!validCoordinate(marker.lng, -180, 180) || !validCoordinate(marker.lat, -90, 90)) {
      error('marker.coordinate-invalid', `${collectionId}/${marker.num ?? '?'}: coordinates are outside geographic bounds`);
    }
    if (typeof marker.target !== 'string' || !marker.target.startsWith('/')) {
      error('marker.target-invalid', `${collectionId}/${marker.num ?? '?'}: target must be an internal absolute path`);
    }
  }
}

for (const [albumId, album] of albums) {
  const photoIds: string[] = album.photos ?? [];
  if (photoIds.length === 0) error('album.empty', `${albumId}: album has no photos`);
  if (hasDuplicates(photoIds)) error('album.photo-duplicate', `${albumId}: duplicate photo reference`);
  for (const photoId of photoIds) {
    if (!photos.has(photoId)) error('album.photo-missing', `${albumId}: photo "${photoId}" does not exist`);
  }
  if (!photos.has(album.coverPhoto)) error('album.cover-missing', `${albumId}: cover "${album.coverPhoto}" does not exist`);
  else if (!photoIds.includes(album.coverPhoto)) error('album.cover-not-in-album', `${albumId}: cover is not in the photo list`);
  if (!album.draft && !albumOwners.has(albumId)) warning('album.orphan', `${albumId}: published album is not assigned to a collection`);
}

for (const [essayId, essay] of essays) {
  if ('slug' in essay) error('essay.slug-forbidden', `${essayId}: top-level slug overrides Astro's entry ID`);
  const collection = collections.get(essay.collectionId);
  if (!collection) error('essay.collection-missing', `${essayId}: collection "${essay.collectionId}" does not exist`);
  else if (!(collection.essays ?? []).includes(essayId)) error('essay.orphan', `${essayId}: not listed by collection "${essay.collectionId}"`);
  if (!essayId.startsWith(`${essay.collectionId}-`)) warning('essay.id-prefix', `${essayId}: ID does not start with collection ID`);
  const essayPhotos: any[] = essay.photos ?? [];
  if (essayPhotos.length === 0) error('essay.empty', `${essayId}: essay has no photos`);
  if (!Number.isInteger(essay.coverPhotoIndex) || essay.coverPhotoIndex < 0 || essay.coverPhotoIndex >= essayPhotos.length) {
    error('essay.cover-index-invalid', `${essayId}: coverPhotoIndex is outside the photo list`);
  }
  const urls = new Set<string>();
  for (const [index, photo] of essayPhotos.entries()) {
    let parsedUrl: URL | null = null;
    try { parsedUrl = new URL(photo.url); } catch { /* reported below */ }
    if (!parsedUrl || parsedUrl.protocol !== 'https:') error('essay.photo-url-invalid', `${essayId}[${index}]: photo URL must use HTTPS`);
    else if (parsedUrl.search || parsedUrl.hash || /\.(?:avif|jpe?g|png|webp)$/i.test(parsedUrl.pathname)) {
      error('essay.photo-url-noncanonical', `${essayId}[${index}]: URL must be an extensionless CDN base URL`);
    }
    if (urls.has(photo.url)) error('essay.photo-duplicate', `${essayId}[${index}]: duplicate photo URL`);
    urls.add(photo.url);
    if (!Number.isInteger(photo.width) || photo.width <= 0 || !Number.isInteger(photo.height) || photo.height <= 0) {
      error('essay.photo-dimensions-invalid', `${essayId}[${index}]: width and height must be positive integers`);
    }
    if (typeof photo.lqip !== 'string' || !photo.lqip.startsWith('data:image/')) {
      error('essay.photo-lqip-invalid', `${essayId}[${index}]: lqip must be an image data URI`);
    }
  }
}

for (const collection of collections.values()) {
  if (collection.primaryHref && !routes.has(collection.primaryHref)) {
    error('collection.primary-route-missing', `primaryHref "${collection.primaryHref}" does not resolve`);
  }
  for (const marker of collection.map?.markers ?? []) {
    if (marker.target?.startsWith('/') && !routes.has(marker.target)) {
      error('marker.target-missing', `marker target "${marker.target}" does not resolve`);
    }
  }
}

for (const filename of mapFileSet) {
  const source = `maps/${filename}`;
  let geojson: any;
  try {
    geojson = JSON.parse(await readFile(path.join(dataDir, 'maps', filename), 'utf8'));
  } catch (cause) {
    error('map.json-invalid', `${source}: ${String(cause)}`);
    continue;
  }
  const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
  if (!Array.isArray(features) || features.length === 0) {
    error('map.features-empty', `${source}: no features`);
    continue;
  }
  const nums = new Set<string>();
  for (const feature of features) {
    const geometry = feature?.geometry;
    if (feature?.type !== 'Feature' || !['Polygon', 'MultiPolygon', 'LineString'].includes(geometry?.type)) {
      error('map.geometry-invalid', `${source}: unsupported GeoJSON feature`);
      continue;
    }
    validateGeometryStructure(geometry, source);
    validateCoordinates(geometry.coordinates, source);
    const num = feature.properties?.num;
    if (num) {
      if (nums.has(num)) error('map.region-number-duplicate', `${source}: duplicate region num "${num}"`);
      nums.add(num);
    }
  }
}

for (const filename of mapFileSet) {
  if (!referencedMaps.has(filename) && !['wise-route.json', 'patagonia-briefing-regions.json'].includes(filename)) {
    warning('map.orphan', `${filename}: not referenced by collection data`);
  }
}

for (const diagnostic of diagnostics) {
  const prefix = diagnostic.level === 'error' ? 'ERROR' : 'WARN ';
  console[diagnostic.level === 'error' ? 'error' : 'warn'](`${prefix} ${diagnostic.code} ${diagnostic.message}`);
}

const errors = diagnostics.filter((item) => item.level === 'error').length;
const warnings = diagnostics.length - errors;
console.log(`Validated ${collections.size} collections, ${essays.size} essays, ${albums.size} albums, ${photos.size} photos, and ${mapFileSet.size} maps.`);
console.log(`${errors} error(s), ${warnings} warning(s).`);
if (errors > 0) process.exitCode = 1;
