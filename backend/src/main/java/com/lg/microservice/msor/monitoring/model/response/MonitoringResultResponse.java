package com.lg.microservice.msor.monitoring.model.response;

import com.lg.microservice.msor.monitoring.model.entity.MonitoringResult;
import com.lg.microservice.msor.monitoring.model.enums.ResultStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
public class MonitoringResultResponse {

    private Long resultId;
    private Integer msorId;
    private LocalDateTime runAt;
    private LocalDate runDate;
    private Integer resultCount;
    private Integer suppressedCount;
    private ResultStatus resultStatus;
    private Integer executionMs;
    private String errorMessage;
    private String errorDetail;

    /** First day scanned, inclusive; null for runs before {@code V1_2_1} or unwindowed items. */
    private LocalDate beginDate;

    /** Last day scanned, inclusive; null for runs before {@code V1_2_1} or unwindowed items. */
    private LocalDate endDate;

    /** {@code Y} for a widened scan, whose count is not comparable with the daily runs around it. */
    private String pastUnresolvedYn;

    private String triggeredAlertYn;
    private String dwSyncedYn;
    private LocalDateTime createdAt;
    private List<MonitoringResultRowResponse> rows;

    public static MonitoringResultResponse from(MonitoringResult result, List<MonitoringResultRowResponse> rows) {
        return MonitoringResultResponse.builder()
                .resultId(result.getResultId())
                .msorId(result.getMsorId())
                .runAt(result.getRunAt())
                .runDate(result.getRunDate())
                .resultCount(result.getResultCount())
                .suppressedCount(result.getSuppressedCount())
                .resultStatus(result.getResultStatus())
                .executionMs(result.getExecutionMs())
                .errorMessage(result.getErrorMessage())
                .errorDetail(result.getErrorDetail())
                .beginDate(result.getBeginDate())
                .endDate(result.getEndDate())
                .pastUnresolvedYn(result.getPastUnresolvedYn())
                .triggeredAlertYn(result.getTriggeredAlertYn())
                .dwSyncedYn(result.getDwSyncedYn())
                .createdAt(result.getCreatedAt())
                .rows(rows)
                .build();
    }
}
