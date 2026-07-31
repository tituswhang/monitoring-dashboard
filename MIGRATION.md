# React → Angular Migration Plan

Refactor of the `monitoring-dashboard` SPA from React 19 + Vite to Angular 21.

> **Status: complete.** Phases 0–8 done. `frontend/` is now the Angular app; the React tree
> was removed in Phase 8 and remains recoverable from git history at `b155fa2`.
>
> Build 655 kB / 135 kB initial (AG Grid and ECharts lazy), 39 tests passing.
> All package versions below were verified against the npm registry on 2026-07-30.
>
> **Feature parity: complete.** Every API method is reachable from the UI and every React
> component has an equivalent. Verified by audit, not by memory — see §10.
>
> **Known gap**, tracked but not done:
> - AG Grid's deprecated selection API (`rowSelection="multiple"`, `headerCheckboxSelection`,
>   `checkboxSelection`) still emits warnings. Migrating changes how the selection column is
>   generated, so it wants to be its own change.

---

## 1. Scope

**The backend is not touched by this migration.**

Verified before planning:

- `.gitlab-ci.yml` contains no npm / node / vite steps — it only deploys the backend to EKS.
- `backend/build.gradle` has no frontend packaging (no node plugin, no `processResources` copy).
- `backend/src/main/resources` contains only `flyway/` — no `static/` or `public/` dir.
- `netlify.toml` sets `base = "frontend"` and deploys the SPA standalone.

The frontend is an independent Netlify deployment running entirely on in-memory mock data.
**Everything in this plan lives under `frontend/`**, plus two lines of `netlify.toml`.

Untouched: `backend/`, `.gitlab-ci.yml`, Flyway migrations, all Gradle config.

---

## 2. Decisions

Three decisions were locked before planning. Rationale recorded here so they are not relitigated mid-migration.

### 2.1 Charts → Apache ECharts (`ngx-echarts`)

`recharts` has no Angular port — the only dependency with no drop-in replacement.

Chosen for its customization headroom on labels and tooltips, which is where the current
implementation is most demanding. Configuration is imperative JSON rather than declarative markup.

> **Bundle cost, measured after wiring it up:** registering only `PieChart` + tooltip + legend +
> `CanvasRenderer` (see `shared/charts/echarts.ts`) and loading it through
> `provideEchartsCore({ echarts: () => import(…) })` puts ECharts in a **lazy 497 kB chunk
> (145 kB transfer)** that stays out of the initial bundle entirely. The initial bundle is 485 kB
> raw / 91 kB transfer. Importing the `echarts` barrel instead would pull in every chart type.

Alternatives considered: a hand-rolled SVG pie (~150 lines, zero deps, exact parity) and
`@swimlane/ngx-charts` (Angular-native, but constrained on custom labels/tooltips and pulls in
`@angular/animations` + `@angular/cdk`).

### 2.2 Angular 21, and `@ng-icons/lucide` (not `lucide-angular`)

Angular 21 was chosen because `lucide-angular@1.0.0` declares peer `@angular/core` `13.x - 21.x`,
putting Angular 22 outside its range.

> ⚠️ **`lucide-angular` turned out to be unusable, and this was found only at build time.**
> Its peer range was never the real constraint. The package ships pre-Angular-16 packaging: the
> `.d.ts` files live in `lib/` while the runtime lives in `esm2020/lib/`, with no `exports` entry
> bridging them. Angular's compiler emits a deep import against the declaration path and esbuild
> cannot resolve it:
>
> ```
> X [ERROR] Could not resolve "../../../../node_modules/lucide-angular/lib/lucide-angular.component"
> ```
>
> There is no workaround from the app side — `ngcc`, which used to convert such packages, was
> removed in Angular 16. **Replaced with `@ng-icons/lucide` 34.0.0** (`fesm2022`, peers
> `@angular/core >=21`), which wraps the same lucide artwork.

The Angular 21 decision still stands on its own — `@angular/material` and `ngx-echarts` both pin
to it — but it is no longer *forced* by the icon library. `@ng-icons` supports 21 and 22 alike, so
a future move to Angular 22 is now gated only on Material and ngx-echarts.

**Naming:** `@ng-icons` tracks lucide's current names, so eight of the 45 icons differ from the
`lucide-react` originals. Recorded in `shared/icons.ts`:

