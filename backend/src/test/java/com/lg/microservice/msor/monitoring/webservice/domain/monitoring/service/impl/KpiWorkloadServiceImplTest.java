package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.impl;

import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.constant.AppTime;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringCaseActivity;
import com.lg.microservice.msor.monitoring.model.response.CaseRef;
import com.lg.microservice.msor.monitoring.model.response.CaseWorkloadProjection;
import com.lg.microservice.msor.monitoring.model.response.CaseWorkloadResponse;
import com.lg.microservice.msor.monitoring.model.response.PersonWorkload;
import com.lg.microservice.msor.monitoring.repository.MonitoringCaseActivityRepository;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.Collection;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;

@SpringBootTest(classes = KpiWorkloadServiceImplTest.class)
class KpiWorkloadServiceImplTest {

    private static final String ALICE = "alice@example.com";
    private static final String BOB = "bob@example.com";
    private static final String JULY = "2026-07";

    @Mock
    private MonitoringCaseActivityRepository activityRepository;

    @InjectMocks
    private KpiWorkloadServiceImpl kpiWorkloadService;

    // ── Month boundaries ─────────────────────────────────────────────────────

    @Test
    void getCaseWorkload_month_queriesAHalfOpenRangeOverThatMonth() {
        stubWorkload();

        kpiWorkloadService.getCaseWorkload(JULY, viewer(ALICE));

        ArgumentCaptor<LocalDateTime> from = ArgumentCaptor.forClass(LocalDateTime.class);
        ArgumentCaptor<LocalDateTime> toExclusive = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(activityRepository).findCaseWorkload(anyCollection(), from.capture(), toExclusive.capture());

        // An entry at 23:59:59 on Jul 31 is in July; midnight on Aug 1 is not.
        Assertions.assertEquals(LocalDateTime.parse("2026-07-01T00:00:00"), from.getValue());
        Assertions.assertEquals(LocalDateTime.parse("2026-08-01T00:00:00"), toExclusive.getValue());
    }

    @Test
    void getCaseWorkload_noMonth_defaultsToTheCurrentMonthInTheAppZone() {
        stubWorkload();

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(null, viewer(ALICE));

        // The app's zone, never the JVM default: a browser or server elsewhere must not shift the month.
        Assertions.assertEquals(YearMonth.now(AppTime.APP_ZONE).toString(), response.month());
    }

    @Test
    void getCaseWorkload_blankMonth_defaultsRatherThanFailing() {
        stubWorkload();

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload("   ", viewer(ALICE));

        Assertions.assertEquals(YearMonth.now(AppTime.APP_ZONE).toString(), response.month());
    }

    @Test
    void getCaseWorkload_malformedMonth_throwsRatherThanSilentlyFallingBack() {
        assertRejected("2026-13");   // no thirteenth month
        assertRejected("2026-7");    // single-digit month
        assertRejected("2026-00");   // no zeroth month
        assertRejected("garbage");
        assertRejected("2026");
    }

    @Test
    void getCaseWorkload_month_isEchoedBack() {
        stubWorkload();

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, viewer(ALICE));

