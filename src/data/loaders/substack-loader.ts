import type { Loader } from 'astro/loaders';

export function substackLoader(): Loader {
  return {
    name: 'substack-loader',
    load: async ({ store, logger }) => {
      const rssUrl = import.meta.env.SUBSTACK_RSS_URL;

      if (!rssUrl) {
        logger.warn('No SUBSTACK_RSS_URL configured — skipping blog posts');
        return;
      }

      try {
        const response = await fetch(rssUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/rss+xml, application/xml, text/xml, */*',
          },
        });

        if (!response.ok) {
          logger.error(`Substack RSS returned status ${response.status}`);
          return;
        }

        const xml = await response.text();
        const items = parseRSSItems(xml);

        store.clear();

        for (const item of items) {
          if (!item.title || !item.link) continue;

          const slug =
            item.link
              .split('/')
              .filter(Boolean)
              .pop()
              ?.replace(/\?.*$/, '') ||
            item.title.toLowerCase().replace(/\s+/g, '-');

          store.set({
            id: slug,
            data: {
              title: item.title,
              link: item.link,
              pubDate: item.pubDate || new Date().toISOString(),
              description: item.description || '',
              content: item.content || '',
              author: item.author || '',
              thumbnail: item.thumbnail,
            },
          });
        }

        logger.info(`Loaded ${items.length} posts from Substack`);
      } catch (err) {
        logger.error(`Failed to fetch Substack RSS: ${err}`);
      }
    },
  };
}

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  content: string;
  author: string;
  thumbnail?: string;
}

function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      pubDate: extractTag(block, 'pubDate'),
      description: extractTag(block, 'description'),
      content: extractTag(block, 'content:encoded'),
      author: extractTag(block, 'dc:creator'),
      thumbnail: extractEnclosureUrl(block),
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`);
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle plain text
  const plainRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const plainMatch = plainRegex.exec(xml);
  if (plainMatch) return plainMatch[1].trim();

  return '';
}

function extractEnclosureUrl(xml: string): string | undefined {
  const match = /url="([^"]+)"/.exec(/<enclosure[^>]*>/.exec(xml)?.[0] || '');
  return match?.[1];
}