| lucide-react | @ng-icons/lucide |
|---|---|
| `Home` | `lucideHouse` |
| `MoreHorizontal` | `lucideEllipsis` |
| `Loader2` | `lucideLoaderCircle` |
| `PauseCircle` | `lucideCirclePause` |
| `PlayCircle` | `lucideCirclePlay` |
| `AlertCircle` | `lucideCircleAlert` |
| `AlertTriangle` | `lucideTriangleAlert` |
| `CheckCircle2` | `lucideCircleCheckBig` |

**Sizing:** `NgIcon` renders a 1em SVG sized by `font-size`, but every icon in the React source
was sized with Tailwind box utilities (`h-4 w-4`). One global rule in `styles.css` makes the SVG
fill its host, so all ~200 existing size classes keep working unchanged.

### 2.3 Selective Angular Material + CDK

**Measured before deciding.** Angular Material replaces **~900–1,100 lines (~10–12%)**, not "most"
of the app. The 9,063 lines break down as:

| Category | Lines | Material-replaceable? |
|---|---|---|
| Data layer (fixtures, API, types, xlsx, auth) | 2,386 | No UI at all |
| Domain views (`DashboardPage` 972, `QueryDetailView` 223, KPI/Person/Home/Category) | 1,617 | App logic, not library-shaped |
| AG Grid layer (`RowsTable` 319, `AllCasesPage` 524, colDefs 169, filter 110) | 1,122 | **No** — `mat-table` lacks virtual scroll, pinning, set filters, dynamic columns, Excel export |
| Charts | 302 | **No** — Material has no charting |
| **Overlay / dialog / datepicker layer** | **~1,300** | **Yes** |

Where it wins:

| Current | Lines | Material equivalent | Verdict |
|---|---|---|---|
| `MiniCalendar` + `DateRangePicker` | **321** | `MatDatepicker`, `mat-date-range-picker` | **Near-total replacement — biggest single win** |
| 7 modal shells (backdrop, positioning, lifecycle) | ~250 of 893 | `MatDialog` | Shell goes, content stays |
| `InfoPopover` + `HoverDescription` | 126 | `MatTooltip` / `MatMenu` | Strong |
| `ColumnPicker` | 136 | `MatMenu` + `MatCheckbox` | ~half |
| `GlobalSearch` + `SearchResultRow` | 130 | `MatAutocomplete` | ~40% |
| `StatusSelectCell` + 15 `<select>` | ~90 | `MatSelect` | Modest |
| 21 click-outside handlers + 9 `getBoundingClientRect` | ~200 distributed | **CDK Overlay** | Strong — the real boilerplate |

**Decision: Material for behaviour-heavy widgets only** — dialog, datepicker, menu, autocomplete,
tooltip, select, sidenav. Tailwind keeps all layout and presentation. The shadcn-style design
system survives intact.

Rejected: **wholesale Material** (a visual redesign that would clash with the DataGrip grid theme)
and **CDK-only** (pixel-identical, but forfeits the 321-line datepicker win).

> Accessibility note: there are currently only **2 Escape-key handlers across 7 modals and 5
> popovers**, and no focus trapping anywhere. Material/CDK provides both by default. This is a
> correctness upgrade, not merely fewer lines — do not regress it by re-hand-rolling overlays.

### 2.4 Full decomposition + Angular Router + signals

The 40 components in `DashboardPage.tsx` split into feature folders; the five hand-rolled views
become real routes; `useState`/`useMemo` map onto `signal`/`computed`.

A faithful 1:1 port was rejected: it would produce a ~6,000-line Angular component with 104
signals in one class, materially worse than the React original.

---

## 3. Target stack

| Concern | Package | Version | Note |
|---|---|---|---|
| Framework | `@angular/core`, `@angular/cli` | **21.2.19** | |
| Charts | `ngx-echarts` | **21.0.0** | See warning below |
| Charts | `echarts` | 6.1.0 | |
| Grid | `ag-grid-angular` | **35.3.1** | Peers Angular ≥18 |
| Grid | `ag-grid-community` | 35.3.x | **Unchanged** — already a dependency |
| Icons | `@ng-icons/core` + `@ng-icons/lucide` | **34.0.0** | `lucide-angular` is unusable — see §2.2 |
| UI widgets | `@angular/material` | **21.2.14** | Selective use — see §2.3 |
| Overlays | `@angular/cdk` | **21.2.14** | Replaces `createPortal`; must match Material exactly |
| Styling | `tailwindcss` | 4.3.3 | Unchanged version |
| Styling | `@tailwindcss/postcss` | 4.3.3 | **Replaces** `@tailwindcss/vite` |
| Dates | `date-fns` | 4.1.0 | Unchanged |
| Classnames | `clsx`, `tailwind-merge` | Unchanged | `cn()` still useful for string-concat cases |

