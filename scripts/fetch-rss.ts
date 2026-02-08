/**
 * Fetch Substack RSS feed and cache it locally.
 *
 * Substack blocks requests from cloud/CI IP ranges. This script
 * runs locally (or via a proxy) and saves the feed to a file that
 * the Astro content loader reads at build time.
 *
 * Usage: pnpm fetch-rss
 */

import fs from 'node:fs';
import path from 'node:path';

const RSS_URL = process.env.SUBSTACK_RSS_URL || 'https://corbinheist.substack.com/feed';
const OUTPUT = path.resolve('src/data/substack-feed.xml');

async function main() {
  console.log(`Fetching RSS from ${RSS_URL}...`);

  const response = await fetch(RSS_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });

  if (!response.ok) {
    console.error(`Failed: HTTP ${response.status}`);
    process.exit(1);
  }

  const xml = await response.text();
  fs.writeFileSync(OUTPUT, xml);
  console.log(`Saved to ${OUTPUT} (${xml.length} bytes)`);
}

main().catch((err) => {
  console.error('Failed to fetch RSS:', err);
  process.exit(1);
});
