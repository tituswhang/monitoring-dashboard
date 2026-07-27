package com.lg.microservice.msor.monitoring.model;

import com.lg.microservice.msor.monitoring.constant.AppTime;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QueryWindowTest {

    @Nested
    class HalfOpenBounds {

        @Test
        void of_endIsExclusiveDayAfterTheDateRequested() {
            QueryWindow window = QueryWindow.of(LocalDate.of(2026, 7, 15), LocalDate.of(2026, 7, 22));

            assertEquals(LocalDate.of(2026, 7, 15), window.begin());
            assertEquals(LocalDate.of(2026, 7, 23), window.endExclusive());
            assertEquals(LocalDate.of(2026, 7, 22), window.endInclusive());
        }

        /**
         * The whole reason the range is half-open. A closed range ending at the requested
         * date would match only rows stamped exactly midnight, dropping the entire final
         * day — which for the default window is today, the part operators care about most.
         */
        @Test
        void of_lateEveningOnTheFinalDayIsInsideTheWindow() {
            QueryWindow window = QueryWindow.of(LocalDate.of(2026, 7, 15), LocalDate.of(2026, 7, 22));

            LocalDateTime orderPlacedTonight = LocalDateTime.of(2026, 7, 22, 23, 45);

            assertTrue(orderPlacedTonight.isAfter(window.begin().atStartOfDay()));
            assertTrue(orderPlacedTonight.isBefore(window.endExclusive().atStartOfDay()));
        }

        @Test
        void of_singleDayWindowIsValidAndCoversThatDay() {
            QueryWindow window = QueryWindow.of(LocalDate.of(2026, 7, 22), LocalDate.of(2026, 7, 22));

            assertEquals(LocalDate.of(2026, 7, 22), window.begin());
            assertEquals(LocalDate.of(2026, 7, 23), window.endExclusive());
        }

        @Test
        void of_endBeforeBegin_rejected() {
            LocalDate begin = LocalDate.of(2026, 7, 22);
            LocalDate end = LocalDate.of(2026, 7, 15);

            assertThrows(IllegalArgumentException.class, () -> QueryWindow.of(begin, end));
        }

        @Test
        void constructor_emptyRange_rejected() {
            LocalDate day = LocalDate.of(2026, 7, 22);

            assertThrows(IllegalArgumentException.class, () -> new QueryWindow(day, day, false));
        }

        @Test
        void constructor_nullBound_rejected() {
            LocalDate day = LocalDate.of(2026, 7, 22);

            assertThrows(IllegalArgumentException.class, () -> new QueryWindow(null, day, false));
            assertThrows(IllegalArgumentException.class, () -> new QueryWindow(day, null, false));
        }
    }

    @Nested
    class Defaults {

        @Test
        void ofDefault_spansLookbackDaysThroughTodayInclusive() {
            QueryWindow window = QueryWindow.ofDefault(7);
            LocalDate today = LocalDate.now(AppTime.APP_ZONE);

            assertEquals(today.minusDays(7), window.begin());
            assertEquals(today, window.endInclusive());
            assertEquals(today.plusDays(1), window.endExclusive());
            assertFalse(window.pastUnresolved());
        }

        /**
         * "Today" must be Eastern, never UTC. Between 20:00 and midnight ET the UTC date is
         * already tomorrow; deriving the window from it would slide both bounds forward a
         * day and silently drop a day of orders off the bottom of every report.
         */
        @Test
        void ofDefault_todayIsEasternNotUtc() {
            ZonedDateTime lateEveningEastern =
                    ZonedDateTime.of(2026, 7, 22, 22, 30, 0, 0, AppTime.APP_ZONE);
            LocalDate easternDate = lateEveningEastern.toLocalDate();
            LocalDate utcDate = lateEveningEastern.withZoneSameInstant(ZoneId.of("UTC")).toLocalDate();

            // Precondition: the two zones really do disagree at this instant.
            assertEquals(LocalDate.of(2026, 7, 22), easternDate);
            assertEquals(LocalDate.of(2026, 7, 23), utcDate);

            assertEquals(LocalDate.now(AppTime.APP_ZONE), QueryWindow.ofDefault(7).endInclusive());
        }
    }

    @Nested
    class PastUnresolved {

        @Test
        void ofPastUnresolved_reachesBackToFloorAndFlagsTheRun() {
            LocalDate floor = LocalDate.of(2026, 7, 1);

            QueryWindow window = QueryWindow.ofPastUnresolved(floor);

            assertEquals(floor, window.begin());
            assertEquals(LocalDate.now(AppTime.APP_ZONE), window.endInclusive());
            assertTrue(window.pastUnresolved());
        }

        @Test
        void ofPastUnresolved_isASupersetOfTheDefaultWindow() {
            QueryWindow wide = QueryWindow.ofPastUnresolved(LocalDate.of(2026, 7, 1));
            QueryWindow narrow = QueryWindow.ofDefault(7);

            assertTrue(!wide.begin().isAfter(narrow.begin()));
            assertEquals(narrow.endExclusive(), wide.endExclusive());
        }

        @Test
        void ofDefault_isNotFlaggedAsPastUnresolved() {
            assertFalse(QueryWindow.ofDefault(7).pastUnresolved());
            assertFalse(QueryWindow.of(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 22)).pastUnresolved());
        }
    }
}