> ⚠️ **Pin `ngx-echarts@21.0.0` exactly.**
> `ngx-echarts@22.0.0` (the `latest` tag) declares peer `@angular/core >=22.0.0` and will not
> install against Angular 21. `npm i ngx-echarts` without a version **will** resolve wrong.

> ⚠️ **Material and CDK lag core.** Latest 21.x for both is **21.2.14**, while `@angular/core` is at
> 21.2.19. This is fine — Material peers `@angular/core ^21.0.0 || ^22.0.0` — but `@angular/material`
> peers `@angular/cdk` at an **exact** version, so the two must be pinned to the same patch.

### Dropped

| Package | Reason |
|---|---|
| `axios` | Listed in `package.json` but **never imported anywhere in `src/`**. Dead dependency. |
| `react`, `react-dom`, `@types/react*` | Replaced |
| `ag-grid-react`, `lucide-react`, `recharts` | Replaced |
| `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite` | Replaced by Angular CLI |

---

## 4. Inventory

18 files, 9,063 lines of TS/TSX/CSS.

| File | Lines | Migration character |
|---|---|---|
| `pages/DashboardPage.tsx` | **5,892** | **The whole app** — 40 components + 44 pure helpers |
| `api/mockData.ts` | 1,350 | Pure fixtures — **moves unchanged** |
| `api/monitoring.ts` | 522 | Promise-based mock client — near-portable |
| `components/UserAdminModal.tsx` | 313 | Modal |
| `lib/xlsx.ts` | 193 | Dependency-free .xlsx writer — **moves unchanged** |
| `types/monitoring.ts` | 183 | Interfaces — **moves unchanged** |
| `index.css` | 151 | Tailwind theme + AG Grid theme — near-portable |
| `auth/auth.ts` | 138 | Module-level singletons → service |
| `pages/DemoLoginPage.tsx` | 78 | Simple form |
| `App.tsx` | 62 | Hand-rolled page switch |
| `pages/LoginPage.tsx` | 50 | Simple form |
| `components/ui/table.tsx` | 44 | Styled-div primitive |
| `components/ui/badge.tsx` | 30 | Styled-div primitive |
| `components/ui/card.tsx` | 27 | Styled-div primitive |
| `main.tsx` | 12 | Bootstrap |
| `components/ui/skeleton.tsx` | 11 | Styled-div primitive |
| `lib/utils.ts` | 6 | `cn()` helper |
| `vite-env.d.ts` | 1 | Deleted |

**~1,900 lines (21%) port with near-zero edits** — types, fixtures, the xlsx writer, most of the CSS.
The remaining work is concentrated almost entirely in one file.

### React surface to convert

| Hook | Whole `src/` | In `DashboardPage.tsx` |
|---|---|---|
| `useState` | 126 | 104 |
| `useMemo` | 45 | 45 |
| `useCallback` | 44 | 44 |
| `useEffect` | 39 | 35 |
| `useRef` | 24 | 24 |

Plus **12 `createPortal` call sites**, all in `DashboardPage.tsx`.

---

## 5. Target structure

```
frontend/src/app/
  core/
    auth.service.ts                 ← auth/auth.ts singletons → DI
    monitoring.service.ts           ← api/monitoring.ts
    mock-data.ts                    ← moves unchanged
    theme.service.ts                ← dark-mode effect
    models/monitoring.ts            ← moves unchanged
  shared/
    ui/                             card, badge, table, skeleton
    charts/
      pie-chart.component.ts        ← ngx-echarts wrapper
    grid/
      datagrip-set-filter.component.ts
      cells/                        ~10 cell renderer components
      column-visibility.ts          ← useColumnVisibility → service
    overlays/
      follow-tooltip                ← stays custom (cursor-following)
      material-theme.css            ← MD3 tokens mapped onto the oklch palette
      (info-popover, hover-description, column-picker → MatMenu/MatTooltip)
      (mini-calendar, date-range-picker → MatDatepicker; 321 lines deleted)
    utils/
      xlsx.ts                       ← moves unchanged
      cn.ts, case-age.ts, scan-window.ts, category.ts
  features/
    home/
    query-detail/
    category/
    kpi/
    person/
    all-cases/
    login/  demo-login/
    modals/                         7 modal components
  app.routes.ts
  app.config.ts
```

