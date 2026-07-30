import { CATEGORY_COLORS, CATEGORY_FALLBACK, CATEGORY_ORDER } from '../constants';

/** Stable display order for a category; unknown values sort last (alphabetically). */
export function categoryRank(cat: string): number {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

/**
 * Stable colour for a category: by taxonomy position when known, else a hash of
 * the name so custom categories still get a consistent, distinct colour.
 */
export function categoryColor(cat: string): string {
  const i = CATEGORY_ORDER.indexOf(cat);
  if (i !== -1) return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
  let h = 0;
  for (let j = 0; j < cat.length; j++) h = (Math.imul(h, 31) + cat.charCodeAt(j)) >>> 0;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}

// Per-category descriptions, keyed by category name (parallel to CATEGORY_ORDER).
// TODO(copy): placeholder text — replace with real descriptions when supplied.
// Custom/unmapped categories return null (no description shown).
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'PG / Payment':
    'Payment gateway and settlement monitoring — captures, authorizations, refunds, and PG reconciliation mismatches.',
  Reward:
    'Reward points and membership-benefit monitoring — accrual, redemption, and balance discrepancies in the reward system.',
  'Order Delivery':
    'Order delivery monitoring — delivery order lifecycle, fulfillment, and shipment status issues.',
  'Order Validation':
    'Order validation monitoring — order validation, eligibility, and pre-fulfillment checks.',
  BOPIS:
    'Buy Online, Pick-up In Store monitoring — store pickup orders, reservation, and pickup-status exceptions.',
  'Cancel / Refund':
    'Cancellation and refund monitoring — cancelled orders, refund processing, and restocking edge cases.',
  'Export & ERP I/F':
    'Export and ERP interface monitoring — data exports and ERP interface transfers and failures.',
  'Interface Health':
    'Interface health monitoring — uptime, latency, and error rates across external system integrations.',
  Marketplace: 'Marketplace monitoring — marketplace vendor, listing, and order-sync issues.',
  ESP: 'ESP integration monitoring — email/notification service-provider delivery and template issues.',
  TPA: 'Third-Party Application monitoring — external partner application integrations and data exchange.',
  Membership: 'Membership monitoring — sign-up, tier, and membership lifecycle data issues.',
  Service: 'Service request monitoring — after-sales service, claims, and support-related cases.',
  Other: 'Uncategorized monitoring items that do not fall under a specific taxonomy bucket.',
};

/** Description for a category, or null for unknown/custom categories. */
export function categoryDescription(cat: string): string | null {
  return CATEGORY_DESCRIPTIONS[cat] ?? null;
}

/** Groups items by category, in taxonomy order. */
export function groupByCategory<T extends { category?: string | null }>(
  items: T[],
): { category: string; items: T[] }[] {
  const byCat = new Map<string, T[]>();
  for (const item of items) {
    const cat = item.category ?? CATEGORY_FALLBACK;
    const bucket = byCat.get(cat);
    if (bucket) bucket.push(item);
    else byCat.set(cat, [item]);
  }
  return [...byCat.entries()]
    .map(([category, list]) => ({ category, items: list }))
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.category.localeCompare(b.category));
}
