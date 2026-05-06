-- ============================================================
--  Monitoring Dashboard — add db_type to monitoring_queries
--  V0_1_0_4
--  Existing rows default to DATABASE1 (backward compatible).
-- ============================================================

ALTER TABLE monitoring_queries
    ADD COLUMN db_type VARCHAR(50) NOT NULL DEFAULT 'DATABASE1'
        COMMENT 'Target database: DATABASE1 | DATABASE2 | DATABASE3 | DATABASE4'
        AFTER description;
