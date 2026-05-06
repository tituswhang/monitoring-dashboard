-- ============================================================
--  MSOR Monitoring Service — normalize result storage
--  V0_1_0_5
--  Each SQL result row becomes its own record in
--  monitoring_result_rows instead of a single JSON blob.
--  result_id acts as the batch ID.
-- ============================================================

CREATE TABLE monitoring_result_rows (
    row_id    BIGINT   NOT NULL AUTO_INCREMENT,
    result_id BIGINT   NOT NULL,
    row_index INT      NOT NULL COMMENT 'Zero-based position of this row in the original result set',
    row_data  LONGTEXT NOT NULL COMMENT 'JSON object for the single result row',
    PRIMARY KEY (row_id),
    CONSTRAINT fk_mrr_result_id FOREIGN KEY (result_id)
        REFERENCES monitoring_results (result_id) ON DELETE CASCADE
) COMMENT = 'Individual rows from monitoring query executions';

CREATE INDEX ix_mrr_result_id ON monitoring_result_rows (result_id);

ALTER TABLE monitoring_results DROP COLUMN result_snapshot;
