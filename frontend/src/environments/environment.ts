/**
 * Build-time configuration. Replaces Vite's `import.meta.env`.
 *
 * The React build read `VITE_AUTH_ENABLED` and `VITE_SHOP_ADMIN_ORDER_URL` from the
 * environment at build time. Angular has no equivalent of `import.meta.env`, so those
 * two flags move here and `environment.prod.ts` is swapped in by `fileReplacements`.
 *
 * `BASE_URL` has no counterpart in this file — it maps onto Angular's `APP_BASE_HREF`,
 * which is read from the `<base href>` tag in index.html.
 */
export const environment = {
  production: false,

  /**
   * When false the SPA shows a local demo login and resolves the current user
   * client-side, with no backend at all. Mirrors `VITE_AUTH_ENABLED !== "true"`.
   */
  authEnabled: false,

  /**
   * Base URL for deep-linking an order into a shop admin. When empty, order numbers
   * render as plain text rather than links. Mirrors `VITE_SHOP_ADMIN_ORDER_URL`.
   */
  shopAdminOrderUrl: '',
};
