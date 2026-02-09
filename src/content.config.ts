import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { substackLoader } from './data/loaders/substack-loader';

const photos = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/data/photos' }),
  schema: z.object({
    title: z.string(),
    url: z.string().url(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    lqip: z.string().describe('Base64-encoded low-quality image placeholder'),
    exif: z
      .object({
        camera: z.string().optional(),
        lens: z.string().optional(),
        focalLength: z.string().optional(),
        aperture: z.string().optional(),
        shutter: z.string().optional(),
        iso: z.number().optional(),
        date: z.string().optional(),
      })
      .optional(),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    sortOrder: z.number().default(0),
  }),
});

const albums = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/data/albums' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    coverPhoto: z.string().describe('Reference to a photo ID'),
    photos: z.array(z.string()).describe('Ordered list of photo IDs'),
    date: z.string().optional(),
    location: z.string().optional(),
    layout: z.enum(['masonry', 'grid', 'horizontal-scroll']).default('masonry'),
    gridAspectRatio: z.string().optional().describe('Aspect ratio for grid layout, e.g. "3:2"'),
    draft: z.boolean().default(false),
    sortOrder: z.number().default(0),
  }),
});

const photoCollections = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/data/collections' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    albums: z.array(z.string()).describe('Ordered list of album IDs'),
    coverPhoto: z.string().optional().describe('Reference to a photo ID'),
    sortOrder: z.number().default(0),
  }),
});

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

const blog = defineCollection({
  loader: substackLoader(),
});

export const collections = { photos, albums, photoCollections, settings, blog };
