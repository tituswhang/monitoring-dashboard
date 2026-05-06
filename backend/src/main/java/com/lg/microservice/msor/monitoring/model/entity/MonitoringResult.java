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

    @Column(name = "result_count", nullable = false)
    private Integer resultCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "result_status", nullable = false)
    private ResultStatus resultStatus;

    @Column(name = "execution_ms")
    private Integer executionMs;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "error_detail", columnDefinition = "MEDIUMTEXT")
    private String errorDetail;

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
        result.resultStatus = ResultStatus.SKIPPED;
        result.triggeredAlertYn = "N";
        result.dwSyncedYn = "N";
        result.createdAt = runAt;
        return result;
    }
}
