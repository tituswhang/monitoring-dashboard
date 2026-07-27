package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.impl;

import com.lg.microservice.msor.monitoring.common.exception.MonitoringServiceException;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.constant.AppTime;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringCaseActivity;
import com.lg.microservice.msor.monitoring.model.response.CaseRef;
import com.lg.microservice.msor.monitoring.model.response.CaseWorkloadProjection;
import com.lg.microservice.msor.monitoring.model.response.CaseWorkloadResponse;
import com.lg.microservice.msor.monitoring.model.response.PersonWorkload;
import com.lg.microservice.msor.monitoring.repository.MonitoringCaseActivityRepository;
import com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.KpiWorkloadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Derives per-person case workload from the activity timeline, because nothing in the schema records
 * who a case belongs to. A person is "on" a case if they touched it — commented, or changed its
 * status — inside the requested month.
 *
 * <p>The month scopes the touch rather than the case, so the answer resets every month instead of
 * accumulating a growing pile of finished work. This is also why the response carries case
 * identities and no status counts: the client already holds every case row, so it reads status from
 * the row and the pie cannot drift from the grid beneath it.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class KpiWorkloadServiceImpl implements KpiWorkloadService {

    /**
     * A human touch. {@code DATA_CHANGE} is excluded: drift detection writes it with no author, and
     * a machine noticing a field changed is not somebody working the case. Bound from the entity's
     * own constants so this definition cannot drift from the definition of an entry type.
     */
    private static final List<String> HUMAN_ENTRY_TYPES =
            List.of(MonitoringCaseActivity.TYPE_COMMENT, MonitoringCaseActivity.TYPE_STATUS_CHANGE);

    private static final DateTimeFormatter MONTH_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM");

    private static final Comparator<CaseRef> BY_ITEM_THEN_KEY =
            Comparator.comparing(CaseRef::msorId).thenComparing(CaseRef::caseKey);

    private final MonitoringCaseActivityRepository activityRepository;

    @Override
    public CaseWorkloadResponse getCaseWorkload(String month, AuthenticatedUser viewer) {
        // Parsed before the try: a malformed month is the caller's mistake (400), not a failure of
        // ours (500), and the catch below is deliberately broad.
        YearMonth target = resolveMonth(month);
        LocalDateTime from = target.atDay(1).atStartOfDay();
        LocalDateTime toExclusive = target.plusMonths(1).atDay(1).atStartOfDay();

        try {
            List<CaseWorkloadProjection> touches =
                    activityRepository.findCaseWorkload(HUMAN_ENTRY_TYPES, from, toExclusive);
            LocalDateTime earliest = activityRepository.findEarliestActivity(HUMAN_ENTRY_TYPES);

            List<PersonWorkload> people = rollUpPeople(touches, viewer);
            return new CaseWorkloadResponse(
                    target.format(MONTH_FORMAT),
                    earliest == null ? null : YearMonth.from(earliest).format(MONTH_FORMAT),
                    people,
                    unattributed(touches, people));
        } catch (Exception ex) {
            log.error("[MSOR] Failed to fetch case workload for month={}: {}", target, ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to fetch case workload", ex);
        }
    }

    /**
     * Resolves {@code yyyy-MM}, defaulting to the current month in the application's zone.
     *
     * <p>Month boundaries are the server's to decide. {@code created_at} is stamped in
     * {@code AppTime.APP_ZONE}, so a browser in another zone computing its own bounds would shift
     * every month edge and file work done late on the 31st under the wrong month.
     */
    private static YearMonth resolveMonth(String month) {
        if (!StringUtils.hasText(month)) {
            return YearMonth.now(AppTime.APP_ZONE);
        }
        try {
            return YearMonth.parse(month, MONTH_FORMAT);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("Invalid month '" + month + "'; expected yyyy-MM", ex);
        }
    }

    /** Groups the touched pairs by author, dropping the authorless ones for {@link #unattributed}. */
    private static List<PersonWorkload> rollUpPeople(List<CaseWorkloadProjection> touches, AuthenticatedUser viewer) {
        Map<String, List<CaseWorkloadProjection>> byEmail = touches.stream()
                .filter(touch -> touch.getAuthorEmail() != null)
                .collect(Collectors.groupingBy(CaseWorkloadProjection::getAuthorEmail));

        return byEmail.entrySet().stream()
                .map(entry -> new PersonWorkload(
                        entry.getKey(),
                        displayName(entry.getValue()),
                        isViewer(entry.getKey(), viewer),
                        caseRefs(entry.getValue())))
                .sorted(Comparator.comparing(PersonWorkload::authorEmail))
                .toList();
    }

    /**
     * One display name per email. A person can arrive carrying several — the name is nullable and
     * mutable while the email is not — so take the greatest non-null, matching the
     * {@code MAX(author_name)} the query already applied per case. Stable across requests, which a
     * "first one wins" rule would not be.
     */
    private static String displayName(List<CaseWorkloadProjection> touches) {
        return touches.stream()
                .map(CaseWorkloadProjection::getAuthorName)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);
    }

    private static List<CaseRef> caseRefs(List<CaseWorkloadProjection> touches) {
        return touches.stream()
                .map(touch -> new CaseRef(touch.getMsorId(), touch.getCaseKey()))
                .sorted(BY_ITEM_THEN_KEY)
                .toList();
    }

    /** Email is the identity; compared case-insensitively because Cognito does not promise a case. */
    private static boolean isViewer(String authorEmail, AuthenticatedUser viewer) {
        return viewer != null && viewer.email() != null && viewer.email().equalsIgnoreCase(authorEmail);
    }

    /**
     * Cases whose touches this month all lacked an author — writes made while auth was disabled, and
     * the legacy row comments {@code V1_0_9} imported with a null author and no way to ever reclaim
     * the identity.
     *
     * <p>A case somebody also touched belongs to that person, so the people's cases are subtracted
     * first. Without that, one case would be both credited and disowned.
     */
    private static List<CaseRef> unattributed(List<CaseWorkloadProjection> touches, List<PersonWorkload> people) {
        Set<CaseRef> claimed = people.stream()
                .flatMap(person -> person.cases().stream())
                .collect(Collectors.toSet());

        return touches.stream()
                .filter(touch -> touch.getAuthorEmail() == null)
                .map(touch -> new CaseRef(touch.getMsorId(), touch.getCaseKey()))
                .filter(ref -> !claimed.contains(ref))
                .distinct()
                .sorted(BY_ITEM_THEN_KEY)
                .toList();
    }
}
