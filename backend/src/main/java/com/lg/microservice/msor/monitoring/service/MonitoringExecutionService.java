package com.lg.microservice.msor.monitoring.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lg.microservice.msor.monitoring.common.exception.QueryResultTooLargeException;
import com.lg.microservice.msor.monitoring.common.utils.CaseDriftDetector;
import com.lg.microservice.msor.monitoring.common.utils.CaseKeyResolver;
import com.lg.microservice.msor.monitoring.constant.AppTime;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringCaseActivity;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringQuery;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResult;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResultRow;
import com.lg.microservice.msor.monitoring.model.QueryWindow;
import com.lg.microservice.msor.monitoring.model.enums.ResultStatus;
import com.lg.microservice.msor.monitoring.model.response.CaseKeyRowData;
import com.lg.microservice.msor.monitoring.props.Database1DbProperties;
import com.lg.microservice.msor.monitoring.props.Database2DbProperties;
import com.lg.microservice.msor.monitoring.props.Database3DbProperties;
import com.lg.microservice.msor.monitoring.props.Database4DbProperties;
import com.lg.microservice.msor.monitoring.props.QueryExecutionProperties;
import com.lg.microservice.msor.monitoring.repository.MonitoringCaseActivityRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRowRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Orchestrates a single monitoring item execution:
 * SSH tunnel → query with retry → persist result → conditional alert → optional DW sync.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MonitoringExecutionService {

    private static final int MAX_ATTEMPTS = 3;
    private static final long[] RETRY_DELAYS_MS = {5_000L, 10_000L};
    private static final DateTimeFormatter DISPLAY_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final TargetDbQueryService targetDbQueryService;
    private final Database1DbProperties database1DbProperties;
    private final Database2DbProperties database2DbProperties;
    private final Database3DbProperties database3DbProperties;
    private final Database4DbProperties database4DbProperties;
    private final MonitoringEmailService monitoringEmailService;
    private final SlackNotificationService slackNotificationService;
    private final DwSyncService dwSyncService;
    private final MonitoringResultRepository resultRepository;
    private final MonitoringResultRowRepository resultRowRepository;
    private final MonitoringCaseActivityRepository activityRepository;
    private final QueryExecutionProperties queryExecutionProperties;
    private final ObjectMapper objectMapper;

    /**
     * Executes the given monitoring item over its default window — the last
     * {@code default_lookback_days} days through today inclusive, falling back to the
     * service-wide default for an item that has no per-item value.
     *
     * <p>The window is resolved here, at call time, so a scheduled item registered at
     * startup gets a fresh window on every fire rather than the one that was current
     * when the service booted.</p>
     *
     * @param item the monitoring query definition loaded from monitoring_queries
     */
    public void execute(MonitoringQuery item) {
        execute(item, null);
    }

    /**
     * Executes the given monitoring item end-to-end over an explicit window.
     *
     * @param item            the monitoring query definition loaded from monitoring_queries
     * @param requestedWindow the date range to run over; null falls back to the item's own
     *                        default lookback. Ignored by items not yet migrated to
     *                        {@code @begin_date} / {@code @end_date}
     */
    public void execute(MonitoringQuery item, QueryWindow requestedWindow) {
        // Resolved rather than required, so no caller can produce a run with no window at all —
        // every path below reads the window, and a missing one would abort the run outright.
        QueryWindow window = requestedWindow != null ? requestedWindow : defaultWindowFor(item);

        LocalDateTime runAt = LocalDateTime.now(AppTime.APP_ZONE);
        log.info("[MSOR] START msor_id={} title='{}' window={}",
                item.getMsorId(), item.getTitle(), window);

        MonitoringResult result = MonitoringResult.ofStart(item.getMsorId(), runAt);
        recordWindow(result, item, window);

        String sql = item.getSqlQuery();

        List<Map<String, Object>> rows;
        long startMs = System.currentTimeMillis();
        try {
            rows = executeWithRetry(item.getMsorId(), item.getDbType(), sql, window);
            result.setResultStatus(ResultStatus.SUCCESS);
            result.setExecutionMs((int) (System.currentTimeMillis() - startMs));
        } catch (Exception ex) {
            log.error("[MSOR] Query failed for msor_id={} after {} attempts: {}",
                    item.getMsorId(), MAX_ATTEMPTS, ex.getMessage(), ex);
            result.setResultStatus(ResultStatus.FAIL);
            result.setExecutionMs((int) (System.currentTimeMillis() - startMs));
            result.setErrorMessage(ex.getMessage());
            result.setErrorDetail(buildErrorDetail(ex));
            resultRepository.save(result);
            return;
        }

        List<Candidate> matched = toCandidates(item, rows);
        List<Candidate> open = withoutDoneCases(item.getMsorId(), matched);
        int suppressed = matched.size() - open.size();

        result.setResultCount(open.size());
        result.setSuppressedCount(suppressed);
        resultRepository.save(result);

        List<MonitoringResultRow> savedRows = saveResultRows(result.getResultId(), open);
        logDataDrift(item, result.getResultId(), savedRows);
        log.info("[MSOR] msor_id={} result_count={} suppressed={} execution_ms={}",
                item.getMsorId(), open.size(), suppressed, result.getExecutionMs());

        // A "past unresolved cases" scan reaches back to the floor rather than over the
        // rolling window, so its row count is not comparable with a scheduled run's. It must
        // not alert: besides being an operator investigation rather than a monitor tick, the
        // once-per-day guard in sendAlertIfNeeded means it would *consume* today's alert and
        // mute the real scheduled run.
        if (window.pastUnresolved()) {
            log.info("[MSOR] Past-unresolved scan for msor_id={} — suppressing alert and DW sync",
                    item.getMsorId());
        } else if (open.isEmpty()) {
            log.info("[MSOR] No open rows detected ({} already DONE) — skipping alert for msor_id={}",
                    suppressed, item.getMsorId());
        } else {
            sendAlertIfNeeded(item, result, open.size(), runAt);
        }

        // The DW is an analytics sink, not a work queue, so it receives every row the query
        // returned — including cases triage has closed. Suppression governs only what operators
        // are asked to act on. A wide scan is excluded outright: it would re-push months of
        // already-synced rows and double-count them.
        if (!window.pastUnresolved() && "Y".equals(item.getFrequentYn())) {
            dwSyncService.sync(item.getMsorId(), item.getTitle(), rows);
            result.setDwSyncedYn("Y");
            resultRepository.save(result);
        }

        log.info("[MSOR] DONE msor_id={}", item.getMsorId());
    }

    /**
     * The window an item runs over when the caller did not ask for a specific one.
     * {@code null} is tolerated so a run is never skipped over missing configuration.
     *
     * <p>Declared after both {@code execute} overloads rather than between them: checkstyle's
     * OverloadMethodsDeclarationOrder requires overloads stay adjacent.</p>
     */
    public QueryWindow defaultWindowFor(MonitoringQuery item) {
        Integer lookback = item.getDefaultLookbackDays();
        return QueryWindow.ofDefault(
                lookback != null && lookback > 0
                        ? lookback
                        : queryExecutionProperties.getDefaultLookbackDays());
    }

    // ------------------------------------------------------------------ private

    /**
     * Stamps the window onto the result row so a count can be read against the range that
     * produced it.
     *
     * <p>Only stamped for an item that actually honours the window. An item still carrying a
     * literal date floor ignores {@code @begin_date} entirely, and recording a range it never
     * applied would be a false audit trail — worse than the null it leaves instead.</p>
     *
     * <p>{@code end_date} is stored as the operator's inclusive last day, not the exclusive
     * bound the SQL predicate uses.</p>
     */
    private void recordWindow(MonitoringResult result, MonitoringQuery item, QueryWindow window) {
        if (window == null || !QueryWindow.isWindowed(item.getSqlQuery())) {
            return;
        }
        result.setBeginDate(window.begin());
        result.setEndDate(window.endInclusive());
        result.setPastUnresolvedYn(window.pastUnresolved() ? "Y" : "N");
    }

    private String resolveJdbcUrl(String dbType) {
        return buildJdbcUrl(dbType, false);
    }

    /**
     * Fallback URL used when the default connection fails with the MariaDB driver's
     * "RSA public key is not available client side" error (caching_sha2_password
     * over a non-TLS connection).
     */
    private String resolveJdbcUrlFixed(String dbType) {
        return buildJdbcUrl(dbType, true);
    }

    private String buildJdbcUrl(String dbType, boolean allowPublicKeyRetrieval) {
        String params = "useUnicode=yes&characterEncoding=UTF-8"
                + (allowPublicKeyRetrieval ? "&allowPublicKeyRetrieval=true" : "")
                + "&useSSL=false&serverTimezone=America/New_York";
        switch (dbType.toUpperCase()) {
            case "DATABASE2":
                return String.format("jdbc:mariadb://%s:%d/%s?%s",
                        database2DbProperties.getHost(), database2DbProperties.getPort(),
                        database2DbProperties.getDatabase(), params);
            case "DATABASE3":
                return String.format("jdbc:mariadb://%s:%d/%s?%s",
                        database3DbProperties.getHost(), database3DbProperties.getPort(),
                        database3DbProperties.getDatabase(), params);
            case "DATABASE4":
                return String.format("jdbc:mariadb://%s:%d/%s?%s",
                        database4DbProperties.getHost(), database4DbProperties.getPort(),
                        database4DbProperties.getDatabase(), params);
            case "DATABASE1":
            default:
                return String.format("jdbc:mariadb://%s:%d/%s?%s",
                        database1DbProperties.getHost(), database1DbProperties.getPort(),
                        database1DbProperties.getDatabase(), params);
        }
    }

    private String resolveUsername(String dbType) {
        switch (dbType.toUpperCase()) {
            case "DATABASE2": return database2DbProperties.getUsername();
            case "DATABASE3": return database3DbProperties.getUsername();
            case "DATABASE4": return database4DbProperties.getUsername();
            default:          return database1DbProperties.getUsername();
        }
    }

    private String resolvePassword(String dbType) {
        switch (dbType.toUpperCase()) {
            case "DATABASE2": return database2DbProperties.getPassword();
            case "DATABASE3": return database3DbProperties.getPassword();
            case "DATABASE4": return database4DbProperties.getPassword();
            default:          return database1DbProperties.getPassword();
        }
    }

    private List<Map<String, Object>> executeWithRetry(
            Integer msorId, String dbType, String sql, QueryWindow window) throws Exception {
        Exception lastEx = null;
        boolean useFixedUrl = false;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            String jdbcUrl = useFixedUrl ? resolveJdbcUrlFixed(dbType) : resolveJdbcUrl(dbType);
            try {
                return targetDbQueryService.query(
                        jdbcUrl, resolveUsername(dbType), resolvePassword(dbType), sql, window);
            } catch (Exception ex) {
                lastEx = ex;
                log.warn("[MSOR] msor_id={} attempt {}/{} failed ({}): {}",
                        msorId, attempt, MAX_ATTEMPTS, useFixedUrl ? "fixed-url" : "default-url", ex.getMessage());

                if (!useFixedUrl && isRsaPublicKeyError(ex)) {
                    log.info("[MSOR] msor_id={} hit RSA public key error — retrying with allowPublicKeyRetrieval=true",
                            msorId);
                    useFixedUrl = true;
                    continue;
                }

                // A timeout or an oversized result is a property of the query, not a blip.
                // Retrying only burns another full timeout and hammers the target DB again.
                if (isDeterministicFailure(ex)) {
                    log.warn("[MSOR] msor_id={} failed deterministically — not retrying", msorId);
                    break;
                }

                if (attempt < MAX_ATTEMPTS) {
                    long delayMs = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
                    Thread.sleep(delayMs);
                }
            }
        }
        throw lastEx;
    }

    private boolean isDeterministicFailure(Throwable ex) {
        Throwable current = ex;
        while (current != null) {
            if (current instanceof SQLTimeoutException
                    || current instanceof QueryResultTooLargeException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private boolean isRsaPublicKeyError(Throwable ex) {
        Throwable current = ex;
        while (current != null) {
            if (current instanceof SQLException
                    && current.getMessage() != null
                    && current.getMessage().contains("RSA public key is not available client side")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private void sendAlertIfNeeded(
            MonitoringQuery item, MonitoringResult result,
            int rowCount, LocalDateTime runAt) {

        boolean alreadyAlerted = resultRepository.existsByMsorIdAndRunDateAndTriggeredAlertYn(
                item.getMsorId(), runAt.toLocalDate(), "Y");

        if (alreadyAlerted) {
            log.info("[MSOR] Alert already sent today for msor_id={} — skipping", item.getMsorId());
            return;
        }

        List<String> recipients = parseRecipients(item.getRecipients());
        if (recipients.isEmpty()) {
            log.warn("[MSOR] No recipients configured for msor_id={} — skipping email", item.getMsorId());
            return;
        }

        try {
            String subject = "[MSOR Alert] " + item.getTitle() + " — " + runAt.toLocalDate();
            String formattedRunAt = runAt.format(DISPLAY_FORMATTER);
            String owner = StringUtils.hasText(item.getOwnerName()) ? item.getOwnerName() : "(not assigned)";

            monitoringEmailService.sendReport(subject, recipients, item.getTitle(),
                    formattedRunAt, owner, rowCount);

            String slackMsg = buildSlackMessage(item, runAt, rowCount);
            slackNotificationService.sendAlert(slackMsg);

            result.setTriggeredAlertYn("Y");
            resultRepository.save(result);

        } catch (Exception ex) {
            log.error("[MSOR] Alert delivery failed for msor_id={}: {}", item.getMsorId(), ex.getMessage(), ex);
        }
    }

    private String buildSlackMessage(MonitoringQuery item, LocalDateTime runAt, int rowCount) {
        return "[MSOR Alert] *" + item.getTitle() + "* — "
                + rowCount + " row(s) detected at " + runAt.format(DISPLAY_FORMATTER) + " ET";
    }

    private List<String> parseRecipients(String recipients) {
        if (!StringUtils.hasText(recipients)) {
            return List.of();
        }
        return Arrays.stream(recipients.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .toList();
    }

    private String buildErrorDetail(Throwable ex) {
        StringBuilder sb = new StringBuilder();
        Throwable current = ex;
        boolean first = true;
        while (current != null) {
            if (!first) {
                sb.append("\nCaused by: ");
            }
            sb.append(current.getClass().getName()).append(": ").append(current.getMessage());
            StackTraceElement[] trace = current.getStackTrace();
            int limit = Math.min(trace.length, 10);
            for (int i = 0; i < limit; i++) {
                sb.append("\n\tat ").append(trace[i]);
            }
            if (trace.length > limit) {
                sb.append("\n\t... ").append(trace.length - limit).append(" more");
            }
            current = current.getCause();
            first = false;
        }
        return sb.toString();
    }

    /** A row the query returned, serialized and with its case identity resolved, but not yet persisted. */
    private record Candidate(String rowJson, CaseKeyResolver.CaseKey caseKey) {
    }

    private List<Candidate> toCandidates(MonitoringQuery item, List<Map<String, Object>> rows) {
        List<Candidate> candidates = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            try {
                Map<String, Object> row = rows.get(i);
                String rowJson = objectMapper.writeValueAsString(row);
                candidates.add(new Candidate(
                        rowJson, CaseKeyResolver.resolve(row, rowJson, item.getIdentityColumns())));
            } catch (JsonProcessingException ex) {
                log.warn("[MSOR] Failed to serialize row {} for msor_id={}: {}",
                        i, item.getMsorId(), ex.getMessage());
            }
        }
        return candidates;
    }

    /**
     * Drops every candidate whose case a user has already closed. A DONE case stays out of each
     * later run entirely — no row written, nothing counted, no alert — until someone moves it back
     * to OPEN or IN_PROGRESS in All Cases, which is what un-suppresses it. Rows written by earlier
     * runs are never touched, so the case remains visible in the history of the runs it appeared in.
     */
    private List<Candidate> withoutDoneCases(Integer msorId, List<Candidate> candidates) {
        if (candidates.isEmpty()) {
            return List.of();
        }
        try {
            Set<String> keys = candidates.stream()
                    .map(c -> c.caseKey().key())
                    .collect(Collectors.toSet());
            Set<String> done = Set.copyOf(resultRowRepository.findDoneCaseKeys(msorId, keys));
            if (done.isEmpty()) {
                return candidates;
            }
            return candidates.stream()
                    .filter(c -> !done.contains(c.caseKey().key()))
                    .toList();
        } catch (Exception ex) {
            // Fail open. Re-showing a case someone already closed is a nuisance; hiding one that is
            // still open is a missed alert, so a lookup failure must not be able to cause the latter.
            log.warn("[MSOR] DONE-case lookup failed for msor_id={} — keeping all {} row(s): {}",
                    msorId, candidates.size(), ex.getMessage());
            return candidates;
        }
    }

    private List<MonitoringResultRow> saveResultRows(Long resultId, List<Candidate> candidates) {
        if (candidates.isEmpty()) {
            return List.of();
        }
        List<MonitoringResultRow> entities = new ArrayList<>(candidates.size());
        for (int i = 0; i < candidates.size(); i++) {
            Candidate candidate = candidates.get(i);
            entities.add(MonitoringResultRow.builder()
                    .resultId(resultId)
                    .rowIndex(i)
                    .rowData(candidate.rowJson())
                    .caseKey(candidate.caseKey().key())
                    .caseKeySource(candidate.caseKey().source())
                    .build());
        }
        return resultRowRepository.saveAll(entities);
    }

    /**
     * Compares each new row against the same case's most recent prior run and records a DATA_CHANGE
     * activity entry for every tracked field that changed (identity/volatile columns excluded).
     * Best-effort: any failure is logged and never blocks the run.
     */
    private void logDataDrift(MonitoringQuery item, Long resultId, List<MonitoringResultRow> savedRows) {
        if (savedRows.isEmpty()) {
            return;
        }
        try {
            // One current row per case (first occurrence) — a run rarely repeats a case within itself.
            Map<String, MonitoringResultRow> currentByCase = new LinkedHashMap<>();
            for (MonitoringResultRow row : savedRows) {
                if (row.getCaseKey() != null) {
                    currentByCase.putIfAbsent(row.getCaseKey(), row);
                }
            }
            if (currentByCase.isEmpty()) {
                return;
            }
            Map<String, String> priorByCase = resultRowRepository
                    .findPriorRowDataByCaseKeys(item.getMsorId(), resultId, currentByCase.keySet())
                    .stream()
                    .collect(Collectors.toMap(CaseKeyRowData::getCaseKey, CaseKeyRowData::getRowData));

            List<MonitoringCaseActivity> entries = new ArrayList<>();
            for (Map.Entry<String, MonitoringResultRow> entry : currentByCase.entrySet()) {
                String priorJson = priorByCase.get(entry.getKey());
                if (priorJson == null) {
                    continue; // first sighting of this case — nothing to diff against
                }
                MonitoringResultRow row = entry.getValue();
                Map<String, Object> prior = parseRowData(priorJson);
                Map<String, Object> current = parseRowData(row.getRowData());
                for (CaseDriftDetector.FieldDiff d :
                        CaseDriftDetector.diff(prior, current, item.getIdentityColumns(), item.getVolatileColumns())) {
                    entries.add(MonitoringCaseActivity.dataChange(
                            item.getMsorId(), entry.getKey(), d.field(), d.oldValue(), d.newValue(), row.getRowId()));
                }
            }
            if (!entries.isEmpty()) {
                activityRepository.saveAll(entries);
                log.info("[MSOR] msor_id={} logged {} data-change entr{}",
                        item.getMsorId(), entries.size(), entries.size() == 1 ? "y" : "ies");
            }
        } catch (Exception ex) {
            log.warn("[MSOR] Data-drift detection failed for msor_id={}: {}", item.getMsorId(), ex.getMessage());
        }
    }

    private Map<String, Object> parseRowData(String json) throws JsonProcessingException {
        return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
    }
}
