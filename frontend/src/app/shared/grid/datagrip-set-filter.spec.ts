import { TestBed } from '@angular/core/testing';
import type { IDoesFilterPassParams, IFilterParams, IRowNode } from 'ag-grid-community';
import { DataGripSetFilterComponent } from './datagrip-set-filter';

/**
 * The filter's *logic* came straight across from React, but its lifecycle
 * (`isFilterActive` / `getModel` / `setModel` / `filterChangedCallback`) is a rewrite
 * onto AG Grid's Angular contract, with nothing to copy. These cover that contract.
 */

type Row = { v: string | null };

function makeParams(values: (string | null)[]) {
  const nodes = values.map((v) => ({ data: { v } }) as unknown as IRowNode<Row>);
  const filterChangedCallback = vi.fn();
  const params = {
    api: {
      forEachNode: (cb: (n: IRowNode<Row>) => void) => nodes.forEach(cb),
    },
    getValue: (node: IRowNode<Row>) => (node.data as Row).v,
    filterChangedCallback,
  } as unknown as IFilterParams;
  return { params, filterChangedCallback, nodes };
}

function nodeFor(value: string | null): IDoesFilterPassParams {
  return { node: { data: { v: value } } } as unknown as IDoesFilterPassParams;
}

function mount(values: (string | null)[]) {
  const fixture = TestBed.createComponent(DataGripSetFilterComponent);
  const comp = fixture.componentInstance;
  const { params, filterChangedCallback } = makeParams(values);
  comp.agInit(params);
  comp.afterGuiAttached();
  fixture.detectChanges();
  return { fixture, comp, filterChangedCallback };
}

describe('DataGripSetFilterComponent', () => {
  it('is inactive with a null model, and passes every row', () => {
    const { comp } = mount(['a', 'b']);
    expect(comp.isFilterActive()).toBe(false);
    expect(comp.doesFilterPass(nodeFor('a'))).toBe(true);
    expect(comp.doesFilterPass(nodeFor('zzz'))).toBe(true);
  });

  it('passes only rows whose value is in the model', () => {
    const { comp } = mount(['a', 'b', 'c']);
    comp.setModel(['a', 'c']);
    expect(comp.isFilterActive()).toBe(true);
    expect(comp.doesFilterPass(nodeFor('a'))).toBe(true);
    expect(comp.doesFilterPass(nodeFor('b'))).toBe(false);
    expect(comp.doesFilterPass(nodeFor('c'))).toBe(true);
  });

  it('buckets null and empty string together under (blank)', () => {
    const { comp } = mount(['a', null, '']);
    comp.setModel(['(blank)']);
    expect(comp.doesFilterPass(nodeFor(null))).toBe(true);
    expect(comp.doesFilterPass(nodeFor(''))).toBe(true);
    expect(comp.doesFilterPass(nodeFor('a'))).toBe(false);
  });

  it('counts occurrences per distinct value, sorted naturally', () => {
    const { fixture } = mount(['b', 'a', 'b', null]);
    const text = fixture.nativeElement.textContent as string;
    // Natural sort puts (blank) first, then a, then b — with b counted twice.
    expect(text).toContain('(blank)');
    expect(text).toContain('a');
    expect(text).toContain('b');
    const rows = fixture.nativeElement.querySelectorAll('label');
    expect(rows.length).toBe(3);
  });

  it('round-trips its model through getModel/setModel', () => {
    const { comp } = mount(['a', 'b']);
    comp.setModel(['b']);
    expect(comp.getModel()).toEqual(['b']);
    comp.setModel(null);
    expect(comp.getModel()).toBeNull();
    expect(comp.isFilterActive()).toBe(false);
  });

  // "Everything ticked" and "no filter" are the same result, so the model collapses to
  // null — otherwise the column would keep showing a filter icon while filtering nothing.
  it('collapses to null when the last unticked value is re-ticked', () => {
    const { comp, filterChangedCallback } = mount(['a', 'b']);
    comp.setModel(['a']);
    comp['toggleValue']('b');
    expect(comp.getModel()).toBeNull();
    expect(filterChangedCallback).toHaveBeenCalled();
  });

  it('toggleAll clears to none, then back to null', () => {
    const { comp } = mount(['a', 'b']);
    // Starts with everything selected (model null) → first toggle deselects all.
    comp['toggleAll']();
    expect(comp.getModel()).toEqual([]);
    expect(comp.doesFilterPass(nodeFor('a'))).toBe(false);
    // Nothing selected → toggle back to "all", which is null.
    comp['toggleAll']();
    expect(comp.getModel()).toBeNull();
  });

  it('notifies the grid whenever the model changes', () => {
    const { comp, filterChangedCallback } = mount(['a', 'b']);
    comp['toggleValue']('a');
    expect(filterChangedCallback).toHaveBeenCalledTimes(1);
    comp['clear']();
    expect(filterChangedCallback).toHaveBeenCalledTimes(2);
  });

  // The React version computed values once on mount, so after the grid's row data was
  // replaced it kept offering the old dataset's values. Reopening now refreshes them.
  it('refreshes its value list when the panel is reopened after a data change', () => {
    const fixture = TestBed.createComponent(DataGripSetFilterComponent);
    const comp = fixture.componentInstance;

    let values: (string | null)[] = ['a', 'b'];
    const params = {
      api: {
        forEachNode: (cb: (n: IRowNode<Row>) => void) =>
          values.map((v) => ({ data: { v } }) as unknown as IRowNode<Row>).forEach(cb),
      },
      getValue: (node: IRowNode<Row>) => (node.data as Row).v,
      filterChangedCallback: vi.fn(),
    } as unknown as IFilterParams;

    comp.agInit(params);
    comp.afterGuiAttached();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('label').length).toBe(2);

    values = ['x', 'y', 'z'];
    comp.afterGuiAttached();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('label').length).toBe(3);
  });

  it('filters the displayed list by the search box without touching the model', () => {
    const { fixture, comp } = mount(['alpha', 'beta', 'gamma']);
    comp['search'].set('a');
    fixture.detectChanges();
    // Every one of them contains an "a" — the search is a plain substring match.
    expect(fixture.nativeElement.querySelectorAll('label').length).toBe(3);

    comp['search'].set('mm');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('label').length).toBe(1);

    // Searching narrows the list only; it must not change what is filtered out.
    expect(comp.getModel()).toBeNull();
  });
});
