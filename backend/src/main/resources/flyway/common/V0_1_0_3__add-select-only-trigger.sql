-- ============================================================
--  MSOR Monitoring Service — SELECT-only guard trigger
--  V0_1_0_3
--  Rejects any INSERT or UPDATE where sql_query does not begin
--  with SELECT (case-insensitive, leading whitespace ignored).
-- ============================================================

DELIMITER $$

CREATE TRIGGER trg_monitoring_queries_before_insert
BEFORE INSERT ON monitoring_queries
FOR EACH ROW
BEGIN
    IF LOWER(TRIM(NEW.sql_query)) NOT LIKE 'select%' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'sql_query must be a SELECT statement';
    END IF;
END$$

CREATE TRIGGER trg_monitoring_queries_before_update
BEFORE UPDATE ON monitoring_queries
FOR EACH ROW
BEGIN
    IF LOWER(TRIM(NEW.sql_query)) NOT LIKE 'select%' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'sql_query must be a SELECT statement';
    END IF;
END$$

DELIMITER ;
