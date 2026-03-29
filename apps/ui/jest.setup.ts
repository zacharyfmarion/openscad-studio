// Jest setup file - runs after the test framework is installed
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';

if (typeof globalThis.ReadableStream === 'undefined') {
  globalThis.ReadableStream = ReadableStream;
}

if (typeof globalThis.WritableStream === 'undefined') {
  globalThis.WritableStream = WritableStream;
}

if (typeof globalThis.TransformStream === 'undefined') {
  globalThis.TransformStream = TransformStream;
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

// Polyfill matchMedia, crypto.randomUUID, scrollIntoView, and ResizeObserver for jsdom
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  }

  if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
    let counter = 0;
    Object.defineProperty(crypto, 'randomUUID', {
      value: () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`,
    });
  }

  // Radix UI portals use scrollIntoView and ResizeObserver which JSDOM lacks
  if (typeof window.HTMLElement !== 'undefined') {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  }
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));
  }
}
