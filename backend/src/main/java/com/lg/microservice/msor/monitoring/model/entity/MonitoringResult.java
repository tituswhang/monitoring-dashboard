package com.lg.microservice.msor.monitoring.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import com.lg.microservice.msor.monitoring.model.enums.ResultStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Execution record for a single monitoring item run.
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "monitoring_results")
public class MonitoringResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "result_id")
    private Long resultId;

    @Column(name = "msor_id", nullable = false)
    private Integer msorId;

    @Column(name = "run_at", nullable = false)
    private LocalDateTime runAt;

    @Column(name = "run_date", nullable = false)
    private LocalDate runDate;

    /** Rows this run actually recorded. Excludes rows withheld because their case is already DONE. */
    @Column(name = "result_count", nullable = false)
    private Integer resultCount;

    /** Rows the query returned but this run withheld because their case is already DONE. */
    @Column(name = "suppressed_count", nullable = false)
    private Integer suppressedCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "result_status", nullable = false)
    private ResultStatus resultStatus;

    @Column(name = "execution_ms")
    private Integer executionMs;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "error_detail", columnDefinition = "MEDIUMTEXT")
    private String errorDetail;

    /**
     * First day this run scanned, inclusive. Null for runs recorded before {@code V1_2_1},
     * and for items that still carry a literal date floor rather than a bound window.
     */
    @Column(name = "begin_date")
    private LocalDate beginDate;

    /**
     * Last day this run scanned, <b>inclusive</b> — what the operator picked, not the
     * exclusive bound {@code QueryWindow} passes to SQL.
     */
    @Column(name = "end_date")
    private LocalDate endDate;

    /**
     * {@code Y} when this was a widened "show past unresolved cases" scan. Such a run
     * reaches back to the configured floor rather than over the rolling window, so its
     * {@link #resultCount} is not comparable with the daily runs around it — anything
     * trending row counts over time must exclude these.
     */
    @Column(name = "past_unresolved_yn", nullable = false, columnDefinition = "CHAR(1)")
    private String pastUnresolvedYn;

    @Column(name = "triggered_alert_yn", nullable = false, columnDefinition = "CHAR(1)")
    private String triggeredAlertYn;

    @Column(name = "dw_synced_yn", nullable = false, columnDefinition = "CHAR(1)")
    private String dwSyncedYn;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * Convenience factory method for a new result record at the start of execution.
     */
    public static MonitoringResult ofStart(Integer msorId, LocalDateTime runAt) {
        MonitoringResult result = new MonitoringResult();
        result.msorId = msorId;
        result.runAt = runAt;
        result.runDate = runAt.toLocalDate();
        result.resultCount = 0;
        result.suppressedCount = 0;
        result.resultStatus = ResultStatus.SKIPPED;
        result.pastUnresolvedYn = "N";
        result.triggeredAlertYn = "N";
        result.dwSyncedYn = "N";
        result.createdAt = runAt;
        return result;
    }
}
