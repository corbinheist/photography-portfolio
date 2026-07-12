import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.join(process.cwd(), process.env.ASTRO_OUT_DIR || 'dist');
const limits = {
  largestJavaScript: 1_100_000,
  totalJavaScript: 1_250_000,
  largestCss: 80_000,
  largestHtml: 525_000,
};

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

console.log(`JavaScript: ${formatBytes(totalJavaScript)} total; largest ${formatBytes(largestJavaScript?.bytes ?? 0)} (${largestJavaScript?.relative ?? 'none'})`);
console.log(`CSS: largest ${formatBytes(largestCss?.bytes ?? 0)} (${largestCss?.relative ?? 'none'})`);
console.log(`HTML: largest ${formatBytes(largestHtml?.bytes ?? 0)} (${largestHtml?.relative ?? 'none'})`);

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`ERROR ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Build output is within the current performance budget.');
}
