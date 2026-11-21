/**
 * The location log: a text file that an automation on the iPhone appends to, about once a day.
 * The Everyday sync uses it for a frame that has no location in Photos. The Ricoh GR IIIx has no GPS
 * receiver, so most of its frames have none (STU-91).
 *
 * One line is one fix:
 *   2026-11-18T05:15:01+01:00LAT: 10.12981599720546LON: 20.428540480576096ALT: 4.5PLACE: Testby,Testland
 * The fields have labels and no separators. A line without the labels is not readable, because the
 * numbers run together; `parseLocationLog` counts it and does not guess.
 */

export interface LocationFix {
  /** The calendar date of the fix in its own time zone, "YYYY-MM-DD". */
  date: string;
  /** The time of the fix, milliseconds since the epoch. */
  time: number;
  latitude: number;
  longitude: number;
}

const LINE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})LAT:\s*(-?\d+(?:\.\d+)?)LON:\s*(-?\d+(?:\.\d+)?)(?:ALT:|PLACE:|$)/;
const TIMESTAMP = /^\S+?(?=LAT:)/;

/** Parse the log text. `unreadable` is the number of lines that are not empty and not a fix. */
export function parseLocationLog(text: string): { fixes: LocationFix[]; unreadable: number } {
  const fixes: LocationFix[] = [];
  let unreadable = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = LINE.exec(line);
    const time = match ? Date.parse(TIMESTAMP.exec(line)![0]) : Number.NaN;
    const latitude = match ? Number(match[2]) : Number.NaN;
    const longitude = match ? Number(match[3]) : Number.NaN;
    if (!match || Number.isNaN(time) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      unreadable++;
      continue;
    }
    fixes.push({ date: match[1], time, latitude, longitude });
  }
  return { fixes, unreadable };
}

/**
 * The fix for a frame: a fix with the same calendar date as the frame. When the date has more than
 * one fix, the one nearest in time to the capture. No fix on that date gives undefined; the sync
 * never takes a fix from another day.
 */
export function fixForFrame(fixes: LocationFix[], frame: { date: string; taken: string }): LocationFix | undefined {
  const sameDay = fixes.filter((fix) => fix.date === frame.date);
  if (sameDay.length === 0) return undefined;
  const taken = Date.parse(frame.taken);
  if (Number.isNaN(taken)) return sameDay[0];
  return sameDay.reduce((best, fix) => (Math.abs(fix.time - taken) < Math.abs(best.time - taken) ? fix : best));
}
