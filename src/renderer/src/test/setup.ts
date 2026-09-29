import '@testing-library/jest-dom/vitest'

// This file runs for both the node and jsdom test environments, and the DOM
// shims below only apply to the latter.
if (typeof window !== 'undefined') {
  // jsdom implements neither of these, and the theme layer depends on both:
  // `matchMedia` for following the OS appearance, and ResizeObserver for the
  // virtualized timeline.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia
  }

  if (!('ResizeObserver' in window)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(window, 'ResizeObserver', {
      value: ResizeObserverStub,
      configurable: true,
      writable: true
    })
  }

  // jsdom has no layout engine, so the virtualizer would measure every scroll
  // container as zero-sized and render nothing. Give it a viewport.
  if (typeof Element !== 'undefined') {
    Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
      configurable: true,
      writable: true,
      value(): DOMRect {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 900,
          bottom: 600,
          width: 900,
          height: 600,
          toJSON: () => ({})
        } as DOMRect
      }
    })
  }
}