        Assertions.assertEquals(JULY, response.month());
    }

    // ── The floor ────────────────────────────────────────────────────────────

    @Test
    void getCaseWorkload_earliestMonth_isTheMonthOfTheFirstTouch() {
        stubWorkload();
        doReturn(LocalDateTime.parse("2026-07-08T14:30:00")).when(activityRepository)
                .findEarliestActivity(anyCollection());

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, viewer(ALICE));

        Assertions.assertEquals(JULY, response.earliestMonth());
    }

    @Test
    void getCaseWorkload_emptyTimeline_reportsNoFloor() {
        stubWorkload();
        doReturn(null).when(activityRepository).findEarliestActivity(anyCollection());

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, viewer(ALICE));

        Assertions.assertNull(response.earliestMonth());
    }

    // ── Attribution ──────────────────────────────────────────────────────────

    @Test
    void getCaseWorkload_onlyHumanEntryTypes_areCounted() {
        stubWorkload();

        kpiWorkloadService.getCaseWorkload(JULY, viewer(ALICE));

        ArgumentCaptor<Collection<String>> types = captureTypes();
        verify(activityRepository).findCaseWorkload(types.capture(), any(), any());

        // DATA_CHANGE is authored by drift detection, not by a person.
        Assertions.assertEquals(
                List.of(MonitoringCaseActivity.TYPE_COMMENT, MonitoringCaseActivity.TYPE_STATUS_CHANGE),
                List.copyOf(types.getValue()));
        Assertions.assertFalse(types.getValue().contains(MonitoringCaseActivity.TYPE_DATA_CHANGE));
    }

    @Test
    void getCaseWorkload_oneCaseTouchedByTwoPeople_appearsUnderBoth() {
        stubWorkload(touch(ALICE, "Alice", 1, "case-a"), touch(BOB, "Bob", 1, "case-a"));

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, viewer(ALICE));

        Assertions.assertEquals(2, response.people().size());
        Assertions.assertEquals(List.of(new CaseRef(1, "case-a")), person(response, ALICE).cases());
        Assertions.assertEquals(List.of(new CaseRef(1, "case-a")), person(response, BOB).cases());
    }

    @Test
    void getCaseWorkload_personWithSeveralCases_getsThemAllOrderedByItemThenKey() {
        stubWorkload(
                touch(ALICE, "Alice", 2, "case-b"),
                touch(ALICE, "Alice", 1, "case-z"),
                touch(ALICE, "Alice", 1, "case-a"));

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, viewer(BOB));

        Assertions.assertEquals(
                List.of(new CaseRef(1, "case-a"), new CaseRef(1, "case-z"), new CaseRef(2, "case-b")),
                person(response, ALICE).cases());
    }

    @Test
    void getCaseWorkload_nameChurn_collapsesToOneDisplayNamePerEmail() {
        // The same person, one case named before they had a Cognito name attribute.
        stubWorkload(touch(ALICE, null, 1, "case-a"), touch(ALICE, "Alice", 2, "case-b"));

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, viewer(BOB));

        Assertions.assertEquals(1, response.people().size());
        Assertions.assertEquals("Alice", person(response, ALICE).authorName());
    }

    @Test
    void getCaseWorkload_userWithNoName_hasANullNameNotAUuid() {
        stubWorkload(touch(ALICE, null, 1, "case-a"));

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, viewer(BOB));

        Assertions.assertNull(person(response, ALICE).authorName());
        Assertions.assertEquals(ALICE, person(response, ALICE).authorEmail());
    }

    @Test
    void getCaseWorkload_isYou_flagsExactlyTheCaller() {
        stubWorkload(touch(ALICE, "Alice", 1, "case-a"), touch(BOB, "Bob", 1, "case-b"));

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, viewer("ALICE@example.com"));

        Assertions.assertTrue(person(response, ALICE).isYou(), "email comparison must ignore case");
        Assertions.assertFalse(person(response, BOB).isYou());
    }

    @Test
    void getCaseWorkload_anonymousViewer_flagsNobody() {
        stubWorkload(touch(ALICE, "Alice", 1, "case-a"));

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, AuthenticatedUser.anonymous());

        Assertions.assertFalse(person(response, ALICE).isYou());
    }

    // ── Unattributed ─────────────────────────────────────────────────────────

    @Test
    void getCaseWorkload_authorlessTouch_landsInUnattributedNotInAPie() {
        stubWorkload(touch(null, null, 3, "legacy"), touch(ALICE, "Alice", 1, "case-a"));

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, viewer(ALICE));

        Assertions.assertEquals(1, response.people().size());
        Assertions.assertEquals(List.of(new CaseRef(3, "legacy")), response.unattributed());
    }

    @Test
    void getCaseWorkload_caseTouchedByBothAPersonAndNoOne_belongsToThePerson() {
        // A legacy comment on a case Alice also worked this month. It is hers, not nobody's —
        // otherwise the same case is both credited and disowned, and the totals stop reconciling.
        stubWorkload(touch(ALICE, "Alice", 1, "case-a"), touch(null, null, 1, "case-a"));

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, viewer(ALICE));

        Assertions.assertEquals(List.of(new CaseRef(1, "case-a")), person(response, ALICE).cases());
        Assertions.assertTrue(response.unattributed().isEmpty());
    }

    @Test
    void getCaseWorkload_noTouchesAtAll_returnsEmptyListsNotNulls() {
        stubWorkload();

        CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(JULY, viewer(ALICE));

        Assertions.assertTrue(response.people().isEmpty());
        Assertions.assertTrue(response.unattributed().isEmpty());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void stubWorkload(CaseWorkloadProjection... touches) {
        doReturn(List.of(touches)).when(activityRepository)
                .findCaseWorkload(anyCollection(), any(LocalDateTime.class), any(LocalDateTime.class));
    }

    private void assertRejected(String month) {
        Assertions.assertThrows(IllegalArgumentException.class,
                () -> kpiWorkloadService.getCaseWorkload(month, viewer(ALICE)),
                () -> "expected '" + month + "' to be rejected");
    }

    private static AuthenticatedUser viewer(String email) {
        return new AuthenticatedUser("Viewer", email);
    }

    private static PersonWorkload person(CaseWorkloadResponse response, String email) {
        return response.people().stream()
                .filter(p -> email.equals(p.authorEmail()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no person for " + email));
    }

    @SuppressWarnings("unchecked")
    private static ArgumentCaptor<Collection<String>> captureTypes() {
        return ArgumentCaptor.forClass(Collection.class);
    }

    private static CaseWorkloadProjection touch(String email, String name, Integer msorId, String caseKey) {
        return new CaseWorkloadProjection() {
            @Override
            public String getAuthorEmail() {
                return email;
            }

            @Override
            public String getAuthorName() {
                return name;
            }

            @Override
            public Integer getMsorId() {
                return msorId;
            }

            @Override
            public String getCaseKey() {
                return caseKey;
            }
        };
    }
}
