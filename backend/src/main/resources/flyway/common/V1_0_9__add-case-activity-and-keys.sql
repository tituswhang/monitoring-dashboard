-- ============================================================
--  Monitoring Dashboard — case activity timeline
--  V1_0_9
--  Adds a stable, order-number-based case key to each result
--  row, and an append-only activity timeline (comments, status
--  changes, and — in Phase 2 — data-drift logs) attached to
--  (msor_id, case_key) so it persists as a case recurs across
--  runs.
-- ============================================================

-- 1. Case-identity config on monitoring items -----------------
ALTER TABLE monitoring_queries
    ADD COLUMN identity_columns VARCHAR(500) NULL
        COMMENT 'Comma-separated row_data columns identifying a case (fallback when increment_id absent)',
    ADD COLUMN volatile_columns VARCHAR(500) NULL
        COMMENT 'Comma-separated row_data columns excluded from drift logging (Phase 2)';

-- 2. Stable case key on each result row -----------------------
ALTER TABLE monitoring_result_rows
    ADD COLUMN case_key VARCHAR(64) NULL
        COMMENT 'SHA-256 identity of the case (order-number based); stable across runs';

-- Best-effort backfill: increment_id -> order_id/entity_id -> full-row hash.
-- Mirrors CaseKeyResolver's canonical prefixes so keys computed here match keys
-- the app computes at insert time for the same identity. identity_columns is
-- unset at migration time, so it is not consulted here — the runtime resolver
-- applies it to rows created after this migration.
UPDATE monitoring_result_rows
SET case_key = CASE
    WHEN JSON_VALID(row_data)
         AND JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.increment_id')) IS NOT NULL
         AND JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.increment_id')) <> ''
        THEN SHA2(CONCAT('inc:', JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.increment_id'))), 256)
    WHEN JSON_VALID(row_data)
         AND JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.order_id')) IS NOT NULL
         AND JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.order_id')) <> ''
        THEN SHA2(CONCAT('oid:', JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.order_id'))), 256)
    WHEN JSON_VALID(row_data)
         AND JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.entity_id')) IS NOT NULL
         AND JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.entity_id')) <> ''
        THEN SHA2(CONCAT('oid:', JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.entity_id'))), 256)
    ELSE SHA2(CONCAT('row:', row_data), 256)
END;

ALTER TABLE monitoring_result_rows
    MODIFY COLUMN case_key VARCHAR(64) NOT NULL
        COMMENT 'SHA-256 identity of the case (order-number based); stable across runs';

CREATE INDEX ix_mrr_case_key ON monitoring_result_rows (case_key);

-- 3. Append-only activity timeline ----------------------------
CREATE TABLE monitoring_case_activity (
    activity_id   BIGINT       NOT NULL AUTO_INCREMENT,
    msor_id       INT          NOT NULL,
    case_key      VARCHAR(64)  NOT NULL,
    entry_type    VARCHAR(20)  NOT NULL COMMENT 'COMMENT | STATUS_CHANGE | DATA_CHANGE',
    author_name   VARCHAR(255) NULL     COMMENT 'Display name; NULL for System / migrated / unauthenticated',
    author_email  VARCHAR(320) NULL     COMMENT 'Stable identity (email); NULL for System / migrated',
    comment_text  TEXT         NULL     COMMENT 'For COMMENT entries',
    field_name    VARCHAR(255) NULL     COMMENT 'For STATUS_CHANGE / DATA_CHANGE entries',
    old_value     TEXT         NULL,
    new_value     TEXT         NULL,
    source_row_id BIGINT       NULL     COMMENT 'Provenance: the row_id that produced this entry',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (activity_id)
) COMMENT = 'Append-only activity timeline per monitoring case (msor_id, case_key)';

CREATE INDEX ix_mca_case ON monitoring_case_activity (msor_id, case_key, created_at);

-- 4. Backfill legacy single comments as the first COMMENT entry
INSERT INTO monitoring_case_activity
    (msor_id, case_key, entry_type, author_name, author_email, comment_text, source_row_id, created_at)
SELECT r.msor_id, rr.case_key, 'COMMENT', NULL, NULL, rr.row_comment, rr.row_id, rr.updated_at
FROM   monitoring_result_rows rr
JOIN   monitoring_results r ON rr.result_id = r.result_id
WHERE  rr.row_comment IS NOT NULL AND TRIM(rr.row_comment) <> '';
