-- ============================================================
--  Monitoring Dashboard — identity columns for case keys
--  V1_1_1  (MySQL / MariaDB)
--
--  CaseKeyResolver derives a case's stable identity in priority order:
--
--      increment_id  →  identity_columns  →  order_id / entity_id  →  whole-row hash
--
--  Only the last of those is unstable: hashing the whole row mints a new key
--  whenever any field changes, so the case reads as brand new on every run, its
--  first-seen date is always "today", and it cannot be aged (see V1_1_0, and the
--  Case Age pie which excludes ROW_HASH rows).
--
--  These items return no increment_id, so without an explicit identity they would
--  fall through to the row hash — 'Example Check 2' in particular carries an
--  error_message that changes between runs, which is exactly the churn that defeats
--  a hash-based key. Naming the columns that actually identify the case fixes each
--  one's key across runs, which is what makes the activity timeline and the case-age
--  buckets meaningful.
--
--  Columns are named as they appear in row_data (the query's own aliases).
-- ============================================================

UPDATE monitoring_queries SET identity_columns = 'id'       WHERE title = 'Example Check 1';
UPDATE monitoring_queries SET identity_columns = 'id'       WHERE title = 'Example Check 2';
UPDATE monitoring_queries SET identity_columns = 'order_id,sku' WHERE title = 'Example Check 3';
UPDATE monitoring_queries SET identity_columns = 'id'       WHERE title = 'DB3 Export Error';
UPDATE monitoring_queries SET identity_columns = 'id'       WHERE title = 'DB3 Pending Records';

-- Fields that change between runs without meaning the case changed. Excluded from
-- drift logging so a re-run does not spam the timeline with noise.
UPDATE monitoring_queries SET volatile_columns = 'error_message' WHERE title = 'Example Check 2';
UPDATE monitoring_queries SET volatile_columns = 'error_text'    WHERE title = 'DB3 Export Error';
