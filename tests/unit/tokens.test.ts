import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Flexoki base scale (Steph Ango). The direction's contrast rules name these values, so each
// --fx-base-* token must hold the Flexoki value of the same name.
const FLEXOKI_BASE: Record<string, string> = {
  '50': '#F2F0E5',
  '100': '#E6E4D9',
  '150': '#DAD8CE',
  '200': '#CECDC3',
  '300': '#B7B5AC',
  '400': '#9F9D96',
  '500': '#878580',
  '600': '#6F6E69',
  '700': '#575653',
  '800': '#403E3C',
  '850': '#343331',
  '900': '#282726',
  '950': '#1C1B1A',
};

describe('Flexoki base tokens', () => {
  const css = readFileSync('src/styles/global.css', 'utf8');
  const defined = Object.fromEntries([...css.matchAll(/--fx-base-(\d+):\s*(#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2].toUpperCase()]));

  it('defines every token with the Flexoki value of the same name', () => {
    for (const [step, hex] of Object.entries(defined)) expect(hex, `--fx-base-${step}`).toBe(FLEXOKI_BASE[step]);
  });

  it('defines no step that Flexoki does not have', () => {
    expect(Object.keys(defined).filter((step) => !(step in FLEXOKI_BASE))).toEqual([]);
  });
});