### Route mapping

The current scheme is `useState` for the view + `history.pushState`/`replaceState` + a `popstate`
listener (`DashboardPage.tsx:5274–5352`).

| Today | Angular |
|---|---|
| `/` | `/` |
| `?id=42` | `/query/42` |
| `?category=Orders` | `/category/Orders` |
| `?kpi&month=2026-07` | `/kpi?month=2026-07` |
| `?person=a@b.com&month=2026-07` | `/kpi/person/a@b.com?month=2026-07` |

The `month` query param stays a query param deliberately — it must survive the drill from KPI into
a person, which is exactly why it was put in the URL originally (see the comment at
`DashboardPage.tsx:4936`).

---

## 6. Phases

Keep the React tree in place until Phase 6 lands, so there is always a working reference to diff against.

### Phase 0 — Scaffold

- [ ] `ng new` Angular 21 workspace in `frontend/`
- [ ] Tailwind v4 via `@tailwindcss/postcss` (`.postcssrc.json`)
- [ ] Path alias `@/*` → `src/app/*` in `tsconfig.json`
- [ ] `environment.ts` / `environment.prod.ts` replacing the 8 `import.meta.env` sites
- [ ] Confirm `ngx-echarts@21.0.0` is pinned, not `^21` or `latest`
- [ ] Install `@angular/material@21.2.14` + `@angular/cdk@21.2.14` (same patch, exact)

**`import.meta.env` sites to replace:**

| Location | Usage |
|---|---|
| `auth/auth.ts:1` | `BASE_URL` → API root derivation |
| `auth/auth.ts:89` | `VITE_AUTH_ENABLED` → demo-mode flag |
| `api/monitoring.ts:476, 494` | `BASE_URL` → invite URL |
| `DashboardPage.tsx:466` | `VITE_SHOP_ADMIN_ORDER_URL` |
| `DashboardPage.tsx:5077, 5219, 5274` | `BASE_URL` → home navigation |

`BASE_URL` maps to Angular's `APP_BASE_HREF`; the two `VITE_*` flags become environment fields.

### Phase 1 — Portable core

- [ ] Move `types/monitoring.ts` → `core/models/monitoring.ts` (verbatim)
- [ ] Move `api/mockData.ts` → `core/mock-data.ts` (verbatim)
- [ ] Move `lib/xlsx.ts` → `shared/utils/xlsx.ts` (verbatim)
- [ ] Port `index.css` → `src/styles.css`

> **Gotcha found during the port:** Angular's default tsconfig enables
> `noPropertyAccessFromIndexSignature`, which the React project did not have. This surfaces as
> ~40 `TS4111` errors in `mock-data.ts`, all from one declaration —
> `const D: Record<string, string>` — making every `D.DAY01` illegal.
>
> Fix at the declaration by giving `D` a finite `DayKey` union instead of a string index
> signature. That keeps all 1,350 fixture lines untouched **and** keeps the check enabled for the
> rest of the app, where it genuinely matters: `AllCasesRow.data` is a `Record<string, unknown>`,
> and this rule is what forces `data['col']` over `data.col`. Do **not** disable the flag globally.

> The `@theme` / `.dark` blocks and the whole `.ag-theme-datagrip` block **must be global styles**,
> not component styles. See risk #5.

### Phase 2 — Services

- [ ] `AuthService` — `auth.ts`'s module-level `accessToken` / `currentUser` become signals;
      `hasRole` / `hasPermission` become `computed`
- [ ] `MonitoringService` — keep every mock-backed body as-is; move the module-level `let queries`,
      `results`, `activity`, `users` into the service

> Preserve the exported signatures one-for-one. The current module's whole design premise is that
> swapping it for an HTTP client is a single-file change (`api/monitoring.ts:9–13`). Do not lose that.

### Phase 3 — Shared UI + Material theme + chart

