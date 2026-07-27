package com.lg.microservice.msor.monitoring.common.utils;

import com.lg.microservice.msor.monitoring.model.enums.CaseKeySource;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;

class CaseKeyResolverTest {

    /** The canonical input string of each branch, hashed exactly as any SQL backfill must hash it. */
    private static String sha256Hex(String input) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder(64);
        for (byte b : hash) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }

    @Test
    void resolve_incrementIdWinsOverEverythingElse() throws Exception {
        Map<String, Object> row = Map.of("increment_id", "100482", "order_id", "77", "doc", "D1");

        CaseKeyResolver.CaseKey key = CaseKeyResolver.resolve(row, "{}", "doc");

        Assertions.assertEquals(CaseKeySource.INCREMENT_ID, key.source());
        Assertions.assertEquals(sha256Hex("inc:100482"), key.key());
    }

    /**
     * Pins the exact canonical form {@code V1_1_1}'s SQL must reproduce:
     * {@code 'idc:' + col=value pairs joined by '|', in the CONFIGURED column order}
     * (not the row's key order). A mismatch forks one case into two.
     */
    @Test
    void resolve_identityColumnsUsesConfiguredOrderNotRowOrder() throws Exception {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("orig_sys_line_ref", "2");          // deliberately first in the row
        row.put("orig_sys_document_ref", "SO-9001");

        CaseKeyResolver.CaseKey key =
                CaseKeyResolver.resolve(row, "{}", "orig_sys_document_ref,orig_sys_line_ref");

        Assertions.assertEquals(CaseKeySource.IDENTITY_COLUMNS, key.source());
        Assertions.assertEquals(
                sha256Hex("idc:orig_sys_document_ref=SO-9001|orig_sys_line_ref=2"),
                key.key());
    }

    @Test
    void resolve_identityColumnsTrimsConfiguredNames() throws Exception {
        Map<String, Object> row = Map.of("orig_sys_document_ref", "SO-9001", "orig_sys_line_ref", "2");

        CaseKeyResolver.CaseKey key =
                CaseKeyResolver.resolve(row, "{}", " orig_sys_document_ref , orig_sys_line_ref ");

        Assertions.assertEquals(
                sha256Hex("idc:orig_sys_document_ref=SO-9001|orig_sys_line_ref=2"),
                key.key());
    }

    /**
     * The resolver requires EVERY configured column. A row missing one falls through to a later
     * branch — and so must the SQL backfill, or the two disagree on exactly these rows.
     */
    @Test
    void resolve_fallsThroughWhenAnyIdentityColumnIsAbsent() throws Exception {
        Map<String, Object> row = Map.of("orig_sys_document_ref", "SO-9001", "entity_id", "555");

        CaseKeyResolver.CaseKey key =
                CaseKeyResolver.resolve(row, "{}", "orig_sys_document_ref,orig_sys_line_ref");

        Assertions.assertEquals(CaseKeySource.ORDER_ID, key.source());
        Assertions.assertEquals(sha256Hex("oid:555"), key.key());
    }

    @Test
    void resolve_fallsThroughWhenIdentityColumnIsEmpty() throws Exception {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("orig_sys_document_ref", "SO-9001");
        row.put("orig_sys_line_ref", "");

        CaseKeyResolver.CaseKey key =
                CaseKeyResolver.resolve(row, "{\"a\":1}", "orig_sys_document_ref,orig_sys_line_ref");

        Assertions.assertEquals(CaseKeySource.ROW_HASH, key.source());
        Assertions.assertEquals(sha256Hex("row:{\"a\":1}"), key.key());
    }

    @Test
    void resolve_orderIdBranchPrefersOrderIdOverEntityId() throws Exception {
        Map<String, Object> row = Map.of("order_id", "77", "entity_id", "555");

        CaseKeyResolver.CaseKey key = CaseKeyResolver.resolve(row, "{}", null);

        Assertions.assertEquals(CaseKeySource.ORDER_ID, key.source());
        Assertions.assertEquals(sha256Hex("oid:77"), key.key());
    }

    /** The unstable branch: no identity at all, so the key is the whole row and churns on any edit. */
    @Test
    void resolve_rowHashWhenNoIdentityAvailable() throws Exception {
        Map<String, Object> row = Map.of("status", "PENDING", "count", 3);
        String rowJson = "{\"status\":\"PENDING\",\"count\":3}";

        CaseKeyResolver.CaseKey key = CaseKeyResolver.resolve(row, rowJson, null);

        Assertions.assertEquals(CaseKeySource.ROW_HASH, key.source());
        Assertions.assertEquals(sha256Hex("row:" + rowJson), key.key());
    }

    /** A row-hash key changes when any field changes — the reason such cases cannot be aged. */
    @Test
    void resolve_rowHashChangesWhenAnyFieldChanges() {
        CaseKeyResolver.CaseKey before = CaseKeyResolver.resolve(Map.of("n", 1), "{\"n\":1}", null);
        CaseKeyResolver.CaseKey after = CaseKeyResolver.resolve(Map.of("n", 2), "{\"n\":2}", null);

        Assertions.assertEquals(CaseKeySource.ROW_HASH, before.source());
        Assertions.assertNotEquals(before.key(), after.key());
    }

    /** Numeric JSON values stringify the same way the SQL JSON_UNQUOTE(JSON_EXTRACT(...)) does. */
    @Test
    void resolve_identityColumnsStringifyNumericValues() throws Exception {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("orig_sys_document_ref", "SO-9001");
        row.put("orig_sys_line_ref", 2);

        CaseKeyResolver.CaseKey key =
                CaseKeyResolver.resolve(row, "{}", "orig_sys_document_ref,orig_sys_line_ref");

        Assertions.assertEquals(
                sha256Hex("idc:orig_sys_document_ref=SO-9001|orig_sys_line_ref=2"),
                key.key());
    }
}
