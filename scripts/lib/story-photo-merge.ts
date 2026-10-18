/**
 * Merge generated photo data into a story manifest (`src/data/story-photos/<slug>.yaml`).
 *
 * The merge edits the parsed YAML document in place, so comments, key order, and every field
 * that the script does not produce stay as the author wrote them. The rules:
 *
 * - The script produces `url`, `width`, `height`, `lqip`, and `exif`. It overwrites these fields
 *   on an existing entry. It sets an `exif` sub-field only when the image has that value, so a
 *   sub-field that the image does not carry stays.
 * - Every other field (`alt`, `title`, and any field the author adds) stays unchanged.
 * - Existing entries keep their order. New images go at the end with an empty `alt`.
 * - The merge never deletes an entry. It returns the ids that have no source image as `missing`.
 */

import { Document, isMap, isScalar, isSeq, parseDocument, Scalar, type YAMLMap, type YAMLSeq } from 'yaml';
import { parseManifest } from '../../src/scripts/utils/story-manifest';
import type { ExifData } from './image-pipeline';

export interface GeneratedPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  lqip: string;
  exif?: ExifData;
}

export interface MergeResult {
  /** The new manifest text. */
  text: string;
  /** Ids appended to the manifest. */
  added: string[];
  /** Ids of existing entries that had a generated field change. */
  updated: string[];
  /** Ids of existing entries with no change. */
  unchanged: string[];
  /** Ids in the manifest with no source image. The merge keeps these entries. */
  missing: string[];
}

const GENERATED_FIELDS = ['url', 'width', 'height', 'lqip'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Make a scalar node. Date strings get double quotes, so no YAML reader turns them into dates. */
function scalar(doc: Document, value: string | number): Scalar {
  const node = doc.createNode(value) as Scalar;
  if (typeof value === 'string' && DATE.test(value)) node.type = Scalar.QUOTE_DOUBLE;
  return node;
}

function nonEmptyExif(exif: ExifData | undefined): exif is ExifData {
  return exif !== undefined && Object.keys(exif).length > 0;
}

/** Set `key` to `value` on `map`. Return true when the value changed. */
function setField(doc: Document, map: YAMLMap, key: string, value: string | number): boolean {
  const current = map.get(key, true);
  if (isScalar(current) && current.value === value) return false;
  map.set(key, scalar(doc, value));
  return true;
}

function newEntry(doc: Document, photo: GeneratedPhoto): YAMLMap {
  const map = doc.createNode({}) as YAMLMap;
  map.set('id', scalar(doc, photo.id));
  for (const field of GENERATED_FIELDS) map.set(field, scalar(doc, photo[field]));
  map.set('alt', scalar(doc, ''));
  if (nonEmptyExif(photo.exif)) {
    const exif = doc.createNode({}) as YAMLMap;
    for (const [key, value] of Object.entries(photo.exif)) exif.set(key, scalar(doc, value));
    map.set('exif', exif);
  }
  return map;
}

/**
 * Merge `generated` into the manifest text `existing` (null when the file does not exist).
 * The result passes the story manifest schema, or the function throws.
 */
export function mergeManifest(slug: string, existing: string | null, generated: GeneratedPhoto[]): MergeResult {
  const seen = new Set<string>();
  for (const photo of generated) {
    if (seen.has(photo.id)) throw new Error(`Story "${slug}": two source images have the id "${photo.id}"`);
    seen.add(photo.id);
  }

  const doc = existing && existing.trim() !== '' ? parseDocument(existing) : new Document([]);
  if (doc.errors.length > 0) throw new Error(`Story "${slug}": manifest is not valid YAML: ${doc.errors[0].message}`);
  if (doc.contents === null) doc.contents = doc.createNode([]);
  if (!isSeq(doc.contents)) throw new Error(`Story "${slug}": manifest must be a list of photo entries`);
  const seq = doc.contents as YAMLSeq;

  const entries = new Map<string, YAMLMap>();
  for (const item of seq.items) {
    if (!isMap(item)) throw new Error(`Story "${slug}": every manifest entry must be a mapping`);
    const id = item.get('id');
    if (typeof id !== 'string') throw new Error(`Story "${slug}": a manifest entry has no string id`);
    if (entries.has(id)) throw new Error(`Story "${slug}": duplicate photo id "${id}" in manifest`);
    entries.set(id, item);
  }

  const result: MergeResult = { text: '', added: [], updated: [], unchanged: [], missing: [] };

  for (const photo of generated) {
    const entry = entries.get(photo.id);
    if (!entry) {
      seq.add(newEntry(doc, photo));
      result.added.push(photo.id);
      continue;
    }

    let changed = false;
    for (const field of GENERATED_FIELDS) changed = setField(doc, entry, field, photo[field]) || changed;
    if (nonEmptyExif(photo.exif)) {
      const current: unknown = entry.get('exif', true);
      let exif: YAMLMap;
      if (isMap(current)) {
        exif = current;
      } else {
        exif = doc.createNode({}) as YAMLMap;
        entry.set('exif', exif);
        changed = true;
      }
      for (const [key, value] of Object.entries(photo.exif)) {
        changed = setField(doc, exif, key, value) || changed;
      }
    }
    (changed ? result.updated : result.unchanged).push(photo.id);
  }

  for (const id of entries.keys()) {
    if (!seen.has(id)) result.missing.push(id);
  }

  result.text = doc.toString({ lineWidth: 0 });
  parseManifest(slug, result.text);
  return result;
}

/**
 * A line diff of `before` and `after` in unified style: `-` removed, `+` added, and `context`
 * unchanged lines around each change. An empty string means no change.
 */
export function diffLines(before: string, after: string, context = 2): string {
  const a = before === '' ? [] : before.replace(/\n$/, '').split('\n');
  const b = after === '' ? [] : after.replace(/\n$/, '').split('\n');

  // Longest common subsequence table, filled from the end.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops: { kind: ' ' | '-' | '+'; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: ' ', line: a[i] });
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      ops.push({ kind: '-', line: a[i] });
      i++;
    } else {
      ops.push({ kind: '+', line: b[j] });
      j++;
    }
  }

  const keep = ops.map((_, index) =>
    ops.slice(Math.max(0, index - context), index + context + 1).some((near) => near.kind !== ' '),
  );
  const lines: string[] = [];
  ops.forEach((op, index) => {
    if (!keep[index]) return;
    if (index > 0 && !keep[index - 1]) lines.push('...');
    lines.push(`${op.kind} ${op.line}`);
  });
  return lines.join('\n');
}
