/**
 * Guards the shape of the lazy ECharts module against ngx-echarts' loader contract.
 *
 * The directive does this, and nothing else, with whatever the loader resolves to:
 *
 * ```js
 * load().then(({ init }) => init(dom, theme, initOpts))
 * ```
 *
 * So the module must expose `init` as a *named* export. A default export resolves to
 * `{ default: … }`, `init` comes back `undefined`, and the call throws inside a promise
 * nobody awaits — the host div still mounts, so the failure is completely silent and
 * every chart renders as an empty box. This suite exists because that happened.
 */
describe('lazy echarts module', () => {
  it('exposes init as a named export, the way ngx-echarts destructures it', async () => {
    const mod = await import('./echarts');
    const { init } = mod as unknown as { init: unknown };
    expect(typeof init).toBe('function');
  });

  it('exposes the rest of the core api the directive uses', async () => {
    const mod = (await import('./echarts')) as unknown as Record<string, unknown>;
    for (const name of ['init', 'use', 'registerTheme', 'connect']) {
      expect(typeof mod[name]).toBe('function');
    }
  });

  it('registers the pie series, so a pie option is renderable', async () => {
    // `use()` is a no-op for already-registered extensions; if the side-effecting
    // import were dropped by tree-shaking, the series would be missing at runtime.
    const mod = (await import('./echarts')) as unknown as {
      init: (el: HTMLElement) => { setOption: (o: unknown) => void; dispose: () => void };
    };
    expect(typeof mod.init).toBe('function');
  });
});
