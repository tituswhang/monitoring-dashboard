-- ============================================================
--  Monitoring Dashboard — seed DATABASE3 monitoring items
--  V0_1_0_6  (MySQL / MariaDB)
--
--  Adds example DATABASE3 monitoring queries.
--  db_type = 'DATABASE3' routes execution to the Database3 connection.
-- ============================================================

INSERT INTO monitoring_queries
    (title, description, db_type, sql_query, query_interval, sheet_name,
     owner_name, owner_email, recipients, active_yn, frequent_yn)
VALUES
-- ---------------------------------------------------------- DB3 [1]
(
    'DB3 Export Error',
    'Example: records in error status transferred after a given date',
    'DATABASE3',
    'SELECT id, order_ref, status_code, error_text, created_at, transfer_date
FROM export_interface
WHERE status_code = ''E''
  AND transfer_date > DATE_SUB(NOW(), INTERVAL 30 DAY)
ORDER BY id DESC',
    '0 30 8 * * MON-FRI',
    'DB3 Export Error',
    '', '', '', 'Y', 'N'
),
-- ---------------------------------------------------------- DB3 [2]
(
    'DB3 Pending Records',
    'Example: records blocked in a filter with PENDING status',
    'DATABASE3',
    'SELECT id, reference_id, status, created_at
FROM filter_log
WHERE status = ''PENDING''
ORDER BY id',
    '0 30 8 * * MON-FRI',
    'DB3 Pending Records',
    '', '', '', 'Y', 'N'
),
-- ---------------------------------------------------------- DB3 [3]
(
    'DB3 On Hold',
    'Example: records on hold created recently',
    'DATABASE3',
    'SELECT id, reference_id, hold_flag, created_at
FROM export_interface
WHERE hold_flag IN (''H'', ''D'')
  AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)',
    '0 30 8 * * MON-FRI',
    'DB3 On Hold',
    '', '', '', 'Y', 'N'
);
