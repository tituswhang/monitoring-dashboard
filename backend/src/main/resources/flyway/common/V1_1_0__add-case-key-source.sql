-- ============================================================
--  Monitoring Dashboard — case key provenance
--  V1_1_0
--  Records which CaseKeyResolver branch produced each row's
--  case_key.
--
--  Only ROW_HASH is unstable: it hashes the whole row_data, so
--  any change to any field mints a new key and the case reads as
--  brand new on the next run. Its first-seen date is therefore
--  always "today" and means nothing — surfaces that age a case by
--  first sighting must exclude ROW_HASH rows.
-- ============================================================

ALTER TABLE monitoring_result_rows
    ADD COLUMN case_key_source VARCHAR(20) NULL
        COMMENT 'INCREMENT_ID | IDENTITY_COLUMNS | ORDER_ID | ROW_HASH; NULL = written before V1_1_0';

-- Label historical rows by *recomputing* each candidate key and comparing it against
-- the key already stored. A row is labelled only when the recomputed key matches, so
-- a key produced by a branch this statement does not model (identity_columns was
-- unset before V1_1_1, so that branch cannot have fired) leaves NULL rather than
-- asserting a wrong provenance.
--
-- NULL reads as "not ROW_HASH", i.e. included in the age pie. That is the safe
-- default: the resolver stamps case_key_source on every row it writes, and the pie
-- only ever buckets the *latest* run's rows, so the column converges to exact after
-- one run per item.
--
-- SHA2(NULL) is NULL and `case_key = NULL` is NULL (never true), so a missing field
-- simply falls through to the next branch without an explicit guard.
UPDATE monitoring_result_rows
SET case_key_source = CASE
    WHEN NOT JSON_VALID(row_data) THEN NULL

    -- 1. increment_id (the order number)
    WHEN case_key = SHA2(CONCAT('inc:', COALESCE(
             NULLIF(JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.increment_id')), ''),
             NULLIF(JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.INCREMENT_ID')), ''))), 256)
        THEN 'INCREMENT_ID'

    -- 3. heuristic order_id / entity_id (branch 2 could not have fired before V1_1_1)
    WHEN case_key = SHA2(CONCAT('oid:', COALESCE(
             NULLIF(JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.order_id')), ''),
             NULLIF(JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.entity_id')), ''),
             NULLIF(JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.ORDER_ID')), ''),
             NULLIF(JSON_UNQUOTE(JSON_EXTRACT(row_data, '$.ENTITY_ID')), ''))), 256)
        THEN 'ORDER_ID'

    -- 4. full row_data
    WHEN case_key = SHA2(CONCAT('row:', row_data), 256)
        THEN 'ROW_HASH'

    ELSE NULL
END;
