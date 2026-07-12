import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.join(process.cwd(), process.env.ASTRO_OUT_DIR || 'dist');
const limits = {
  largestJavaScript: 1_100_000,
  totalJavaScript: 1_260_000,
  largestCss: 80_000,
  largestHtml: 525_000,
  mapFreeReferencedJavaScript: 50_000,
};

const mapFreePages = ['index.html', 'about/index.html', 'blog/index.html', 'gallery/index.html'];

async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

const measured = await Promise.all(
  (await walk(distDir)).map(async (filename) => ({
    filename,
    relative: path.relative(distDir, filename),
    bytes: (await stat(filename)).size,
  })),
);

const javascript = measured.filter((file) => file.filename.endsWith('.js'));
const css = measured.filter((file) => file.filename.endsWith('.css'));
const html = measured.filter((file) => file.filename.endsWith('.html'));
const largest = (files: typeof measured) => files.toSorted((a, b) => b.bytes - a.bytes)[0];
const totalJavaScript = javascript.reduce((sum, file) => sum + file.bytes, 0);
const largestJavaScript = largest(javascript);
const largestCss = largest(css);
const largestHtml = largest(html);

const failures: string[] = [];
if (largestJavaScript?.bytes > limits.largestJavaScript) {
  failures.push(`Largest JavaScript asset is ${formatBytes(largestJavaScript.bytes)} (${largestJavaScript.relative}); limit is ${formatBytes(limits.largestJavaScript)}.`);
}
if (totalJavaScript > limits.totalJavaScript) {
  failures.push(`Total JavaScript is ${formatBytes(totalJavaScript)}; limit is ${formatBytes(limits.totalJavaScript)}.`);
}
if (largestCss?.bytes > limits.largestCss) {
  failures.push(`Largest CSS asset is ${formatBytes(largestCss.bytes)} (${largestCss.relative}); limit is ${formatBytes(limits.largestCss)}.`);
}
if (largestHtml?.bytes > limits.largestHtml) {
  failures.push(`Largest HTML page is ${formatBytes(largestHtml.bytes)} (${largestHtml.relative}); limit is ${formatBytes(limits.largestHtml)}.`);
}

for (const page of mapFreePages) {
  const htmlSource = await readFile(path.join(distDir, page), 'utf8');
  const assetPaths = [...htmlSource.matchAll(/(?:src|href)="([^"?]+\.js)"/g)]
    .map((match) => match[1])
    .filter((asset, index, all) => all.indexOf(asset) === index);
  let referencedBytes = 0;
  for (const asset of assetPaths) {
    const url = new URL(asset, `https://local.invalid/${page}`);
    if (url.origin !== 'https://local.invalid') continue;
    const relative = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const file = measured.find((entry) => entry.relative === relative);
    if (!file) {
      failures.push(`${page} references unresolved local JavaScript asset "${asset}".`);
      continue;
    }
    referencedBytes += file.bytes;
    const source = await readFile(file.filename, 'utf8');
    if (source.includes('MapLibre GL JS') || source.includes('maplibregl-map')) {
      failures.push(`${page} includes MapLibre through ${file.relative} despite being map-free.`);
    }
  }
  if (referencedBytes > limits.mapFreeReferencedJavaScript) {
    failures.push(`${page} references ${formatBytes(referencedBytes)} of JavaScript; limit is ${formatBytes(limits.mapFreeReferencedJavaScript)}.`);
  }
  console.log(`${page}: ${formatBytes(referencedBytes)} referenced JavaScript`);
}

console.log(`JavaScript: ${formatBytes(totalJavaScript)} total; largest ${formatBytes(largestJavaScript?.bytes ?? 0)} (${largestJavaScript?.relative ?? 'none'})`);
console.log(`CSS: largest ${formatBytes(largestCss?.bytes ?? 0)} (${largestCss?.relative ?? 'none'})`);
console.log(`HTML: largest ${formatBytes(largestHtml?.bytes ?? 0)} (${largestHtml?.relative ?? 'none'})`);

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`ERROR ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Build output is within the current performance budget.');
}
