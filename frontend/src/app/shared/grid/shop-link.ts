import { environment } from '../../../environments/environment';

// ── Shop admin order links ─────────────────────────────────────────────────
// The shop admin order page is keyed by the internal entity id (aliased
// "order_id" in the seed queries — see the Flyway seeds), which is NOT the
// human-facing increment_id. We render the increment_id as the link text but
// build the URL from the entity id found in the same row.
//
// The admin base URL is deployment-specific and is supplied at build time via
// `environment.shopAdminOrderUrl` (was `VITE_SHOP_ADMIN_ORDER_URL`). When empty
// (as in the public demo) no link is rendered and the increment_id shows as
// plain text.

export const SHOP_ADMIN_ORDER_URL = environment.shopAdminOrderUrl;

export function isIncrementIdColumn(col: string): boolean {
  return col.trim().toLowerCase() === 'increment_id';
}

/** Pull the shop entity id (order_id / entity_id) from a result row's data. */
export function shopOrderEntityId(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const raw = data['order_id'] ?? data['entity_id'] ?? data['ORDER_ID'] ?? data['ENTITY_ID'];
  if (raw === null || raw === undefined || raw === '') return null;
  const str = String(raw).trim();
  return /^\d+$/.test(str) ? str : null;
}

/**
 * Only DATABASE1 rows map to the shop admin order page. Other db types (e.g.
 * DATABASE3, whose `increment_id` is an ERP document-ref substring) must never
 * render a shop link, even if their data happens to carry an
 * order_id/entity_id-named column.
 */
export function isShopLinkable(dbType: string | undefined | null): boolean {
  return (dbType ?? '').toUpperCase() === 'DATABASE1';
}
