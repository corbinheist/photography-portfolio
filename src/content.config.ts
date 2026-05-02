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

const essays = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/data/essays' }),
  schema: z.object({
    collectionId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    date: z.string().optional(),
    location: z.string().optional(),
    coverPhotoIndex: z.number().int().nonnegative().default(0),
    photos: z.array(
      z.object({
        url: z.string().url(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        lqip: z.string(),
        title: z.string(),
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
      }),
    ),
  }),
});

const photoCollections = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/data/collections' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    albums: z.array(z.string()).describe('Ordered list of album IDs'),
    essays: z
      .array(
        z.object({
          slug: z.string(),
          title: z.string(),
          description: z.string().optional(),
          coverImage: z.object({
            url: z.string(),
            width: z.number(),
            height: z.number(),
            lqip: z.string(),
          }),
          photoCount: z.number(),
        }),
      )
      .optional(),
    coverPhoto: z.string().optional().describe('Reference to a photo ID'),
    primaryHref: z.string().optional().describe('Override link for world map marker (defaults to /work/<id>)'),
    sortOrder: z.number().default(0),
    map: z
      .object({
        center: z.tuple([z.number(), z.number()]),
        zoom: z.number().default(7),
        regionsFile: z.string().optional(),
        routeFile: z.string().optional(),
        markers: z
          .array(
            z.object({
              label: z.string(),
              lng: z.number(),
              lat: z.number(),
              target: z.string(),
              num: z.string().optional(),
            }),
          )
          .default([]),
      })
      .optional(),
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

export const collections = { photos, albums, essays, photoCollections, settings, blog };
