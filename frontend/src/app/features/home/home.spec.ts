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
 * The pies are deliberately not asserted on: ECharts draws to a canvas, which jsdom does
 * not implement. `pie-chart.spec.ts` covers the label logic directly instead.
 */
describe('HomeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideIcons(APP_ICONS),
        // The pie components resolve this even though jsdom never paints them.
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
    return { fixture, store, text: fixture.nativeElement.textContent as string };
  }

  it('loads monitoring items from the fixtures', async () => {
    const { store } = await renderWithData();
    expect(store.queries().length).toBeGreaterThan(0);
    expect(store.loadingQueries()).toBe(false);
  });

  it('renders a card per monitoring item', async () => {
    const { fixture, store } = await renderWithData();
    const cards: NodeListOf<HTMLAnchorElement> =
      fixture.nativeElement.querySelectorAll('a[uiCard]');
    expect(cards.length).toBe(store.queries().length);
  });

  it('links each card to its query route', async () => {
    const { fixture, store } = await renderWithData();
    const first: HTMLAnchorElement = fixture.nativeElement.querySelector('a[uiCard]');
    expect(first.getAttribute('href')).toBe(`/query/${store.queries()[0].msorId}`);
  });

  it('shows the summary tiles', async () => {
    const { text } = await renderWithData();
    expect(text).toContain('Active Items');
    expect(text).toContain('Open Cases');
    expect(text).toContain('New Today');
  });

  it('renders icons through ng-icons', async () => {
    const { fixture } = await renderWithData();
    // The two pie-card headers each carry one. If the icon registry were misnamed,
    // NgIcon would render an empty host and this would find no <svg>.
    const svgs = fixture.nativeElement.querySelectorAll('ng-icon svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('applies the ui primitive classes through the cn() merge', async () => {
    const { fixture } = await renderWithData();
    const card: HTMLElement = fixture.nativeElement.querySelector('a[uiCard]');
    // Base classes from the directive, plus the caller's `h-full block` — both survive.
    expect(card.classList).toContain('rounded-lg');
    expect(card.classList).toContain('bg-card');
    expect(card.classList).toContain('h-full');
  });
});
