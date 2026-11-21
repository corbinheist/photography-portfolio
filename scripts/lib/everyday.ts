/**
 * The `pnpm everyday sync` pipeline. `scripts/everyday.ts` is the command line. Tests call
 * `buildEveryday` with exported frames and fake processing.
 *
 * The Apple Photos album is the source of truth:
 * - Every still frame is published. The Photos caption is the alt text. A frame without a caption
 *   gets a factual alt text from its date (`fallbackAlt`); the caption replaces it when one is added.
 * - A frame removed from the album leaves the manifest. Its CDN objects stay.
 * - An unchanged frame keeps its manifest entry, so it is not processed or uploaded again.
 * - A frame without a location in Photos takes its coordinates from the location log, when the log
 *   has a fix on the date of the frame (`location-log.ts`). The manifest marks such a frame with
 *   `coordinatesSource: location-log`.
 */

import { stringify } from 'yaml';
import type { ExifData } from './image-pipeline';
import { EVERYDAY_COORDINATE_DECIMALS, formatEverydayDate, type EverydayPhoto } from '../../src/scripts/utils/everyday';
import { fixForFrame, type LocationFix } from './location-log';

/** One frame as `scripts/everyday/export_album.py` writes it. */
export interface ExportedFrame {
  id: string;
  uuid: string;
  /** The original file name, to find the frame in Photos. */
  name?: string;
  alt: string;
  date: string;
  taken: string;
  coordinates?: { latitude: number; longitude: number };
  /** The exported JPEG, relative to the repository root. Absent when the export failed. */
  file?: string;
  error?: string;
}

/** The variants and the placeholder of one new frame. */
export interface ProcessedFrame {
  width: number;
  height: number;
  lqip: string;
  exif: ExifData;
}

export interface EverydayPlan {
  photos: EverydayPhoto[];
  added: string[];
  removed: string[];
  updated: string[];
  /** Frames without a caption: published with the fallback alt text. */
  uncaptioned: ExportedFrame[];
  /** Frames that failed to export: they stay off the page, and the run reports a failure. */
  failed: ExportedFrame[];
  /** Frames whose coordinates come from the location log. */
  located: string[];
}

const round = (value: number) => Number(value.toFixed(EVERYDAY_COORDINATE_DECIMALS));

/** The alt text of a frame without a caption: only facts the sync has, never a guessed subject. */
export function fallbackAlt(date: string): string {
  return `Everyday photograph, ${formatEverydayDate(date)}`;
}

/**
 * Build the new manifest. `process` runs only for frames that the current manifest does not have.
 * The order follows `frames` (newest first). `fixes` is the location log; it gives the coordinates
 * only for a frame that has no location in Photos.
 */
export async function buildEveryday(
  frames: ExportedFrame[],
  current: EverydayPhoto[],
  cdnBase: string,
  process: (frame: ExportedFrame) => Promise<ProcessedFrame>,
  fixes: LocationFix[] = [],
): Promise<EverydayPlan> {
  const known = new Map(current.map((photo) => [photo.id, photo]));
  const photos: EverydayPhoto[] = [];
  const added: string[] = [];
  const updated: string[] = [];
  const uncaptioned: ExportedFrame[] = [];
  const failed: ExportedFrame[] = [];
  const located: string[] = [];

  for (const frame of frames) {
    const caption = frame.alt.trim();
    if (!caption) uncaptioned.push(frame);
    const alt = caption || fallbackAlt(frame.date);
    if (frame.error) {
      failed.push(frame);
      continue;
    }
    // Round again here: the manifest must never carry more precision than the rule allows.
    const fix = frame.coordinates ? undefined : fixForFrame(fixes, frame);
    const source = frame.coordinates ?? fix;
    const coordinates = source ? { latitude: round(source.latitude), longitude: round(source.longitude) } : undefined;
    const coordinatesSource = fix ? ('location-log' as const) : undefined;
    if (fix) located.push(frame.id);

    const previous = known.get(frame.id);
    let photo: EverydayPhoto;
    if (previous) {
      photo = { ...previous, alt, date: frame.date, coordinates, coordinatesSource };
      if (JSON.stringify(photo) !== JSON.stringify(previous)) updated.push(frame.id);
    } else {
      if (!frame.file) {
        failed.push({ ...frame, error: 'no exported file' });
        continue;
      }
      const processed = await process(frame);
      photo = {
        id: frame.id,
        url: `${cdnBase}/photos/${frame.id}`,
        width: processed.width,
        height: processed.height,
        lqip: processed.lqip,
        alt,
        ...(Object.keys(processed.exif).length > 0 ? { exif: processed.exif } : {}),
        date: frame.date,
        coordinates,
        coordinatesSource,
      };
      added.push(frame.id);
    }
    if (!photo.coordinates) delete photo.coordinates;
    if (!photo.coordinatesSource) delete photo.coordinatesSource;
    photos.push(photo);
  }

  const kept = new Set(photos.map((photo) => photo.id));
  const removed = current.map((photo) => photo.id).filter((id) => !kept.has(id));
  return { photos, added, removed, updated, uncaptioned, failed, located };
}

const HEADER = `# The Everyday page (/everyday/), newest first.
# Written by \`pnpm everyday sync\` from the Apple Photos album EDC. Do not edit by hand:
# change the caption in Photos instead. The next sync replaces this file.
`;

export function renderEveryday(photos: EverydayPhoto[]): string {
  return HEADER + (photos.length ? stringify(photos, { lineWidth: 0 }) : '[]\n');
}
