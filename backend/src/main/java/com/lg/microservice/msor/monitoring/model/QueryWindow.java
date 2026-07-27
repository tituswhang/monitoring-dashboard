package com.lg.microservice.msor.monitoring.model;

import com.lg.microservice.msor.monitoring.constant.AppTime;

import java.time.LocalDate;

/**
 * The date range a monitoring query is run over, supplied to the target DB as the
 * {@code @begin_date} / {@code @end_date} session variables.
 *
 * <p><b>Half-open.</b> {@code endExclusive} is the day <i>after</i> the last day the
 * operator asked for, and queries compare {@code col < @end_date}. A closed range
 * (`BETWEEN`) against a {@code DATETIME} column would match only rows stamped exactly
 * midnight on the final day — i.e. it would drop everything that happened today, which
 * is the set the dashboard exists to show. The "+1 day" is applied here and nowhere
 * else; every caller, API parameter and UI control speaks inclusive dates.</p>
 *
 * <p><b>Eastern.</b> "Today" is resolved in {@link AppTime#APP_ZONE}, not the JVM
 * default and not the target DB's {@code CURDATE()}. Between 20:00 and midnight ET a
 * UTC-derived today is already tomorrow, which would slide the whole window forward a
 * day and silently drop a day of orders off the bottom.</p>
 *
 * @param begin          first instant included (inclusive)
 * @param endExclusive   first instant excluded
 * @param pastUnresolved whether this is the widened "show past unresolved cases" scan,
 *                       which reaches back to the configured floor instead of the
 *                       rolling lookback. Such a run is an operator investigation
 *                       rather than a monitor tick, so it must not alert or sync.
 */
public record QueryWindow(LocalDate begin, LocalDate endExclusive, boolean pastUnresolved) {

    /**
     * The token whose presence in a query's text marks it as windowed. Items not yet migrated
     * carry a literal date floor instead, ignore any window supplied to them, and are run
     * unchanged — so this is also what tells the API whether offering a date range to a caller
     * would mean anything.
     */
    public static final String BEGIN_DATE_TOKEN = "@begin_date";

    /** True if {@code sql} takes its date range from this window rather than a literal floor. */
    public static boolean isWindowed(String sql) {
        return sql != null && sql.contains(BEGIN_DATE_TOKEN);
    }

    public QueryWindow {
        if (begin == null || endExclusive == null) {
            throw new IllegalArgumentException("Query window bounds must not be null");
        }
        if (!endExclusive.isAfter(begin)) {
            throw new IllegalArgumentException(
                    "Query window end must be after begin, got begin=" + begin + " end=" + endExclusive);
        }
    }

    /**
     * Builds a window from the two dates an operator picked, both inclusive.
     *
     * @throws IllegalArgumentException if {@code endInclusive} precedes {@code beginInclusive}
     */
    public static QueryWindow of(LocalDate beginInclusive, LocalDate endInclusive) {
        return new QueryWindow(beginInclusive, endInclusive.plusDays(1), false);
    }

    /** The default scheduled window: the last {@code lookbackDays} days, ending today inclusive. */
    public static QueryWindow ofDefault(int lookbackDays) {
        LocalDate today = LocalDate.now(AppTime.APP_ZONE);
        return of(today.minusDays(lookbackDays), today);
    }

    /**
     * The widened window: everything from {@code floor} through today inclusive. Used by the
     * "show past unresolved cases" toggle; the per-request width cap does not apply to it,
     * because the width is the point — {@code floor} is what bounds it instead.
     */
    public static QueryWindow ofPastUnresolved(LocalDate floor) {
        LocalDate today = LocalDate.now(AppTime.APP_ZONE);
        return new QueryWindow(floor, today.plusDays(1), true);
    }

    /** The last day included, as an operator would state it. */
    public LocalDate endInclusive() {
        return endExclusive.minusDays(1);
    }

    @Override
    public String toString() {
        return "[" + begin + ", " + endExclusive + ")" + (pastUnresolved ? " +past-unresolved" : "");
    }
}
