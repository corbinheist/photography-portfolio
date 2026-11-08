import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'astro/zod';
import { storyPhotoSchema } from './story-manifest';

/**
 * The Everyday page (/everyday/). `pnpm everyday sync` writes this file from the Apple Photos
 * album EDC. Do not edit it by hand: the next sync replaces it.
 */
export const EVERYDAY_FILE = 'src/data/everyday.yaml';

/** Coordinates are rounded to this many decimal places (about 1.1 km) before they leave the Mac. */
export const EVERYDAY_COORDINATE_DECIMALS = 2;

const roundedDegree = (min: number, max: number) =>
  z
    .number()
    .min(min)
    .max(max)
    .refine((value) => Number(value.toFixed(EVERYDAY_COORDINATE_DECIMALS)) === value, {
      message: `coordinates must be rounded to ${EVERYDAY_COORDINATE_DECIMALS} decimal places`,
    });

export const everydayPhotoSchema = storyPhotoSchema.extend({
  alt: z.string().trim().min(1, 'every frame needs alt text (the Photos caption)'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be a quoted "YYYY-MM-DD" string'),
  coordinates: z.object({ latitude: roundedDegree(-90, 90), longitude: roundedDegree(-180, 180) }).optional(),
});

export type EverydayPhoto = z.infer<typeof everydayPhotoSchema>;

/** Parse the manifest text. The file is a list of frames, newest first. */
export function parseEveryday(source: string): EverydayPhoto[] {
  const result = z.array(everydayPhotoSchema).safeParse(parse(source) ?? []);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`${EVERYDAY_FILE}: invalid entry at [${issue.path.join('.')}]: ${issue.message}`);
  }
  const ids = new Set<string>();
  for (const photo of result.data) {
    if (ids.has(photo.id)) throw new Error(`${EVERYDAY_FILE}: duplicate id "${photo.id}"`);
    ids.add(photo.id);
  }
  return result.data;
}

/** Load the Everyday frames. A missing file means no frames yet. */
export function loadEveryday(root = process.cwd()): EverydayPhoto[] {
  let source: string;
  try {
    source = readFileSync(path.join(root, EVERYDAY_FILE), 'utf8');
  } catch {
    return [];
  }
  return parseEveryday(source);
}

/** Format a capture date ("YYYY-MM-DD") for display, for example "8 November 2026". */
export function formatEverydayDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
