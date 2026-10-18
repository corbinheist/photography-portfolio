import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const settings = defineCollection({
  loader: glob({ pattern: 'settings.yaml', base: './src/data' }),
  schema: z.object({
    siteName: z.string(),
    author: z.object({
      name: z.string(),
      bio: z.string().optional(),
      avatar: z.string().optional(),
    }),
    substackUrl: z.string().url().optional(),
    socialLinks: z
      .array(
        z.object({
          platform: z.string(),
          url: z.string().url(),
          label: z.string(),
        }),
      )
      .default([]),
  }),
});

const stories = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/stories' }),
  schema: z.object({
    title: z.string(),
    place: z.string(),
    date: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'date must be a quoted "YYYY", "YYYY-MM", or "YYYY-MM-DD" string'),
    summary: z.string(),
    cover: z.string().describe('Image id in src/data/story-photos/<slug>.yaml'),
    /** Tiebreak for stories with the same date (lowest first). The date sets the order: newest first. */
    order: z.number(),
    draft: z.boolean().default(false),
    client: z.string().optional(),
    theme: z.enum(['korman']).optional(),
    credits: z.array(z.object({ role: z.string(), name: z.string() })).default([]),
    /** Optional measured facts. Each one shows in the title card only when it is set. */
    region: z.string().optional(),
    coords: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
    elevation_m: z.number().optional(),
  }),
});

export const collections = { settings, stories };
