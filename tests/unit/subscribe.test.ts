import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage before importing the module
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const key in store) delete store[key]; },
  get length() { return Object.keys(store).length; },
  key: (index: number) => Object.keys(store)[index] ?? null,
};
vi.stubGlobal('localStorage', mockLocalStorage);

import { isDismissed, DISMISSED_KEY, SUBSCRIBED_KEY, DISMISS_DAYS } from '../../src/scripts/subscribe';

describe('isDismissed', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('returns false when localStorage is empty', () => {
    expect(isDismissed()).toBe(false);
  });

  it('returns true when user has subscribed', () => {
    mockLocalStorage.setItem(SUBSCRIBED_KEY, '1');
    expect(isDismissed()).toBe(true);
  });

  it('returns true when dismissed within 30 days', () => {
    mockLocalStorage.setItem(DISMISSED_KEY, String(Date.now()));
    expect(isDismissed()).toBe(true);
  });

  it('returns false when dismissed more than 30 days ago', () => {
    const expired = Date.now() - (DISMISS_DAYS + 1) * 24 * 60 * 60 * 1000;
    mockLocalStorage.setItem(DISMISSED_KEY, String(expired));
    expect(isDismissed()).toBe(false);
  });

  it('returns true when subscribed even if dismissal expired', () => {
    const expired = Date.now() - (DISMISS_DAYS + 1) * 24 * 60 * 60 * 1000;
    mockLocalStorage.setItem(DISMISSED_KEY, String(expired));
    mockLocalStorage.setItem(SUBSCRIBED_KEY, '1');
    expect(isDismissed()).toBe(true);
  });
});
