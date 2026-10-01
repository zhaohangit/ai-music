import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'scrollTo', { writable: true, value: vi.fn() });
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, writable: true, value: vi.fn() });
Object.defineProperty(window, 'confirm', { writable: true, value: vi.fn(() => true) });

Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) });
Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() });
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: vi.fn(() => null) });

if (!globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: () => '00000000-0000-4000-8000-000000000000' });
}
