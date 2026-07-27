-- ============================================================
--  Monitoring Dashboard — add on_hold flag to monitoring_queries
--  V1_0_5  (MySQL / MariaDB)
--
--  on_hold_yn = 'Y' marks an item whose cases cannot be resolved
--  right now (blocked on an external action). Such items are
--  excluded from the dashboard totals, the Case Status breakdown,
--  and the per-category pies, so the daily view only shows cases
--  that are actionable. The item still runs on schedule and remains
--  visible (badged) in the item lists.
-- ============================================================

ALTER TABLE monitoring_queries
    ADD COLUMN on_hold_yn CHAR(1) NOT NULL DEFAULT 'N'
        COMMENT 'Y = exclude this item from dashboard totals/status (blocked on external action)'
        AFTER frequent_yn;
