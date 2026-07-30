import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';

/**
 * AG Grid v33+ requires modules to be registered before any grid is created. The React
 * entrypoint did this at module scope in DashboardPage; here it is imported by each
 * grid-hosting component, and `registerModules` is idempotent.
 *
 * Community only — the Enterprise column tool panel and set filter are why
 * `ColumnPickerComponent` and `DataGripSetFilterComponent` exist at all.
 */
ModuleRegistry.registerModules([AllCommunityModule]);
