import type { RowStatus } from '../core/models/monitoring';

export const QUERY_COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
  '#84cc16', '#a855f7', '#3b82f6', '#22c55e', '#eab308',
];

export const ROW_STATUS_COLORS: Record<RowStatus, string> = {
  OPEN: '#6b7280',
  IN_PROGRESS: '#f59e0b',
  DONE: '#10b981',
};

export const ALL_DB_TYPES = ['DATABASE1', 'DATABASE2', 'DATABASE3', 'DATABASE4'];

/** Category buckets in display order. Must match the V1_0_4 taxonomy. */
export const CATEGORY_ORDER = [
  'PG / Payment', 'Reward', 'Order Delivery', 'Order Validation', 'BOPIS', 'Cancel / Refund',
  'Export & ERP I/F', 'Interface Health', 'Marketplace', 'ESP', 'TPA',
  'Membership', 'Service', 'Other',
];

export const CATEGORY_FALLBACK = 'Other';

/**
 * One distinct colour per category, aligned 1:1 with CATEGORY_ORDER so categories
 * keep a stable colour identity across the app (pies, sidebar, category pages).
 */
export const CATEGORY_COLORS = [
  '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d', '#16a34a',
  '#059669', '#0891b2', '#2563eb', '#4f46e5', '#7c3aed', '#9333ea',
  '#c026d3', '#6b7280',
];
