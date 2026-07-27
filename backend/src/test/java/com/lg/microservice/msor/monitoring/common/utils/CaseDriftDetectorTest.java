package com.lg.microservice.msor.monitoring.common.utils;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

class CaseDriftDetectorTest {

    @Test
    void diff_detectsChangedTrackedField() {
        Map<String, Object> prior = Map.of("increment_id", "100482", "cost", "1200", "customer", "J. Doe");
        Map<String, Object> current = Map.of("increment_id", "100482", "cost", "1080", "customer", "J. Doe");

        List<CaseDriftDetector.FieldDiff> diffs = CaseDriftDetector.diff(prior, current, null, null);

        Assertions.assertEquals(1, diffs.size());
        Assertions.assertEquals("cost", diffs.get(0).field());
        Assertions.assertEquals("1200", diffs.get(0).oldValue());
        Assertions.assertEquals("1080", diffs.get(0).newValue());
    }

    @Test
    void diff_ignoresIdentityAndBuiltInVolatileColumns() {
        Map<String, Object> prior = Map.of(
                "increment_id", "1", "order_id", "10", "age", "5", "elapsed_days", "2", "created_time", "a", "amount", "100");
        Map<String, Object> current = Map.of(
                "increment_id", "1", "order_id", "10", "age", "6", "elapsed_days", "3", "created_time", "b", "amount", "100");

        List<CaseDriftDetector.FieldDiff> diffs = CaseDriftDetector.diff(prior, current, null, null);

        Assertions.assertTrue(diffs.isEmpty(), "identity + volatile changes must be ignored");
    }

    @Test
    void diff_respectsConfiguredVolatileColumns() {
        Map<String, Object> prior = Map.of("increment_id", "1", "status_note", "x", "amount", "100");
        Map<String, Object> current = Map.of("increment_id", "1", "status_note", "y", "amount", "100");

        Assertions.assertTrue(CaseDriftDetector.diff(prior, current, null, "status_note").isEmpty());

        List<CaseDriftDetector.FieldDiff> diffs = CaseDriftDetector.diff(prior, current, null, null);
        Assertions.assertEquals(1, diffs.size());
        Assertions.assertEquals("status_note", diffs.get(0).field());
    }

    @Test
    void diff_treatsBlankAndNullAsEqual() {
        Map<String, Object> prior = new HashMap<>();
        prior.put("increment_id", "1");
        prior.put("note", "  ");
        Map<String, Object> current = new HashMap<>();
        current.put("increment_id", "1");
        current.put("note", null);

        Assertions.assertTrue(CaseDriftDetector.diff(prior, current, null, null).isEmpty());
    }
}
