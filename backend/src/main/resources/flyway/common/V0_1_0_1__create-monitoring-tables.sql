-- ============================================================
--  Monitoring Dashboard — initial schema
--  V0_1_0_1  (MySQL)
-- ============================================================

-- ----------------------------------------------------------
--  monitoring_queries
--  Source of truth for all monitoring items.
--  The application user should have SELECT-only access;
--  all modifications must go through a DBA or admin tool.
-- ----------------------------------------------------------
CREATE TABLE monitoring_queries (
    msor_id            INT          NOT NULL AUTO_INCREMENT,
    title              VARCHAR(200) NOT NULL,
    description        TEXT,
    sql_query          MEDIUMTEXT   NOT NULL COMMENT 'SQL query to execute against the target database',
    query_interval     VARCHAR(100) NOT NULL COMMENT 'Spring 6-field cron expression, e.g. 0 30 8 * * MON-FRI',
    sheet_name         VARCHAR(100) NOT NULL,
    owner_name         VARCHAR(100),
    owner_email        VARCHAR(200),
    recipients         TEXT         NOT NULL COMMENT 'Comma-separated email addresses',
    active_yn          CHAR(1)      NOT NULL DEFAULT 'Y',
    frequent_yn        CHAR(1)      NOT NULL DEFAULT 'N' COMMENT 'Y = frequent path (result+DW sync); N = alert-only path',
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (msor_id)
) COMMENT = 'Monitoring item definitions — SELECT-only for app user';

-- ----------------------------------------------------------
--  item_history
--  Records column-level changes on monitoring_queries.
--  Populated via the V0_1_0_3 trigger migration.
-- ----------------------------------------------------------
CREATE TABLE item_history (
    history_id    BIGINT       NOT NULL AUTO_INCREMENT,
    msor_id       INT          NOT NULL,
    changed_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_field VARCHAR(100) NOT NULL,
    old_value     TEXT,
    new_value     TEXT,
    PRIMARY KEY (history_id)
);

CREATE INDEX ix_item_history_msor_id ON item_history (msor_id);

-- ----------------------------------------------------------
--  monitoring_results
--  One row per monitoring item execution.
--  UNIQUE(msor_id, run_at) prevents duplicate writes on retry.
-- ----------------------------------------------------------
CREATE TABLE monitoring_results (
    result_id           BIGINT       NOT NULL AUTO_INCREMENT,
    msor_id             INT          NOT NULL,
    run_at              DATETIME     NOT NULL,
    run_date            DATE         NOT NULL,
    result_count        INT          NOT NULL DEFAULT 0,
    result_status       VARCHAR(20)  NOT NULL COMMENT 'SUCCESS | FAIL | SKIPPED',
    result_snapshot     MEDIUMTEXT            COMMENT 'Serialized JSON result payload (truncated if large)',
    execution_ms        INT                   COMMENT 'Query execution time in milliseconds',
    error_message       TEXT,
    triggered_alert_yn  CHAR(1)      NOT NULL DEFAULT 'N' COMMENT 'Y once email/Slack alert has been sent for this run',
    dw_synced_yn        CHAR(1)      NOT NULL DEFAULT 'N' COMMENT 'Y after result synced to DW (frequent_yn=Y items only)',
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (result_id),
    CONSTRAINT uq_monitoring_results_msor_run UNIQUE (msor_id, run_at),
    CONSTRAINT fk_monitoring_results_msor_id  FOREIGN KEY (msor_id) REFERENCES monitoring_queries (msor_id)
);

CREATE INDEX ix_monitoring_results_run_date ON monitoring_results (run_date);
