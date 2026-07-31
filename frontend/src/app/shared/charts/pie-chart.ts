import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { EChartsOption } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ThemeService } from '../../core/theme.service';
import { pluralS } from '../utils/plural';

/** A single wedge. `msorId` rides along so a click can drill into the item it represents. */
export interface PieSlice {
  name: string;
  value: number;
  color: string;
  msorId?: number;
}

/** What one unit counts as, for the tooltip's `N case(s)` / `N row(s)` wording. */
export type SliceNoun = 'case' | 'row';

interface EchartsLabelParams {
  value: number;
  percent: number;
}

interface EchartsItemParams {
  name: string;
  value: number;
  color: string;
  dataIndex: number;
}

@Component({
  selector: 'app-pie-chart',
  imports: [NgxEchartsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A component host is `display: inline` by default, which gives ECharts no reliable
  // width to measure — it sizes the canvas from the container's client box on init.
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
  template: `
    <div
      echarts
      [options]="options()"
      [autoResize]="true"
      (chartClick)="onChartClick($event)"
      [style.height.px]="height()"
      [class.cursor-pointer]="clickable()"
    ></div>
  `,
})
export class PieChartComponent {
  private readonly theme = inject(ThemeService);

  readonly slices = input.required<PieSlice[]>();
  readonly height = input(220);
  readonly outerRadius = input(80);
  readonly noun = input<SliceNoun>('case');
  readonly showLegend = input(true);
  /** When true, wedges become click targets and emit `sliceClick`. */
  readonly clickable = input(false);

  readonly sliceClick = output<PieSlice>();

  /**
   * ECharts paints to a canvas and cannot resolve `var(--color-…)`, so the legend
   * colour is read eagerly. Reading `darkMode()` here is what makes this recompute
   * when the theme flips — the class swap on `<html>` notifies no signal by itself.
   */
  private readonly legendColor = computed(() => {
    this.theme.darkMode();
    return this.theme.cssVar('--color-foreground') || '#000';
  });

  /** Used for the legend's paging arrows and counter, which should recede. */
  private readonly mutedColor = computed(() => {
    this.theme.darkMode();
    return this.theme.cssVar('--color-muted-foreground') || '#888';
  });

  protected readonly options = computed<EChartsOption>(() => {
    const slices = this.slices();
    const withLegend = this.showLegend();
    const noun = this.noun();
    const { radius, centerY, legendHeight } = pieGeometry(
      this.height(),
      this.outerRadius(),
      withLegend,
    );

    return {
      // The wrapper Card supplies the background; a painted one would square off
      // the rounded corners in dark mode.
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'item',
        // Chrome-less: the formatter below emits the same Tailwind-styled markup the
        // React FollowTooltip portaled to the body, so ECharts must not draw a box
        // of its own around it.
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0,
        extraCssText: 'box-shadow:none;',
        // Offsets from the cursor exactly as the React tooltip did (+14 / -10).
        position: (point: [number, number]) => [point[0] + 14, point[1] - 10],
        formatter: (params: unknown) => {
          const p = params as EchartsItemParams;
          return `
            <div class="rounded-md border bg-background px-3 py-2 shadow-md text-xs min-w-[120px]">
              <p class="font-medium text-foreground mb-1">${escapeHtml(p.name)}</p>
              <p class="flex items-center gap-1.5 leading-relaxed">
                <span class="inline-block w-2 h-2 rounded-sm shrink-0" style="background-color:${p.color}"></span>
                <span class="text-foreground">${p.value} ${noun}${pluralS(p.value)}</span>
              </p>
            </div>`;
        },
      },
      legend: withLegend
        ? {
            // `scroll` is what stops a long legend from colliding with the pie.
            // ECharts draws the legend *inside* the canvas — unlike recharts, which
            // rendered it as HTML below the chart — so an unbounded one wraps upward
            // over the wedges. Scrolling confines it to the reserved band and pages
            // the overflow instead.
            type: 'scroll',
            bottom: 0,
            height: legendHeight - LEGEND_PADDING,
            icon: 'rect',
            itemWidth: 8,
            itemHeight: 8,
            itemGap: 10,
            textStyle: { fontSize: 12, color: this.legendColor() },
            pageIconSize: 9,
            pageIconColor: this.legendColor(),
            pageIconInactiveColor: this.mutedColor(),
            pageTextStyle: { fontSize: 11, color: this.mutedColor() },
          }
        : undefined,
      series: [
        {
          type: 'pie',
          radius,
          // Centred in the space the legend leaves, not in the canvas.
          center: ['50%', centerY],
          data: slices.map((s) => ({
            name: s.name,
            value: s.value,
            itemStyle: { color: s.color },
          })),
          label: {
            position: 'inside',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            // The dark halo that keeps the number legible on any wedge colour.
            // `textBorder*` paints behind the fill, matching SVG paint-order:stroke.
            textBorderColor: 'rgba(0,0,0,0.55)',
            textBorderWidth: 2.5,
            formatter: (params: unknown) => sliceValueLabel(params as EchartsLabelParams, radius),
          },
          labelLine: { show: false },
          emphasis: { scale: false },
        },
      ],
    };
  });

  protected onChartClick(event: unknown): void {
    if (!this.clickable()) return;
    const { dataIndex } = event as EchartsItemParams;
    const slice = this.slices()[dataIndex];
    if (slice) this.sliceClick.emit(slice);
  }
}

/**
 * A wedge too slim to hold its number renders no label at all: a number wider than
 * its wedge would sit on top of its neighbours', and the exact value is still one
 * hover away in the tooltip.
 *
 * Fit is judged by comparing the wedge's arc width at the label radius against a
 * rough width for the text (~7px per digit at 12px bold, plus the halo) — the same
 * rule the React `renderSliceValueLabel` applied. ECharts reports `percent` as
 * 0–100 where recharts used 0–1, hence the /100.
 */
/** Height of the band reserved at the bottom for a scrolling legend. */
const LEGEND_BAND = 34;
/** Breathing room between the legend band and the wedges above it. */
const LEGEND_PADDING = 6;
/** Smallest pie worth drawing; below this the card should show its empty state. */
const MIN_RADIUS = 28;

export interface PieGeometry {
  radius: number;
  centerY: number;
  legendHeight: number;
}

/**
 * Splits the canvas between the pie and the legend.
 *
 * The legend is drawn *inside* the ECharts canvas, so it has to be given its own band
 * and the pie sized to what remains — otherwise a chart with many wedges grows its
 * legend upward until it sits on top of them. The caller's `outerRadius` is treated as
 * a maximum, not a fixed size: it is honoured when there is room and shrunk when not.
 */
export function pieGeometry(
  height: number,
  outerRadius: number,
  hasLegend: boolean,
): PieGeometry {
  const legendHeight = hasLegend ? LEGEND_BAND : 0;
  const available = Math.max(0, height - legendHeight);
  const radius = Math.max(MIN_RADIUS, Math.min(outerRadius, available / 2 - LEGEND_PADDING));
  return { radius, centerY: available / 2, legendHeight };
}

export function sliceValueLabel(params: EchartsLabelParams, outerRadius: number): string {
  const labelRadius = outerRadius * 0.55;
  const labelWidth = String(params.value).length * 7 + 6;
  const arcWidth = (params.percent / 100) * 2 * Math.PI * labelRadius;
  return arcWidth < labelWidth ? '' : String(params.value);
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