- [ ] **`material-theme.css` mapping `--mat-sys-*` onto the oklch `--color-*` palette** — do this
      first; see risk #4
- [ ] Set Material density to match the current compact UI
- [ ] 5 `ui/` primitives → standalone components (`Card`, `CardHeader`, `CardTitle`,
      `CardDescription`, `CardContent`, `Badge`, `Table*`, `Skeleton`)
      — these stay Tailwind; Material is not used for presentation
> **Resolved during the port — the `cn()` merge is load-bearing.** The React primitives took
> `className` and merged it with `tailwind-merge`, and callers rely on the override:
> `<Badge className="h-4 shrink-0 px-1 py-0 …">` sits on top of a base `px-2 py-0.5`. Applying
> both classes instead would let Tailwind's emit order pick the winner rather than the caller.
>
> The Angular equivalent is an attribute **directive** with an input aliased to `class`, merged
> through `cn()` in a `host: { '[class]': … }` binding. Directives (not wrapper components) so the
> host stays a native element — `<h3 uiCardTitle>` keeps its heading semantics and the table
> primitives keep a real `<table>/<thead>/<tr>` tree. Covered by `badge.spec.ts`.

> **ECharts is canvas-based and cannot read `var(--color-…)`.** Any chart colour that must follow
> the theme has to be resolved eagerly via `getComputedStyle`. `ThemeService.cssVar()` does this,
> but the computed that calls it **must also read `darkMode()`** — toggling the class on `<html>`
> notifies no signal on its own, so without that read the legend keeps its old colour after a
> theme flip.

- [ ] `PieChartComponent` over `ngx-echarts`, absorbing:
  - `renderSliceValueLabel` (`:369`) → `label.formatter`
  - `renderCaseTooltip` (`:973`) / `renderRowTooltip` (`:977`) → `tooltip.formatter`
  - `FollowTooltip` (`:927`) → `tooltip.position`
  - per-slice `<Cell fill>` → `itemStyle.color` per data item
  - `onSliceClick` drill-down → `(chartClick)`

### Phase 4 — Shell, routing, login

- [ ] `app.routes.ts` per §5; route guard replacing `App.tsx`'s auth gate
- [ ] `LoginPage` / `DemoLoginPage` → reactive forms
- [ ] `ThemeService` replacing the dark-mode `useEffect` (`:5002–5006`)
- [ ] Sidebar shell, `SidebarItem` (`:1324`), `GlobalSearch` (`:2991`)

### Phase 5 — Grid layer

- [x] `RowsTable` (`:1887`) — `shared/grid/rows-table.ts`
- [x] All Cases grid (`:3721`) + `buildAllCasesColDefs` (`:3066`) — `shared/grid/all-cases.ts`
- [ ] Convert ~10 inline JSX `cellRenderer`s into renderer components
      (`:2014, 2032, 2062, 2088, 3108, 3120, 3138, 3166, 3205, 3224`)
- [ ] `StatusSelectCell` (`:2207`), `IncrementIdLinkCell` (`:489`), `renderFirstSeenCell` (`:984`)
- [ ] **`DataGripSetFilter` (`:1776`) → `IFilterAngularComp`** — see risk #1
- [ ] `useColumnVisibility` (`:717`) → service; `ColumnPicker` (`:773`), `EmptyColumnsToggle` (`:755`)
- [ ] `exportAgGridToExcel` (`:524`) — pure, moves unchanged

### Phase 6 — Feature views

The bulk of the work.

- [x] `HomeView` (`:4605`)
- [x] `CategoryView` (`:3964`) + `CategoryPieCard` (`:3766`) + `CaseAgePieCard` (`:3814`)
- [x] `KpiView` (`:4362`) + `PersonPieCard` (`:4242`) + `WorkloadStatTile` (`:4303`) +
      `MonthSelector` (`:4181`) — logic in `shared/utils/kpi.ts`, covered by `kpi.spec.ts`
- [x] `PersonView` (`:4495`), including the `BUCKET_UNATTENDED` / `BUCKET_UNATTRIBUTED` cards
- [x] `AllCasesPage` (`:3236`)
- [x] `QueryDetailView` (`:4695`) — header, run-date selector, both pies, `RunScanControl`
      (`:1551`), `ErrorPanel` (`:1736`), run detail, and the results grid
- [ ] `VerticalResizable` (`:3880`) — the draggable split between the pies and the grid.
      Query detail currently uses a fixed layout; the split is cosmetic and deferred.

