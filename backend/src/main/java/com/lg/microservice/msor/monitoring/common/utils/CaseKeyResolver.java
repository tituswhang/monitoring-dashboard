package com.lg.microservice.msor.monitoring.common.utils;

import com.lg.microservice.msor.monitoring.model.enums.CaseKeySource;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Resolves a stable, order-number-based case key for a result row. The key is a
 * SHA-256 hash of a canonical identity string, so it is fixed-length, URL-safe,
 * and identical for the same logical case across runs.
 *
 * <p>Resolution priority (matches the {@code V1_0_9} SQL backfill for the
 * increment_id / order_id / entity_id / full-row branches, and the {@code V1_1_1} backfill
 * for the identity_columns branch):</p>
 * <ol>
 *   <li>{@code increment_id} — the order number (default case identity).</li>
 *   <li>the item's configured {@code identity_columns} — for non-order items.</li>
 *   <li>heuristic {@code order_id} / {@code entity_id} internal keys.</li>
 *   <li>a hash of the full {@code row_data} JSON (degrades to today's behavior).</li>
 * </ol>
 *
 * <p>Any SQL that recomputes {@code case_key} must reproduce the canonical input string of the
 * matching branch exactly — {@code "idc:"} + {@code col=value} pairs joined by {@code |}, in the
 * configured column order, and only when <em>every</em> configured column is present. A mismatch
 * silently forks one case into two.</p>
 */
public final class CaseKeyResolver {

    private CaseKeyResolver() {
    }

    /**
     * A resolved case key together with the strategy that produced it.
     *
     * @param key    a 64-char lowercase hex SHA-256 case key (never null)
     * @param source which branch produced {@code key}; {@link CaseKeySource#ROW_HASH} means the key
     *               churns whenever any field of the row changes
     */
    public record CaseKey(String key, CaseKeySource source) {
    }

    /**
     * @param rowData     the parsed result row
     * @param rowDataJson the exact JSON string stored in {@code row_data} (hashed for the full-row fallback,
     *                    so it must match what the SQL backfill sees)
     * @param identityColumns the item's {@code identity_columns} config (may be null/blank)
     * @return the case key and the strategy that produced it (never null)
     */
    public static CaseKey resolve(Map<String, Object> rowData, String rowDataJson, String identityColumns) {
        // 1. increment_id (the order number)
        String incrementId = value(rowData, "increment_id", "INCREMENT_ID");
        if (StringUtils.hasText(incrementId)) {
            return new CaseKey(sha256Hex("inc:" + incrementId), CaseKeySource.INCREMENT_ID);
        }

        // 2. configured identity columns (all must be present)
        if (StringUtils.hasText(identityColumns)) {
            List<String> parts = new ArrayList<>();
            boolean allPresent = true;
            for (String rawCol : identityColumns.split(",")) {
                String col = rawCol.trim();
                if (col.isEmpty()) {
                    continue;
                }
                String v = value(rowData, col);
                if (!StringUtils.hasText(v)) {
                    allPresent = false;
                    break;
                }
                parts.add(col + "=" + v);
            }
            if (allPresent && !parts.isEmpty()) {
                return new CaseKey(sha256Hex("idc:" + String.join("|", parts)), CaseKeySource.IDENTITY_COLUMNS);
            }
        }

        // 3. heuristic order_id / entity_id
        String orderId = value(rowData, "order_id", "entity_id", "ORDER_ID", "ENTITY_ID");
        if (StringUtils.hasText(orderId)) {
            return new CaseKey(sha256Hex("oid:" + orderId), CaseKeySource.ORDER_ID);
        }

        // 4. full row_data
        return new CaseKey(sha256Hex("row:" + rowDataJson), CaseKeySource.ROW_HASH);
    }

    /** First non-null value among the given keys, as a raw (untrimmed) string, or null. */
    private static String value(Map<String, Object> rowData, String... keys) {
        if (rowData == null) {
            return null;
        }
        for (String key : keys) {
            Object v = rowData.get(key);
            if (v != null) {
                String s = String.valueOf(v);
                if (!s.isEmpty()) {
                    return s;
                }
            }
        }
        return null;
    }

    private static String sha256Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : hash) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available", e);
        }
    }
}
