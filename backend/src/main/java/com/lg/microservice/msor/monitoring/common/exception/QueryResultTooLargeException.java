package com.lg.microservice.msor.monitoring.common.exception;

import java.sql.SQLException;

/**
 * Raised when a monitoring query returns more rows than the configured cap.
 *
 * <p>Deliberately an error rather than a silent truncation: a monitoring run reports
 * {@code result_count}, and operators read a low count as "the condition cleared".
 * A truncated result would report a plausible-looking number that is simply wrong.
 * Failing loudly puts the item in FAIL with a message that names the cap instead.
 */
public class QueryResultTooLargeException extends SQLException {

    public QueryResultTooLargeException(int maxRows) {
        super("Query returned more than the configured maximum of " + maxRows
                + " rows. Narrow the query, or raise monitoring.query-execution.max-rows.");
    }
}
