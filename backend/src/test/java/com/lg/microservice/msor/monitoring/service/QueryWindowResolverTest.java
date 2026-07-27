package com.lg.microservice.msor.monitoring.service;

import com.lg.microservice.msor.monitoring.common.exception.InvalidQueryWindowException;
import com.lg.microservice.msor.monitoring.constant.AppTime;
import com.lg.microservice.msor.monitoring.model.QueryWindow;
import com.lg.microservice.msor.monitoring.props.QueryExecutionProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QueryWindowResolverTest {

    private static final LocalDate FLOOR = LocalDate.of(2026, 7, 1);

    private QueryWindowResolver resolver;

    @BeforeEach
    void setUp() {
        QueryExecutionProperties props = new QueryExecutionProperties();
        props.setMinBeginDate(FLOOR);
        props.setMaxWindowDays(180);
        props.setDefaultLookbackDays(7);
        resolver = new QueryWindowResolver(props);
    }

    @Test
    void resolve_noDates_deferstoPerItemDefault() {
        assertNull(resolver.resolve(null, null, false));
    }

    @Test
    void resolve_explicitRange_isInclusiveOfBothEnds() {
        QueryWindow window = resolver.resolve(LocalDate.of(2026, 7, 15), LocalDate.of(2026, 7, 22), false);

        assertEquals(LocalDate.of(2026, 7, 15), window.begin());
        assertEquals(LocalDate.of(2026, 7, 22), window.endInclusive());
        assertFalse(window.pastUnresolved());
    }

    @Test
    void resolve_sameDayRange_isOneDayNotZero() {
        LocalDate day = LocalDate.of(2026, 7, 22);

        QueryWindow window = resolver.resolve(day, day, false);

        assertEquals(day, window.begin());
        assertEquals(day, window.endInclusive());
    }

    @Test
    void resolve_onlyOneDateSupplied_rejected() {
        LocalDate day = LocalDate.of(2026, 7, 22);

        assertThrows(InvalidQueryWindowException.class, () -> resolver.resolve(day, null, false));
        assertThrows(InvalidQueryWindowException.class, () -> resolver.resolve(null, day, false));
    }

    @Test
    void resolve_endBeforeBegin_rejected() {
        assertThrows(InvalidQueryWindowException.class,
                () -> resolver.resolve(LocalDate.of(2026, 7, 22), LocalDate.of(2026, 7, 15), false));
    }

    @Test
    void resolve_beginBelowFloor_rejected() {
        assertThrows(InvalidQueryWindowException.class,
                () -> resolver.resolve(FLOOR.minusDays(1), LocalDate.of(2026, 7, 22), false));
    }

    @Test
    void resolve_beginExactlyOnFloor_accepted() {
        QueryWindow window = resolver.resolve(FLOOR, LocalDate.of(2026, 7, 22), false);

        assertEquals(FLOOR, window.begin());
    }

    @Test
    void resolve_windowWiderThanCap_rejected() {
        assertThrows(InvalidQueryWindowException.class,
                () -> resolver.resolve(FLOOR, FLOOR.plusDays(180), false)); // 181 days inclusive
    }

    @Test
    void resolve_windowExactlyAtCap_accepted() {
        QueryWindow window = resolver.resolve(FLOOR, FLOOR.plusDays(179), false); // 180 days inclusive

        assertEquals(FLOOR, window.begin());
    }

    /** The toggle replaces the begin date outright, so the width cap must not apply to it. */
    @Test
    void resolve_pastUnresolved_reachesFloorAndBypassesTheWidthCap() {
        QueryWindow window = resolver.resolve(null, null, true);

        assertEquals(FLOOR, window.begin());
        assertEquals(LocalDate.now(AppTime.APP_ZONE), window.endInclusive());
        assertTrue(window.pastUnresolved());
    }

    /**
     * The widened scan ignores a supplied begin date rather than validating it. Rejecting a
     * range that is about to be discarded would fail a request that was going to succeed.
     */
    @Test
    void resolve_pastUnresolvedWithOtherwiseInvalidDates_stillAccepted() {
        QueryWindow window = resolver.resolve(FLOOR.minusYears(5), LocalDate.of(2026, 1, 1), true);

        assertEquals(FLOOR, window.begin());
        assertTrue(window.pastUnresolved());
    }
}
