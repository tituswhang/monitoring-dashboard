import type { AllCasesRow, CaseWorkloadResponse, RowStatus } from '../../core/models/monitoring';
import { buildKpiData, countStatuses } from './kpi';

function row(msorId: number, caseKey: string, rowStatus: RowStatus): AllCasesRow {
  return {
    rowId: msorId * 1000 + caseKey.length,
    rowStatus,
    rowComment: null,
    caseKey,
    caseKeySource: 'INCREMENT_ID',
    activityCount: 0,
    data: {},
    resultId: 1,
    msorId,
    title: `Item ${msorId}`,
    dbType: 'DATABASE1',
    runDate: '2026-07-01',
  };
}

function workload(partial: Partial<CaseWorkloadResponse> = {}): CaseWorkloadResponse {
  return {
    month: '2026-07',
    earliestMonth: '2026-01',
    people: [],
    unattributed: [],
    ...partial,
  };
}

describe('countStatuses', () => {
  it('counts each ref by its current status', () => {
    const statuses = new Map<string, RowStatus>([
      ['1:a', 'OPEN'],
      ['1:b', 'DONE'],
    ]);
    const { counts, orphaned, keys } = countStatuses(
      [
        { msorId: 1, caseKey: 'a' },
        { msorId: 1, caseKey: 'b' },
      ],
      statuses,
    );
    expect(counts).toEqual({ OPEN: 1, IN_PROGRESS: 0, DONE: 1 });
    expect(orphaned).toBe(0);
    expect(keys).toEqual(new Set(['1:a', '1:b']));
  });

  // A ref matching no row points at a case key that no longer exists — it is orphaned,
  // not zero. Counting it would inflate the header stat and break the closing identity.
  it('reports refs with no matching row as orphaned and excludes them from keys', () => {
    const statuses = new Map<string, RowStatus>([['1:a', 'OPEN']]);
    const { counts, orphaned, keys } = countStatuses(
      [
        { msorId: 1, caseKey: 'a' },
        { msorId: 1, caseKey: 'gone' },
      ],
      statuses,
    );
    expect(counts).toEqual({ OPEN: 1, IN_PROGRESS: 0, DONE: 0 });
    expect(orphaned).toBe(1);
    expect(keys.has('1:gone')).toBe(false);
  });
});

describe('buildKpiData', () => {
  it('credits a case to every person who touched it — cards overlap', () => {
    const rows = [row(1, 'a', 'OPEN')];
    const wl = workload({
      people: [
        { authorEmail: 'x@e.com', authorName: 'X', isYou: false, cases: [{ msorId: 1, caseKey: 'a' }] },
        { authorEmail: 'y@e.com', authorName: 'Y', isYou: false, cases: [{ msorId: 1, caseKey: 'a' }] },
      ],
    });
    const kpi = buildKpiData(wl, rows);
    expect(kpi.people).toHaveLength(2);
    expect(kpi.people[0].counts.OPEN).toBe(1);
    expect(kpi.people[1].counts.OPEN).toBe(1);
    // Summing the cards would say 2; the distinct total is 1.
    expect(kpi.touchedTotal).toBe(1);
  });

  it('closes the identity touched + unattributed + unattended + dormant = total', () => {
    const rows = [
      row(1, 'touched', 'OPEN'),
      row(1, 'anon', 'IN_PROGRESS'),
      row(1, 'stale', 'OPEN'),
      row(1, 'finished', 'DONE'),
    ];
    const wl = workload({
      people: [
        {
          authorEmail: 'x@e.com',
          authorName: 'X',
          isYou: false,
          cases: [{ msorId: 1, caseKey: 'touched' }],
        },
      ],
      unattributed: [{ msorId: 1, caseKey: 'anon' }],
    });
    const kpi = buildKpiData(wl, rows);

    expect(kpi.touchedTotal).toBe(1);
    expect(kpi.unattributed.keys.size).toBe(1);
    expect(kpi.unattended.keys.size).toBe(1); // 'stale' — untouched and not DONE
    expect(kpi.dormant).toBe(1); // 'finished' — untouched but DONE
    expect(
      kpi.touchedTotal + kpi.unattributed.keys.size + kpi.unattended.keys.size + kpi.dormant,
    ).toBe(rows.length);
  });

  // Drawing DONE-and-untouched would rebuild the all-time green disc that monthly
  // scoping exists to prevent.
  it('classifies an untouched DONE case as dormant, not unattended', () => {
    const kpi = buildKpiData(workload(), [row(1, 'done', 'DONE')]);
    expect(kpi.dormant).toBe(1);
    expect(kpi.unattended.keys.size).toBe(0);
  });

  it('sorts you first, then by active count, then by email', () => {
    const rows = [row(1, 'a', 'OPEN'), row(1, 'b', 'OPEN'), row(1, 'c', 'OPEN')];
    const wl = workload({
      people: [
        {
          authorEmail: 'busy@e.com',
          authorName: null,
          isYou: false,
          cases: [
            { msorId: 1, caseKey: 'a' },
            { msorId: 1, caseKey: 'b' },
          ],
        },
        { authorEmail: 'me@e.com', authorName: null, isYou: true, cases: [{ msorId: 1, caseKey: 'c' }] },
      ],
    });
    const kpi = buildKpiData(wl, rows);
    // You lead despite having fewer active cases.
    expect(kpi.people[0].email).toBe('me@e.com');
    expect(kpi.people[1].email).toBe('busy@e.com');
  });

  it('keeps orphaned refs out of the counts and reports them separately', () => {
    const rows = [row(1, 'real', 'OPEN')];
    const wl = workload({
      people: [
        {
          authorEmail: 'x@e.com',
          authorName: null,
          isYou: false,
          cases: [
            { msorId: 1, caseKey: 'real' },
            { msorId: 1, caseKey: 'vanished' },
          ],
        },
      ],
    });
    const kpi = buildKpiData(wl, rows);
    expect(kpi.orphaned).toBe(1);
    expect(kpi.touchedTotal).toBe(1);
    // The identity still closes — the orphan is excluded rather than miscounted.
    expect(
      kpi.touchedTotal + kpi.unattributed.keys.size + kpi.unattended.keys.size + kpi.dormant,
    ).toBe(rows.length);
  });
});
