-- ============================================================
--  Monitoring Dashboard — suppressed-case count
--  V1_1_4
--
--  A case whose current status is DONE is withheld from every later
--  run (MonitoringExecutionService#withoutDoneCases): its row is not
--  inserted, not counted in result_count, and not alerted on.
--
--  Without this column, a run that matched 12 rows and withheld all 12
--  is indistinguishable from a run that matched nothing — both report
--  result_count = 0. Those mean opposite things to an operator: the
--  first is "triage is caught up", the second is "the condition
--  cleared" (or the query is broken).
--
--  Backfilling 0 is accurate rather than merely convenient: every
--  historical run predates suppression, so none of them withheld a row.
-- ============================================================

ALTER TABLE monitoring_results
    ADD COLUMN suppressed_count INT NOT NULL DEFAULT 0
        COMMENT 'Rows the query returned that were withheld because their case is already DONE';
