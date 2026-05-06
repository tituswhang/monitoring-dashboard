ALTER TABLE monitoring_results
    ADD COLUMN error_detail MEDIUMTEXT NULL AFTER error_message;
