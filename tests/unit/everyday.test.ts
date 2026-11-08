import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { buildEveryday, fallbackAlt, renderEveryday, type ExportedFrame } from '../../scripts/lib/everyday';
import { processImage } from '../../scripts/lib/image-pipeline';
import { formatEverydayDate, parseEveryday, type EverydayPhoto } from '../../src/scripts/utils/everyday';

const CDN = 'https://cdn.test';
const frame = (id: string, extra: Partial<ExportedFrame> = {}): ExportedFrame => ({
  id,
  uuid: id.toUpperCase(),
  alt: `Alt for ${id}`,
  date: '2026-11-08',
  taken: '2026-11-08T09:00:00-08:00',
  file: `_raw/everyday/${id}.jpg`,
  ...extra,
});
const processed = { width: 3000, height: 2000, lqip: 'data:image/webp;base64,AA==', exif: { camera: 'RICOH GR IIIx' } };
const existing = (id: string, extra: Partial<EverydayPhoto> = {}): EverydayPhoto => ({
  id,
  url: `${CDN}/photos/${id}`,
  width: 3000,
  height: 2000,
  lqip: 'data:image/webp;base64,AA==',
  alt: `Alt for ${id}`,
  date: '2026-11-08',
  ...extra,
});

describe('buildEveryday', () => {
  it('publishes captioned frames in album order and processes only the new ones', async () => {
    const process = vi.fn().mockResolvedValue(processed);
    const plan = await buildEveryday([frame('new-1'), frame('old-1')], [existing('old-1')], CDN, process);
    expect(plan.photos.map((photo) => photo.id)).toEqual(['new-1', 'old-1']);
    expect(plan.added).toEqual(['new-1']);
    expect(process).toHaveBeenCalledTimes(1);
    expect(plan.photos[0].url).toBe(`${CDN}/photos/new-1`);
  });

  it('publishes a frame without a caption with the date as its alt text', async () => {
    const plan = await buildEveryday([frame('a', { alt: '  ' })], [], CDN, vi.fn().mockResolvedValue(processed));
    expect(plan.photos[0].alt).toBe('Everyday photograph, 8 November 2026');
    expect(plan.photos[0].alt).toBe(fallbackAlt('2026-11-08'));
    expect(plan.uncaptioned.map((item) => item.id)).toEqual(['a']);
  });

  it('replaces the date alt text when a caption is added later, without processing again', async () => {
    const process = vi.fn();
    const plan = await buildEveryday([frame('a', { alt: 'A cyclist at a wet crossing' })], [existing('a', { alt: fallbackAlt('2026-11-08') })], CDN, process);
    expect(process).not.toHaveBeenCalled();
    expect(plan.updated).toEqual(['a']);
    expect(plan.photos[0].alt).toBe('A cyclist at a wet crossing');
  });

  it('removes a frame that left the album', async () => {
    const plan = await buildEveryday([], [existing('gone')], CDN, vi.fn());
    expect(plan.removed).toEqual(['gone']);
    expect(plan.photos).toEqual([]);
  });

  it('takes a new caption without processing the frame again', async () => {
    const process = vi.fn();
    const plan = await buildEveryday([frame('a', { alt: 'New caption' })], [existing('a')], CDN, process);
    expect(process).not.toHaveBeenCalled();
    expect(plan.updated).toEqual(['a']);
    expect(plan.photos[0].alt).toBe('New caption');
  });

  it('rounds coordinates to 2 decimal places', async () => {
    const plan = await buildEveryday([frame('a', { coordinates: { latitude: 47.661234, longitude: -122.354987 } })], [], CDN, vi.fn().mockResolvedValue(processed));
    expect(plan.photos[0].coordinates).toEqual({ latitude: 47.66, longitude: -122.35 });
  });

  it('reports a failed export and leaves the frame off the page', async () => {
    const plan = await buildEveryday([frame('a', { error: 'export failed', file: undefined })], [], CDN, vi.fn());
    expect(plan.failed.map((item) => item.id)).toEqual(['a']);
    expect(plan.photos).toEqual([]);
  });

  it('writes a manifest that the page schema accepts', async () => {
    const plan = await buildEveryday([frame('a', { coordinates: { latitude: 1.234, longitude: 5.678 } }), frame('b')], [], CDN, vi.fn().mockResolvedValue(processed));
    expect(parseEveryday(renderEveryday(plan.photos))).toEqual(plan.photos);
  });
});

describe('the Everyday schema', () => {
  it('rejects coordinates with more than 2 decimal places', () => {
    const yaml = renderEveryday([existing('a', { coordinates: { latitude: 47.661, longitude: -122.35 } })]);
    expect(() => parseEveryday(yaml)).toThrow(/2 decimal places/);
  });

  it('rejects an empty alt', () => {
    expect(() => parseEveryday(renderEveryday([existing('a', { alt: ' ' })]))).toThrow(/alt/);
  });

  it('accepts an empty manifest', () => {
    expect(parseEveryday(renderEveryday([]))).toEqual([]);
  });

  it('formats the capture date', () => {
    expect(formatEverydayDate('2026-11-08')).toBe('8 November 2026');
  });
});

describe('the image pipeline', () => {
  it('writes variants without EXIF, so GPS does not leave the Mac', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'everyday-exif-'));
    const input = path.join(dir, 'gps.jpg');
    await sharp({ create: { width: 800, height: 600, channels: 3, background: '#888' } })
      .withExif({ IFD0: { Make: 'Apple', Model: 'iPhone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '47/1 39/1 4000/100' } })
      .jpeg()
      .toFile(input);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const image = await processImage(input, dir);
    for (const variant of image.variants) {
      const metadata = await sharp(variant.path).metadata();
      expect(metadata.exif, variant.path).toBeUndefined();
      expect(metadata.xmp, variant.path).toBeUndefined();
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
