-- ============================================================
--  Monitoring Dashboard — allow NULL recipients on monitoring_queries
--  V1_0_6  (MySQL / MariaDB)
--
--  recipients was created NOT NULL, but a monitoring item may have
--  no notification recipients configured. Dropping the NOT NULL
--  constraint lets the edit/create flows store NULL instead of
--  failing with "Column 'recipients' cannot be null".
-- ============================================================

ALTER TABLE monitoring_queries
    MODIFY COLUMN recipients TEXT NULL
        COMMENT 'Comma-separated email addresses';
