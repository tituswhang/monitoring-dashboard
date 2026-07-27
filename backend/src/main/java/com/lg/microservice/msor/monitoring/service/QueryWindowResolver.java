package com.lg.microservice.msor.monitoring.service;

import com.lg.microservice.msor.monitoring.common.exception.InvalidQueryWindowException;
import com.lg.microservice.msor.monitoring.model.QueryWindow;
import com.lg.microservice.msor.monitoring.props.QueryExecutionProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * Turns the run request's optional date parameters into a {@link QueryWindow}, rejecting
 * anything the service will not scan.
 *
 * <p>Deliberately does not know about monitoring items. Everything it validates is a
 * property of the dates themselves, so it can run on the request thread before the run is
 * handed off — which is the only place a bad range can still be reported as a {@code 400}.
 * Resolving the per-item default needs the item and therefore happens later, in the
 * execution service.</p>
 */
@Component
@RequiredArgsConstructor
public class QueryWindowResolver {

    private final QueryExecutionProperties queryExecutionProperties;

    /**
     * @param beginDate             first day to scan, inclusive; null to use the item's default
     * @param endDate               last day to scan, inclusive; null to use the item's default
     * @param includePastUnresolved widen to everything still open since the configured floor
     * @return the window to run, or {@code null} to mean "use this item's default lookback"
     * @throws InvalidQueryWindowException if the requested range is one the service will not scan
     */
    public QueryWindow resolve(LocalDate beginDate, LocalDate endDate, boolean includePastUnresolved) {
        LocalDate floor = queryExecutionProperties.getMinBeginDate();

        // Checked first: this mode replaces the begin date outright, so validating a supplied
        // one would reject a range that is never going to be used.
        if (includePastUnresolved) {
            return QueryWindow.ofPastUnresolved(floor);
        }

        if (beginDate == null && endDate == null) {
            return null;
        }
        if (beginDate == null || endDate == null) {
            throw new InvalidQueryWindowException(
                    "beginDate and endDate must be supplied together; got beginDate=" + beginDate
                            + " endDate=" + endDate);
        }
        if (endDate.isBefore(beginDate)) {
            throw new InvalidQueryWindowException(
                    "endDate must not precede beginDate; got " + beginDate + " to " + endDate);
        }
        if (beginDate.isBefore(floor)) {
            throw new InvalidQueryWindowException(
                    "beginDate must not precede " + floor + "; got " + beginDate
                            + ". Use includePastUnresolved=true to scan everything still open.");
        }
        // Inclusive day count, so a begin == end request is 1 day rather than 0.
        long days = ChronoUnit.DAYS.between(beginDate, endDate) + 1;
        int maxDays = queryExecutionProperties.getMaxWindowDays();
        if (days > maxDays) {
            throw new InvalidQueryWindowException(
                    "Requested window of " + days + " days exceeds the maximum of " + maxDays
                            + " days. Narrow the range, or use includePastUnresolved=true.");
        }
        return QueryWindow.of(beginDate, endDate);
    }
}
