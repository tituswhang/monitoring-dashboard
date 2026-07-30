/**
 * jsdom does not implement ResizeObserver, and ngx-echarts requires it for `autoResize`.
 * Every browser the app targets ships it, so this gap is purely a test-environment one —
 * a no-op stub is enough to let chart-hosting components mount.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

/** Nor does jsdom implement canvas; ECharts probes for a 2D context on init. */
if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype.getContext) {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
