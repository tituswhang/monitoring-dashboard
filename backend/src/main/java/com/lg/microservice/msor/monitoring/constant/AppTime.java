package com.lg.microservice.msor.monitoring.constant;

import java.time.ZoneId;

/**
 * The single time zone the application reasons about dates in.
 *
 * <p>Every datasource URL already pins {@code serverTimezone=America/New_York}, so the
 * database agrees with New York regardless of the JVM's default zone. Anything that
 * stamps or compares a {@code run_date} must use {@link #APP_ZONE} for the same reason —
 * otherwise a run near midnight lands on a different calendar day than the one the
 * dashboard buckets it into.</p>
 *
 * <p>{@code America/New_York}, not {@code EST}: the former follows daylight saving, the
 * latter is fixed at UTC−5 and would be an hour off for eight months of the year.</p>
 */
public final class AppTime {

    public static final ZoneId APP_ZONE = ZoneId.of("America/New_York");

    private AppTime() {
    }
}
