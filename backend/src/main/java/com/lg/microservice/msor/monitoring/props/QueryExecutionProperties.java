package com.lg.microservice.msor.monitoring.props;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * Bounds on a single monitoring query run against a target DB.
 *
 * <p>Monitoring queries are operator-authored SQL executed on production databases
 * (Database1, DATABASE3) on a schedule. Without a bound, one bad query holds a connection
 * open indefinitely and streams an unbounded result set into heap.
 */
@Data
@Component
@ConfigurationProperties(prefix = "monitoring.query-execution")
public class QueryExecutionProperties {

    /** Seconds a single query may run before the driver cancels it. */
    private int timeoutSeconds = 300;

    /**
     * Rows a single query may return. Exceeding this fails the run rather than
     * truncating it — see {@code TargetDbQueryService}.
     */
    private int maxRows = 50_000;

    /**
     * How far back a scheduled run looks by default: the window is the last
     * {@code defaultLookbackDays} days through today inclusive.
     */
    private int defaultLookbackDays = 7;

    /**
     * The earliest date any window may begin, and the floor the "show past unresolved
     * cases" scan reaches back to.
     *
     * <p>Matches the floor {@code V1_1_5} pinned every seeded query to. It bounds the
     * widened scan, and stops an operator-supplied begin date from turning into a
     * full-history scan of a production table.</p>
     */
    private LocalDate minBeginDate = LocalDate.parse("2026-07-01");

    /**
     * Widest window an operator may request. Does <b>not</b> apply to the "show past
     * unresolved cases" scan, whose width is the point — {@link #minBeginDate} bounds
     * that one instead.
     */
    private int maxWindowDays = 180;

    /**
     * Seconds a "show past unresolved cases" run may take. Longer than
     * {@link #timeoutSeconds} because it deliberately scans back to
     * {@link #minBeginDate} rather than over the rolling window.
     */
    private int pastUnresolvedTimeoutSeconds = 600;

}
