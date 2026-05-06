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
    private ResultStatus resultStatus;
    private Integer executionMs;
    private String errorMessage;
    private String errorDetail;
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
                .resultStatus(result.getResultStatus())
                .executionMs(result.getExecutionMs())
                .errorMessage(result.getErrorMessage())
                .errorDetail(result.getErrorDetail())
                .triggeredAlertYn(result.getTriggeredAlertYn())
                .dwSyncedYn(result.getDwSyncedYn())
                .createdAt(result.getCreatedAt())
                .rows(rows)
                .build();
    }
}
