import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideIcons } from '@ng-icons/core';
import { MonitoringService } from '../../core/monitoring.service';
import type { MonitoringQuery } from '../../core/models/monitoring';
import { APP_ICONS } from '../icons';
import { AllCasesComponent } from './all-cases';

@Component({
  imports: [AllCasesComponent],
  template: `
    <app-all-cases
      [queries]="queries()"
      [lockedCategory]="locked()"
      [embedded]="true"
    />
  `,
})
class Host {
  readonly queries = signal<MonitoringQuery[]>([]);
  readonly locked = signal<string | undefined>(undefined);
}

async function render(locked?: string) {
  const api = TestBed.inject(MonitoringService);
  const queries = await api.fetchQueries();

  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.queries.set(queries);
  if (locked) fixture.componentInstance.locked.set(locked);
  fixture.detectChanges();

  // The component loads its own rows in an effect; let the mock client's delay settle.
  await new Promise((r) => setTimeout(r, 500));
  fixture.detectChanges();

  const grid = fixture.debugElement.children[0].componentInstance as AllCasesComponent;
  return { fixture, grid, queries };
}

describe('AllCasesComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideIcons(APP_ICONS), provideNativeDateAdapter()],
    });
  });

  it('loads case rows from the service', async () => {
    const { grid } = await render();
    expect(grid['rows']().length).toBeGreaterThan(0);
    expect(grid['loading']()).toBe(false);
  });

  it('builds column defs covering the fixed columns and the data columns', async () => {
    const { grid } = await render();
    const colIds = grid['colDefs']().map((c) => c.colId);
    for (const expected of ['rowStatus', 'comments', 'category', 'title', 'dbType', 'runDate']) {
      expect(colIds).toContain(expected);
    }
    // Plus at least one `data.*` column discovered from the rows themselves.
    expect(colIds.some((id) => id?.startsWith('data.'))).toBe(true);
  });

  it('renders the grid element with rows bound to it', async () => {
    const { fixture, grid } = await render();
    const gridEl = fixture.nativeElement.querySelector('ag-grid-angular');
    expect(gridEl).toBeTruthy();
    expect(grid['displayedRows']().length).toBe(grid['rows']().length);
  });

  it('narrows to one category when locked, and keeps the lock applied', async () => {
    const { grid } = await render('Reward');
    expect(grid['filterCategory']()).toBe('Reward');
    const all = grid['rows']().length;
    const shown = grid['displayedRows']().length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(all);
  });

  it('discovers data columns from the rows in scope', async () => {
    const { grid } = await render();
    // Every discovered column must actually appear on at least one row, or the
    // empty-column rule would be hiding phantoms.
    const cols = grid['dataColumns']();
    expect(cols.length).toBeGreaterThan(0);
    const rows = grid['rows']();
    for (const col of cols) {
      expect(rows.some((r) => col in r.data)).toBe(true);
    }
  });
});
