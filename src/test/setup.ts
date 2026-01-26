import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock;

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.IntersectionObserver = IntersectionObserverMock as any;

// Mock HTMLMediaElement methods
Object.defineProperty(HTMLMediaElement.prototype, "play", {
  writable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(HTMLMediaElement.prototype, "load", {
  writable: true,
  value: vi.fn(),
});

// Mock fullscreen API
Object.defineProperty(document, "fullscreenElement", {
  writable: true,
  value: null,
});

Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
  writable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

Object.defineProperty(document, "exitFullscreen", {
  writable: true,
  value: vi.fn().mockResolvedValue(undefined),
});
