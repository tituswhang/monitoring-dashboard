-- ============================================================
--  Monitoring Dashboard — bind the monitoring items to a date window
--  V1_2_0  (MySQL / MariaDB)
--
--  Every item whose scan was pinned to a rolling literal interval now takes its
--  range from the service instead:
--
--      <col> >  DATE_SUB(NOW(), INTERVAL n DAY)
--   →  <col> >= @begin_date AND <col> < @end_date
--
--  TargetDbQueryService binds @begin_date / @end_date per run (see
--  QueryWindow.isWindowed, which decides an item is windowed purely by the presence
--  of the @begin_date token). An item left without the token keeps whatever literal
--  filter it carries and simply ignores the caller's range — which is why the UI
--  hides the scan-range controls for those items rather than showing them doing
--  nothing.
--
--  BEHAVIOUR CHANGE, restated: each of these items now reports only what falls
--  inside the requested window (by default the last `default_lookback_days` days).
--  A failure older than the window is not fixed, it is out of frame; reaching it
--  needs the widened "show past unresolved cases" scan.
--
--  end_date is bound EXCLUSIVE, so `<` is correct and the final day is not dropped.
-- ============================================================

-- ---------------------------------------------------------------- Example Check 1
UPDATE monitoring_queries
SET sql_query = 'SELECT id, created_at, amount, expected_amount
FROM orders
WHERE amount <> expected_amount
  AND created_at >= @begin_date
  AND created_at <  @end_date
ORDER BY created_at DESC'
WHERE title = 'Example Check 1';

-- ---------------------------------------------------------------- Example Check 3
UPDATE monitoring_queries
SET sql_query = 'SELECT id, order_id, sku, qty_invoiced, qty_refunded, cancelled_at
FROM order_items
WHERE status = ''CANCELLED''
  AND qty_invoiced > 0
  AND qty_refunded = 0
  AND cancelled_at >= @begin_date
  AND cancelled_at <  @end_date
ORDER BY cancelled_at DESC'
WHERE title = 'Example Check 3';

-- ---------------------------------------------------------------- DB3 Export Error
UPDATE monitoring_queries
SET sql_query = 'SELECT id, order_ref, status_code, error_text, created_at, transfer_date
FROM export_interface
WHERE status_code = ''E''
  AND transfer_date >= @begin_date
  AND transfer_date <  @end_date
ORDER BY id DESC'
WHERE title = 'DB3 Export Error';

-- ============================================================
--  Deliberately left alone
--
--  * 'Example Check 2' filters on the *absence* of recent progress
--    (`created_at < NOW() - 24h`) rather than on a scan range. Windowing it would
--    inverse its meaning: the point is to surface records that have been stuck for
--    longer than a day, not records created during the last day.
--
--  * 'DB3 Pending Records' has no date predicate at all — it reports whatever is
--    currently in a PENDING state, which is a snapshot rather than a range.
--
--  Both keep default_lookback_days for schedule bookkeeping, but the UI hides the
--  scan-range controls for them because QueryWindow.isWindowed reports false.
-- ============================================================
