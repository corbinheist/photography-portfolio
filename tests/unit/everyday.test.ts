import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { buildEveryday, fallbackAlt, renderEveryday, type ExportedFrame } from '../../scripts/lib/everyday';
import { processImage } from '../../scripts/lib/image-pipeline';
import { fixForFrame, parseLocationLog } from '../../scripts/lib/location-log';
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

describe('the location log', () => {
  const LOG = [
    '2026-11-17T06:02:18+01:0010.12345678901234520.1234567890123455.5TestbyTestland',
    '2026-11-18T05:15:01+01:00LAT: 10.12981599720546LON: 20.428540480576096ALT: 4.5PLACE: Testby,Testland',
    '2026-11-18T09:39:16+01:00LAT: 10.12356121450753LON: 20.37443102842437ALT: 33.9PLACE: Testby,Testland',
    '2026-11-19T05:15:01+01:00LAT: 10.12981042622767LON: 20.428552983028673ALT: -25.8PLACE: Testby,Testland',
    '2026-11-21T05:15:01+01:00LAT: -33.86LON: -151.2ALT: 20PLACE: Somewhere',
    '',
  ].join('\n');
  const { fixes, unreadable } = parseLocationLog(LOG);

  it('reads the labelled lines and counts a line without labels as not readable', () => {
    expect(fixes.map((fix) => fix.date)).toEqual(['2026-11-18', '2026-11-18', '2026-11-19', '2026-11-21']);
    expect(unreadable).toBe(1);
    expect(fixes[0]).toMatchObject({ latitude: 10.12981599720546, longitude: 20.428540480576096 });
    expect(fixes[0].time).toBe(Date.parse('2026-11-18T05:15:01+01:00'));
    expect(fixes[3]).toMatchObject({ latitude: -33.86, longitude: -151.2 });
  });

  it('rejects a latitude or a longitude outside the valid range', () => {
    expect(parseLocationLog('2026-11-18T05:15:01+01:00LAT: 91LON: 9ALT: 1PLACE: x')).toEqual({ fixes: [], unreadable: 1 });
    expect(parseLocationLog('2026-11-18T05:15:01+01:00LAT: 9LON: 181ALT: 1PLACE: x')).toEqual({ fixes: [], unreadable: 1 });
  });

  it('takes the fix nearest in time on the date of the frame', () => {
    expect(fixForFrame(fixes, { date: '2026-11-18', taken: '2026-11-18T10:00:00+01:00' })?.longitude).toBe(20.37443102842437);
    expect(fixForFrame(fixes, { date: '2026-11-18', taken: '2026-11-18T06:00:00+01:00' })?.longitude).toBe(20.428540480576096);
  });

  it('gives no fix for a date that the log does not have', () => {
    expect(fixForFrame(fixes, { date: '2026-11-20', taken: '2026-11-20T05:20:00+01:00' })).toBeUndefined();
    expect(fixForFrame(fixes, { date: '2026-11-17', taken: '2026-11-17T12:00:00+01:00' })).toBeUndefined();
  });

  it('gives a frame without a location the rounded coordinates of the fix, and marks the source', async () => {
    const plan = await buildEveryday([frame('a', { date: '2026-11-19', taken: '2026-11-19T00:21:33+01:00' })], [], CDN, vi.fn().mockResolvedValue(processed), fixes);
    expect(plan.photos[0].coordinates).toEqual({ latitude: 10.13, longitude: 20.43 });
    expect(plan.photos[0].coordinatesSource).toBe('location-log');
    expect(plan.located).toEqual(['a']);
    expect(parseEveryday(renderEveryday(plan.photos))).toEqual(plan.photos);
  });

  it('keeps the location from Photos when the frame has one', async () => {
    const plan = await buildEveryday(
      [frame('a', { date: '2026-11-19', taken: '2026-11-19T00:21:33+01:00', coordinates: { latitude: 30.5, longitude: 40.5 } })],
      [],
      CDN,
      vi.fn().mockResolvedValue(processed),
      fixes,
    );
    expect(plan.photos[0].coordinates).toEqual({ latitude: 30.5, longitude: 40.5 });
    expect(plan.photos[0]).not.toHaveProperty('coordinatesSource');
    expect(plan.located).toEqual([]);
  });

  it('adds the coordinates to a published frame without processing it again', async () => {
    const process = vi.fn();
    const plan = await buildEveryday([frame('a', { date: '2026-11-19', taken: '2026-11-19T12:00:00+01:00' })], [existing('a', { date: '2026-11-19' })], CDN, process, fixes);
    expect(process).not.toHaveBeenCalled();
    expect(plan.updated).toEqual(['a']);
    expect(plan.photos[0].coordinates).toEqual({ latitude: 10.13, longitude: 20.43 });
  });

  it('removes the mark and the coordinates when the log no longer has the date', async () => {
    const before = existing('a', { date: '2026-11-19', coordinates: { latitude: 10.13, longitude: 20.43 }, coordinatesSource: 'location-log' });
    const plan = await buildEveryday([frame('a', { date: '2026-11-19', taken: '2026-11-19T12:00:00+01:00' })], [before], CDN, vi.fn(), []);
    expect(plan.photos[0]).not.toHaveProperty('coordinates');
    expect(plan.photos[0]).not.toHaveProperty('coordinatesSource');
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
  it('reports a rotated portrait frame (EXIF orientation 6) as portrait, and writes upright variants', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'everyday-orient-'));
    const input = path.join(dir, 'portrait.jpg');
    await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#888' } }).withMetadata({ orientation: 6 }).jpeg().toFile(input);
    const image = await processImage(input, dir);
    expect([image.width, image.height]).toEqual([800, 1200]);
    const variant = await sharp(image.variants[0].path).metadata();
    expect(variant.height! > variant.width!).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

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
