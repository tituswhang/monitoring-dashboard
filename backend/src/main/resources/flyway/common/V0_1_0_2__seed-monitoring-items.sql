-- ============================================================
--  Monitoring Dashboard — seed example monitoring items
--  V0_1_0_2  (MySQL / MariaDB)
--
--  SQL queries are stored inline in sql_query (MEDIUMTEXT).
--  Update recipients via:
--    UPDATE monitoring_queries SET recipients = 'a@example.com,b@example.com'
--    WHERE id = <id>;
--
--  query_interval uses 6-field Spring cron (sec min hr dom mon dow).
--  Default: weekdays at 08:30 = '0 30 8 * * MON-FRI'
-- ============================================================

INSERT INTO monitoring_queries
    (title, description, sql_query, query_interval, sheet_name,
     owner_name, owner_email, recipients, active_yn, frequent_yn)
VALUES
-- ---------------------------------------------------------- 1
(
    'Example Check 1',
    'Example: rows where amount does not match expected total',
    'SELECT id, created_at, amount, expected_amount
FROM orders
WHERE amount <> expected_amount
  AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
ORDER BY created_at DESC',
    '0 30 8 * * MON-FRI',
    'Example Check 1',
    '', '', '', 'Y', 'N'
),
-- ---------------------------------------------------------- 2
(
    'Example Check 2',
    'Example: records stuck in a pending state for more than 24 hours',
    'SELECT id, created_at, status, error_message
FROM transactions
WHERE status = ''PENDING''
  AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
ORDER BY created_at',
    '0 30 8 * * MON-FRI',
    'Example Check 2',
    '', '', '', 'Y', 'N'
),
-- ---------------------------------------------------------- 3
(
    'Example Check 3',
    'Example: items cancelled but not yet refunded',
    'SELECT id, order_id, sku, qty_invoiced, qty_refunded, cancelled_at
FROM order_items
WHERE status = ''CANCELLED''
  AND qty_invoiced > 0
  AND qty_refunded = 0
  AND cancelled_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY cancelled_at DESC',
    '0 30 8 * * MON-FRI',
    'Example Check 3',
    '', '', '', 'Y', 'N'
);