> The 44 camelCase helper functions (`categoryRank`, `caseAgeBucket`, `buildCaseAgeData`,
> `buildKpiData`, `daysOpen`, `nyToday`, `shiftMonth`, …) are pure TypeScript and port with
> **no changes** — only their location moves. Do these first in each view; they de-risk the rest.

### Phase 7 — Modals & overlays

All 12 portal sites → Material / CDK Overlay. Per §2.3, Material supplies behaviour; Tailwind
supplies the visuals. Every dialog gets focus-trapping and Escape handling by default — verify
both, since the React original had neither.

> **Build gotcha:** `ng build` finishes in ~10s but **the CLI process does not exit** on
> Windows. Anything that waits for the process to terminate will appear to hang. Redirect to
> a log and read it (`ng build > build.log 2>&1`) rather than waiting on exit status.

**Modals (7) → `MatDialog`:**
- [ ] `EditQueryModal` (`:2452`)
- [ ] `CreateQueryModal` (`:2736`)
- [ ] `RunSelectionModal` (`:2641`)
- [ ] `DeleteConfirmModal` (`:2714`)
- [ ] `QueryHistoryModal` (`:2870`)
- [ ] `CaseActivityModal` (`:2304`) + `ActivityEntry` (`:2265`) + `ViewCommentsButton` (`:2412`)
- [ ] `UserAdminModal` (`components/UserAdminModal.tsx`)

**Popovers / floating UI (5):**
- [ ] `InfoPopover` (`:550`) → `MatMenu` (rich content; `MatTooltip` is text-only)
- [ ] `HoverDescription` (`:605`) → `MatTooltip`
- [x] **`MiniCalendar` (`:1001`) + `DateRangePicker` (`:1145`) → `mat-date-range-picker`** —
      done early, in `shared/overlays/date-range-picker.ts`, because All Cases needed it.
      **321 lines replaced by ~85**, the largest single win of the migration.
      Needs `provideNativeDateAdapter()` in `app.config.ts` — and in any TestBed that
      renders a component embedding All Cases, or it throws at construction.
- [ ] Sidebar section menu (`:5651`) → `MatMenu`

**Retire the hand-rolled positioning:** 21 click-outside handlers and 9 `getBoundingClientRect`
calls are subsumed by CDK Overlay's positioning strategies. Grep for both after this phase; any
survivor is a missed conversion.

`FollowTooltip` (`:927`) **stays custom** — it follows the cursor, which `MatTooltip` does not do.
It also moves into the ECharts config in Phase 3, so it may not survive as a component at all.

### Phase 8 — Deploy & cleanup

