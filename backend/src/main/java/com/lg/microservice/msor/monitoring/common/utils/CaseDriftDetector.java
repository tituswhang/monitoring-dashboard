package com.lg.microservice.msor.monitoring.common.utils;

import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/**
 * Detects field-level changes between two snapshots of the same case (successive runs).
 *
 * <p>Two classes of columns are never reported:</p>
 * <ul>
 *   <li><b>Identity</b> columns ({@code increment_id}/{@code order_id}/{@code entity_id} plus the
 *       item's configured {@code identity_columns}) — a change here is a different case, not a drift.</li>
 *   <li><b>Volatile</b> columns — the item's configured {@code volatile_columns} plus built-in
 *       name patterns (age, elapsed, now, current*, *_time, *_ago, duration) that change every run.</li>
 * </ul>
 */
public final class CaseDriftDetector {

    private CaseDriftDetector() {
    }

    /** A single tracked-field change. Values are normalized (trimmed; blank → null). */
    public record FieldDiff(String field, String oldValue, String newValue) {
    }

    private static final Set<String> IDENTITY_FIELDS = Set.of("increment_id", "order_id", "entity_id");

    public static List<FieldDiff> diff(Map<String, Object> prior, Map<String, Object> current,
                                       String identityColumns, String volatileColumns) {
        Set<String> ignore = new HashSet<>(IDENTITY_FIELDS);
        addCsvLowercased(ignore, identityColumns);
        addCsvLowercased(ignore, volatileColumns);

        Set<String> keys = new TreeSet<>();
        keys.addAll(prior.keySet());
        keys.addAll(current.keySet());

        List<FieldDiff> diffs = new ArrayList<>();
        for (String key : keys) {
            String lower = key.toLowerCase();
            if (ignore.contains(lower) || isVolatilePattern(lower)) {
                continue;
            }
            String oldVal = normalize(prior.get(key));
            String newVal = normalize(current.get(key));
            if (!Objects.equals(oldVal, newVal)) {
                diffs.add(new FieldDiff(key, oldVal, newVal));
            }
        }
        return diffs;
    }

    /** Built-in volatile column-name patterns: age, elapsed, now, current*, *_time, *_ago, duration. */
    private static boolean isVolatilePattern(String k) {
        return k.equals("age") || k.endsWith("_age")
                || k.contains("elapsed")
                || k.contains("duration")
                || k.startsWith("now") || k.endsWith("_now")
                || k.startsWith("current")
                || k.endsWith("_time")
                || k.endsWith("_ago");
    }

    private static void addCsvLowercased(Set<String> target, String csv) {
        if (!StringUtils.hasText(csv)) {
            return;
        }
        for (String part : csv.split(",")) {
            String p = part.trim().toLowerCase();
            if (!p.isEmpty()) {
                target.add(p);
            }
        }
    }

    private static String normalize(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
