import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage before importing the module (which has side effects)
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

import { getStoredTheme, setTheme, toggleTheme } from '../../src/scripts/theme';

describe('theme', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  describe('getStoredTheme', () => {
    it('returns null when localStorage is empty', () => {
      expect(getStoredTheme()).toBeNull();
    });

    it('returns "dark" when stored', () => {
      mockLocalStorage.setItem('theme', 'dark');
      expect(getStoredTheme()).toBe('dark');
    });

    it('returns "light" when stored', () => {
      mockLocalStorage.setItem('theme', 'light');
      expect(getStoredTheme()).toBe('light');
    });

    it('returns null for invalid stored value', () => {
      mockLocalStorage.setItem('theme', 'invalid');
      expect(getStoredTheme()).toBeNull();
    });
  });

  describe('setTheme', () => {
    it('sets data-theme attribute and localStorage', () => {
      setTheme('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(mockLocalStorage.getItem('theme')).toBe('light');
    });

    it('overwrites previous theme', () => {
      setTheme('light');
      setTheme('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(mockLocalStorage.getItem('theme')).toBe('dark');
    });
  });

  describe('toggleTheme', () => {
    it('flips dark to light', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      toggleTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('flips light to dark', () => {
      document.documentElement.setAttribute('data-theme', 'light');
      toggleTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('defaults to light when no theme set (treats missing as dark)', () => {
      toggleTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });
});