- [x] Delete the React tree and its dependencies — `frontend-ng/` renamed to `frontend/`
- [x] Update `netlify.toml` — publish dir `dist/monitoring-dashboard/browser` **and** the
      catch-all redirect (risk #3)
- [x] Verify the demo build end-to-end
- [x] Update `README.md` — overview, tech-stack table, project structure, frontend setup,
      environment config, and the Netlify section

---

## 7. Risks

### 1. `DataGripSetFilter` — ~~no equivalent to copy~~ RESOLVED

`DashboardPage.tsx:1776–1881`. `useGridFilter` is a React-only AG Grid hook. Rewritten as
`IFilterAngularComp` in `shared/grid/datagrip-set-filter.ts`; the filtering *logic* came across
unchanged, the lifecycle is new. Covered by 11 tests in `datagrip-set-filter.spec.ts`.

Mapping, for reference:

| React | Angular |
|---|---|
| `model` prop | `model` signal + `getModel`/`setModel` |
| `onModelChange(m)` | set signal, then `filterChangedCallback()` |
| `useGridFilter({doesFilterPass})` | `doesFilterPass()` method |
| (implicit) | `isFilterActive()` |

The model shape is unchanged — `string[]` of included values, or `null` for "show all" — so
saved filter models stay compatible.

> **One deliberate behaviour change.** The React version built its value list in a
> `useEffect(…, [])`, i.e. once per mount. AG Grid keeps a filter component alive after first
> creation, so once the grid's row data was replaced — which happens here whenever a different
> run is selected — the filter went on offering values and counts from the *previous* dataset.
> The Angular version rebuilds in `afterGuiAttached()`, so reopening the panel refreshes it.
> Regression-tested.

### 2. ECharts label & tooltip parity

recharts gave an SVG label render-prop and a portal-based cursor-following tooltip. ECharts owns
its own label layout and tooltip positioning, so both become `formatter` config plus
`tooltip.position`. **Most likely item to need visual iteration.** Click-to-drill and per-slice
colors map cleanly; label collision behaviour on small slices will not match automatically.

### 3. Netlify will 404 on hard refresh without a redirect rule

Query-string routing means every URL currently resolves to `/`. Real paths like `/query/42` will
404 on direct load or refresh. `netlify.toml` needs:

```toml
[build]
  base    = "frontend"
  command = "npm run build"
  publish = "dist/monitoring-dashboard/browser"   # was: dist

[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

Note the publish dir change — Angular 21 emits to `dist/<project>/browser`, not `dist`.

### 4. Material MD3 tokens vs. the oklch Tailwind palette

Material 3 themes through its own token system (`--mat-sys-primary`, `--mat-sys-surface`, …), while
the app themes through Tailwind's `@theme` block in oklch. Left alone, Material widgets will not
track the app's light/dark palette.

Fix once, centrally: define the Material theme in `shared/overlays/material-theme.css` mapping
`--mat-sys-*` onto the existing `--color-*` variables, so both systems read from one source and the
`.dark` class continues to drive everything. Do this in Phase 3, **before** any Material component
is used in anger — retrofitting it after Phase 7 means touching every dialog.

Density is the other gotcha: Material's default control heights are taller than the current compact
UI. Expect to set a negative density on form fields and buttons.

### 5. Tailwind v4 + Angular `ViewEncapsulation`

Utility classes in templates are fine (global). But `@apply` inside component styles needs the
Tailwind import per file, and `.dark` descendant selectors **will not pierce** Angular's
per-component style scoping. Keep the `@theme` block, the `.dark` overrides, and all
`.ag-theme-datagrip` rules in global `styles.css`. Consider `ViewEncapsulation.None` on
grid-hosting components.

### 6. Component hosts are `display: inline` — it broke two things silently

React components render no wrapper element; Angular components render a host element that
defaults to `display: inline` with auto height. Any ported markup relying on `h-full`
(`height: 100%`) or on a parent's measurable width therefore collapses.

This bit twice, and both times the component tree, the signals, and the data were all
provably correct — only the pixels were wrong:

| Component | Symptom | Fix |
|---|---|---|
| `PieChartComponent` | ECharts sizes its canvas from the container's client box; an inline host gave it nothing to measure | `:host { display: block; width: 100% }` |
| `AllCasesComponent`, `RowsTableComponent` | Template root is `h-full`, which resolves against the host — the whole chain collapsed to zero | `:host { display: block; height: 100% }` |
| `<ag-grid-angular>` | **The grid element itself.** React's `<AgGridReact>` renders a div that fills its styled wrapper, so the React source sizes the *wrapper*. The Angular component **is** the host element, and AG Grid ships no CSS rule for that selector — left inline it has no height and the grid renders zero rows | `class="block h-full w-full"` **on the grid element**, not the wrapper |

> The `<ag-grid-angular>` case is the one to watch when porting any remaining grid: the
> React markup puts the size on a wrapper `<div>`, and copying that structure verbatim
> produces a grid that initialises correctly, loads its rows, fires its events, and
> displays nothing.

**Add `:host { display: block }` to every ported component whose template root assumes a
block box.** Unit tests cannot catch this class of bug — jsdom computes no layout, so the
elements are present and correctly bound while rendering nothing.

### 7. Silent failures in unawaited promises

`shared/charts/echarts.ts` originally used `export default echarts`. ngx-echarts resolves the
loader and immediately destructures it — `load().then(({ init }) => init(dom, …))` — so a
default export made `init` come back `undefined` and the call threw inside a promise nobody
awaits. The host div still mounted, so every chart rendered as an empty box with no error
surfaced to the UI.

Fixed with `export * from 'echarts/core'`, and pinned by `echarts.spec.ts`, which asserts the
loader contract rather than that a div exists.

The general lesson for the rest of the port: **asserting an element is in the DOM proves
nothing about whether it rendered.** Where a third-party library initialises imperatively,
test its contract directly.

### 8. Deep links break

Moving off query strings invalidates existing bookmarks. If that matters, add redirect routes
mapping `?id=` / `?category=` / `?person=` onto the new paths. Cheap now, awkward later.

---

## 8. Verification

Signature-compatible services mean behaviour can be diffed directly against the React app — run
both, click the same paths.

Behaviours worth checking explicitly at each phase, chosen because each encodes a non-obvious
decision documented in the source:

| Check | Source |
|---|---|
| Mutations persist in-session, vanish on reload | `api/monitoring.ts:9–13` |
| Scan window rejects `beginDate > endDate` | `api/monitoring.ts:91–95` |
| Re-run suppresses `DONE` cases, reports count | `api/monitoring.ts:99–107` |
| All Cases `runDate` is **first-seen**, not run date | `types/monitoring.ts:124–131` |
| Case Age pie excludes `ROW_HASH` rows | `types/monitoring.ts:32–38`, `DashboardPage.tsx:277` |
| Workload month derives from newest activity, not browser `now` | `api/monitoring.ts:295–297` |
| Workload cases are non-exclusive — summing over-counts | `types/monitoring.ts:153–160` |
| Excel export writes inline strings (large order IDs keep digits) | `lib/xlsx.ts:1–7` |
| Admin controls gate on `hasRole("ADMIN")`, not merely signed-in | `DashboardPage.tsx:4989–4991` |
| Roles load **before** first dashboard paint | `App.tsx:17–19` |
| Scan window is session-held, never persisted | `DashboardPage.tsx:4966–4969` |
| KPI refresh skips the workload refetch on past months | `DashboardPage.tsx:5053–5066` |

---

## 9. Sequencing notes

- Phases 0–4 are steady mechanical work.
- **Phase 6 is the long pole** by volume.
- **Phases 5 and 7 carry the genuine unknowns** (risks #1 and #2). Consider spiking
  `DataGripSetFilter` and one ECharts pie early, out of order, to retire both risks before
  committing to the full port.

---

## 10. Parity audit

Three gaps were found only because someone opened the app, not because a test failed. The
lesson generalises: **a passing suite says nothing about whether a feature is reachable.**

| Gap | How it presented | Why tests missed it |
|---|---|---|
| Category pages orphaned | Route, component, and pies all worked — nothing linked to them | Nothing asserts a route is reachable |
| Home missing the by-category pie | Two pies instead of three; the click-to-drill route into categories was absent | The pie that *was* there rendered fine |
| Sidebar reduced to plain links | No per-item ⋯ menu, no select mode, no on-hold | Links worked; the missing menu had no test to fail |

The audit that produced the definitive list, worth re-running after any large change:

```bash
# 1. Any service method the UI can no longer reach
for fn in fetchQueries fetchResults triggerRun updateQuery createQuery deleteQuery \
          setOnHold fetchAllResultRows fetchCaseWorkload updateRow fetchCaseActivity \
          addCaseComment fetchUsers inviteUser updateUserRoles deactivateUser; do
  n=$(grep -rl "\.$fn(" src/app/features src/app/shared src/app/core/dashboard-store.ts | wc -l)
  [ "$n" -eq 0 ] && echo "UNREACHABLE: $fn"
done

# 2. Any route with no inbound link
grep -rn "routerLink\|router.navigate" src/app --include='*.ts' --include='*.html'
```

`setOnHold` was the one method the first run flagged — defined, tested by nothing, and
callable from nowhere in the UI. It is now on the sidebar item's ⋯ menu.

### Component map

React names did not all survive; these are the same features under different names.

| React | Angular |
|---|---|
| `AllCasesPage` | `AllCasesComponent` (`shared/grid/all-cases.ts`) |
| `EditQueryModal` + `CreateQueryModal` | `QueryFormDialogComponent` (one component, `isEdit` mode) |
| `StatusSelectCell` | `StatusCellComponent` |
| `IncrementIdLinkCell` | `IncrementIdCellComponent` |
| `MonthSelector` | inlined in `kpi.html` |
| `CategoryPieCard`, `PersonPieCard`, `CaseAgePieCard` | one `PieChartComponent` inside a `uiCard` |
| `HoverDescription` | `matTooltip` |
| `MiniCalendar` + `DateRangePicker` | `mat-date-range-picker` |

Pies per view now match the React original: home 3, category 3, person 3, KPI one per
person card, query detail 2.
