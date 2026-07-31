import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideIcons } from '@ng-icons/core';
import { provideEchartsCore } from 'ngx-echarts';
import { DashboardStore } from '../../core/dashboard-store';
import { APP_ICONS } from '../../shared/icons';
import { HomeComponent } from './home';

/**
 * Renders Home against the real MonitoringService — which is mock-data-backed, so this
 * exercises the fixtures, the store's derivations, and the template together.
 *
 * The pies themselves are not asserted on: ECharts draws to a canvas, which jsdom does
 * not implement. `pie-chart.spec.ts` covers the label logic directly instead.
 */
describe('HomeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideIcons(APP_ICONS),
        provideEchartsCore({ echarts: () => import('../../shared/charts/echarts') }),
        // Home embeds All Cases, whose date-range filter needs a Material date adapter.
        provideNativeDateAdapter(),
      ],
    });
  });

  async function renderWithData() {
    const store = TestBed.inject(DashboardStore);
    await store.loadQueries();
    // loadQueries kicks these off without awaiting; do it explicitly so the
    // derived signals are settled before the first render.
    await store.loadHomeResults(store.queries());
    await store.loadCaseRows();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance as unknown as Record<string, () => unknown>;
    return { fixture, store, comp, text: fixture.nativeElement.textContent as string };
  }

  it('loads monitoring items from the fixtures', async () => {
    const { store } = await renderWithData();
    expect(store.queries().length).toBeGreaterThan(0);
    expect(store.loadingQueries()).toBe(false);
  });

  it('renders the three overview pie cards', async () => {
    const { text, fixture } = await renderWithData();
    expect(text).toContain('Total Cases — All Items');
    expect(text).toContain('Case Status — All Items');
    expect(text).toContain('Case Age');
    expect(fixture.nativeElement.querySelectorAll('app-pie-chart').length).toBe(3);
  });

  // The category pie is the primary route into a category page — without it those
  // routes are only reachable from the All Cases grid's Category cell.
  it('groups open cases by category, sorted by size then taxonomy order', async () => {
    const { comp } = await renderWithData();
    const slices = comp['categorySlices']() as { name: string; value: number }[];
    expect(slices.length).toBeGreaterThan(1);
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i - 1].value).toBeGreaterThanOrEqual(slices[i].value);
    }
    // Every wedge carries a real category name, since clicking one routes to it.
    for (const s of slices) expect(s.name.length).toBeGreaterThan(0);
  });

  it('shows the item count and total-case badge in the header', async () => {
    const { text, comp } = await renderWithData();
    expect(text).toContain('Overview');
    expect(text).toContain('monitoring items');
    const total = comp['totalCaseCount']() as number;
    if (total > 0) expect(text).toContain(`${total} total case`);
  });

  it('embeds the All Cases grid', async () => {
    const { fixture } = await renderWithData();
    expect(fixture.nativeElement.querySelector('app-all-cases')).toBeTruthy();

    // All Cases loads its own rows in an effect and shows skeletons until they land,
    // so the grid element only appears once that settles.
    await new Promise((r) => setTimeout(r, 500));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ag-grid-angular')).toBeTruthy();
  });

  it('renders icons through ng-icons', async () => {
    const { fixture } = await renderWithData();
    // Each pie-card header carries one. If the icon registry were misnamed, NgIcon
    // would render an empty host and this would find no <svg>.
    expect(fixture.nativeElement.querySelectorAll('ng-icon svg').length).toBeGreaterThan(0);
  });

  it('applies the ui primitive classes through the cn() merge', async () => {
    const { fixture } = await renderWithData();
    const card: HTMLElement = fixture.nativeElement.querySelector('[uiCard]');
    expect(card.classList).toContain('rounded-lg');
    expect(card.classList).toContain('bg-card');
  });
});
