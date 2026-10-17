/**
 * Generate YAML content files from processed images
 *
 * Reads the manifest from _processed/ and extracts EXIF data
 * from original files, then creates/updates YAML files in src/data/photos/
 *
 * Usage: pnpm generate-yaml
 */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { extractExif } from './lib/image-pipeline';

const PROCESSED_DIR = path.resolve('_processed');
const PHOTOS_DIR = path.resolve('src/data/photos');
const CDN_BASE =
  process.env.DO_SPACES_CDN_ENDPOINT || 'https://your-bucket.nyc3.cdn.digitaloceanspaces.com';

interface Manifest {
  slug: string;
  originalPath: string;
  width: number;
  height: number;
  lqip: string;
  variants: { format: string; width: number; path: string }[];
}

async function main() {
  const manifestPath = path.join(PROCESSED_DIR, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    console.log('Run "pnpm process-images" first.');
    process.exit(1);
  }

  const manifest: Manifest[] = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  fs.mkdirSync(PHOTOS_DIR, { recursive: true });

  console.log(`Generating YAML for ${manifest.length} photo(s)...\n`);

  for (let i = 0; i < manifest.length; i++) {
    const entry = manifest[i];
    const yamlPath = path.join(PHOTOS_DIR, `${entry.slug}.yaml`);

    // Skip if YAML already exists (don't overwrite manual edits)
    if (fs.existsSync(yamlPath)) {
      console.log(`  Skipping ${entry.slug}.yaml (already exists)`);
      continue;
    }

    const exif = await extractExif(entry.originalPath);

    // Build the base URL — the Photo component will construct srcset from this
    const url = `${CDN_BASE}/photos/${entry.slug}`;

    const photoData: Record<string, unknown> = {
      title: entry.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      url,
      width: entry.width,
      height: entry.height,
      lqip: entry.lqip,
      tags: [],
      sortOrder: i + 1,
    };

    if (Object.keys(exif).length > 0) {
      photoData.exif = exif;
    }

    const doc = new YAML.Document(photoData);
    // Force date strings to be quoted so YAML doesn't parse them as Date objects
    YAML.visit(doc, {
      Scalar(_, node) {
        if (typeof node.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(node.value)) {
          node.type = YAML.Scalar.QUOTE_DOUBLE;
        }
      },
    });
    const yamlStr = doc.toString({ lineWidth: 0 });
    fs.writeFileSync(yamlPath, yamlStr);
    console.log(`  Created: ${entry.slug}.yaml`);
  }

  console.log('\nDone. Review and customize the generated YAML files.');
}

main().catch((err) => {
  console.error('YAML generation failed:', err);
  process.exit(1);
});
