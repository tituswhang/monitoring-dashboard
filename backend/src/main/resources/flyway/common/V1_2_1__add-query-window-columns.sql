-- ============================================================
--  Monitoring Dashboard — window configuration and audit columns
--  V1_2_1  (MySQL / MariaDB)
--
--  V1_2_0 made the monitoring items take their date range from the service.
--  This adds the two things that range now needs around it:
--
--    1. monitoring_queries.default_lookback_days — how far back a scheduled run
--       looks, per item. The 7-day default is the request; items that accumulate
--       long-lived open cases can be widened without editing their SQL.
--
--    2. monitoring_results.begin_date / end_date / past_unresolved_yn — the window
--       a run actually used. A row count is not interpretable without it: after
--       V1_2_0 a "0" can mean "nothing is broken" or "nothing broke in these seven
--       days", and those are very different reports.
--
--  ALTER TABLE does not fire the V0_1_0_3 guard trigger (it is a row trigger on
--  INSERT/UPDATE), and neither table's sql_query is touched, so the guard is
--  unaffected.
-- ============================================================

-- ---------------------------------------------------------------- per-item lookback
--
--  SMALLINT: the widest sensible lookback is a couple of years; the widened
--  "past unresolved cases" scan does not use this column at all, it reaches back to
--  the configured floor instead.
--
--  NOT NULL DEFAULT 7 so every existing row gets the default the feedback asked for,
--  and so MonitoringQueryRepository.insertMonitoringQuery — which does not name this
--  column — keeps working unchanged.
ALTER TABLE monitoring_queries
    ADD COLUMN default_lookback_days SMALLINT NOT NULL DEFAULT 7
        COMMENT 'Days a scheduled run looks back; window is [today - N, today] inclusive';

-- ---------------------------------------------------------------- window audit
--
--  begin_date / end_date are NULLable: every run recorded before this migration has
--  no window, and NULL says that honestly. A default of some invented date would make
--  historical runs claim a range they never used.
--
--  end_date stores the INCLUSIVE last day, matching what the operator picked and what
--  the API and UI speak. QueryWindow holds the exclusive bound internally; the +1 day
--  is an implementation detail of the SQL predicate and must not leak into the audit
--  trail, or every stored range would read as a day longer than it was.
ALTER TABLE monitoring_results
    ADD COLUMN begin_date DATE NULL
        COMMENT 'First day scanned (inclusive); NULL for runs before V1_2_1',
    ADD COLUMN end_date DATE NULL
        COMMENT 'Last day scanned (inclusive); NULL for runs before V1_2_1',
    ADD COLUMN past_unresolved_yn CHAR(1) NOT NULL DEFAULT 'N'
        COMMENT 'Y = widened "show past unresolved cases" scan; not comparable with daily runs';

-- ============================================================
--  Considered and deliberately NOT done here
--
--  * monitoring_result_rows.first_seen_at — the plan called for storing each case's
--    first-seen date so the UI could show "open 21 days". It is already derived:
--    MonitoringResultRowRepository.findAllCasesRows computes
--        MIN(r.run_date) OVER (PARTITION BY r.msor_id, rr.case_key)
--    and returns it as the `runDate` field of AllCasesRowResponse, which the
--    dashboard's Case Age pie already buckets on (see CASE_AGE_DESCRIPTION —
--    "a case keeps its original first-seen date when it recurs").
--
--    Storing it as well would create a second source of truth for the same fact,
--    needing a backfill for every existing row and able to disagree with the window
--    function afterwards. The stated reason for storing it — that it does not go
--    stale — is already satisfied: the window function recomputes it per query.
-- ============================================================
