package com.lg.microservice.msor.monitoring.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lg.microservice.msor.monitoring.model.ReportSheet;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringQuery;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResult;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResultRow;
import com.lg.microservice.msor.monitoring.model.enums.ResultStatus;
import com.lg.microservice.msor.monitoring.props.Database1DbProperties;
import com.lg.microservice.msor.monitoring.props.Database2DbProperties;
import com.lg.microservice.msor.monitoring.props.Database3DbProperties;
import com.lg.microservice.msor.monitoring.props.Database4DbProperties;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRowRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * Orchestrates a single monitoring item execution:
 * query with retry → persist result → conditional alert → optional DW sync.
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
    private final ExcelReportService excelReportService;
    private final MonitoringEmailService monitoringEmailService;
    private final SlackNotificationService slackNotificationService;
    private final DwSyncService dwSyncService;
    private final MonitoringResultRepository resultRepository;
    private final MonitoringResultRowRepository resultRowRepository;
    private final ObjectMapper objectMapper;

    public void execute(MonitoringQuery item) {
        LocalDateTime runAt = LocalDateTime.now();
        log.info("[MONITOR] START id={} title='{}'", item.getMsorId(), item.getTitle());

        MonitoringResult result = MonitoringResult.ofStart(item.getMsorId(), runAt);

        String sql = item.getSqlQuery();

        List<Map<String, Object>> rows;
        long startMs = System.currentTimeMillis();
        try {
            rows = executeWithRetry(item.getMsorId(), item.getDbType(), sql);
            result.setResultStatus(ResultStatus.SUCCESS);
            result.setResultCount(rows.size());
            result.setExecutionMs((int) (System.currentTimeMillis() - startMs));
        } catch (Exception ex) {
            log.error("[MONITOR] Query failed for id={} after {} attempts: {}",
                    item.getMsorId(), MAX_ATTEMPTS, ex.getMessage(), ex);
            result.setResultStatus(ResultStatus.FAIL);
            result.setExecutionMs((int) (System.currentTimeMillis() - startMs));
            result.setErrorMessage(ex.getMessage());
            result.setErrorDetail(buildErrorDetail(ex));
            resultRepository.save(result);
            return;
        }

        resultRepository.save(result);
        saveResultRows(result.getResultId(), rows);
        log.info("[MONITOR] id={} result_count={} execution_ms={}",
                item.getMsorId(), rows.size(), result.getExecutionMs());

        if (rows.isEmpty()) {
            log.info("[MONITOR] No rows detected — skipping alert for id={}", item.getMsorId());
        } else {
            sendAlertIfNeeded(item, result, rows, runAt);
        }

        if ("Y".equals(item.getFrequentYn())) {
            dwSyncService.sync(item.getMsorId(), item.getTitle(), rows);
            result.setDwSyncedYn("Y");
            resultRepository.save(result);
        }

        log.info("[MONITOR] DONE id={}", item.getMsorId());
    }

    // ------------------------------------------------------------------ private

    private String resolveJdbcUrl(String dbType) {
        switch (dbType.toUpperCase()) {
            case "DATABASE2":
                return String.format(
                        "jdbc:mariadb://%s:%d/%s?useUnicode=yes&characterEncoding=UTF-8&useSSL=false&serverTimezone=UTC",
                        database2DbProperties.getHost(), database2DbProperties.getPort(), database2DbProperties.getDatabase());
            case "DATABASE3":
                return String.format(
                        "jdbc:mariadb://%s:%d/%s?useUnicode=yes&characterEncoding=UTF-8&useSSL=false&serverTimezone=UTC",
                        database3DbProperties.getHost(), database3DbProperties.getPort(), database3DbProperties.getDatabase());
            case "DATABASE4":
                return String.format(
                        "jdbc:mariadb://%s:%d/%s?useUnicode=yes&characterEncoding=UTF-8&useSSL=false&serverTimezone=UTC",
                        database4DbProperties.getHost(), database4DbProperties.getPort(), database4DbProperties.getDatabase());
            case "DATABASE1":
            default:
                return String.format(
                        "jdbc:mariadb://%s:%d/%s?useUnicode=yes&characterEncoding=UTF-8&useSSL=false&serverTimezone=UTC",
                        database1DbProperties.getHost(), database1DbProperties.getPort(), database1DbProperties.getDatabase());
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

    private List<Map<String, Object>> executeWithRetry(Integer id, String dbType, String sql) throws Exception {
        Exception lastEx = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                return targetDbQueryService.query(
                        resolveJdbcUrl(dbType), resolveUsername(dbType), resolvePassword(dbType), sql);
            } catch (Exception ex) {
                lastEx = ex;
                log.warn("[MONITOR] id={} attempt {}/{} failed: {}",
                        id, attempt, MAX_ATTEMPTS, ex.getMessage());
                if (attempt < MAX_ATTEMPTS) {
                    long delayMs = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
                    Thread.sleep(delayMs);
                }
            }
        }
        throw lastEx;
    }

    private void sendAlertIfNeeded(
            MonitoringQuery item, MonitoringResult result,
            List<Map<String, Object>> rows, LocalDateTime runAt) {

        boolean alreadyAlerted = resultRepository.existsByMsorIdAndRunDateAndTriggeredAlertYn(
                item.getMsorId(), runAt.toLocalDate(), "Y");

        if (alreadyAlerted) {
            log.info("[MONITOR] Alert already sent today for id={} — skipping", item.getMsorId());
            return;
        }

        List<String> recipients = parseRecipients(item.getRecipients());
        if (recipients.isEmpty()) {
            log.warn("[MONITOR] No recipients configured for id={} — skipping email", item.getMsorId());
            return;
        }

        try {
            ReportSheet sheet = buildReportSheet(item.getSheetName(), rows);
            byte[] xlsx = excelReportService.generate(List.of(sheet));
            String filename = item.getSheetName().replaceAll("[^a-zA-Z0-9_-]", "_")
                    + "_" + runAt.toLocalDate() + ".xlsx";
            String subject = "[MONITOR Alert] " + item.getTitle() + " — " + runAt.toLocalDate();
            String htmlBody = buildHtmlBody(item, runAt, rows.size());

            monitoringEmailService.sendReport(subject, recipients, htmlBody, xlsx, filename);

            String slackMsg = buildSlackMessage(item, runAt, rows.size());
            slackNotificationService.sendAlert(slackMsg);

            result.setTriggeredAlertYn("Y");
            resultRepository.save(result);

        } catch (Exception ex) {
            log.error("[MONITOR] Alert delivery failed for id={}: {}", item.getMsorId(), ex.getMessage(), ex);
        }
    }

    private ReportSheet buildReportSheet(String sheetName, List<Map<String, Object>> rows) {
        List<String> headers = rows.isEmpty()
                ? List.of()
                : new ArrayList<>(rows.get(0).keySet());

        List<List<Object>> dataRows = rows.stream()
                .map(row -> (List<Object>) new ArrayList<>(row.values()))
                .toList();

        return ReportSheet.builder()
                .name(sheetName)
                .headers(headers)
                .rows(dataRows)
                .build();
    }

    private String buildHtmlBody(MonitoringQuery item, LocalDateTime runAt, int rowCount) {
        String owner = StringUtils.hasText(item.getOwnerName()) ? item.getOwnerName() : "(not assigned)";
        return "<html><body style=\"font-family:Arial,sans-serif;font-size:14px;\">"
                + "<p><strong>Monitoring Item:</strong> " + item.getTitle() + "</p>"
                + "<p><strong>Date / Time:</strong> " + runAt.format(DISPLAY_FORMATTER) + "</p>"
                + "<p><strong>Owner:</strong> " + owner + "</p>"
                + "<p><strong>Rows Detected:</strong> " + rowCount + "</p>"
                + "<p>Please see the attached spreadsheet for details.</p>"
                + "</body></html>";
    }

    private String buildSlackMessage(MonitoringQuery item, LocalDateTime runAt, int rowCount) {
        return "[MONITOR Alert] *" + item.getTitle() + "* — "
                + rowCount + " row(s) detected at " + runAt.format(DISPLAY_FORMATTER);
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
            if (!first) sb.append("\nCaused by: ");
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

    private void saveResultRows(Long resultId, List<Map<String, Object>> rows) {
        List<MonitoringResultRow> entities = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            try {
                entities.add(MonitoringResultRow.builder()
                        .resultId(resultId)
                        .rowIndex(i)
                        .rowData(objectMapper.writeValueAsString(rows.get(i)))
                        .build());
            } catch (JsonProcessingException ex) {
                log.warn("[MONITOR] Failed to serialize row {} for result_id={}: {}", i, resultId, ex.getMessage());
            }
        }
        if (!entities.isEmpty()) {
            resultRowRepository.saveAll(entities);
        }
    }
}
