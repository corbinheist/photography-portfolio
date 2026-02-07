import type { Loader } from 'astro/loaders';
import RSSParser from 'rss-parser';

export interface SubstackPost {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
  content: string;
  author: string;
  thumbnail?: string;
}

export function substackLoader(): Loader {
  return {
    name: 'substack-loader',
    load: async ({ store, logger }) => {
      const rssUrl = import.meta.env.SUBSTACK_RSS_URL;

      if (!rssUrl) {
        logger.warn('No SUBSTACK_RSS_URL configured — skipping blog posts');
        return;
      }

      const parser = new RSSParser();

      try {
        const feed = await parser.parseURL(rssUrl);

        store.clear();

        for (const item of feed.items) {
          if (!item.title || !item.link) continue;

          // Extract thumbnail from content or enclosure
          let thumbnail: string | undefined;
          if (item.enclosure?.url) {
            thumbnail = item.enclosure.url;
          }

          const slug = item.link
            .split('/')
            .filter(Boolean)
            .pop()
            ?.replace(/\?.*$/, '') || item.title.toLowerCase().replace(/\s+/g, '-');

          store.set({
            id: slug,
            data: {
              title: item.title,
              link: item.link,
              pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
              description: item.contentSnippet || item.content?.slice(0, 200) || '',
              content: item['content:encoded'] || item.content || '',
              author: item.creator || item.author || '',
              thumbnail,
            },
          });
        }

        logger.info(`Loaded ${feed.items.length} posts from Substack`);
      } catch (err) {
        logger.error(`Failed to fetch Substack RSS: ${err}`);
      }
    },
  };
}
