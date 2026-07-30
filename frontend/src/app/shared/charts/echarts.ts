import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

/**
 * Tree-shaken ECharts build. The app draws pie charts and nothing else, so only the
 * pie series, tooltip, legend, and canvas renderer are registered — importing the
 * `echarts` barrel instead would pull in every chart type and roughly triple this.
 *
 * Loaded lazily via `provideEchartsCore({ echarts: () => import('./echarts') })`, so
 * none of it lands in the initial chunk.
 */
echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer]);

/**
 * **Must be a named re-export, not `export default`.**
 *
 * ngx-echarts resolves the loader and immediately destructures the result:
 *
 * ```js
 * load().then(({ init }) => init(dom, theme, initOpts))
 * ```
 *
 * A default export makes `import()` resolve to `{ default: … }`, so `init` comes back
 * `undefined` and the call throws inside a promise nobody awaits. The host div still
 * mounts, so it fails silently — an empty box where the chart should be, with the
 * component tree looking entirely correct. `export *` puts `init` on the namespace.
 */
export * from 'echarts/core';
