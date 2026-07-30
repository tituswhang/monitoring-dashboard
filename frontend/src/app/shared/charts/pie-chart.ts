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

  protected readonly options = computed<EChartsOption>(() => {
    const slices = this.slices();
    const radius = this.outerRadius();
    const withLegend = this.showLegend();
    const noun = this.noun();

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
            bottom: 0,
            icon: 'rect',
            itemWidth: 8,
            itemHeight: 8,
            textStyle: { fontSize: 12, color: this.legendColor() },
          }
        : undefined,
      series: [
        {
          type: 'pie',
          radius,
          // Lifted off centre when a legend occupies the bottom strip.
          center: withLegend ? ['50%', '45%'] : ['50%', '50%'],
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
